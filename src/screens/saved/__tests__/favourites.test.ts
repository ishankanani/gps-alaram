import { describe, expect, it } from 'vitest';

import type { Place } from '../../../lib/geocode';
import { cleanName, insertAt, moveFavourite, originalNameOf, renamed } from '../favourites';

const hbf: Place = { id: 'de:1', name: 'München Hbf', context: 'München', latitude: 48.14, longitude: 11.56, kind: 'train', modes: 7 };

describe('favourites', () => {
  it('moves and inserts with clamped positions', () => {
    expect(moveFavourite(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveFavourite(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveFavourite(['a', 'b', 'c'], 1, 9)).toEqual(['a', 'c', 'b']);
    expect(moveFavourite(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
    expect(insertAt(['a', 'c'], 'b', 1)).toEqual(['a', 'b', 'c']);
    expect(insertAt(['a'], 'b', 7)).toEqual(['a', 'b']);
  });

  it('renames and goes back to the original name', () => {
    const work = renamed(hbf, '  Work   commute ');
    expect(work).toMatchObject({ id: 'de:1', name: 'Work commute', originalName: 'München Hbf' });
    expect(originalNameOf(work)).toBe('München Hbf');
    expect(originalNameOf(hbf)).toBeNull();

    const again = renamed(work, 'Office');
    expect(again).toMatchObject({ name: 'Office', originalName: 'München Hbf' });

    const back = renamed(again, '');
    expect(back.name).toBe('München Hbf');
    expect('originalName' in back).toBe(false);
    expect(renamed(work, 'München Hbf').name).toBe('München Hbf');
    expect(cleanName('x'.repeat(60))).toHaveLength(40);
  });
});
