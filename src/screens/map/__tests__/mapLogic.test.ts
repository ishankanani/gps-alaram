import { describe, expect, it } from 'vitest';

import type { Place } from '../../../lib/geocode';
import {
  BROWSE,
  droppedPin,
  highlightMatch,
  isDroppedPin,
  modesReducer,
  movedEnough,
  nbsp,
  parsePlaceLink,
  pickBanner,
  ruleLine,
  topMode,
  updateTopPlace,
  withAlpha,
  type ModeStack,
} from '../mapLogic';

const HBF: Place = { id: 'stop:München Hbf', name: 'München Hbf', context: 'München', latitude: 48.14, longitude: 11.56 };
const OST: Place = { id: 'stop:München Ost', name: 'München Ost', context: 'München', latitude: 48.13, longitude: 11.6 };

describe('sheet modes', () => {
  it('goes browse → search → stop and back one at a time', () => {
    let stack: ModeStack = BROWSE;
    stack = modesReducer(stack, { type: 'search' });
    stack = modesReducer(stack, { type: 'stop', place: HBF });
    expect(stack.map((m) => m.type)).toEqual(['browse', 'search', 'stop']);
    stack = modesReducer(stack, { type: 'back' });
    expect(topMode(stack).type).toBe('search');
    stack = modesReducer(stack, { type: 'back' });
    stack = modesReducer(stack, { type: 'back' });
    expect(stack).toEqual(BROWSE);
  });

  it('replaces the open stop instead of piling stops up', () => {
    let stack = modesReducer(BROWSE, { type: 'stop', place: HBF });
    stack = modesReducer(stack, { type: 'stop', place: OST });
    expect(stack.map((m) => m.type)).toEqual(['browse', 'stop']);
    expect(topMode(stack)).toMatchObject({ place: OST });
  });

  it('puts the stop picked in pin mode in place of the pin', () => {
    let stack = modesReducer(modesReducer(BROWSE, { type: 'search' }), { type: 'pin' });
    stack = modesReducer(stack, { type: 'stop', place: HBF });
    expect(stack.map((m) => m.type)).toEqual(['browse', 'search', 'stop']);
  });

  it('opens search from a stop without keeping the stop below it', () => {
    const stack = modesReducer(modesReducer(BROWSE, { type: 'stop', place: HBF }), { type: 'search' });
    expect(stack.map((m) => m.type)).toEqual(['browse', 'search']);
  });

  it('updates a dropped pin once its address arrives', () => {
    const pin = droppedPin(48.1, 11.5, 'Dropped pin');
    const stack = modesReducer(BROWSE, { type: 'stop', place: pin });
    const next = updateTopPlace(stack, pin.id, { ...pin, name: 'Marienplatz 1' });
    expect(topMode(next)).toMatchObject({ place: { name: 'Marienplatz 1' } });
    expect(updateTopPlace(stack, 'other', HBF)).toBe(stack);
    expect(isDroppedPin(pin)).toBe(true);
    expect(isDroppedPin(HBF)).toBe(false);
  });
});

describe('map banners', () => {
  it('shows only the most important one', () => {
    expect(pickBanner({ offline: true, zoomHint: true, pack: true })).toBe('offline');
    expect(pickBanner({ stoppedByPhone: true, updateRequired: true })).toBe('stoppedByPhone');
    expect(pickBanner({ announcement: true, criticalAnnouncement: true })).toBe('criticalAnnouncement');
    expect(pickBanner({ pack: true, announcement: true })).toBe('pack');
    expect(pickBanner({})).toBeNull();
  });
});

describe('highlightMatch', () => {
  const marked = (title: string, q: string) =>
    highlightMatch(title, q)
      .filter((p) => p.match)
      .map((p) => p.text);

  it('marks the typed start of each word', () => {
    expect(marked('München Hbf', 'münchen hb')).toEqual(['München', 'Hb']);
    expect(marked('München Hbf', 'muenchen')).toEqual(['München']);
    expect(marked('München Hbf', 'munch')).toEqual(['Münch']);
    expect(marked('Heilbronn Hbf', 'hbf heil')).toEqual(['Heil', 'Hbf']);
  });

  it('keeps the whole title', () => {
    expect(highlightMatch('Pfühlpark Süd', 'süd').map((p) => p.text).join('')).toBe('Pfühlpark Süd');
    expect(highlightMatch('Ulm Hbf', '')).toEqual([{ text: 'Ulm Hbf', match: false }]);
    expect(marked('Ulm Hbf', 'xyz')).toEqual([]);
  });
});

describe('stop mode copy', () => {
  it('says what the alarm will do', () => {
    expect(ruleLine({ mode: 'arrive', wakeBy: 'time', minutesBefore: 2 }, '300 m')).toEqual({ key: 'map.rule.time', params: { minutes: 2 } });
    expect(ruleLine({ mode: 'arrive', wakeBy: 'distance', minutesBefore: 2 }, '300 m')).toEqual({
      key: 'map.rule.distance',
      params: { distance: '300 m' },
    });
    expect(ruleLine({ mode: 'leave', wakeBy: 'time', minutesBefore: 2 }, '1 km').key).toBe('map.rule.leave');
  });

  it('keeps numbers and units together', () => {
    expect(nbsp('1.4 km')).toBe('1.4 km');
    expect(nbsp('<1 min')).toBe('<1 min');
    expect(nbsp('1 h 5 min')).toBe('1 h 5 min');
  });
});

describe('links and movement', () => {
  it('reads "Show on map" ids', () => {
    expect(parsePlaceLink('stop:München Hbf')).toEqual({ kind: 'stop', name: 'München Hbf' });
    expect(parsePlaceLink('pin:48.13710,11.57540')).toEqual({ kind: 'point', latitude: 48.1371, longitude: 11.5754 });
    expect(parsePlaceLink('coords:48.1,11.5')).toMatchObject({ kind: 'point' });
    expect(parsePlaceLink('pin:99,11')).toBeNull();
    expect(parsePlaceLink('osm:N123')).toBeNull();
    expect(parsePlaceLink('stop:')).toBeNull();
  });

  it('looks for nearby stops again only after a real move', () => {
    const here = { latitude: 48.14, longitude: 11.56 };
    expect(movedEnough(null, here)).toBe(true);
    expect(movedEnough(here, { latitude: 48.1403, longitude: 11.56 })).toBe(false);
    expect(movedEnough(here, { latitude: 48.141, longitude: 11.56 })).toBe(true);
  });
});

describe('withAlpha', () => {
  it('fades a token colour', () => {
    expect(withAlpha('#F4F6F9', 0.85)).toBe('rgba(244,246,249,0.85)');
    expect(withAlpha('rgba(0,0,0,0.6)', 0.5)).toBe('rgba(0,0,0,0.6)');
  });
});
