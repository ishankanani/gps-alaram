import { useState, type ReactNode } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { adminApi, invalidateAdmin, refreshConfigAfterAdminSave, useAdminQuery } from '../../api/admin';
import type { AdminSetting, AnnouncementSetting, ApiLang, PaidPlan, ProFeature, SettingKey } from '../../api/types';
import { useI18n } from '../../i18n';
import { createRequest } from '../../navigation/results';
import { openSheet } from '../../navigation/sheet';
import type { RootScreenProps } from '../../navigation/types';
import {
  ANNOUNCEMENT_TONE,
  AppText,
  Banner,
  Button,
  Card,
  Chip,
  ChipWrap,
  DateField,
  IconButton,
  ListItem,
  Section,
  SegmentedControl,
  SkeletonCard,
  StickyFooter,
  Stepper,
  SwitchRow,
  TextField,
  useTheme,
} from '../../ui';
import { AdminScreen, useAdminContext, withAdmin } from './components/AdminFrame';
import { useAdminAction } from './components/actions';
import { ErrorState, Footnote } from './components/parts';
import { endOfLocalDay } from './lib/durations';
import { formatDate, formatRelative } from './lib/format';
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_LANGS,
  ANNOUNCEMENT_TITLE_MAX,
  announcementId,
  changedKeys,
  checkSettings,
  cleanAnnouncement,
  LANGUAGE_NAMES,
  lastChange,
  newAnnouncement,
  settingsPatch,
  valuesFrom,
  type SettingValues,
} from './lib/settings';
import type { AdminKey } from './lib/text';
import { PLAN_LABEL } from './lib/users';

const TRIAL_CHIPS = [0, 3, 7, 14, 30];
const FEATURES: { key: ProFeature; label: AdminKey }[] = [
  { key: 'heavyAlarm', label: 'admin.settings.feature.heavyAlarm' },
  { key: 'unlimitedFavourites', label: 'admin.settings.feature.unlimitedFavourites' },
  { key: 'offlineMap', label: 'admin.settings.feature.offlineMap' },
];
const LEVELS: AnnouncementSetting['level'][] = ['info', 'success', 'warning', 'critical'];
const PAID: PaidPlan[] = ['monthly', 'yearly', 'lifetime'];

/**
 * Route `AdminSettings` (backend-spec 6.5, ui-critiques "Admin: app settings"): every setting with
 * its default or who changed it, the announcement editor with a live preview, and one Publish for
 * all changes (PATCH /admin/settings, all or nothing).
 */
function AdminSettings(_props: RootScreenProps<'AdminSettings'>) {
  const { t } = useI18n();
  const query = useAdminQuery('settings', () => adminApi.settings());
  if (!query.data) {
    return (
      <AdminScreen title={t('admin.settings.title')} testID="screen-AdminSettings">
        {query.error ? (
          <ErrorState error={query.error} title={t('admin.settings.loadFailed')} onRetry={query.reload} />
        ) : (
          <View style={styles.pad}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        )}
      </AdminScreen>
    );
  }
  return (
    <SettingsEditor
      items={query.data.items}
      fetchedAt={query.fetchedAt}
      stale={query.stale}
      refreshing={query.refreshing}
      onRefresh={query.refresh}
      navigation={_props.navigation}
    />
  );
}

