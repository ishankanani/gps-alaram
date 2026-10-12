import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { apiConfigured, deviceRegion } from '../../api';
import { useApiLanguage } from '../../api/account';
import { fetchConfigFor, useRemoteConfig } from '../../api/config';
import type { PriceRow, ProFeature } from '../../api/types';
import { useI18n, type Key } from '../../i18n';
import { en } from '../../i18n/en';
import type { ProReason } from '../../lib/plans';
import { resolvePrice } from '../../lib/pricing';
import { buy, loadPlans, restore, usePro } from '../../lib/pro';
import type { RootScreenProps } from '../../navigation/types';
import { useToast } from '../../state';
import {
  AppText,
  Banner,
  Button,
  Card,
  ComparisonTable,
  haptics,
  Icon,
  PlanCard,
  Screen,
  SectionHeader,
  SkeletonCard,
  StickyFooter,
  TrialTimeline,
  useTheme,
  type ComparisonRow,
  type IconName,
} from '../../ui';
import { paywallCurrentPlan } from '../account/planStatus';
import { formatDate, openExternal, openWeb } from '../account/shared';
import { plansFromStore, plansFromTable, type ShownPlan, type ShownPlanType } from './prices';

/** How long the paywall waits for Google Play before it shows the table prices (backend-spec 5.3). */
const STORE_WAIT_MS = 5000;
const SCREENSHOTS = process.env.EXPO_PUBLIC_SCREENSHOTS === '1';

const FEATURE_OF: Record<Exclude<ProReason, null>, ProFeature> = {
  heavy: 'heavyAlarm',
  favourites: 'unlimitedFavourites',
  offlineMap: 'offlineMap',
};

const BENEFITS: { feature: ProFeature; icon: IconName; title: Key; body: Key }[] = [
  { feature: 'heavyAlarm', icon: 'alarm-light-outline', title: 'paywall.benefit.heavy', body: 'paywall.benefit.heavyBody' },
  { feature: 'unlimitedFavourites', icon: 'star-outline', title: 'paywall.benefit.favourites', body: 'paywall.benefit.favouritesBody' },
  { feature: 'offlineMap', icon: 'map-check-outline', title: 'paywall.benefit.offlineMap', body: 'paywall.benefit.offlineMapBody' },
];

/** "Germany" for the price source line, or null when we have no name for the region. */
function countryName(code: string | null, lang: string, tr: (key: Key) => string): string | null {
  if (!code) return null;
  const key = `paywall.country.${code.toUpperCase()}`;
  if (key in en) return tr(key as Key);
  try {
    const DisplayNames = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: 'region' }) => { of: (c: string) => string | undefined } })
      .DisplayNames;
    const name = DisplayNames ? new DisplayNames([lang], { type: 'region' }).of(code.toUpperCase()) : undefined;
    return name && name !== code.toUpperCase() ? name : null;
  } catch {
    return null;
  }
}

