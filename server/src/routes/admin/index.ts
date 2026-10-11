/**
 * Every /v1/admin route (spec 2.4, 2.10). The router refuses to start if any of them is
 * registered with an auth level other than `admin` (4.5).
 */
import type { AppRoute } from '../../context.ts';
import { adminAuditRoutes } from './audit.ts';
import { adminDashboardRoutes } from './dashboard.ts';
import { adminNoteRoutes } from './notes.ts';
import { adminPriceRoutes } from './prices.ts';
import { adminPromoRoutes } from './promo-codes.ts';
import { adminSettingsRoutes } from './settings.ts';
import { adminStoreEventRoutes } from './store-events.ts';
import { adminUserRoutes } from './users.ts';

export const adminRoutes: AppRoute[] = [
  ...adminDashboardRoutes,
  ...adminUserRoutes,
  ...adminNoteRoutes,
  ...adminPromoRoutes,
  ...adminPriceRoutes,
  ...adminSettingsRoutes,
  ...adminAuditRoutes,
  ...adminStoreEventRoutes,
];
