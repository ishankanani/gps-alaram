import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { apiConfigured } from '../../api';
import { accountUser, signUp, useAccount, useApiLanguage } from '../../api/account';
import { useRemoteConfig } from '../../api/config';
import { isApiError } from '../../api/errors';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useToast } from '../../state';
import { AppText, Banner, Button, EmptyState, haptics, Icon, Screen, StickyFooter, TextField } from '../../ui';
import { errorText, fieldErrorText, looksLikeEmail, openWeb } from '../account/shared';

/** "By creating an account you agree to the {terms} and the {privacy}." with the two as links. */
function Consent({ terms, privacy }: { terms: string; privacy: string }) {
  const { t: tr } = useI18n();
  const parts = tr('account.consent', { terms: '\u0000terms\u0000', privacy: '\u0000privacy\u0000' }).split('\u0000');
  return (
    <AppText variant="bodyS" color="textSecondary">
      {parts.map((part, i) => {
        if (part === 'terms' || part === 'privacy') {
          const url = part === 'terms' ? terms : privacy;
          const label = tr(part === 'terms' ? 'account.terms' : 'account.privacy');
          return url ? (
            <AppText key={i} variant="bodyS" color="primary" accessibilityRole="link" onPress={() => void openWeb(url)}>
              {label}
            </AppText>
          ) : (
            label
          );
        }
        return part;
      })}
    </AppText>
  );
}

/**
 * Route `SignUp` (ui-direction-a 4.3 "Sign up" with the critiques' honest copy): the guest becomes
 * an account with the same ID (POST /auth/sign-up). Favourites and trips stay on the phone.
 */
export function SignUpScreen({ navigation }: RootScreenProps<'SignUp'>) {
  const { t: tr } = useI18n();
  useApiLanguage();
  const toast = useToast();
  const config = useRemoteConfig();
  const account = useAccount();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  if (!apiConfigured) {
    return (
      <Screen topBar={{ leading: 'close' }} testID="screen-SignUp">
        <EmptyState icon="cellphone-lock" title={tr('account.local.title')} body={tr('account.local.body')} />
      </Screen>
    );
  }

  const publicId = accountUser(account)?.publicId ?? account.session?.publicId ?? null;
  const disabled = !config.auth.signUpEnabled;

  async function submit() {
    if (busy || disabled) return;
    const trimmed = email.trim();
    const badName = name.trim().length > 60 ? tr('errors.name.too_long') : null;
    const badEmail = !looksLikeEmail(trimmed) ? tr(trimmed ? 'errors.field.invalid_email' : 'errors.field.required') : null;
    const length = [...password.normalize('NFKC')].length;
    const badPassword = !password ? tr('errors.field.required') : length < 8 ? tr('errors.password.too_short') : length > 128 ? tr('errors.password.too_long') : null;
    setNameError(badName);
    setEmailError(badEmail);
    setPasswordError(badPassword);
    setEmailTaken(false);
    setError(null);
    if (badName || badEmail || badPassword) {
      haptics.warning();
      return;
    }
    setBusy(true);
    try {
      await signUp({ email: trimmed, password, displayName: name.trim() || null });
      haptics.success();
      navigation.goBack();
      toast.show({ id: 'signed-up', message: tr('account.created'), icon: 'account-check-outline' });
    } catch (e) {
      setBusy(false);
      haptics.warning();
      if (isApiError(e) && e.code === 'confirmation_sent') {
        // Supabase asks to confirm the address first: sign in after tapping the link in the email.
        haptics.success();
        navigation.replace('SignIn', {});
        toast.show({ id: 'confirm-email', message: tr('account.confirmEmailSent'), icon: 'email-check-outline' });
        return;
      }
      if (isApiError(e) && e.code === 'email_taken') {
        setEmailError(tr('errors.email_taken'));
        setEmailTaken(true);
        return;
      }
      const fields = {
        name: fieldErrorText(e, 'displayName', tr, 'name'),
        email: fieldErrorText(e, 'email', tr),
        password: fieldErrorText(e, 'password', tr, 'password'),
      };
      if (fields.name || fields.email || fields.password) {
        setNameError(fields.name);
        setEmailError(fields.email);
        setPasswordError(fields.password);
      } else {
        setError(errorText(e, tr));
      }
    }
  }

  return (
    <Screen
      topBar={{ leading: 'close' }}
      keyboard
      testID="screen-SignUp"
      footer={
        <StickyFooter>
          <Button label={tr('account.signUpSubmit')} onPress={() => void submit()} loading={busy} disabled={disabled} block testID="sign-up-submit" />
          <Button label={tr('account.toSignIn')} variant="ghost" size="M" block onPress={() => navigation.replace('SignIn', {})} disabled={busy} />
        </StickyFooter>
      }>
      <View style={styles.content}>
        <View style={styles.intro}>
          <AppText variant="titleL">{tr('account.signUpTitle')}</AppText>
          <AppText variant="bodyM" color="textSecondary">
            {tr('account.signUpBody')}
          </AppText>
        </View>
        {disabled ? <Banner tone="warning" body={tr('errors.signup_disabled')} /> : null}
        {error ? <Banner tone="danger" body={error} /> : null}
        <TextField
          label={tr('account.name')}
          kind="name"
          value={name}
          onChangeText={(text) => {
            setName(text);
            setNameError(null);
          }}
          error={nameError}
          maxLength={80}
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <View style={styles.field}>
          <TextField
            label={tr('account.email')}
            icon="email-outline"
            kind="email"
            value={email}
            inputRef={emailRef}
            onChangeText={(text) => {
              setEmail(text);
              setEmailError(null);
              setEmailTaken(false);
            }}
            error={emailError}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            testID="sign-up-email"
          />
          {emailTaken ? (
            <Button
              label={tr('account.signInInstead')}
              variant="ghost"
              size="S"
              onPress={() => navigation.replace('SignIn', { email: email.trim() })}
              style={styles.inlineAction}
            />
          ) : null}
        </View>
        <TextField
          label={tr('account.password')}
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
          onSubmitEditing={() => void submit()}
          testID="sign-up-password"
        />
        {publicId ? (
          <View style={styles.reassure}>
            <Icon name="check-circle-outline" size={20} color="success" />
            <AppText variant="bodyS" color="textSecondary" style={styles.flex}>
              {tr('account.keepsId', { id: publicId })}
            </AppText>
          </View>
        ) : null}
        <AppText variant="bodyS" color="textTertiary">
          {tr('account.signUpNote')}
        </AppText>
        <Consent terms={config.links.terms} privacy={config.links.privacy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  intro: { gap: 8 },
  field: { gap: 0 },
  inlineAction: { marginLeft: -14 },
  reassure: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1 },
});
