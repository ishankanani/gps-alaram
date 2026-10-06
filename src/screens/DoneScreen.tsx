import { ScrollView, StyleSheet, Text } from 'react-native';

import { TripAlarm, type TripEndedEvent } from '../../modules/trip-alarm/src';
import type { Place } from '../lib/geocode';
import { Body, Button, Card, Title } from '../ui/components';
import { useTheme } from '../ui/theme';

type Props = {
  ended: TripEndedEvent;
  place: Place | null;
  isFavourite: boolean;
  onSaveFavourite: () => void;
  onDone: () => void;
};

const HEADLINE: Record<string, string> = {
  dismissed: 'You made it',
  stopped: 'Trip stopped',
  error: 'The trip could not start',
};

export function DoneScreen({ ended, place, isFavourite, onSaveFavourite, onDone }: Props) {
  const t = useTheme();
  const logName = ended.logName;
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.container}>
      <Title>{HEADLINE[ended.reason] ?? 'Trip finished'}</Title>
      {ended.reason === 'error' ? (
        <Body>{ended.message || 'Check that location and notifications are allowed, then try again.'}</Body>
      ) : null}

      {place && !isFavourite && ended.reason !== 'error' ? (
        <Card>
          <Text style={[styles.cardTitle, { color: t.text }]}>Save {place.name}?</Text>
          <Body muted>Next time it is one tap away.</Body>
          <Button title="Save to favourites" kind="secondary" onPress={onSaveFavourite} />
        </Card>
      ) : null}

      {logName && TripAlarm ? (
        <Card>
          <Text style={[styles.cardTitle, { color: t.text }]}>Help us test</Text>
          <Body muted>
            The trip log has every GPS fix and alarm decision from this trip. Sharing it helps us tune when the alarm rings.
          </Body>
          <Button title="Share trip log" kind="secondary" onPress={() => void TripAlarm?.shareTripLog(logName)} />
        </Card>
      ) : null}

      <Button title="Done" onPress={onDone} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
});
