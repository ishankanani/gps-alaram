import type { SetupStatus } from '../../../modules/trip-alarm/src/TripAlarm.types';
import type { Key } from '../../i18n';

// The "Get ready" checklist (ui-direction-a 4.3 Setup, merged with Permissions by ui-critiques):
// which items exist, which are required, which are done, and the battery-saver path for the
// phone's brand. Pure, no React Native, so it is tested.

export type SetupItemKey = 'location' | 'services' | 'notifications' | 'fullscreen' | 'exact' | 'battery';

/** Without these a trip can't run (setupReady in src/state/setup.ts says the same). */
export const REQUIRED_ITEMS: readonly SetupItemKey[] = ['location', 'services', 'notifications'];
/** These make the alarm more reliable. */
export const RECOMMENDED_ITEMS: readonly SetupItemKey[] = ['fullscreen', 'exact', 'battery'];

export function itemDone(status: SetupStatus, key: SetupItemKey): boolean {
  switch (key) {
    case 'location':
      return status.location === 'precise';
    case 'services':
      return status.locationServices;
    case 'notifications':
      return status.notifications;
    case 'fullscreen':
      return status.fullScreenAlarm;
    case 'exact':
      return status.exactAlarms;
    case 'battery':
      return status.batteryUnrestricted;
  }
}

export type SetupSummary = {
  requiredMissing: number;
  recommendedMissing: number;
  done: number;
  total: number;
  ready: boolean;
};

export function summarize(status: SetupStatus): SetupSummary {
  const requiredMissing = REQUIRED_ITEMS.filter((k) => !itemDone(status, k)).length;
  const recommendedMissing = RECOMMENDED_ITEMS.filter((k) => !itemDone(status, k)).length;
  const total = REQUIRED_ITEMS.length + RECOMMENDED_ITEMS.length;
  return { requiredMissing, recommendedMissing, done: total - requiredMissing - recommendedMissing, total, ready: requiredMissing === 0 };
}

/** Items that were missing in `before` and are done in `after` (for the "Notifications allowed" toast). */
export function newlyDone(before: SetupStatus | null, after: SetupStatus | null): SetupItemKey[] {
  if (!before || !after) return [];
  return [...REQUIRED_ITEMS, ...RECOMMENDED_ITEMS].filter((k) => !itemDone(before, k) && itemDone(after, k));
}

/** Battery savers known to close background apps (see dontkillmyapp.com), by brand. */
const OEM: { brands: string[]; hint: Key; slug: string }[] = [
  { brands: ['samsung'], hint: 'setup.battery.samsung', slug: 'samsung' },
  { brands: ['xiaomi', 'redmi', 'poco'], hint: 'setup.battery.xiaomi', slug: 'xiaomi' },
  { brands: ['oppo', 'realme'], hint: 'setup.battery.oppo', slug: 'oppo' },
  { brands: ['oneplus'], hint: 'setup.battery.oneplus', slug: 'oneplus' },
  { brands: ['vivo'], hint: 'setup.battery.vivo', slug: 'vivo' },
  { brands: ['huawei', 'honor'], hint: 'setup.battery.huawei', slug: 'huawei' },
];

function oem(manufacturer: string | null | undefined) {
  const m = (manufacturer ?? '').toLowerCase();
  return m ? (OEM.find((o) => o.brands.some((b) => m.includes(b))) ?? null) : null;
}

/** The brand-specific battery path (a setup.battery.* key), or null for other phones. */
export function batteryHint(manufacturer: string | null | undefined): Key | null {
  return oem(manufacturer)?.hint ?? null;
}

/** dontkillmyapp.com, on the page of the phone's brand when it has one. */
export function batteryHelpUrl(manufacturer: string | null | undefined): string {
  const o = oem(manufacturer);
  return o ? `https://dontkillmyapp.com/${o.slug}` : 'https://dontkillmyapp.com/';
}
