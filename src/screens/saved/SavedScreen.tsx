import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useRemoteConfig } from '../../api/config';
import { useI18n } from '../../i18n';
import type { Place } from '../../lib/geocode';
import { lastTripTo, useHistory } from '../../lib/history';
import { canAddFavourite } from '../../lib/plans';
import { usePro } from '../../lib/pro';
import { samePlace } from '../../lib/storage';
import { defaultWake } from '../../lib/wake';
import { openSheet } from '../../navigation/sheet';
import type { SheetOptionSpec, TabScreenProps } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import { useTrip } from '../../state/trip';
import {
  AppText,
  Banner,
  Button,
  EmptyState,
  IconButton,
  KindIcon,
  ListItem,
  ModeBadgeRow,
  Screen,
  Section,
  useDialogs,
  useToast,
} from '../../ui';
import { dayTime } from '../activity/format';
import { useNow, uses24HourClock } from '../activity/time';
import { insertAt, moveFavourite, originalNameOf } from './favourites';

/** The town from a place's context ("München, Bayern, Deutschland" → "München"). */
function townOf(place: Place): string {
  return place.context.split(',')[0]?.trim() ?? '';
}

/**
 * The Saved tab (ui-direction-a 4.3): favourites (open, start, rename, reorder, remove with Undo)
 * and recent stops. Free keeps the config's number of favourites; a banner says so at the limit.
 */
