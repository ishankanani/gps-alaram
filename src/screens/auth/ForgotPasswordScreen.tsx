import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { apiConfigured } from '../../api';
import { accountUser, forgotPassword, resetPassword, useAccount, useApiLanguage } from '../../api/account';
import { useRemoteConfig } from '../../api/config';
import { isApiError } from '../../api/errors';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useToast } from '../../state';
import { AppText, Banner, Button, EmptyState, haptics, Screen, StickyFooter, TextField } from '../../ui';
import { errorText, fieldErrorText, looksLikeEmail, mailSupport, maskEmail } from '../account/shared';

const RESEND_AFTER_S = 60;

/** Reset codes are 8 Crockford characters (backend-spec 1.1): capitals, a dash after 4, any separator pasted. */
/** Supabase's email codes are 6 to 10 digits; shown in groups of four. */
export function formatResetCode(text: string): string {
  const raw = text.replace(/[^0-9]/g, '').slice(0, 10);
  return raw.match(/.{1,4}/g)?.join('-') ?? '';
}

/**
 * Route `ForgotPassword` (ui-direction-a 4.3 with the critiques' code format and no-mail mode):
 * step 1 sends a code by email (or, without mail, says to ask support), step 2 sets the new
 * password with the code and signs in (POST /auth/reset-password).
 */
