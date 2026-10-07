import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TripAlarm, type TripEndedEvent } from '../../modules/trip-alarm/src';
import { useI18n } from '../i18n';
import type { Place } from '../lib/geocode';
import { Body, Button, Card, Heading, Icon, Title } from '../ui/components';
import { useTheme } from '../ui/theme';

type Props = {
  ended: TripEndedEvent;
  place: Place | null;
  isFavourite: boolean;
  onSaveFavourite: () => void;
  onDone: () => void;
};

export function DoneScreen({ ended, place, isFavourite, onSaveFavourite, onDone }: Props) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const logName = ended.logName;
  const error = ended.reason === 'error';
  const headline = error ? tr('done.error') : ended.reason === 'dismissed' ? tr('done.dismissed') : tr('done.stopped');

  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.badge, { backgroundColor: error ? t.bad : t.good }]}>
        <Icon name={error ? 'alert-circle' : ended.reason === 'dismissed' ? 'flag-checkered' : 'stop-circle-outline'} size={44} color="#FFFFFF" />
      </View>
      <Title>{headline}</Title>
      {error ? <Body>{ended.message || tr('done.errorBody')}</Body> : null}

      {place && !isFavourite && !error ? (
        <Card>
          <Heading>{tr('done.save', { name: place.name })}</Heading>
          <Body muted>{tr('done.saveBody')}</Body>
          <Button title={tr('done.saveButton')} kind="secondary" icon="star" onPress={onSaveFavourite} />
        </Card>
      ) : null}

      {logName && TripAlarm ? (
        <Card>
          <Heading>{tr('done.log.title')}</Heading>
          <Body muted>{tr('done.log.body')}</Body>
          <Button
            title={tr('done.log.button')}
            kind="secondary"
            icon="share-variant"
            onPress={() => void TripAlarm?.shareTripLog(logName)}
          />
        </Card>
      ) : null}

      <Button title={tr('common.done')} onPress={onDone} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, gap: 16 },
  badge: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
});
