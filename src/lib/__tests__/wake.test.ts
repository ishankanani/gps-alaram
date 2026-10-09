import { describe, expect, it } from 'vitest';

import type { Place } from '../geocode';
import { DEFAULT_PREFERENCES } from '../prefs';
import { DEMO_SPEED_MPS, defaultWake, demoRide, rememberWake, tooShortForTrain, tripOptions, TIME_BACKSTOP_RADIUS_M } from '../wake';

const place: Place = { id: 'stop:Ulm Hbf', name: 'Ulm Hbf', context: '', latitude: 48.4, longitude: 9.98 };

describe('wake options', () => {
  it('defaults trains and S-Bahn to minutes, buses, trams and U-Bahn to distance', () => {
    expect(defaultWake('train', DEFAULT_PREFERENCES).wakeBy).toBe('time');
    expect(defaultWake('sbahn', DEFAULT_PREFERENCES).wakeBy).toBe('time');
    expect(defaultWake('ubahn', DEFAULT_PREFERENCES).wakeBy).toBe('distance');
    expect(defaultWake('tram', DEFAULT_PREFERENCES).wakeBy).toBe('distance');
    expect(defaultWake('bus', DEFAULT_PREFERENCES).wakeBy).toBe('distance');
    expect(defaultWake('place', DEFAULT_PREFERENCES).wakeBy).toBe('distance');
  });

  it('warns about 100 or 200 m before a train or S-Bahn station only', () => {
    const w = { ...defaultWake('train', DEFAULT_PREFERENCES), wakeBy: 'distance' as const, radiusM: 200 };
    expect(tooShortForTrain('train', w)).toBe(true);
    expect(tooShortForTrain('sbahn', w)).toBe(true);
    expect(tooShortForTrain('train', { ...w, radiusM: 500 })).toBe(false);
    expect(tooShortForTrain('bus', w)).toBe(false);
    expect(tooShortForTrain('ubahn', w)).toBe(false);
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

  it('starts a demo ride so the alarm rings about 40 s in, on the side the user is on', () => {
    const stop = { latitude: 48.14, longitude: 11.56 };
    const metres = (a: typeof stop, b: typeof stop) =>
      Math.hypot((a.latitude - b.latitude) * 110_540, (a.longitude - b.longitude) * 111_320 * Math.cos((48.14 * Math.PI) / 180));
    // Train, wake 2 min before: 2 min plus 40 s at train speed.
    const train = demoRide(stop, 'train', defaultWake('train', DEFAULT_PREFERENCES), { latitude: 48.2, longitude: 11.56 });
    const start = { latitude: train.demoFromLatitude, longitude: train.demoFromLongitude };
    expect(train.demoSpeedMps).toBe(DEMO_SPEED_MPS.train);
    expect(metres(start, stop)).toBeCloseTo((120 + 40) * 33, -1);
    expect(start.latitude).toBeGreaterThan(stop.latitude); // north, towards the user
    // Bus, wake 300 m before, user unknown: starts west of the stop.
    const bus = demoRide(stop, 'bus', { ...defaultWake('bus', DEFAULT_PREFERENCES), radiusM: 300 }, null);
    expect(metres({ latitude: bus.demoFromLatitude, longitude: bus.demoFromLongitude }, stop)).toBeCloseTo(300 + 40 * 10, -1);
    expect(bus.demoFromLongitude).toBeLessThan(stop.longitude);
  });
});