export function ForgotPasswordScreen({ navigation, route }: RootScreenProps<'ForgotPassword'>) {
  const { t: tr } = useI18n();
  useApiLanguage();
  const toast = useToast();
  const config = useRemoteConfig();
  const account = useAccount();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [mailDown, setMailDown] = useState(false);
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const passwordRef = useRef<TextInput>(null);

  const waiting = resendAt > now;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  if (!apiConfigured) {
    return (
      <Screen topBar={{ leading: 'close' }} testID="screen-ForgotPassword">
        <EmptyState icon="cellphone-lock" title={tr('account.local.title')} body={tr('account.local.body')} />
      </Screen>
    );
  }

  // Without mail on the server, support sends codes (backend-spec 7.6).
  const noMail = mailDown || !config.auth.passwordReset;
  const publicId = accountUser(account)?.publicId ?? account.session?.publicId ?? null;
  const trimmed = email.trim();

  function checkEmail(): boolean {
    const bad = !looksLikeEmail(trimmed) ? tr(trimmed ? 'errors.field.invalid_email' : 'errors.field.required') : null;
    setEmailError(bad);
    if (bad) haptics.warning();
    return !bad;
  }

  async function sendCode() {
    if (busy || !checkEmail()) return;
    setBusy(true);
    setError(null);
    try {
      await forgotPassword(trimmed);
      setStep('code');
      setResendAt(Date.now() + RESEND_AFTER_S * 1000);
      setNow(Date.now());
      toast.show({ id: 'code-sent', message: tr('account.codeSent'), icon: 'email-check-outline' });
    } catch (e) {
      haptics.warning();
      if (isApiError(e) && e.code === 'mail_unavailable') setMailDown(true);
      else setError(errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  function askSupport() {
    if (!checkEmail()) return;
    mailSupport(
      config.support.email,
      tr('account.resetMailSubject', { id: publicId ?? '' }),
      tr('account.resetMailBody', { id: publicId ?? '', email: trimmed }),
    );
    setStep('code');
  }

  async function submitReset() {
    if (busy) return;
    // Supabase's email one-time codes have 6 to 10 digits (supabase/README.md recommends 8).
    const digits = code.replace(/[\s-]/g, '').length;
    const badCode = digits < 6 || digits > 10 ? tr('errors.invalid_reset_code') : null;
    const length = [...password.normalize('NFKC')].length;
    const badPassword = !password ? tr('errors.field.required') : length < 8 ? tr('errors.password.too_short') : length > 128 ? tr('errors.password.too_long') : null;
    setCodeError(badCode);
    setPasswordError(badPassword);
    setError(null);
    if (badCode || badPassword) {
      haptics.warning();
      return;
    }
    setBusy(true);
    try {
      await resetPassword({ email: trimmed, code, newPassword: password });
      haptics.success();
      navigation.navigate('Tabs', { screen: 'AccountTab' }, { pop: true });
      toast.show({ id: 'reset-done', message: tr('account.resetDone'), icon: 'lock-check-outline' });
    } catch (e) {
      setBusy(false);
      haptics.warning();
      if (isApiError(e) && e.code === 'invalid_reset_code') {
        setCodeError(tr('errors.invalid_reset_code'));
        return;
      }
      const field = fieldErrorText(e, 'newPassword', tr, 'password');
      if (field) setPasswordError(field);
      else setError(errorText(e, tr));
    }
  }

  if (step === 'email') {
    return (
      <Screen
        topBar={{ leading: 'close' }}
        keyboard
        testID="screen-ForgotPassword"
        footer={
          <StickyFooter>
            {noMail ? (
              <Button label={tr('account.emailSupport')} icon="email-outline" onPress={askSupport} block disabled={!config.support.email} />
            ) : (
              <Button label={tr('account.sendCode')} onPress={() => void sendCode()} loading={busy} block testID="forgot-send" />
            )}
            <Button
              label={tr('account.haveCode')}
              variant="ghost"
              size="M"
              block
              disabled={busy}
              onPress={() => {
                if (checkEmail()) setStep('code');
              }}
            />
          </StickyFooter>
        }>
        <View style={styles.content}>
          <View style={styles.intro}>
            <AppText variant="titleL">{tr('account.resetTitle')}</AppText>
            <AppText variant="bodyM" color="textSecondary">
              {noMail ? (publicId ? tr('account.resetNoMail', { id: publicId }) : tr('account.resetNoMailNoId')) : tr('account.resetBody')}
            </AppText>
          </View>
          {error ? <Banner tone="danger" body={error} /> : null}
          <TextField
            label={tr('account.email')}
            icon="email-outline"
            kind="email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setEmailError(null);
              setError(null);
            }}
            error={emailError}
            returnKeyType="send"
            onSubmitEditing={() => (noMail ? askSupport() : void sendCode())}
            autoFocus={!route.params?.email}
            testID="forgot-email"
          />
        </View>
      </Screen>
    );
  }

  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  return (
    <Screen
      topBar={{ leading: 'back', onLeadingPress: () => setStep('email') }}
      keyboard
      testID="screen-ForgotPassword-code"
      footer={
        <StickyFooter>
          <Button label={tr('account.setPassword')} onPress={() => void submitReset()} loading={busy} block testID="forgot-submit" />
          {!noMail ? (
            <Button
              label={waiting ? tr('account.resendIn', { seconds }) : tr('account.resend')}
              variant="ghost"
              size="M"
              block
              disabled={waiting || busy}
              onPress={() => void sendCode()}
            />
          ) : null}
        </StickyFooter>
      }>
      <View style={styles.content}>
        <View style={styles.intro}>
          <AppText variant="titleL">{tr('account.resetTitle')}</AppText>
          <AppText variant="bodyM" color="textSecondary">
            {noMail ? tr('account.enterSupportCode', { email: trimmed }) : tr('account.enterCode', { email: maskEmail(trimmed) })}
          </AppText>
        </View>
        {error ? <Banner tone="danger" body={error} /> : null}
        <TextField
          label={tr('account.code')}
          kind="oneTimeCode"
          variant="code"
          value={code}
          placeholder="1234-5678"
          onChangeText={(text) => {
            setCode(formatResetCode(text));
            setCodeError(null);
          }}
          helper={noMail ? tr('account.codeHelperSupport') : tr('account.codeHelper')}
          error={codeError}
          maxLength={12}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          autoFocus
          testID="forgot-code"
        />
        <TextField
          label={tr('account.newPassword')}
          kind="newPassword"
          value={password}
          inputRef={passwordRef}
          helper={tr('account.passwordHelper')}
          onChangeText={(text) => {
            setPassword(text);
            setPasswordError(null);
          }}
          error={passwordError}
          returnKeyType="go"
          onSubmitEditing={() => void submitReset()}
          testID="forgot-password"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  intro: { gap: 8 },
});
