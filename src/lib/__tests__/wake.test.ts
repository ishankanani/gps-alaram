import { describe, expect, it } from 'vitest';

import type { Place } from '../geocode';
import { DEFAULT_PREFERENCES } from '../prefs';
import { defaultWake, rememberWake, tooShortForTrain, tripOptions, TIME_BACKSTOP_RADIUS_M } from '../wake';

const place: Place = { id: 'stop:Ulm Hbf', name: 'Ulm Hbf', context: '', latitude: 48.4, longitude: 9.98 };

describe('wake options', () => {
  it('defaults trains to minutes and buses to distance', () => {
    expect(defaultWake('train', DEFAULT_PREFERENCES).wakeBy).toBe('time');
    expect(defaultWake('bus', DEFAULT_PREFERENCES).wakeBy).toBe('distance');
    expect(defaultWake('place', DEFAULT_PREFERENCES).wakeBy).toBe('distance');
  });

  it('warns about 100 or 200 m before a train station only', () => {
    const w = { ...defaultWake('train', DEFAULT_PREFERENCES), wakeBy: 'distance' as const, radiusM: 200 };
    expect(tooShortForTrain('train', w)).toBe(true);
    expect(tooShortForTrain('train', { ...w, radiusM: 500 })).toBe(false);
    expect(tooShortForTrain('bus', w)).toBe(false);
  });

  it('turns a time choice into minutes plus a backstop radius', () => {
    const w = { ...defaultWake('train', DEFAULT_PREFERENCES), minutesBefore: 3 };
    expect(tripOptions(place, w, false)).toMatchObject({
      minutesBefore: 3,
      radiusM: TIME_BACKSTOP_RADIUS_M,
      mode: 'arrive',
      label: 'Ulm Hbf',
    });
  });

  it('turns a distance choice into a radius only', () => {
    const w = { ...defaultWake('bus', DEFAULT_PREFERENCES), radiusM: 200 };
    expect(tripOptions(place, w, true)).toMatchObject({ minutesBefore: null, radiusM: 200, useMiles: true });
  });

  it('ignores minutes in leave mode', () => {
    const w = { ...defaultWake('train', DEFAULT_PREFERENCES), mode: 'leave' as const, radiusM: 1000 };
    expect(tripOptions(place, w, false)).toMatchObject({ minutesBefore: null, radiusM: 1000, mode: 'leave' });
  });

  it('remembers distance, minutes and strength', () => {
    const w = { ...defaultWake('bus', DEFAULT_PREFERENCES), radiusM: 500, minutesBefore: 5, strength: 'heavy' as const };
    expect(rememberWake(DEFAULT_PREFERENCES, w)).toMatchObject({ radiusM: 500, minutesBefore: 5, strength: 'heavy' });
  });
});
