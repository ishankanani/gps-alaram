import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { apiConfigured } from '../../api';
import { accountUser, getAccountState, signIn, useApiLanguage } from '../../api/account';
import { useRemoteConfig } from '../../api/config';
import { isApiError } from '../../api/errors';
import { useI18n } from '../../i18n';
import { usePro } from '../../lib/pro';
import type { RootScreenProps } from '../../navigation/types';
import { useDialogs, useToast } from '../../state';
import { AppText, Banner, Button, EmptyState, haptics, Screen, StickyFooter, TextField } from '../../ui';
import { errorText, fieldErrorText, formatDate, looksLikeEmail } from '../account/shared';

/**
 * Route `SignIn` (ui-direction-a 4.3 "Sign in", backend-spec 7.6): POST /auth/sign-in with the
 * current guest token, so the guest's plan, codes and purchases move into the account.
 */
export function SignInScreen({ navigation, route }: RootScreenProps<'SignIn'>) {
  const { t: tr, lang } = useI18n();
  useApiLanguage();
  const toast = useToast();
  const dialogs = useDialogs();
  const config = useRemoteConfig();
  const pro = usePro();
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  if (!apiConfigured) {
    return (
      <Screen topBar={{ leading: 'close' }} testID="screen-SignIn">
        <EmptyState icon="cellphone-lock" title={tr('account.local.title')} body={tr('account.local.body')} />
      </Screen>
    );
  }

  async function submit() {
    if (busy) return;
    const trimmed = email.trim();
    const badEmail = !looksLikeEmail(trimmed) ? tr(trimmed ? 'errors.field.invalid_email' : 'errors.field.required') : null;
    const badPassword = password ? null : tr('errors.field.required');
    setEmailError(badEmail);
    setPasswordError(badPassword);
    setError(null);
    if (badEmail || badPassword) {
      haptics.warning();
      return;
    }

    // A guest with Pro from the server: say where it goes before it moves (3.6).
    const state = getAccountState();
    const user = accountUser(state);
    if (user?.kind === 'guest' && pro.isPro && pro.origin === 'server') {
      const plan = pro.plan === 'lifetime' || !pro.expiresAt ? tr('account.proLifetime') : tr('account.proUntil', { date: formatDate(pro.expiresAt, lang) });
      const ok = await dialogs.confirm({
        title: tr('account.moveTitle'),
        message: tr('account.moveBody', { plan, email: trimmed.toLowerCase() }),
        confirmLabel: tr('account.moveConfirm'),
        icon: 'swap-horizontal',
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      const merged = await signIn({ email: trimmed, password });
      haptics.success();
      navigation.goBack();
      const moved = merged && (merged.grants > 0 || merged.storeSubscriptions > 0 || merged.promoRedemptions > 0);
      toast.show({ id: 'signed-in', message: tr(moved ? 'account.merged' : 'account.signedIn'), icon: 'account-check-outline' });
    } catch (e) {
      setBusy(false);
      haptics.warning();
      const emailField = fieldErrorText(e, 'email', tr);
      const passwordField = fieldErrorText(e, 'password', tr);
      if (emailField || passwordField) {
        setEmailError(emailField);
        setPasswordError(passwordField);
      } else {
        setError(errorText(e, tr));
      }
      if (isApiError(e) && e.code === 'invalid_credentials') setPassword('');
    }
  }

  return (
    <Screen
      topBar={{ leading: 'close' }}
      keyboard
      testID="screen-SignIn"
      footer={
        <StickyFooter>
          <Button label={tr('account.signInSubmit')} onPress={() => void submit()} loading={busy} block testID="sign-in-submit" />
          {config.auth.signUpEnabled ? (
            <Button label={tr('account.toSignUp')} variant="ghost" size="M" block onPress={() => navigation.replace('SignUp')} disabled={busy} />
          ) : null}
        </StickyFooter>
      }>
      <View style={styles.content}>
        <View style={styles.intro}>
          <AppText variant="titleL">{tr('account.signInTitle')}</AppText>
          <AppText variant="bodyM" color="textSecondary">
            {tr('account.signInBody')}
          </AppText>
        </View>
        {error ? <Banner tone="danger" body={error} testID="sign-in-error" /> : null}
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
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          autoFocus={!route.params?.email}
          testID="sign-in-email"
        />
        <View>
          <TextField
            label={tr('account.password')}
            kind="password"
            value={password}
            inputRef={passwordRef}
            onChangeText={(text) => {
              setPassword(text);
              setPasswordError(null);
              setError(null);
            }}
            error={passwordError}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            autoFocus={!!route.params?.email}
            testID="sign-in-password"
          />
          <Button
            label={tr('account.forgot')}
            variant="ghost"
            size="S"
            onPress={() => navigation.navigate('ForgotPassword', { email: email.trim() || undefined })}
            style={styles.forgot}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  intro: { gap: 8 },
  forgot: { alignSelf: 'flex-end', marginTop: 2, marginRight: -14 },
});
