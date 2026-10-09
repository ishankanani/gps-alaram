import { File, Paths } from 'expo-file-system';
import { getLocales } from 'expo-localization';

import type { Place } from './geocode';
import { DEFAULT_PREFERENCES, type SavedData } from './prefs';

export { DEFAULT_PREFERENCES, type Preferences, type SavedData, type WakeBy } from './prefs';

/** Miles where the phone is set to US or UK units, until the user picks. */
function deviceUsesMiles(): boolean {
  try {
    const system = getLocales()[0]?.measurementSystem;
    return system === 'us' || system === 'uk';
  } catch {
    return false;
  }
}

const DEFAULTS = { ...DEFAULT_PREFERENCES, useMiles: deviceUsesMiles() };
const EMPTY: SavedData = { favourites: [], recents: [], preferences: DEFAULTS };
const MAX_RECENTS = 8;

function file() {
  return new File(Paths.document, 'stopwake.json');
}

/** Everything is on the device; there is no backend. */
export function loadData(): SavedData {
  try {
    const f = file();
    if (!f.exists) return EMPTY;
    const parsed = JSON.parse(f.textSync()) as Partial<SavedData>;
    return {
      favourites: parsed.favourites ?? [],
      recents: parsed.recents ?? [],
      preferences: { ...DEFAULTS, ...parsed.preferences },
    };
  } catch {
    return EMPTY;
  }
}

export function saveData(data: SavedData) {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(data));
  } catch {
    // Losing favourites is a nuisance, not a reason to crash.
  }
}

export function samePlace(a: Place, b: Place) {
  return a.id === b.id || (Math.abs(a.latitude - b.latitude) < 1e-5 && Math.abs(a.longitude - b.longitude) < 1e-5);
}

export function withRecent(data: SavedData, place: Place): SavedData {
  const recents = [place, ...data.recents.filter((p) => !samePlace(p, place))].slice(0, MAX_RECENTS);
  return { ...data, recents };
}

export function toggleFavourite(data: SavedData, place: Place): SavedData {
  const exists = data.favourites.some((p) => samePlace(p, place));
  const favourites = exists ? data.favourites.filter((p) => !samePlace(p, place)) : [place, ...data.favourites];
  return { ...data, favourites };
}
