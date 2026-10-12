import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { accountUser, updateProfile, useAccount, useApiLanguage } from '../../api/account';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useDialogs, useToast } from '../../state';
import { Avatar, Banner, Button, EmptyState, haptics, ListItem, Screen, Section, StickyFooter, TextField } from '../../ui';
import { copyText, errorText, fieldErrorText, looksLikeEmail } from './shared';

/**
 * Route `EditProfile` (ui-direction-a 4.3, Save in the StickyFooter per the critiques): name and
 * email (PATCH /me; a new email asks for the password), Change password, and the read-only ID.
 */
export function EditProfileScreen({ navigation }: RootScreenProps<'EditProfile'>) {
  const { t: tr } = useI18n();
  useApiLanguage();
  const toast = useToast();
  const dialogs = useDialogs();
  const account = useAccount();
  const user = accountUser(account);
  const [name, setName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <Screen topBar={{ title: tr('account.editTitle') }} testID="screen-EditProfile">
        <EmptyState icon="account-off-outline" title={tr('account.offlineNoPlan')} />
      </Screen>
    );
  }

  const account0 = user.kind === 'account';
  const nameChanged = name.trim() !== (user.displayName ?? '');
  const emailChanged = account0 && email.trim().toLowerCase() !== (user.email ?? '');
  const changed = nameChanged || emailChanged;

  async function save() {
    if (!changed || busy || !user) return;
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const badName = trimmedName.length > 60 ? tr('errors.name.too_long') : null;
    const badEmail = emailChanged && !looksLikeEmail(trimmedEmail) ? tr(trimmedEmail ? 'errors.field.invalid_email' : 'errors.field.required') : null;
    setNameError(badName);
    setEmailError(badEmail);
    setError(null);
    if (badName || badEmail) {
      haptics.warning();
      return;
    }
    const body = nameChanged ? { displayName: trimmedName || null } : {};
    if (emailChanged) {
      // A new email needs the current password (backend-spec 2.7).
      const ok = await dialogs.confirm({
        title: tr('account.emailChangeTitle'),
        message: tr('account.emailChangeBody', { email: trimmedEmail.toLowerCase() }),
        confirmLabel: tr('account.emailChangeConfirm'),
        icon: 'email-edit-outline',
        requirePassword: true,
        onConfirm: async ({ password }) => {
          try {
            await updateProfile({ ...body, email: trimmedEmail, currentPassword: password });
          } catch (e) {
            throw new Error(fieldErrorText(e, 'email', tr) ?? errorText(e, tr));
          }
        },
      });
      if (!ok) return;
    } else {
      setBusy(true);
      try {
        await updateProfile(body);
      } catch (e) {
        setBusy(false);
        haptics.warning();
        const field = fieldErrorText(e, 'displayName', tr, 'name');
        if (field) setNameError(field);
        else setError(errorText(e, tr));
        return;
      }
    }
    haptics.success();
    toast.show({ id: 'profile-saved', message: tr('account.saved'), icon: 'check' });
    navigation.goBack();
  }

  return (
    <Screen
      topBar={{ title: tr('account.editTitle') }}
      keyboard
      testID="screen-EditProfile"
      footer={
        <StickyFooter>
          <Button label={tr('account.save')} onPress={() => void save()} disabled={!changed} loading={busy} block testID="edit-profile-save" />
        </StickyFooter>
      }>
      <View style={styles.content}>
        <Avatar size={64} name={name.trim() || null} email={email.trim() || null} style={styles.avatar} />
        {error ? <Banner tone="danger" body={error} /> : null}
        <TextField
          label={tr('account.nameLabel')}
          kind="name"
          value={name}
          onChangeText={(text) => {
            setName(text);
            setNameError(null);
          }}
          error={nameError}
          maxLength={80}
          returnKeyType="next"
        />
        {account0 ? (
          <TextField
            label={tr('account.email')}
            icon="email-outline"
            kind="email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setEmailError(null);
            }}
            error={emailError}
            returnKeyType="done"
          />
        ) : null}
        <TextField
          label={tr('account.userId')}
          value={user.publicId}
          onChangeText={() => {}}
          readOnly
          onCopy={() => {
            void copyText(user.publicId).then((ok) => {
              if (ok) toast.show({ id: 'id-copied', message: tr('account.idCopied'), icon: 'content-copy' });
            });
          }}
        />
      </View>
      {account0 ? (
        <Section style={styles.section}>
          <ListItem icon="lock-reset" title={tr('account.changePassword')} chevron onPress={() => navigation.navigate('ChangePassword')} />
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  avatar: { alignSelf: 'center', marginVertical: 8 },
  section: { marginTop: 24 },
});
