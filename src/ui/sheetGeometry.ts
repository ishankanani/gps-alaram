import { layout } from './tokens';

// MapSheet geometry (ui-direction-a 3.17 and the critiques' layout model). Pure, so it is tested.
//
// Browse and search modes: the sheet is absolutely positioned at the screen bottom with the height
// of its `expanded` snap plus whatever sits under it (the tab bar), and moves with translateY on
// the native driver. Snaps are heights above that bottom offset:
//   available = frame height - top inset - bottom offset
//   peek = 160, half = round(0.45 x available), expanded = available - 72

export type SheetSnap = 'peek' | 'half' | 'expanded';

export const SNAP_ORDER: readonly SheetSnap[] = ['peek', 'half', 'expanded'];

export type SheetGeometry = {
  available: number;
  heights: Record<SheetSnap, number>;
  /** The sheet's layout height: expanded plus the bottom offset (it reaches the screen bottom). */
  layoutHeight: number;
  /** translateY for each snap (expanded = 0, peek is the largest). */
  translate: Record<SheetSnap, number>;
  /** Stop mode: the most the auto-height sheet may take. */
  fitMaxHeight: number;
};

export function sheetGeometry(frameHeight: number, topInset: number, bottomOffset: number): SheetGeometry {
  const available = Math.max(0, frameHeight - topInset - bottomOffset);
  const expanded = Math.max(layout.sheetPeek, available - layout.sheetExpandedGap);
  const half = Math.min(expanded, Math.max(layout.sheetPeek, Math.round(layout.sheetHalfRatio * available)));
  const peek = Math.min(layout.sheetPeek, expanded);
  const heights = { peek, half, expanded };
  return {
    available,
    heights,
    layoutHeight: expanded + bottomOffset,
    translate: { peek: expanded - peek, half: expanded - half, expanded: 0 },
    fitMaxHeight: Math.round(layout.sheetStopMaxRatio * frameHeight),
  };
}

/**
 * Where a released drag settles: with a fling (|vy| > 0.6) the next snap in that direction,
 * otherwise the nearest one. `position` is the current translateY.
 */
export function settleSnap(geometry: SheetGeometry, position: number, vy: number): SheetSnap {
  const byTranslate = [...SNAP_ORDER].sort((a, b) => geometry.translate[a] - geometry.translate[b]);
  if (Math.abs(vy) > 0.6) {
    if (vy > 0) {
      // Downwards: the first snap below the current position, else the lowest.
      return byTranslate.find((s) => geometry.translate[s] > position + 1) ?? 'peek';
    }
    return [...byTranslate].reverse().find((s) => geometry.translate[s] < position - 1) ?? 'expanded';
  }
  return byTranslate.reduce((best, s) =>
    Math.abs(geometry.translate[s] - position) < Math.abs(geometry.translate[best] - position) ? s : best,
  );
}

/** One snap up (increment) or down (decrement), for the grabber's accessibility actions. */
export function stepSnap(snap: SheetSnap, direction: 'up' | 'down'): SheetSnap {
  const i = SNAP_ORDER.indexOf(snap);
  return SNAP_ORDER[Math.max(0, Math.min(SNAP_ORDER.length - 1, i + (direction === 'up' ? 1 : -1)))];
}

/** Stop mode: a release past 25 % of the sheet's height, or a downward fling, dismisses it. */
export function shouldDismiss(height: number, translate: number, vy: number): boolean {
  return vy > 0.6 || translate > height * 0.25;
}
