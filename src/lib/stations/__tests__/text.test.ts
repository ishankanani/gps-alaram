import { describe, expect, it } from 'vitest';

import { indexTokens, matchQuery, MODE, modeBadges, primaryKind, queryWords, splitName } from '../text';

describe('indexTokens', () => {
  it('indexes umlauts both ways', () => {
    const t = indexTokens('München Hbf');
    expect(t).toEqual(expect.arrayContaining(['muenchen', 'munchen', 'hbf', 'hauptbahnhof']));
  });

  it('expands street and station abbreviations', () => {
    expect(indexTokens('Konrad-Adenauer-Str., Laupheim')).toEqual(expect.arrayContaining(['str', 'strasse']));
    expect(indexTokens('Hauptstraße, Ulm')).toEqual(expect.arrayContaining(['hauptstrasse', 'hauptstr']));
    expect(indexTokens('Heilbronn Hauptbahnhof')).toContain('hbf');
    expect(indexTokens('Bf Aalen')).toContain('bahnhof');
  });

  it('finds names with apostrophes with or without them', () => {
    const tokens = indexTokens("King's Cross St. Pancras");
    expect(tokens).toContain('kings');
    expect(tokens).toContain('king');
    expect(queryWords("king's cross")).toEqual(['kings', 'cross']);
    expect(indexTokens('Gare de l’Est')).toEqual(expect.arrayContaining(['lest', 'est']));
  });

  it('spells out Frankfurt am Main', () => {
    expect(indexTokens('Frankfurt(M)Hauptwache')).toEqual(expect.arrayContaining(['frankfurt', 'main', 'hauptwache']));
    expect(indexTokens('Hauptwache, Frankfurt a.M.')).toEqual(expect.arrayContaining(['main', 'am']));
  });
});

describe('matchQuery', () => {
  it('turns words into prefix terms in the indexed spelling', () => {
    expect(matchQuery('München Hb')).toBe('"muenchen"* AND "hb"*');
    expect(matchQuery('Straße')).toBe('"strasse"*');
  });

  it('strips characters that would break FTS syntax', () => {
    expect(matchQuery('"Ulm" OR *')).toBe('"ulm"* AND "or"*');
    expect(matchQuery('  ,. ')).toBeNull();
  });
});

describe('names and modes', () => {
  it('splits local stop names into stop and town', () => {
    expect(splitName('Pfühlpark Süd, Heilbronn')).toEqual({ title: 'Pfühlpark Süd', place: 'Heilbronn' });
    expect(splitName('Heilbronn Hbf')).toEqual({ title: 'Heilbronn Hbf', place: null });
  });

  it('picks the main kind and badges', () => {
    const hbf = MODE.ICE | MODE.RE | MODE.SBAHN | MODE.BUS;
    expect(primaryKind(hbf)).toBe('train');
    expect(primaryKind(MODE.UBAHN | MODE.TRAM | MODE.BUS)).toBe('ubahn');
    expect(primaryKind(MODE.BUS)).toBe('bus');
    expect(modeBadges(hbf)).toEqual(['ICE', 'RE', 'S', 'Bus']);
  });
});
