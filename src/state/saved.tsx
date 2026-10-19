import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { notifySavedChanged, registerSavedData } from '../api/sync';

import type { Place } from '../lib/geocode';
import { canAddFavourite } from '../lib/plans';
import { usePro } from '../lib/pro';
import { loadData, samePlace, saveData, toggleFavourite as toggled, type Preferences, type SavedData } from '../lib/storage';

// Favourites, recents and preferences: everything the app keeps on the phone (stopwake.json).
// Taken over from the old App.tsx: one copy in memory, written through on every change.

export type SavedDataApi = {
  data: SavedData;
  /**
   * Replaces everything and saves it. A function gets the latest data (safe in async code).
   * Returns what was saved.
   */
  update: (next: SavedData | ((current: SavedData) => SavedData)) => SavedData;
  setPreferences: (next: Preferences | ((current: Preferences) => Preferences)) => void;
  isFavourite: (place: Place) => boolean;
  /**
   * Adds or removes a favourite. The free plan keeps FREE_FAVOURITES: adding one more returns
   * 'needsPro' and changes nothing (open the Paywall with reason 'favourites').
   */
  toggleFavourite: (place: Place) => 'added' | 'removed' | 'needsPro';
};

const SavedDataContext = createContext<SavedDataApi | null>(null);

export function SavedDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SavedData>(loadData);
  // The latest data for callbacks that run after awaits (the trip launch).
  const latest = useRef(data);
  const { isPro } = usePro();

  const update = useCallback<SavedDataApi['update']>((next) => {
    const value = typeof next === 'function' ? next(latest.current) : next;
    latest.current = value;
    setData(value);
    saveData(value);
    notifySavedChanged();
    return value;
  }, []);

  // The account sync reads and merges favourites and recents (src/api/sync.ts).
  useEffect(
    () =>
      registerSavedData({
        get: () => ({ favourites: latest.current.favourites, recents: latest.current.recents }),
        set: (next) => update((current) => ({ ...current, ...next })),
      }),
    [update],
  );

  const setPreferences = useCallback<SavedDataApi['setPreferences']>(
    (next) => {
      update((current) => ({
        ...current,
        preferences: typeof next === 'function' ? next(current.preferences) : next,
      }));
    },
    [update],
  );

  const toggleFavourite = useCallback<SavedDataApi['toggleFavourite']>(
    (place) => {
      const current = latest.current;
      const adding = !current.favourites.some((f) => samePlace(f, place));
      if (adding && !canAddFavourite(current.favourites.length, isPro)) return 'needsPro';
      update(toggled(current, place));
      return adding ? 'added' : 'removed';
    },
    [isPro, update],
  );

  const api = useMemo<SavedDataApi>(
    () => ({
      data,
      update,
      setPreferences,
      isFavourite: (place) => data.favourites.some((f) => samePlace(f, place)),
      toggleFavourite,
    }),
    [data, update, setPreferences, toggleFavourite],
  );

  return <SavedDataContext.Provider value={api}>{children}</SavedDataContext.Provider>;
}

export function useSavedData(): SavedDataApi {
  const api = useContext(SavedDataContext);
  if (!api) throw new Error('useSavedData() needs a SavedDataProvider');
  return api;
}
