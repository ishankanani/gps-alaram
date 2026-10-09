import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n, type Key } from '../i18n';
import { FALLBACK_PRICES, FREE_FAVOURITES, TRIAL_DAYS, type PlanType, type ProReason } from '../lib/plans';
import { buy, loadPlans, restore, storeConnected, usePro, type Plan } from '../lib/pro';
import { Body, Button, Card, Icon, IconButton } from '../ui/components';
import { radius, useTheme } from '../ui/theme';

type Props = { reason: ProReason; onBack: () => void };

const FEATURES = [
  { key: 'heavy', icon: 'alarm-light' },
  { key: 'favourites', icon: 'star' },
  { key: 'offlineMap', icon: 'map-check' },
  { key: 'noAds', icon: 'heart' },
] as const;

/** What a plan card shows: from the store, or example prices in builds without a store. */
type Shown = { type: PlanType; price: string; perMonth: string | null; trialDays: number | null; plan: Plan | null };

function examplePlans(): Shown[] {
  return [
    { type: 'annual', price: FALLBACK_PRICES.annual, perMonth: '€0.83', trialDays: TRIAL_DAYS, plan: null },
    { type: 'monthly', price: FALLBACK_PRICES.monthly, perMonth: null, trialDays: null, plan: null },
    { type: 'lifetime', price: FALLBACK_PRICES.lifetime, perMonth: null, trialDays: null, plan: null },
  ];
}

/** StopWake Pro: what it adds, the plans and the purchase. */
export function ProScreen({ reason, onBack }: Props) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const pro = usePro();
  const [selected, setSelected] = useState<PlanType>('annual');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);

  useEffect(() => {
    void loadPlans();
  }, []);

  const shown: Shown[] | null = storeConnected
    ? (pro.plans?.map((p) => ({ type: p.type, price: p.price, perMonth: p.perMonth, trialDays: p.trialDays, plan: p })) ?? null)
    : examplePlans();
  const choice = shown?.find((s) => s.type === selected) ?? shown?.[0] ?? null;

  async function purchase() {
    if (!choice?.plan) return;
    setBusy(true);
    setMessage(null);
    const result = await buy(choice.plan);
    setBusy(false);
    if (result === 'done') onBack();
    else if (result === 'failed') setMessage({ text: tr('pro.failed'), good: false });
  }

  async function restorePurchases() {
    setBusy(true);
    setMessage(null);
    const active = await restore();
    setBusy(false);
    setMessage(active ? { text: tr('pro.restored'), good: true } : { text: tr('pro.notFound'), good: false });
  }

  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <IconButton icon="arrow-left" label={tr('common.back')} onPress={onBack} size={44} />

      <View style={[styles.hero, { backgroundColor: t.primary }]}>
        <View style={[styles.heroIcon, { backgroundColor: t.accent }]}>
          <Icon name="crown" size={34} color={t.onAccent} />
        </View>
        <Text style={[styles.heroTitle, { color: t.onPrimary }]}>{tr('pro.title')}</Text>
        <Text style={[styles.heroBody, { color: t.onPrimary }]}>{tr('pro.subtitle')}</Text>
      </View>

      {reason && !pro.isPro ? (
        <View style={[styles.reason, { backgroundColor: t.primarySoft }]}>
          <Icon name="lock-open-variant" size={20} color={t.primary} />
          <Text style={[styles.reasonText, { color: t.text }]}>
            {tr(`pro.reason.${reason}` as Key, { count: FREE_FAVOURITES })}
          </Text>
        </View>
      ) : null}

      <Card>
        {FEATURES.map((f) => (
          <View key={f.key} style={styles.feature}>
            <View style={[styles.featureIcon, { backgroundColor: f.key === reason ? t.accent : t.primarySoft }]}>
              <Icon name={f.icon} size={22} color={f.key === reason ? t.onAccent : t.primary} />
            </View>
            <View style={styles.featureText}>
              <Text style={[styles.featureTitle, { color: t.text }]}>{tr(`pro.feature.${f.key}` as Key)}</Text>
              <Text style={[styles.featureBody, { color: t.muted }]}>{tr(`pro.feature.${f.key}Body` as Key)}</Text>
            </View>
          </View>
        ))}
      </Card>

      {pro.isPro && storeConnected ? (
        <Card>
          <View style={styles.activeRow}>
            <Icon name="check-decagram" size={28} color={t.good} />
            <Text style={[styles.activeText, { color: t.text }]}>{tr('pro.active')}</Text>
          </View>
        </Card>
      ) : (
        <>
          {shown ? (
            <View style={styles.plans}>
              {shown.map((s) => (
                <PlanCard key={s.type} shown={s} selected={choice?.type === s.type} onPress={() => setSelected(s.type)} />
              ))}
            </View>
          ) : pro.plansError ? (
            <Card>
              <Body>{tr('pro.storeError')}</Body>
              <Button title={tr('countries.retry')} kind="secondary" icon="refresh" onPress={() => void loadPlans()} />
            </Card>
          ) : (
            <ActivityIndicator color={t.primary} style={styles.loading} />
          )}

          {storeConnected ? (
            <Button
              title={choice?.trialDays ? tr('pro.ctaTrial', { days: choice.trialDays }) : tr('pro.ctaBuy')}
              icon="crown"
              busy={busy}
              disabled={!choice?.plan}
              onPress={() => void purchase()}
            />
          ) : (
            <View style={[styles.reason, { backgroundColor: t.surfaceAlt }]}>
              <Icon name="flask-outline" size={20} color={t.muted} />
              <Text style={[styles.reasonText, { color: t.muted }]}>{tr('pro.testBuild')}</Text>
            </View>
          )}

          {message ? <Text style={[styles.message, { color: message.good ? t.good : t.bad }]}>{message.text}</Text> : null}

          <Text style={[styles.legal, { color: t.muted }]}>
            {choice?.type === 'annual' && choice.trialDays ? `${tr('pro.afterTrial', { price: choice.price })} ` : ''}
            {tr('pro.renews')}
          </Text>
          {storeConnected ? <Button title={tr('pro.restore')} kind="ghost" onPress={() => void restorePurchases()} disabled={busy} /> : null}
        </>
      )}

      <Text style={[styles.legal, { color: t.muted }]}>{tr('pro.comingSoon')}</Text>
    </ScrollView>
  );
}

