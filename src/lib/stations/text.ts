/**
 * Text rules for station search. The station database builder (tools/build-stations.ts) indexes
 * names with indexTokens() and the app queries with matchQuery(), so this file is the single
 * source of truth for both sides. It must stay free of imports so Node can run the builder.
 */

// Danish and Norwegian ø and æ are letters of their own, so the index does not fold them away.
const UMLAUT_AS_E: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ø: 'oe', æ: 'ae' };
const UMLAUT_PLAIN: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', ø: 'o', æ: 'ae' };

/** Words that mean the same thing on German stop signs, in both directions. */
const SYNONYMS: Record<string, string[]> = {
  hbf: ['hauptbahnhof'],
  hauptbahnhof: ['hbf'],
  bf: ['bahnhof'],
  bhf: ['bahnhof'],
  bahnhof: ['bf', 'bhf'],
  str: ['strasse'],
  pl: ['platz'],
  st: ['sankt'],
  sankt: ['st'],
  zob: ['busbahnhof'],
  busbahnhof: ['zob'],
};

/** Lowercase, with ß spelled ss. */
export function fold(text: string): string {
  return text.toLowerCase().replace(/ß/g, 'ss');
}

/** Splits into lowercase words on anything that is not a letter or digit. */
export function words(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** "münchen" is typed as "muenchen" or "munchen"; return both, the "ue" form first. */
export function spellings(word: string): string[] {
  const withE = word.replace(/[äöüøæ]/g, (c) => UMLAUT_AS_E[c]);
  const plain = word.replace(/[äöüøæ]/g, (c) => UMLAUT_PLAIN[c]);
  return withE === plain ? [withE] : [withE, plain];
}

function expansions(word: string): string[] {
  const out = [...(SYNONYMS[word] ?? [])];
  // "Hauptstr." and "Hauptstraße" should find each other.
  if (word.length > 3 && word.endsWith('str')) out.push(`${word}asse`);
  if (word.length > 7 && word.endsWith('strasse')) out.push(word.slice(0, -4));
  return out;
}

/** "Frankfurt(M)" and "Frankfurt a.M." are both Frankfurt am Main. */
function expandPlaceAbbreviations(name: string): string {
  return name.replace(/\ba\.\s?M\./g, ' am Main ').replace(/\((?:M|Main)\)/g, ' Main ');
}

/** Every token a station name should be findable by. */
/** Apostrophes inside names: King's Cross, l'Étoile, Earl’s Court. */
const APOSTROPHES = /['’`]/g;

export function indexTokens(name: string): string[] {
  const out = new Set<string>();
  const text = expandPlaceAbbreviations(name);
  // "King's Cross" is typed "kings cross" or "king's cross"; "Gare de l'Est" may be typed "est".
  const all = [...words(text), ...words(text.replace(APOSTROPHES, ''))];
  for (const word of all) {
    for (const spelling of spellings(word)) {
      out.add(spelling);
      for (const extra of expansions(spelling)) out.add(extra);
    }
  }
  return [...out];
}

/** The query words in the form the index stores ("ue" for umlauts). */
export function queryWords(input: string): string[] {
  return words(input.replace(APOSTROPHES, '')).map((w) => spellings(w)[0]);
}

/**
 * An FTS5 MATCH expression: every word must match the start of some token, so "heilb hb" finds
 * "Heilbronn Hbf". Returns null when there is nothing to search for.
 */
export function matchQuery(input: string): string | null {
  const ws = queryWords(input);
  if (ws.length === 0) return null;
  return ws.map((w) => `"${w}"*`).join(' AND ');
}

/** "Pfühlpark Süd, Heilbronn" shows as "Pfühlpark Süd" with "Heilbronn" underneath. */
export function splitName(name: string): { title: string; place: string | null } {
  const i = name.lastIndexOf(', ');
  if (i <= 0) return { title: name, place: null };
  return { title: name.slice(0, i), place: name.slice(i + 2) };
}

export const MODE = {
  ICE: 1,
  IC: 2,
  RE: 4,
  RB: 8,
  SBAHN: 16,
  UBAHN: 32,
  TRAM: 64,
  BUS: 128,
  FERRY: 256,
  /** Any train outside Germany (country packs from OpenStreetMap). */
  TRAIN: 512,
  /** Metro, subway or underground outside the German-speaking countries. */
  METRO: 1024,
} as const;

export type StopKind = 'train' | 'sbahn' | 'ubahn' | 'metro' | 'tram' | 'bus' | 'ferry' | 'other';

/** The mode a stop is best known for, which picks its icon and colour. */
export function primaryKind(modes: number): StopKind {
  if (modes & (MODE.ICE | MODE.IC | MODE.RE | MODE.RB | MODE.TRAIN)) return 'train';
  if (modes & MODE.SBAHN) return 'sbahn';
  if (modes & MODE.UBAHN) return 'ubahn';
  if (modes & MODE.METRO) return 'metro';
  if (modes & MODE.TRAM) return 'tram';
  if (modes & MODE.FERRY) return 'ferry';
  if (modes & MODE.BUS) return 'bus';
  return 'other';
}

/** Short labels for the lines that serve a stop, most important first. */
export function modeBadges(modes: number): string[] {
  const out: string[] = [];
  if (modes & MODE.ICE) out.push('ICE');
  if (modes & MODE.IC) out.push('IC');
  if (modes & (MODE.RE | MODE.RB)) out.push('RE');
  if (modes & MODE.TRAIN) out.push('Train');
  if (modes & MODE.SBAHN) out.push('S');
  if (modes & MODE.UBAHN) out.push('U');
  if (modes & MODE.METRO) out.push('Metro');
  if (modes & MODE.TRAM) out.push('Tram');
  if (modes & MODE.BUS) out.push('Bus');
  if (modes & MODE.FERRY) out.push('Ferry');
  return out;
}
