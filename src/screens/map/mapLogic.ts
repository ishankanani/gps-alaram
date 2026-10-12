import type { Key, Params } from '../../i18n';
import type { Place } from '../../lib/geocode';
import { fold, spellings, words } from '../../lib/stations/text';
import type { WakeOptions } from '../../lib/wake';

// Pure helpers of the Map home (no react-native), tested in __tests__/mapLogic.test.ts.

/** Joins a number and its unit with a non-breaking space: "300 m" never breaks (copy rule 7). */
export function nbsp(text: string): string {
  return text.replace(/ (?=\S+$)/, ' ');
}

// ---- MapSheet modes: a stack, browse at the bottom (3.17). Android back pops one mode. ----

export type StopEntry = {
  place: Place;
  /** Opened from "Ring when I leave here": the alarm starts in leave mode. */
  leave?: boolean;
};

export type SheetMode =
  | { type: 'browse' }
  | { type: 'search' }
  /** Drop a pin without long-press: a crosshair at the centre of the visible map. */
  | { type: 'pin' }
  | ({ type: 'stop' } & StopEntry);

export type ModeStack = readonly SheetMode[];

export const BROWSE: ModeStack = [{ type: 'browse' }];

export function topMode(stack: ModeStack): SheetMode {
  return stack[stack.length - 1] ?? { type: 'browse' };
}

export type ModeAction =
  | { type: 'search' }
  | { type: 'pin' }
  | ({ type: 'stop' } & StopEntry)
  | { type: 'back' }
  | { type: 'reset' };

/**
 * The next stack. Opening a stop while one is open replaces it (tapping stop after stop never
 * piles up), a pin replaces search's place in the stack only while it is on top, and back never
 * leaves browse.
 */
export function modesReducer(stack: ModeStack, action: ModeAction): ModeStack {
  const top = topMode(stack);
  switch (action.type) {
    case 'reset':
      return BROWSE;
    case 'back':
      return stack.length > 1 ? stack.slice(0, -1) : BROWSE;
    case 'search':
      return top.type === 'search' ? stack : [...stack.filter((m) => m.type === 'browse'), { type: 'search' }];
    case 'pin':
      return top.type === 'pin' ? stack : [...stack, { type: 'pin' }];
    case 'stop': {
      const entry: SheetMode = { type: 'stop', place: action.place, leave: action.leave };
      // A stop picked in pin mode takes the pin's place: back then returns to search.
      const base = top.type === 'stop' || top.type === 'pin' ? stack.slice(0, -1) : stack;
      return [...base, entry];
    }
  }
}

/** Updates the place of the stop on top (a dropped pin whose address has arrived). */
export function updateTopPlace(stack: ModeStack, id: string, place: Place): ModeStack {
  const top = topMode(stack);
  if (top.type !== 'stop' || top.place.id !== id) return stack;
  return [...stack.slice(0, -1), { ...top, place }];
}

// ---- Map banners: only one at a time, in this order (critiques: map banners). ----

export type MapBannerKind =
  | 'stoppedByPhone'
  | 'updateRequired'
  | 'criticalAnnouncement'
  | 'offline'
  | 'pack'
  | 'announcement'
  | 'zoomHint';

export const BANNER_PRIORITY: readonly MapBannerKind[] = [
  'stoppedByPhone',
  'updateRequired',
  'criticalAnnouncement',
  'offline',
  'pack',
  'announcement',
  'zoomHint',
];

/** The banner the map shows: the first wanted one in priority order, or null. */
export function pickBanner(wanted: Partial<Record<MapBannerKind, boolean>>): MapBannerKind | null {
  return BANNER_PRIORITY.find((kind) => wanted[kind]) ?? null;
}

// ---- Search ----

export type TextPart = { text: string; match: boolean };

