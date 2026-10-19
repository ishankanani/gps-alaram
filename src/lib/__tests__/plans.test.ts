import { beforeAll, describe, expect, it } from 'vitest';

import { canAddFavourite, effectiveStrength, FREE_FAVOURITES, strengthAllowed } from '../plans';
import { setRemoteMonetizationMode } from '../monetization';

// These gates are the premium mode's; free_ads unlocks everything (monetization.test.ts).
beforeAll(() => setRemoteMonetizationMode('premium'));

describe('free and Pro', () => {
  it('keeps Heavy sleeper for Pro', () => {
    expect(strengthAllowed('heavy', false)).toBe(false);
    expect(strengthAllowed('heavy', true)).toBe(true);
    expect(strengthAllowed('gentle', false)).toBe(true);
    expect(effectiveStrength('heavy', false)).toBe('normal');
    expect(effectiveStrength('heavy', true)).toBe('heavy');
    expect(effectiveStrength('gentle', false)).toBe('gentle');
  });

  it('allows three favourites for free', () => {
    expect(FREE_FAVOURITES).toBe(3);
    expect(canAddFavourite(2, false)).toBe(true);
    expect(canAddFavourite(3, false)).toBe(false);
    expect(canAddFavourite(30, true)).toBe(true);
  });
});
