/**
 * Text rules for station search. The station database builder (tools/build-stations.ts) indexes
 * names with indexTokens() and the app queries with matchQuery(), so this file is the single
 * source of truth for both sides. It must stay free of imports so Node can run the builder.
 */

const UMLAUT_AS_E: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue' };
const UMLAUT_PLAIN: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u' };

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
  const withE = word.replace(/[äöü]/g, (c) => UMLAUT_AS_E[c]);
  const plain = word.replace(/[äöü]/g, (c) => UMLAUT_PLAIN[c]);
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
export function indexTokens(name: string): string[] {
  const out = new Set<string>();
  for (const word of words(expandPlaceAbbreviations(name))) {
    for (const spelling of spellings(word)) {
      out.add(spelling);
      for (const extra of expansions(spelling)) out.add(extra);
    }
  }
  return [...out];
}

/** The query words in the form the index stores ("ue" for umlauts). */
export function queryWords(input: string): string[] {
  return words(input).map((w) => spellings(w)[0]);
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
} as const;

export type StopKind = 'train' | 'sbahn' | 'ubahn' | 'tram' | 'bus' | 'ferry' | 'other';

/** The mode a stop is best known for, which picks its icon and colour. */
export function primaryKind(modes: number): StopKind {
  if (modes & (MODE.ICE | MODE.IC | MODE.RE | MODE.RB)) return 'train';
  if (modes & MODE.SBAHN) return 'sbahn';
  if (modes & MODE.UBAHN) return 'ubahn';
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
  if (modes & MODE.SBAHN) out.push('S');
  if (modes & MODE.UBAHN) out.push('U');
  if (modes & MODE.TRAM) out.push('Tram');
  if (modes & MODE.BUS) out.push('Bus');
  if (modes & MODE.FERRY) out.push('Ferry');
  return out;
}
