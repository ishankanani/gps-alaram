import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import { Button, EmptyState, Screen, StickyFooter, TextField, useToast } from '../../ui';
import { cleanName, originalNameOf, renamed, RENAME_MAX_LENGTH } from './favourites';

/**
 * RenameFavourite (modal, ui-direction-a 4.3 Saved): a name of the rider's own for a favourite,
 * shown on the map and on the alarm. An empty name goes back to the stop's own name.
 */
export function RenameFavouriteScreen({ navigation, route }: RootScreenProps<'RenameFavourite'>) {
  const { t: tr } = useI18n();
  const saved = useSavedData();
  const toast = useToast();
  const place = saved.data.favourites.find((f) => f.id === route.params.favouriteId) ?? null;
  const [name, setName] = useState(place?.name ?? '');

  if (!place) {
    return (
      <Screen topBar={{ title: tr('saved.rename.title'), leading: 'close' }} testID="screen-RenameFavourite">
        <EmptyState
          icon="star-off-outline"
          title={tr('saved.rename.missing.title')}
          body={tr('saved.rename.missing.body')}
          action={{ label: tr('common.close'), onPress: () => navigation.goBack() }}
        />
      </Screen>
    );
  }

  const original = originalNameOf(place) ?? place.name;
  const changed = (cleanName(name) || original) !== place.name;

  function save(next: string) {
    if (!place) return;
    const updated = renamed(place, next);
    saved.update((current) => ({
      ...current,
      favourites: current.favourites.map((f) => (f.id === place.id ? updated : f)),
    }));
    navigation.goBack();
    toast.show({ id: 'renamed', message: tr('saved.renamed', { name: updated.name }), icon: 'pencil-outline' });
  }

  return (
    <Screen
      topBar={{ title: tr('saved.rename.title'), leading: 'close' }}
      keyboard
      footer={
        <StickyFooter>
          <Button label={tr('saved.rename.save')} block disabled={!changed} onPress={() => save(name)} testID="rename-save" />
        </StickyFooter>
      }
      testID="screen-RenameFavourite">
      <View style={styles.form}>
        <TextField
          label={tr('saved.rename.label')}
          value={name}
          onChangeText={setName}
          placeholder={original}
          helper={original !== name.trim() ? `${tr('saved.rename.helper')} ${tr('saved.rename.original', { name: original })}` : tr('saved.rename.helper')}
          maxLength={RENAME_MAX_LENGTH}
          clearable
          autoFocus
          autoCapitalize="sentences"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (changed) save(name);
          }}
          testID="rename-field"
        />
        {originalNameOf(place) ? (
          <Button
            label={tr('saved.rename.reset')}
            variant="ghost"
            size="S"
            icon="restore"
            onPress={() => save('')}
            style={styles.reset}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  reset: { alignSelf: 'flex-start', marginLeft: -14 },
});