function SettingsEditor({
  items,
  fetchedAt,
  stale,
  refreshing,
  onRefresh,
  navigation,
}: {
  items: AdminSetting[];
  fetchedAt: number | null;
  stale: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  navigation: RootScreenProps<'AdminSettings'>['navigation'];
}) {
  const { t } = useI18n();
  const theme = useTheme();
  const act = useAdminAction();
  const { offline } = useAdminContext();
  const { values: initial, defaults } = valuesFrom(items);
  const [edited, setEdited] = useState<SettingValues | null>(null);
  const [tried, setTried] = useState(false);
  const [newProduct, setNewProduct] = useState('');
  const [newProductPlan, setNewProductPlan] = useState<PaidPlan>('yearly');
  const v = edited ?? initial;
  const changed = changedKeys(initial, v);
  const errors = checkSettings(v);
  const errorCount = Object.keys(errors).filter((k) => changed.some((c) => k === c || k.startsWith(`${c}.`))).length;
  const err = (key: string) => (tried && errors[key] ? t(errors[key]!) : null);
  const byKey = new Map(items.map((i) => [i.key, i]));
  const last = lastChange(items);

  const set = <K extends SettingKey>(key: K, value: SettingValues[K]) => setEdited({ ...v, [key]: value });
  const ann = v.announcement;
  const setAnn = (patch: Partial<AnnouncementSetting>) => {
    if (ann) set('announcement', { ...ann, ...patch });
  };
  const setText = (lang: ApiLang, patch: { title?: string | null; body?: string }) => {
    if (!ann) return;
    const current = ann.texts[lang] ?? { title: null, body: '' };
    setAnn({ texts: { ...ann.texts, [lang]: { ...current, ...patch } } as AnnouncementSetting['texts'] });
  };

  /** "Default", or "Edited by Alex Admin · 1 d ago", with Reset to default. */
  const meta = (key: SettingKey): ReactNode => {
    const item = byKey.get(key);
    const isDefault = JSON.stringify(v[key]) === JSON.stringify(defaults[key]);
    const pending = changed.includes(key);
    const label = pending
      ? t('admin.settings.unsaved')
      : item?.overridden && item.updatedAt
        ? t('admin.common.editedBy', { name: item.updatedBy?.displayName ?? item.updatedBy?.publicId ?? t('admin.common.unknown'), when: formatRelative(item.updatedAt, t) })
        : t('admin.common.default');
    return (
      <View style={styles.meta}>
        <AppText variant="bodyS" color={pending ? 'primary' : 'textTertiary'} style={styles.flex}>
          {label}
        </AppText>
        {!isDefault ? (
          <Button label={t('admin.common.resetDefault')} variant="ghost" size="S" onPress={() => set(key, defaults[key] as never)} />
        ) : null}
      </View>
    );
  };

  const pickCountries = async () => {
    if (!ann) return;
    const { requestId, result } = createRequest<string[]>();
    navigation.navigate('CountryPicker', { requestId, selected: ann.countries ?? [], multiple: true, title: t('admin.ann.countries') });
    const picked = await result;
    if (picked) setAnn({ countries: picked.length ? picked : null });
  };

  const addTranslation = async () => {
    if (!ann) return;
    const missing = ANNOUNCEMENT_LANGS.filter((l) => !ann.texts[l]);
    const id = await openSheet({ title: t('admin.ann.addTranslation'), options: missing.map((l) => ({ id: l, label: t(LANGUAGE_NAMES[l]) })) });
    if (id) setText(id as ApiLang, { title: null, body: '' });
  };

  const removeTranslation = (lang: ApiLang) => {
    if (!ann) return;
    const texts = { ...ann.texts };
    delete texts[lang];
    setAnn({ texts });
  };

  const publish = () => {
    setTried(true);
    if (errorCount > 0) return;
    const prepared: SettingValues = v.announcement ? { ...v, announcement: cleanAnnouncement(v.announcement) } : v;
    const patch = settingsPatch(initial, prepared, defaults);
    void act({
      title: t('admin.settings.publishTitle'),
      message: t('admin.settings.publishBody', { keys: changed.map((k) => t(SETTING_LABEL[k])).join(', ') }),
      confirmLabel: t('admin.settings.publish'),
      icon: 'application-cog-outline',
      run: () => adminApi.patchSettings(patch),
      success: () => t('admin.settings.published'),
      after: () => {
        setEdited(null);
        setTried(false);
        invalidateAdmin('settings', 'audit', 'dashboard');
        refreshConfigAfterAdminSave();
      },
    });
  };

  const dirty = changed.length > 0;
  const footer = dirty ? (
    <StickyFooter helper={tried && errorCount ? t('admin.settings.fix', { count: errorCount }) : t('admin.settings.pending', { count: changed.length })}>
      <View style={styles.footerRow}>
        <Button
          label={t('admin.settings.discard')}
          variant="ghost"
          size="L"
          onPress={() => {
            setEdited(null);
            setTried(false);
          }}
        />
        <Button label={t('admin.settings.publish')} size="L" onPress={publish} disabled={offline} style={styles.flex} testID="admin-settings-publish" />
      </View>
    </StickyFooter>
  ) : undefined;

  const products = Object.entries(v['store.productPlans']);

  return (
    <AdminScreen
      title={t('admin.settings.title')}
      fetchedAt={fetchedAt}
      stale={stale}
      keyboard
      footer={footer}
      refreshControl={dirty ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.color.primary]} tintColor={theme.color.primary} />}
      testID="screen-AdminSettings">
      {last?.updatedAt ? (
        <AppText variant="bodyS" color="textTertiary" style={styles.lastChange}>
          {t('admin.settings.lastChange', {
            name: last.updatedBy?.displayName ?? last.updatedBy?.publicId ?? t('admin.common.unknown'),
            when: formatRelative(last.updatedAt, t),
          })}
        </AppText>
      ) : null}

      <Section title={t('admin.settings.free')} first>
        <ListItem
          title={t('admin.settings.freeFavourites')}
          subtitle={t('admin.settings.freeFavouritesHelp')}
          subtitleLines={2}
          accessible={false}
          trailing={
            <Stepper
              value={v['limits.freeFavourites']}
              onChange={(n) => set('limits.freeFavourites', n)}
              min={0}
              max={100}
              accessibilityLabel={t('admin.settings.freeFavourites')}
            />
          }
        />
      </Section>
      <View style={styles.metaWrap}>{meta('limits.freeFavourites')}</View>

      <Section title={t('admin.settings.pro')} footer={t('admin.settings.proFoot')}>
        {FEATURES.map((f) => (
          <SwitchRow
            key={f.key}
            title={t(f.label)}
            value={v['pro.features'][f.key]}
            onValueChange={(on) => set('pro.features', { ...v['pro.features'], [f.key]: on })}
          />
        ))}
      </Section>
      <View style={styles.metaWrap}>{meta('pro.features')}</View>

      <Section title={t('admin.settings.trial')} footer={t('admin.settings.trialFoot')}>
        <View style={styles.inner}>
          <ChipWrap radio accessibilityLabel={t('admin.settings.trial')}>
            {[...new Set([...TRIAL_CHIPS, v['pricing.trialDays']])]
              .sort((a, b) => a - b)
              .map((d) => (
                <Chip key={d} label={t('admin.price.trialDays', { days: d })} selected={v['pricing.trialDays'] === d} onPress={() => set('pricing.trialDays', d)} />
              ))}
          </ChipWrap>
        </View>
      </Section>
      <View style={styles.metaWrap}>{meta('pricing.trialDays')}</View>

      <Section title={t('admin.settings.access')}>
        <SwitchRow
          title={t('admin.settings.signUp')}
          subtitle={t('admin.settings.signUpHelp')}
          value={v['auth.signUpEnabled']}
          onValueChange={(on) => set('auth.signUpEnabled', on)}
        />
        <SwitchRow
          title={t('admin.settings.codes')}
          subtitle={t('admin.settings.codesHelp')}
          value={v['promo.redeemEnabled']}
          onValueChange={(on) => set('promo.redeemEnabled', on)}
        />
      </Section>
      <View style={styles.metaWrap}>
        {meta('auth.signUpEnabled')}
        {meta('promo.redeemEnabled')}
      </View>

      <Section title={t('admin.settings.versions')} footer={t('admin.settings.versionsFoot')}>
        <View style={styles.inner}>
          <TextField
            label={t('admin.settings.minVersion')}
            value={v['app.minVersion']}
            onChangeText={(s) => set('app.minVersion', s.trim())}
            placeholder="1.0.0"
            error={err('app.minVersion')}
          />
          {meta('app.minVersion')}
          <TextField
            label={t('admin.settings.latestVersion')}
            value={v['app.latestVersion']}
            onChangeText={(s) => set('app.latestVersion', s.trim())}
            placeholder="1.0.0"
            error={err('app.latestVersion')}
          />
          {meta('app.latestVersion')}
        </View>
      </Section>

      <Section title={t('admin.settings.cache')} footer={t('admin.settings.cacheFoot')}>
        <ListItem
          title={t('admin.settings.cacheDays')}
          accessible={false}
          trailing={
            <Stepper value={v['plan.cacheDays']} onChange={(n) => set('plan.cacheDays', n)} min={1} max={90} accessibilityLabel={t('admin.settings.cacheDays')} />
          }
        />
      </Section>
      <View style={styles.metaWrap}>{meta('plan.cacheDays')}</View>

      <Section title={t('admin.settings.support')}>
        <View style={styles.inner}>
          <TextField
            label={t('admin.settings.supportEmail')}
            value={v['support.email']}
            onChangeText={(s) => set('support.email', s.trim())}
            kind="email"
            error={err('support.email')}
          />
          {meta('support.email')}
          <TextField
            label={t('admin.settings.privacy')}
            value={v['links.privacy']}
            onChangeText={(s) => set('links.privacy', s.trim())}
            autoCapitalize="none"
            error={err('links.privacy')}
          />
          {meta('links.privacy')}
          <TextField
            label={t('admin.settings.terms')}
            value={v['links.terms']}
            onChangeText={(s) => set('links.terms', s.trim())}
            autoCapitalize="none"
            error={err('links.terms')}
          />
          {meta('links.terms')}
        </View>
      </Section>

      {/* Announcement */}
      <Section title={t('admin.ann.title')} footer={t('admin.ann.foot')}>
        {ann ? (
          <View style={styles.inner}>
            <View style={styles.flushRow}>
              <SwitchRow title={t('admin.ann.enabled')} subtitle={t('admin.ann.enabledHelp')} value={ann.enabled} onValueChange={(enabled) => setAnn({ enabled })} />
            </View>
            <AppText variant="labelM" color="textSecondary">
              {t('admin.ann.level')}
            </AppText>
            <SegmentedControl
              options={LEVELS.map((l) => ({ value: l, label: t(`admin.ann.level.${l}`) }))}
              value={ann.level}
              onChange={(level) => setAnn({ level })}
              accessibilityLabel={t('admin.ann.level')}
            />
            <TextField
              label={t('admin.ann.titleEn')}
              value={ann.texts.en.title ?? ''}
              onChangeText={(title) => setText('en', { title })}
              maxLength={ANNOUNCEMENT_TITLE_MAX}
              helper={t('admin.ann.count', { count: [...(ann.texts.en.title ?? '')].length, max: ANNOUNCEMENT_TITLE_MAX })}
              error={err('announcement.title.en')}
            />
            <TextField
              label={t('admin.ann.bodyEn')}
              value={ann.texts.en.body}
              onChangeText={(body) => setText('en', { body })}
              variant="multiline"
              maxLength={ANNOUNCEMENT_BODY_MAX}
              error={err('announcement.body.en')}
            />
            {ANNOUNCEMENT_LANGS.filter((l) => ann.texts[l]).map((lang) => (
              <Card
                key={lang}
                variant="outlined"
                title={t(LANGUAGE_NAMES[lang])}
                headerTrailing={<IconButton icon="close" accessibilityLabel={t('admin.ann.removeTranslation', { lang: t(LANGUAGE_NAMES[lang]) })} onPress={() => removeTranslation(lang)} />}>
                <TextField
                  label={t('admin.ann.titleLang')}
                  value={ann.texts[lang]?.title ?? ''}
                  onChangeText={(title) => setText(lang, { title })}
                  maxLength={ANNOUNCEMENT_TITLE_MAX}
                  error={err(`announcement.title.${lang}`)}
                />
                <TextField
                  label={t('admin.ann.bodyLang')}
                  value={ann.texts[lang]?.body ?? ''}
                  onChangeText={(body) => setText(lang, { body })}
                  variant="multiline"
                  maxLength={ANNOUNCEMENT_BODY_MAX}
                  error={err(`announcement.body.${lang}`)}
                />
              </Card>
            ))}
            {ANNOUNCEMENT_LANGS.some((l) => !ann.texts[l]) ? (
              <Button label={t('admin.ann.addTranslation')} icon="translate" variant="secondary" size="M" onPress={() => void addTranslation()} />
            ) : null}
            <AppText variant="bodyS" color="textTertiary">
              {t('admin.ann.fallback')}
            </AppText>
            <TextField
              label={t('admin.ann.link')}
              value={ann.url ?? ''}
              onChangeText={(url) => setAnn({ url: url.trim() || null })}
              placeholder="https://"
              autoCapitalize="none"
              error={err('announcement.url')}
            />
            <ListItem
              icon="earth"
              title={t('admin.ann.countries')}
              value={ann.countries?.length ? ann.countries.join(', ') : t('admin.ann.everyone')}
              chevron
              onPress={() => void pickCountries()}
              style={styles.flushRow}
            />
            <View style={styles.row2}>
              <TextField
                label={t('admin.ann.fromVersion')}
                value={ann.minAppVersion ?? ''}
                onChangeText={(s) => setAnn({ minAppVersion: s.trim() || null })}
                placeholder={t('admin.ann.anyVersion')}
                error={err('announcement.minAppVersion')}
                style={styles.flex}
              />
              <TextField
                label={t('admin.ann.toVersion')}
                value={ann.maxAppVersion ?? ''}
                onChangeText={(s) => setAnn({ maxAppVersion: s.trim() || null })}
                placeholder={t('admin.ann.anyVersion')}
                error={err('announcement.maxAppVersion')}
                style={styles.flex}
              />
            </View>
            <DateField
              label={t('admin.ann.starts')}
              value={ann.startsAt ? new Date(ann.startsAt) : null}
              onChange={(d) => setAnn({ startsAt: d ? d.toISOString() : null })}
              helper={ann.startsAt ? formatDate(ann.startsAt, { weekday: true }) : t('admin.ann.startsNow')}
            />
            <DateField
              label={t('admin.ann.ends')}
              value={ann.endsAt ? new Date(ann.endsAt) : null}
              onChange={(d) => setAnn({ endsAt: d ? endOfLocalDay(d).toISOString() : null })}
              helper={ann.endsAt ? t('admin.promoNew.untilEnd', { date: formatDate(ann.endsAt, { weekday: true }) }) : t('admin.ann.noEnd')}
              error={err('announcement.endsAt')}
            />
            {ann.startsAt || ann.endsAt ? (
              <Button label={t('admin.ann.clearDates')} variant="ghost" size="S" onPress={() => setAnn({ startsAt: null, endsAt: null })} style={styles.left} />
            ) : null}
            <View style={styles.flushRow}>
              <SwitchRow
                title={t('admin.ann.dismissible')}
                subtitle={t('admin.ann.dismissibleHelp')}
                value={ann.dismissible}
                onValueChange={(dismissible) => setAnn({ dismissible })}
              />
            </View>

            <AppText variant="labelM" color="textSecondary">
              {t('admin.ann.preview')}
            </AppText>
            <View style={[styles.previewBox, { backgroundColor: theme.map.placeholder, borderRadius: theme.radius.lg }]}>
              <Banner
                onMap
                tone={ANNOUNCEMENT_TONE[ann.level]}
                icon="bullhorn-outline"
                title={ann.texts.en.title?.trim() || undefined}
                body={ann.texts.en.body.trim() || t('admin.ann.previewEmpty')}
                action={ann.url ? { label: t('admin.ann.learnMore'), onPress: () => {} } : undefined}
                onClose={ann.dismissible ? () => {} : undefined}
              />
            </View>
            <AppText variant="bodyS" color="textTertiary">
              {ann.enabled ? t('admin.ann.idLine', { id: ann.id }) : t('admin.ann.offLine', { id: ann.id })}
            </AppText>
            <Button
              label={t('admin.ann.showAgain')}
              icon="refresh"
              variant="secondary"
              size="M"
              onPress={() => setAnn({ id: announcementId(new Date()) })}
            />
            <Button label={t('admin.ann.remove')} icon="delete-outline" variant="dangerOutline" size="M" onPress={() => set('announcement', null)} />
          </View>
        ) : (
          <View style={styles.inner}>
            <AppText variant="bodyM" color="textSecondary">
              {t('admin.ann.none')}
            </AppText>
            <Button label={t('admin.ann.create')} icon="bullhorn-outline" variant="secondary" size="M" onPress={() => set('announcement', newAnnouncement(new Date()))} />
          </View>
        )}
      </Section>
      <View style={styles.metaWrap}>{meta('announcement')}</View>

      <Section title={t('admin.settings.products')} footer={t('admin.settings.productsFoot')}>
        {products.map(([product, plan]) => (
          <ListItem
            key={product}
            icon="package-variant-closed"
            title={product}
            value={t(PLAN_LABEL[plan])}
            accessible={false}
            trailing={
              <IconButton
                icon="close"
                accessibilityLabel={t('admin.settings.productRemove', { product })}
                onPress={() => {
                  const next = { ...v['store.productPlans'] };
                  delete next[product];
                  set('store.productPlans', next);
                }}
              />
            }
          />
        ))}
        <View style={styles.inner}>
          <TextField label={t('admin.settings.productId')} value={newProduct} onChangeText={setNewProduct} autoCapitalize="none" placeholder="stopwake_pro:yearly" />
          <SegmentedControl options={PAID.map((p) => ({ value: p, label: t(PLAN_LABEL[p]) }))} value={newProductPlan} onChange={setNewProductPlan} accessibilityLabel={t('admin.form.plan')} />
          <Button
            label={t('admin.settings.productAdd')}
            icon="plus"
            variant="secondary"
            size="M"
            disabled={!newProduct.trim()}
            onPress={() => {
              set('store.productPlans', { ...v['store.productPlans'], [newProduct.trim()]: newProductPlan });
              setNewProduct('');
            }}
          />
          {err('store.productPlans') ? (
            <AppText variant="bodyS" color="danger">
              {err('store.productPlans')}
            </AppText>
          ) : null}
        </View>
      </Section>
      <View style={styles.metaWrap}>{meta('store.productPlans')}</View>
      <Footnote>{t('admin.settings.pickUp')}</Footnote>
    </AdminScreen>
  );
}