function addDays(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

/**
 * Route `Paywall` (ui-direction-a 4.3 with the critiques: plans above the fold, one badge per card,
 * trial only when the store offers it, trust row, "Have a code?", the gift state). Prices come from
 * Google Play when connected, else the remote config row, else the built-in table for the region.
 */
export function PaywallScreen({ navigation, route }: RootScreenProps<'Paywall'>) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  useApiLanguage();
  const toast = useToast();
  const pro = usePro();
  const config = useRemoteConfig();
  const reason = route.params?.reason ?? null;
  const previewRegion = route.params?.previewRegion?.toUpperCase() ?? null;

  const [selected, setSelected] = useState<ShownPlanType>('yearly');
  const [timedOutAttempt, setTimedOutAttempt] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pending, setPending] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [compare, setCompare] = useState(false);
  const [previewRow, setPreviewRow] = useState<PriceRow | null>(null);
  const [storeAttempt, setStoreAttempt] = useState(0);

  // Google Play's prices; after 5 s without them, the table stands in (and buying waits).
  useEffect(() => {
    if (!pro.storeConnected || previewRegion) return;
    void loadPlans();
    const timer = setTimeout(() => setTimedOutAttempt(storeAttempt), STORE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [pro.storeConnected, previewRegion, storeAttempt]);

  // Admin preview: another country's resolved row, overrides included.
  useEffect(() => {
    if (!previewRegion) return;
    let alive = true;
    if (apiConfigured) {
      fetchConfigFor(previewRegion)
        .then((c) => {
          if (alive) setPreviewRow(c.prices);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [previewRegion]);

  const waitedForStore = timedOutAttempt === storeAttempt;
  const storePlans = !previewRegion && pro.storeConnected && pro.plans && pro.plans.length > 0 ? pro.plans : null;
  const storeFailed = pro.storeConnected && !previewRegion && !storePlans && (waitedForStore || pro.plansError);
  const loading = pro.storeConnected && !previewRegion && !storePlans && !storeFailed;
  const row = previewRegion ? (previewRow ?? resolvePrice(previewRegion)) : config.prices;

  const plans: ShownPlan[] | null = useMemo(() => {
    if (storePlans) return plansFromStore(storePlans);
    if (loading) return null;
    // The table never promises a trial when a store exists: only Google Play knows who may have one.
    return plansFromTable(row, lang, pro.storeConnected ? null : config.trialDays);
  }, [storePlans, loading, row, lang, pro.storeConnected, config.trialDays]);

  const choice = plans?.find((p) => p.type === selected) ?? plans?.[0] ?? null;
  const regionCode = previewRegion ?? deviceRegion();
  const country = countryName(regionCode, lang, tr);

  const current = pro.isPro ? paywallCurrentPlan(pro, lang, tr) : null;
  const plansVisible = !current || showPlans || !!previewRegion;
  const canBuy = !!choice?.storePlan && !busy && !previewRegion;

  async function purchase() {
    if (!choice || busy) return;
    if (!choice.storePlan) {
      toast.show({ id: 'no-store', message: tr('paywall.noStore'), icon: 'store-off-outline' });
      return;
    }
    setBusy(true);
    setPending(false);
    const result = await buy(choice.storePlan);
    setBusy(false);
    if (result === 'done') {
      haptics.success();
      navigation.goBack();
      toast.show({ id: 'welcome-pro', message: tr('paywall.welcome'), icon: 'crown' });
    } else if (result === 'pending') {
      setPending(true);
    } else if (result === 'failed') {
      haptics.warning();
      toast.show({ id: 'purchase-failed', message: tr('paywall.failed'), error: true });
    }
  }

  async function onRestore() {
    setRestoring(true);
    const active = await restore();
    setRestoring(false);
    if (active) {
      haptics.success();
      toast.show({ id: 'restore', message: tr('paywall.restored'), icon: 'check-circle-outline' });
    } else {
      toast.show({ id: 'restore', message: tr('paywall.restoreNone') });
    }
  }

  // ---- Copy for the selected plan ----
  let cta = tr('paywall.ctaLoading');
  let helper: string | undefined;
  let timeline: string[] | null = null;
  if (choice) {
    if (choice.type === 'yearly' && choice.trialDays) {
      const end = formatDate(addDays(choice.trialDays), lang, 'short');
      const yearPrice = choice.price;
      cta = tr('paywall.ctaTrial', { days: choice.trialDays });
      helper = tr('paywall.helperTrial', { date: end, price: yearPrice });
      timeline = [
        tr('paywall.timelineToday'),
        tr('paywall.timelineCancel', { date: end }),
        tr('paywall.timelineCharge', { date: end, price: yearPrice }),
      ];
    } else if (choice.type === 'yearly') {
      cta = tr('paywall.ctaYearly', { price: choice.price });
      helper = tr('paywall.helperYearly', { price: choice.price });
    } else if (choice.type === 'monthly') {
      cta = tr('paywall.ctaMonthly', { price: choice.price });
      helper = tr('paywall.helperMonthly', { price: choice.price });
    } else {
      cta = tr('paywall.ctaLifetime', { price: choice.price });
      helper = tr('paywall.helperLifetime');
    }
  }

  const reasonFeature = reason ? FEATURE_OF[reason] : null;
  const benefits = [...BENEFITS]
    .filter((b) => config.proFeatures[b.feature] || b.feature === reasonFeature)
    .sort((a, b) => (a.feature === reasonFeature ? -1 : b.feature === reasonFeature ? 1 : 0));
  const headline = reason ? tr(`paywall.headline.${reason}`) : tr('paywall.headline');
  const subtitle = reason === 'favourites' ? tr('paywall.subtitle.favourites', { count: config.limits.freeFavourites }) : tr('paywall.subtitle');

  const compareRows: ComparisonRow[] = [];
  if (config.proFeatures.heavyAlarm) compareRows.push({ feature: tr('paywall.compare.heavy'), free: false, pro: true });
  if (config.proFeatures.unlimitedFavourites) {
    compareRows.push({
      feature: tr('paywall.compare.favourites'),
      free: String(config.limits.freeFavourites),
      pro: { infinity: true, label: tr('paywall.compare.unlimited') },
    });
  }
  if (config.proFeatures.offlineMap) compareRows.push({ feature: tr('paywall.compare.offlineMap'), free: false, pro: true });

  function subtitleOf(p: ShownPlan): string {
    if (p.type === 'monthly') return tr('paywall.monthlySub');
    if (p.type === 'lifetime') return tr('paywall.lifetimeSub');
    if (!p.perMonth) return tr('paywall.yearlyBilled');
    if (p.trialDays) {
      return tr(p.perMonthAbout ? 'paywall.yearlySubAboutTrial' : 'paywall.yearlySubTrial', { perMonth: p.perMonth, days: p.trialDays });
    }
    return tr(p.perMonthAbout ? 'paywall.yearlySubAbout' : 'paywall.yearlySub', { perMonth: p.perMonth });
  }

  const sourceLine =
    !storePlans && !storeFailed && plans && !previewRegion
      ? country
        ? tr('paywall.source', { country, currency: row.currency })
        : tr('paywall.sourceCurrency', { currency: row.currency })
      : null;

  return (
    <Screen
      topBar={{
        leading: 'close',
        transparent: true,
        trailing: pro.storeConnected || apiConfigured ? (
          <Button label={tr('paywall.restore')} variant="ghost" size="S" loading={restoring} onPress={() => void onRestore()} testID="paywall-restore" />
        ) : undefined,
      }}
      testID="screen-Paywall"
      footer={
        plansVisible ? (
          <StickyFooter helper={choice ? helper : undefined}>
            <Button
              label={cta}
              onPress={() => void purchase()}
              disabled={!choice || (pro.storeConnected && !canBuy) || !!previewRegion}
              loading={busy}
              block
              testID="paywall-buy"
            />
          </StickyFooter>
        ) : undefined
      }>
      <View style={styles.hero}>
        <View style={[styles.crown, { backgroundColor: t.color.accentSoft }]}>
          <Icon name="crown" size={28} color="accentInk" />
        </View>
        <AppText variant="titleL" align="center">
          {headline}
        </AppText>
        <AppText variant="bodyM" color="textSecondary" align="center">
          {subtitle}
        </AppText>
      </View>

      <View style={styles.banners}>
        {previewRegion ? <Banner tone="info" icon="eye-outline" body={tr('paywall.preview', { country: country ?? previewRegion })} /> : null}
        {!pro.storeConnected && !SCREENSHOTS && !previewRegion && !current ? <Banner tone="neutral" body={tr('paywall.testBuild')} /> : null}
        {pending ? <Banner tone="warning" body={tr('paywall.pending')} /> : null}
      </View>

      <View style={styles.benefits}>
        {benefits.map((b) => {
          const highlight = b.feature === reasonFeature;
          return (
            <View
              key={b.feature}
              accessible
              accessibilityLabel={`${tr(b.title)}. ${tr(b.body)}`}
              style={[styles.benefit, highlight ? { backgroundColor: t.color.accentSoft, borderRadius: t.radius.md } : null]}>
              <Icon name={b.icon} size={24} color={highlight ? 'accentInk' : 'primary'} />
              <View style={styles.flex}>
                <AppText variant="labelL" color={highlight ? 'accentInk' : 'text'}>
                  {tr(b.title)}
                </AppText>
                <AppText variant="bodyS" color={highlight ? 'accentInk' : 'textSecondary'}>
                  {tr(b.body)}
                </AppText>
              </View>
            </View>
          );
        })}
      </View>

      {current ? (
        <Card
          variant="outlined"
          borderColor={current.billing ? 'warning' : 'accent'}
          borderWidth={1.5}
          style={styles.current}
          testID="paywall-current">
          <View style={styles.currentHead} accessible accessibilityLabel={[current.title, current.line].filter(Boolean).join('. ')}>
            <Icon
              name={current.billing ? 'alert-circle-outline' : current.kind === 'gift' ? 'gift-outline' : 'check-decagram'}
              size={28}
              color={current.billing ? 'warning' : current.kind === 'gift' ? 'accentInk' : 'success'}
            />
            <View style={styles.flex}>
              <AppText variant="titleS">{current.title}</AppText>
              {current.line ? (
                <AppText variant="bodyM" color="textSecondary">
                  {current.line}
                </AppText>
              ) : null}
              {current.kind === 'gift' ? (
                <AppText variant="bodyS" color="textTertiary">
                  {tr('paywall.noPayment')}
                </AppText>
              ) : null}
            </View>
          </View>
          {current.kind === 'store' && pro.plan !== 'lifetime' ? (
            <Button
              label={current.billing ? tr('account.plan.fixInPlay') : tr('paywall.manage')}
              variant="secondary"
              size="M"
              block
              onPress={() => openExternal(pro.managementUrl)}
            />
          ) : null}
          {current.canSeePlans && !showPlans ? (
            <Button label={tr('paywall.seePlans')} variant="ghost" size="M" block onPress={() => setShowPlans(true)} />
          ) : null}
        </Card>
      ) : null}

      {plansVisible ? (
        <>
          <SectionHeader title={tr('paywall.choose')} />
          {current?.canSeePlans ? (
            <AppText variant="bodyS" color="textSecondary" style={styles.note}>
              {tr('paywall.seePlansNote')}
            </AppText>
          ) : null}
          {storeFailed ? (
            <Banner
              tone="warning"
              body={country ? tr('paywall.storeSlowRegion', { country, currency: row.currency }) : tr('paywall.storeSlow')}
              action={{
                label: tr('paywall.tryAgain'),
                onPress: () => setStoreAttempt((n) => n + 1),
              }}
              style={styles.storeBanner}
            />
          ) : null}
          <View style={styles.plans} accessibilityRole="radiogroup">
            {plans
              ? plans.map((p) => (
                  <PlanCard
                    key={p.type}
                    title={tr(`paywall.plan.${p.type}`)}
                    badge={p.savePercent ? tr('paywall.save', { percent: p.savePercent }) : undefined}
                    subtitle={subtitleOf(p)}
                    price={p.price}
                    period={tr(`paywall.per.${p.type}`)}
                    selected={choice?.type === p.type}
                    onPress={() => setSelected(p.type)}
                    testID={`paywall-plan-${p.type}`}
                  />
                ))
              : [0, 1, 2].map((i) => <SkeletonCard key={i} />)}
          </View>
          {timeline ? <TrialTimeline steps={timeline} style={styles.timeline} /> : null}
        </>
      ) : null}

      <View style={styles.trust}>
        {[
          { icon: 'google-play' as const, text: tr('paywall.trustPlay') },
          { icon: 'calendar-remove-outline' as const, text: tr('paywall.trustCancel') },
          { icon: 'shield-lock-outline' as const, text: tr('paywall.trustPrivacy') },
        ].map((item) => (
          <View key={item.text} style={styles.trustRow}>
            <Icon name={item.icon} size={20} color="textSecondary" />
            <AppText variant="bodyS" color="textSecondary" style={styles.flex}>
              {item.text}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.legal}>
        {sourceLine ? (
          <View style={styles.source}>
            <Icon name="earth" size={16} color="textTertiary" />
            <AppText variant="bodyS" color="textTertiary" style={styles.flexShrink}>
              {sourceLine}
            </AppText>
          </View>
        ) : null}
        <AppText variant="bodyS" color="textTertiary" align="center">
          {tr('paywall.legal')}
        </AppText>
        {config.links.terms || config.links.privacy ? (
          <View style={styles.links}>
            {config.links.terms ? (
              <Button label={tr('paywall.terms')} variant="ghost" size="S" onPress={() => void openWeb(config.links.terms)} />
            ) : null}
            {config.links.privacy ? (
              <Button label={tr('paywall.privacy')} variant="ghost" size="S" onPress={() => void openWeb(config.links.privacy)} />
            ) : null}
          </View>
        ) : null}
        {apiConfigured && config.features.redeemCodes ? (
          <Button
            label={tr('paywall.haveCode')}
            variant="ghost"
            size="S"
            icon="ticket-percent-outline"
            onPress={() => navigation.navigate('Redeem', {})}
            style={styles.center}
            testID="paywall-code"
          />
        ) : null}
        {compareRows.length > 0 ? (
          <Button
            label={compare ? tr('paywall.compareHide') : tr('paywall.compare')}
            variant="ghost"
            size="S"
            icon={compare ? 'chevron-up' : 'chevron-down'}
            onPress={() => setCompare(!compare)}
            style={styles.center}
          />
        ) : null}
      </View>
      {compare ? <ComparisonTable rows={compareRows} style={styles.compare} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingHorizontal: 24, gap: 6 },
  crown: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  banners: { marginHorizontal: 16, gap: 8, marginTop: 12 },
  benefits: { marginHorizontal: 16, marginTop: 8, gap: 2 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, minHeight: 48 },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  current: { marginHorizontal: 16, marginTop: 16 },
  currentHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  note: { marginHorizontal: 32, marginBottom: 8 },
  storeBanner: { marginHorizontal: 16, marginBottom: 12 },
  plans: { marginHorizontal: 16, gap: 12 },
  timeline: { marginTop: 20 },
  trust: { marginHorizontal: 16, marginTop: 20, gap: 8 },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legal: { marginTop: 16, paddingHorizontal: 16, alignItems: 'center', gap: 4 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  center: { alignSelf: 'center' },
  compare: { marginTop: 8 },
});