/** How many characters of `word` it takes to spell `typed` (umlauts count as "ue" or "u"). */
function prefixLength(word: string, typed: string): number {
  const lower = fold(word);
  for (let i = 1; i <= word.length; i++) {
    if (spellings(lower.slice(0, i)).some((s) => s.length >= typed.length && s.startsWith(typed))) return i;
  }
  return 0;
}

/**
 * The stop title split into the parts the query matched (shown at weight 700) and the rest:
 * "muenchen hb" in "München Hbf" marks "München" and "Hb".
 */
export function highlightMatch(title: string, query: string): TextPart[] {
  const typed = words(query.replace(/['’`]/g, '')).flatMap((w) => spellings(w).slice(0, 1));
  if (typed.length === 0) return [{ text: title, match: false }];
  // Every word of the title with its position.
  const tokens = [...title.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ start: m.index ?? 0, text: m[0] }));
  const marks: [number, number][] = [];
  const used = new Set<number>();
  for (const w of typed) {
    const i = tokens.findIndex((tk, j) => !used.has(j) && spellings(fold(tk.text)).some((s) => s.startsWith(w)));
    if (i < 0) continue;
    used.add(i);
    const length = prefixLength(tokens[i].text, w);
    if (length > 0) marks.push([tokens[i].start, tokens[i].start + length]);
  }
  marks.sort((a, b) => a[0] - b[0]);
  const parts: TextPart[] = [];
  let at = 0;
  for (const [start, end] of marks) {
    if (start > at) parts.push({ text: title.slice(at, start), match: false });
    parts.push({ text: title.slice(start, end), match: true });
    at = end;
  }
  if (at < title.length) parts.push({ text: title.slice(at), match: false });
  return parts;
}

// ---- Stop mode ----

export type Translatable = { key: Key; params?: Params };

/**
 * What the alarm will do, in one honest line: "Rings about 2 min before you arrive", "Rings
 * 300 m before the stop" or "Rings when you're 500 m away". `distance` is the formatted radius.
 */
export function ruleLine(wake: Pick<WakeOptions, 'mode' | 'wakeBy' | 'minutesBefore'>, distance: string): Translatable {
  if (wake.mode === 'leave') return { key: 'map.rule.leave', params: { distance: nbsp(distance) } };
  if (wake.wakeBy === 'time') return { key: 'map.rule.time', params: { minutes: wake.minutesBefore } };
  return { key: 'map.rule.distance', params: { distance: nbsp(distance) } };
}

/** A dropped pin (long-press or pin mode) rather than a stop or an address. */
export function isDroppedPin(place: Place): boolean {
  return place.id.startsWith('pin:');
}

export function droppedPin(latitude: number, longitude: number, name: string): Place {
  return {
    id: `pin:${latitude.toFixed(5)},${longitude.toFixed(5)}`,
    name,
    context: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    latitude,
    longitude,
  };
}

/**
 * A place from a "Show on map" link (stopwake://stop/{id}): a dropped pin or coordinates carry
 * their position in the id; a stop has its full name after "stop:". Null for anything else.
 */
export function parsePlaceLink(id: string): { kind: 'stop'; name: string } | { kind: 'point'; latitude: number; longitude: number } | null {
  const point = /^(?:pin|coords|here):(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(id);
  if (point) {
    const latitude = Number(point[1]);
    const longitude = Number(point[2]);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { kind: 'point', latitude, longitude };
    return null;
  }
  if (id.startsWith('stop:') && id.length > 5) return { kind: 'stop', name: id.slice(5) };
  return null;
}

/** Moved far enough to look for nearby stops again (critiques: battery). */
export function movedEnough(from: { latitude: number; longitude: number } | null, to: { latitude: number; longitude: number }, metres = 75): boolean {
  if (!from) return true;
  const north = (to.latitude - from.latitude) * 110_540;
  const east = (to.longitude - from.longitude) * 111_320 * Math.cos((from.latitude * Math.PI) / 180);
  return Math.hypot(north, east) >= metres;
}

/** A theme colour ("#RRGGBB") at an opacity, for gradients over the map. Other formats pass through. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return color;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}
