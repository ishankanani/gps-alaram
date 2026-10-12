import type { Place } from '../../lib/geocode';

// Favourites as the Saved tab edits them: reorder, rename, remove and undo. Pure, no React Native.
//
// A renamed favourite keeps its new name in `name` (so the map chips, the stop sheet and the alarm
// show it) and the stop's own name in `originalName`. Both live in stopwake.json with the rest of
// the favourite.

export type SavedPlace = Place & { originalName?: string };

const MAX_NAME = 40;

/** The stop's own name, when the favourite was renamed. */
export function originalNameOf(place: Place): string | null {
  const original = (place as SavedPlace).originalName;
  return original && original !== place.name ? original : null;
}

/** Moves the favourite at `from` to `to` (clamped). */
export function moveFavourite<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list];
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

/** Inserts `item` at `index` (clamped): Undo puts a removed favourite back where it was. */
export function insertAt<T>(list: readonly T[], item: T, index: number): T[] {
  const next = [...list];
  next.splice(Math.max(0, Math.min(next.length, index)), 0, item);
  return next;
}

/** The cleaned-up name a rename would save: trimmed, single spaces, at most 40 characters. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim();
}

/** Renames a favourite; an empty name (or the original one) goes back to the stop's own name. */
export function renamed(place: Place, name: string): SavedPlace {
  const original = (place as SavedPlace).originalName ?? place.name;
  const next = cleanName(name);
  const rest: SavedPlace = { ...place };
  delete rest.originalName;
  if (!next || next === original) return { ...rest, name: original };
  return { ...rest, name: next, originalName: original };
}

export const RENAME_MAX_LENGTH = MAX_NAME;
