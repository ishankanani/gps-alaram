import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { ProReason } from '../lib/plans';
import type { IconName } from '../ui/components/Icon';

// Every route of ui-direction-a 4.1 (with the critiques' changes) and the admin routes of
// backend-spec 7.7, with their params. Params are serialisable: no callbacks (pickers answer
// through src/navigation/results.ts), no class instances.

/** The four tabs (4.2). Search and stop are MapSheet modes, not routes. */
export type TabParamList = {
  /** "Show on map" from anywhere: opens stop mode for this stop (or place id). */
  MapTab: { stopId?: string } | undefined;
  SavedTab: undefined;
  ActivityTab: undefined;
  AccountTab: undefined;
};

/**
 * Where Setup was opened from: its title follows ("Almost ready", "Alarm reliability", "Before you
 * go"). With 'trip', a trip is waiting in the trip provider and Continue starts it.
 */
export type SetupEntry = 'onboarding' | 'settings' | 'account' | 'trip' | 'arrived';

/** One row of a ModalSheet picker or action menu. */
export type SheetOptionSpec = {
  id: string;
  label: string;
  description?: string;
  icon?: IconName;
  /** Single-choice pickers: a radio on every row, this one checked. */
  selected?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  /** A PRO badge; the caller opens the Paywall when this id comes back. */
  locked?: boolean;
};

export type ModalSheetParams = {
  /** Set by openSheet(); the answer goes back through it. */
  requestId: string;
  title?: string;
  message?: string;
  options: SheetOptionSpec[];
};

export type RootStackParamList = {
  // Onboarding and setup. Permissions priming is merged into Setup ("Get ready", ui-critiques).
  Onboarding: undefined;
  Setup: { entry?: SetupEntry; focus?: 'battery' } | undefined;

  Tabs: NavigatorScreenParams<TabParamList> | undefined;

  // The trip
  Trip: undefined;
  Arrived: { tripId?: string | null } | undefined;
  TripDetail: { tripId: string };

  // Plan
  Paywall: { reason?: ProReason; previewRegion?: string } | undefined;
  Redeem: { code?: string } | undefined;

  // Account (modals)
  SignIn: { email?: string } | undefined;
  SignUp: undefined;
  ForgotPassword: { email?: string } | undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
  DeleteAccount: undefined;
  RenameFavourite: { favouriteId: string };
  /** A country list with its own search; answers through results.ts with the chosen ISO codes. */
  CountryPicker: { requestId: string; selected?: string[]; multiple?: boolean; title?: string };

  // Settings
  Settings: undefined;
  AlarmDefaults: undefined;
  /** 'modal' when opened from onboarding. */
  Language: { presentation?: 'modal' | 'card' } | undefined;
  Countries: undefined;
  OfflineMaps: undefined;
  Help: undefined;
  HelpArticle: { article: string };
  Legal: { doc?: 'privacy' | 'terms' } | undefined;
  Licences: undefined;
  About: undefined;

  /** Pickers and action menus: a native formSheet that fits its content. */
  ModalSheet: ModalSheetParams;

  // Admin (registered only for admins)
  AdminHome: undefined;
  AdminUsers: { filter?: string; query?: string } | undefined;
  AdminUser: { userId: string };
  AdminEditUser: { userId: string };
  AdminGrant: { userId: string };
  AdminChangePlan: { userId: string };
  AdminExtend: { userId: string; grantId?: string };
  AdminNote: { userId: string; noteId?: string };
  AdminPromoCodes: { status?: string } | undefined;
  AdminPromoCode: { codeId: string };
  /** Create a code, or edit one with codeId. */
  AdminPromoNew: { codeId?: string } | undefined;
  AdminPrices: undefined;
  /** Without a country: Add country. */
  AdminPrice: { country?: string } | undefined;
  AdminSettings: undefined;
  AdminAudit: { userId?: string; adminId?: string; action?: string } | undefined;
  /** The before → after detail of one audit entry. */
  AdminAuditEntry: { entryId: string };
  AdminStoreEvents: { status?: string } | undefined;
  AdminStoreEvent: { eventId: string };
};

export type RootRouteName = keyof RootStackParamList;

/** Routes of the admin stack: registered (and linked) only while the session's role is admin. */
export const ADMIN_ROUTES = [
  'AdminHome',
  'AdminUsers',
  'AdminUser',
  'AdminEditUser',
  'AdminGrant',
  'AdminChangePlan',
  'AdminExtend',
  'AdminNote',
  'AdminPromoCodes',
  'AdminPromoCode',
  'AdminPromoNew',
  'AdminPrices',
  'AdminPrice',
  'AdminSettings',
  'AdminAudit',
  'AdminAuditEntry',
  'AdminStoreEvents',
  'AdminStoreEvent',
] as const satisfies readonly RootRouteName[];

export type AdminRouteName = (typeof ADMIN_ROUTES)[number];

export function isAdminRoute(name: string | undefined): name is AdminRouteName {
  return !!name && (ADMIN_ROUTES as readonly string[]).includes(name);
}

/** Props of a screen in the root stack. */
export type RootScreenProps<T extends RootRouteName> = NativeStackScreenProps<RootStackParamList, T>;

/** Props of a tab root: its own tab navigation, plus the root stack around it. */
export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

declare global {
  // useNavigation() and navigationRef are typed with the root stack everywhere.
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