function PlanCard({ shown, selected, onPress }: { shown: Shown; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const note =
    shown.type === 'annual' && shown.perMonth
      ? tr('pro.plan.annualNote', { perMonth: shown.perMonth })
      : tr(`pro.plan.${shown.type}Note` as Key);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        styles.plan,
        { backgroundColor: t.surface, borderColor: selected ? t.primary : t.border, borderWidth: selected ? 2.5 : 1.5 },
      ]}>
      <Icon name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={24} color={selected ? t.primary : t.muted} />
      <View style={styles.planText}>
        <View style={styles.planTitleRow}>
          <Text style={[styles.planTitle, { color: t.text }]}>{tr(`pro.plan.${shown.type}` as Key)}</Text>
          {shown.type === 'annual' ? (
            <View style={[styles.badge, { backgroundColor: t.accent }]}>
              <Text style={[styles.badgeText, { color: t.onAccent }]}>
                {shown.trialDays ? tr('pro.trialBadge', { days: shown.trialDays }) : tr('pro.bestValue')}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.planNote, { color: t.muted }]}>{note}</Text>
      </View>
      <View style={styles.priceBox}>
        <Text style={[styles.price, { color: t.text }]}>{shown.price}</Text>
        <Text style={[styles.per, { color: t.muted }]}>{tr(`pro.per.${shown.type}` as Key)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { padding: 18, gap: 14 },
  hero: { borderRadius: radius.lg, padding: 22, alignItems: 'center', gap: 8 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle: { fontSize: 28, fontWeight: '800' },
  heroBody: { fontSize: 16, textAlign: 'center', opacity: 0.92, lineHeight: 22 },
  reason: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: radius.md },
  reasonText: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  feature: { flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 6 },
  featureIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1, gap: 2 },
  featureTitle: { fontSize: 16, fontWeight: '700' },
  featureBody: { fontSize: 14, lineHeight: 19 },
  plans: { gap: 10 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md },
  planText: { flex: 1, gap: 3 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  planTitle: { fontSize: 17, fontWeight: '700' },
  planNote: { fontSize: 13 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  priceBox: { alignItems: 'flex-end' },
  price: { fontSize: 18, fontWeight: '800' },
  per: { fontSize: 12 },
  loading: { padding: 20 },
  activeRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  activeText: { flex: 1, fontSize: 17, fontWeight: '700' },
  message: { fontSize: 15, textAlign: 'center' },
  legal: { fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },
});