const SETTING_LABEL: Record<SettingKey, AdminKey> = {
  'limits.freeFavourites': 'admin.settings.freeFavourites',
  'pro.features': 'admin.settings.pro',
  'pricing.trialDays': 'admin.settings.trial',
  announcement: 'admin.ann.title',
  'support.email': 'admin.settings.supportEmail',
  'links.privacy': 'admin.settings.privacy',
  'links.terms': 'admin.settings.terms',
  'app.minVersion': 'admin.settings.minVersion',
  'app.latestVersion': 'admin.settings.latestVersion',
  'auth.signUpEnabled': 'admin.settings.signUp',
  'promo.redeemEnabled': 'admin.settings.codes',
  'plan.cacheDays': 'admin.settings.cacheDays',
  'store.productPlans': 'admin.settings.products',
};

export const AdminSettingsScreen = withAdmin(AdminSettings);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  lastChange: { paddingHorizontal: 32, paddingTop: 8 },
  inner: { padding: 16, gap: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', minHeight: 36, gap: 8 },
  metaWrap: { paddingLeft: 32, paddingRight: 16 },
  flushRow: { marginHorizontal: -16 },
  row2: { flexDirection: 'row', gap: 12 },
  previewBox: { padding: 12 },
  left: { alignSelf: 'flex-start' },
  footerRow: { flexDirection: 'row', gap: 8 },
});
