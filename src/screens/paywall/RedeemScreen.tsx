import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { apiConfigured } from '../../api';
import { redeemCode, useApiLanguage } from '../../api/account';
import { useRemoteConfig } from '../../api/config';
import { isApiError } from '../../api/errors';
import type { RedeemResponse } from '../../api/types';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { AppText, Banner, Button, Chip, EmptyState, haptics, Icon, Screen, StickyFooter, TextField, useTheme } from '../../ui';
import { errorText, formatDate } from '../account/shared';

/** Promo codes: 4–32 of A–Z, 0–9 and "-" once normalised (backend-spec 1.1). */
export function normalizePromoCode(text: string): string {
  return text
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const looksLikeCode = (code: string) => /^[A-Z0-9-]{4,32}$/.test(code);

/**
 * Route `Redeem` (ui-direction-a 4.3 "Redeem code"; stopwake://redeem/CODE fills the field):
 * POST /promo/redeem. The clipboard is only read when the user taps "Paste code".
 */
export function RedeemScreen({ navigation, route }: RootScreenProps<'Redeem'>) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  useApiLanguage();
  const config = useRemoteConfig();
  const [code, setCode] = useState(route.params?.code ? normalizePromoCode(route.params.code) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canPaste, setCanPaste] = useState(false);
  const [done, setDone] = useState<RedeemResponse | null>(null);

  // hasStringAsync shows no "pasted from your clipboard" notice; the text is read only on tap.
  useEffect(() => {
    let alive = true;
    Clipboard.hasStringAsync()
      .then((has) => {
        if (alive) setCanPaste(has);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!apiConfigured) {
    return (
      <Screen topBar={{ leading: 'close', title: tr('paywall.redeemTitle') }} testID="screen-Redeem">
        <EmptyState icon="ticket-percent-outline" title={tr('account.local.title')} body={tr('paywall.redeemUnavailable')} />
      </Screen>
    );
  }

  async function paste() {
    try {
      const text = normalizePromoCode(await Clipboard.getStringAsync());
      if (looksLikeCode(text)) {
        setCode(text);
        setError(null);
      } else {
        setError(tr('paywall.redeemNotACode'));
      }
    } catch {
      setError(tr('paywall.redeemNotACode'));
    }
  }

  async function submit() {
    const normalized = normalizePromoCode(code);
    if (!normalized || busy) return;
    if (!looksLikeCode(normalized)) {
      setError(tr('errors.promo_invalid'));
      haptics.warning();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await redeemCode(normalized);
      haptics.success();
      setDone(res);
    } catch (e) {
      haptics.warning();
      setError(isApiError(e) && e.offline ? tr('paywall.redeemOffline') : errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const end = done.grant.endsAt;
    return (
      <Screen
        topBar={{ leading: 'close' }}
        testID="screen-Redeem-success"
        footer={
          <StickyFooter>
            <Button label={tr('paywall.redeemDone')} onPress={() => navigation.goBack()} block testID="redeem-done" />
          </StickyFooter>
        }>
        <View style={styles.success} accessibilityLiveRegion="polite">
          <View style={[styles.crown, { backgroundColor: t.color.accentSoft }]}>
            <Icon name="crown" size={36} color="accentInk" />
          </View>
          <AppText variant="titleL" align="center">
            {tr('paywall.redeemSuccessTitle')}
          </AppText>
          <AppText variant="bodyL" color="textSecondary" align="center">
            {end ? tr('paywall.redeemSuccess', { date: formatDate(end, lang) }) : tr('paywall.redeemSuccessLifetime')}
          </AppText>
        </View>
      </Screen>
    );
  }

  const disabled = !config.features.redeemCodes;
  return (
    <Screen
      topBar={{ leading: 'close', title: tr('paywall.redeemTitle') }}
      keyboard
      testID="screen-Redeem"
      footer={
        <StickyFooter>
          <Button
            label={tr('paywall.redeemSubmit')}
            onPress={() => void submit()}
            disabled={!code.trim() || disabled}
            loading={busy}
            block
            testID="redeem-submit"
          />
        </StickyFooter>
      }>
      <View style={styles.content}>
        <AppText variant="bodyM" color="textSecondary">
          {tr('paywall.redeemBody')}
        </AppText>
        {disabled ? <Banner tone="warning" body={tr('errors.redeem_disabled')} /> : null}
        <TextField
          label={tr('paywall.redeemLabel')}
          icon="ticket-percent-outline"
          variant="code"
          value={code}
          placeholder={tr('paywall.redeemPlaceholder')}
          onChangeText={(text) => {
            setCode(text.toUpperCase());
            setError(null);
          }}
          error={error}
          maxLength={40}
          clearable
          autoFocus={!route.params?.code}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          testID="redeem-code"
        />
        {canPaste && !code ? (
          <View style={styles.chips}>
            <Chip variant="assist" icon="content-paste" label={tr('paywall.redeemPaste')} onPress={() => void paste()} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  chips: { flexDirection: 'row', paddingVertical: 6 },
  success: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 48, gap: 12 },
  crown: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
});
