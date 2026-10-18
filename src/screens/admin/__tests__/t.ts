// The English admin translator for the tests (the screens pass useI18n().t).
import { admin } from '../../../i18n/en/admin';
import { fill, type AdminT } from '../lib/text';

export const t: AdminT = (key, params) => fill(admin[key], params);