export function SavedScreen({ navigation }: TabScreenProps<'SavedTab'>) {
  const { t: tr } = useI18n();
  const saved = useSavedData();
  const trip = useTrip();
  const toast = useToast();
  const dialogs = useDialogs();
  const { isPro } = usePro();
  const config = useRemoteConfig();
  const history = useHistory();
  const now = useNow();
  const h24 = uses24HourClock();
  const [editMode, setEditMode] = useState(false);

  const { favourites, recents, preferences } = saved.data;
  const editing = editMode && favourites.length > 0;
  const limit = config.limits.freeFavourites;
  // A limit applies only to Free, and only while the config makes unlimited favourites a Pro feature.
  const limited = !isPro && config.proFeatures.unlimitedFavourites;
  const atLimit = limited && !canAddFavourite(favourites.length, isPro, config.limits, config.proFeatures);

  const showOnMap = (place: Place) => navigation.navigate('MapTab', { stopId: place.id });
  const findStop = () => navigation.navigate('MapTab');
  const startAlarm = (place: Place) => void trip.start({ place, wake: defaultWake(place.kind ?? 'place', preferences) });

  function setFavourites(update: (list: Place[]) => Place[]) {
    saved.update((current) => ({ ...current, favourites: update(current.favourites) }));
  }

  function removeFavourite(place: Place) {
    const index = saved.data.favourites.findIndex((f) => samePlace(f, place));
    if (index < 0) return;
    setFavourites((list) => list.filter((f) => !samePlace(f, place)));
    toast.show({
      id: 'saved-removed',
      message: tr('saved.removed', { name: place.name }),
      icon: 'star-off-outline',
      action: {
        label: tr('saved.undo'),
        onPress: () => setFavourites((list) => (list.some((f) => samePlace(f, place)) ? list : insertAt(list, place, index))),
      },
    });
  }

  function move(place: Place, by: number) {
    setFavourites((list) => {
      const from = list.findIndex((f) => samePlace(f, place));
      return moveFavourite(list, from, by === -Infinity ? 0 : from + by);
    });
  }

  async function favouriteMenu(place: Place, index: number) {
    const options: SheetOptionSpec[] = [
      { id: 'start', label: tr('place.start'), icon: 'alarm' },
      { id: 'map', label: tr('saved.menu.showOnMap'), icon: 'map-marker-outline' },
      { id: 'rename', label: tr('saved.menu.rename'), icon: 'pencil-outline' },
      ...(index > 0 ? [{ id: 'top', label: tr('saved.menu.moveTop'), icon: 'arrow-collapse-up' as const }] : []),
      { id: 'remove', label: tr('saved.menu.remove'), icon: 'delete-outline', destructive: true },
    ];
    const choice = await openSheet({ title: place.name, options });
    if (choice === 'start') startAlarm(place);
    else if (choice === 'map') showOnMap(place);
    else if (choice === 'rename') navigation.navigate('RenameFavourite', { favouriteId: place.id });
    else if (choice === 'top') move(place, -Infinity);
    else if (choice === 'remove') removeFavourite(place);
  }

  async function recentMenu(place: Place) {
    const isFavourite = saved.isFavourite(place);
    const options: SheetOptionSpec[] = [
      { id: 'start', label: tr('place.start'), icon: 'alarm' },
      { id: 'map', label: tr('saved.menu.showOnMap'), icon: 'map-marker-outline' },
      ...(isFavourite ? [] : [{ id: 'save', label: tr('place.save'), icon: 'star-outline' as const }]),
      { id: 'remove', label: tr('saved.menu.removeRecent'), icon: 'history', destructive: true },
    ];
    const choice = await openSheet({ title: place.name, options });
    if (choice === 'start') startAlarm(place);
    else if (choice === 'map') showOnMap(place);
    else if (choice === 'save') {
      if (saved.toggleFavourite(place) === 'needsPro') navigation.navigate('Paywall', { reason: 'favourites' });
    } else if (choice === 'remove') {
      saved.update((current) => ({ ...current, recents: current.recents.filter((p) => !samePlace(p, place)) }));
      toast.show({ id: 'recent-removed', message: tr('saved.removedRecent', { name: place.name }), icon: 'history' });
    }
  }

  async function clearRecents() {
    const confirmed = await dialogs.confirm({
      title: tr('saved.clearRecent.title'),
      message: tr('saved.clearRecent.body'),
      confirmLabel: tr('saved.clearRecent.confirm'),
      tone: 'danger',
      icon: 'history',
    });
    if (confirmed) saved.update((current) => ({ ...current, recents: [] }));
  }

  if (favourites.length === 0 && recents.length === 0) {
    return (
      <Screen largeTitle={tr('nav.tab.saved')} testID="screen-SavedTab">
        <EmptyState
          icon="star-outline"
          title={tr('saved.emptyAll.title')}
          body={tr('saved.emptyAll.body')}
          action={{ label: tr('saved.findStop'), onPress: findStop, icon: 'magnify' }}
        />
      </Screen>
    );
  }

  const favouriteRow = (place: Place, index: number) => {
    const original = originalNameOf(place);
    const town = townOf(place);
    const meta =
      place.modes || town ? (
        <>
          {place.modes ? <ModeBadgeRow modes={place.modes} /> : null}
          {town ? (
            <AppText variant="bodyS" color="textTertiary" numberOfLines={1} style={styles.town}>
              {town}
            </AppText>
          ) : null}
        </>
      ) : undefined;

    if (editing) {
      return (
        <ListItem
          key={place.id}
          title={place.name}
          subtitle={original ?? undefined}
          accessible={false}
          leadingWidth={40}
          leading={
            <IconButton
              icon="minus-circle-outline"
              color="danger"
              accessibilityLabel={tr('saved.remove', { name: place.name })}
              onPress={() => removeFavourite(place)}
              testID={`saved-remove-${index}`}
            />
          }
          trailing={
            <View style={styles.moveButtons}>
              <IconButton
                icon="arrow-up"
                accessibilityLabel={tr('saved.moveUp')}
                disabled={index === 0}
                onPress={() => move(place, -1)}
              />
              <IconButton
                icon="arrow-down"
                accessibilityLabel={tr('saved.moveDown')}
                disabled={index === favourites.length - 1}
                onPress={() => move(place, 1)}
              />
            </View>
          }
          testID={`saved-favourite-${index}`}
        />
      );
    }
    return (
      <ListItem
        key={place.id}
        title={place.name}
        subtitle={original ?? undefined}
        meta={meta}
        leading={<KindIcon kind={place.kind ?? 'place'} />}
        onPress={() => showOnMap(place)}
        onLongPress={() => void favouriteMenu(place, index)}
        trailing={
          <IconButton
            icon="dots-vertical"
            color="textSecondary"
            accessibilityLabel={tr('saved.more', { name: place.name })}
            onPress={() => void favouriteMenu(place, index)}
            testID={`saved-favourite-menu-${index}`}
          />
        }
        accessibilityLabel={[place.name, original, town].filter(Boolean).join(', ')}
        accessibilityActions={[{ name: 'menu', label: tr('saved.more', { name: place.name }) }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'menu') void favouriteMenu(place, index);
        }}
        testID={`saved-favourite-${index}`}
      />
    );
  };

  const recentRow = (place: Place, index: number) => {
    const last = lastTripTo(history.trips, place);
    const subtitle = last ? dayTime(last.startedAt, now, h24, tr) : townOf(place) || undefined;
    return (
      <ListItem
        key={place.id}
        title={place.name}
        subtitle={subtitle}
        leading={<KindIcon kind={place.kind ?? 'place'} />}
        onPress={() => showOnMap(place)}
        onLongPress={() => void recentMenu(place)}
        trailing={
          <IconButton
            icon="dots-vertical"
            color="textSecondary"
            accessibilityLabel={tr('saved.more', { name: place.name })}
            onPress={() => void recentMenu(place)}
            testID={`saved-recent-menu-${index}`}
          />
        }
        accessibilityActions={[{ name: 'menu', label: tr('saved.more', { name: place.name }) }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'menu') void recentMenu(place);
        }}
        testID={`saved-recent-${index}`}
      />
    );
  };

  return (
    <Screen
      largeTitle={tr('nav.tab.saved')}
      largeTrailing={
        favourites.length > 0 ? (
          <Button
            label={editing ? tr('common.done') : tr('saved.edit')}
            variant="ghost"
            size="S"
            onPress={() => setEditMode(!editing)}
            testID="saved-edit"
          />
        ) : null
      }
      testID="screen-SavedTab">
      {atLimit ? (
        <Banner
          tone="promo"
          body={tr('saved.limit', { count: favourites.length, max: limit })}
          action={{ label: tr('saved.getPro'), onPress: () => navigation.navigate('Paywall', { reason: 'favourites' }) }}
          style={styles.banner}
          testID="saved-limit"
        />
      ) : null}

      <Section
        title={tr('home.favourites')}
        count={limited ? tr('saved.favouritesCount', { count: favourites.length, max: limit }) : undefined}
        first
        empty={
          <EmptyState
            variant="inline"
            icon="star-outline"
            title={tr('saved.empty.title')}
            body={tr('saved.empty.body')}
            action={{ label: tr('saved.findStop'), onPress: findStop }}
          />
        }>
        {favourites.map(favouriteRow)}
      </Section>

      {recents.length > 0 && !editing ? (
        <Section title={tr('home.recent')} action={{ label: tr('ui.clear'), onPress: () => void clearRecents() }}>
          {recents.map(recentRow)}
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: 16, marginTop: 8 },
  town: { flexShrink: 1 },
  moveButtons: { flexDirection: 'row', marginRight: -8 },
});
