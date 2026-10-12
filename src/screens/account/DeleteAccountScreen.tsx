import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { accountUser, deleteAccount, exportData, useAccount, useApiLanguage } from '../../api/account';
import { isApiError } from '../../api/errors';
import { useI18n } from '../../i18n';
import { usePro } from '../../lib/pro';
import { DEFAULT_PREFERENCES } from '../../lib/prefs';
import type { RootScreenProps } from '../../navigation/types';
import { useSavedData, useToast } from '../../state';
import { AppText, Banner, Button, haptics, Icon, Screen, Section, StickyFooter, SwitchRow, TextField, useTheme } from '../../ui';
import { errorText, openExternal } from './shared';

/**
 * Route `DeleteAccount` (ui-direction-a 4.3 with the critiques' fixes): DELETE /me with the
 * password for accounts, the Google Play warning (409 subscription_active → "Delete anyway" with
 * acknowledgeSubscription), last_admin inline, "Download my data", and "Also clear this phone".
 * Afterwards the phone continues as a new guest.
 */
export function DeleteAccountScreen({ navigation }: RootScreenProps<'DeleteAccount'>) {
  const t = useTheme();
  const { t: tr } = useI18n();
  useApiLanguage();
  const toast = useToast();
  const saved = useSavedData();
  const account = useAccount();
  const pro = usePro();
  const user = accountUser(account);
  const guest = !user || user.kind === 'guest';
  const publicId = user?.publicId ?? account.session?.publicId ?? '';
  const renewing = account.me?.entitlements.some((e) => e.source === 'store' && e.willRenew) ?? (pro.source === 'store' && pro.willRenew);

  const [clearPhone, setClearPhone] = useState(true);
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionWarned, setSubscriptionWarned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const word = tr('account.deleteWord');
  const showSubscription = renewing || subscriptionWarned;
  const ready = typed.trim().toLocaleUpperCase() === word.toLocaleUpperCase() && (guest || password.length > 0) && !!account.session;

  async function onExport() {
    setExporting(true);
    try {
      const data = await exportData();
      await Share.share({ title: `stopwake-${data.user.publicId}.json`, message: JSON.stringify(data, null, 2) }, { dialogTitle: tr('account.exportTitle') });
    } catch (e) {
      toast.show({ id: 'export', message: errorText(e, tr), error: true });
    } finally {
      setExporting(false);
    }
  }

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setPasswordError(null);
    try {
      // The warning has been shown: the user deletes knowing Google Play keeps billing.
      await deleteAccount({ password: guest ? undefined : password, acknowledgeSubscription: showSubscription || undefined });
    } catch (e) {
      setBusy(false);
      haptics.warning();
      if (isApiError(e) && e.code === 'subscription_active') {
        setSubscriptionWarned(true);
        return;
      }
      if (isApiError(e) && e.code === 'invalid_credentials') {
        setPasswordError(tr('errors.invalid_credentials'));
        setPassword('');
        return;
      }
      setError(errorText(e, tr));
      return;
    }
    haptics.success();
    if (clearPhone) {
      saved.update((current) => ({
        favourites: [],
        recents: [],
        preferences: { ...DEFAULT_PREFERENCES, useMiles: current.preferences.useMiles, onboarded: false },
      }));
      navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
    } else {
      navigation.navigate('Tabs', { screen: 'AccountTab' }, { pop: true });
    }
    toast.show({ id: 'deleted', message: tr(guest ? 'account.dataDeleted' : 'account.deleted'), icon: 'delete-outline' });
  }

  const items = [
    !guest ? tr('account.deleteItemAccount') : null,
    publicId ? tr('account.deleteItemId', { id: publicId }) : null,
    tr('account.deleteItemPlan'),
    tr('account.deleteItemSessions'),
  ].filter((x): x is string => !!x);

  return (
    <Screen
      topBar={{ title: guest ? tr('account.deleteDataTitle') : tr('account.deleteTitle') }}
      keyboard
      testID="screen-DeleteAccount"
      footer={
        <StickyFooter>
          <Button
            label={showSubscription ? tr('account.deleteAnyway') : guest ? tr('account.deleteDataSubmit') : tr('account.deleteSubmit')}
            variant="danger"
            onPress={() => void submit()}
            disabled={!ready}
            loading={busy}
            block
            testID="delete-account-submit"
          />
        </StickyFooter>
      }>
      <View style={styles.content}>
        <Banner tone="danger" body={tr('account.deleteWarning')} />
        {showSubscription ? (
          <Banner
            tone="warning"
            body={tr('account.deleteSubscription')}
            action={{ label: tr('account.openPlay'), onPress: () => openExternal(pro.managementUrl) }}
          />
        ) : null}
        {error ? <Banner tone="danger" body={error} /> : null}
      </View>

      <Section title={tr('account.deleteWhat')}>
        {items.map((item) => (
          <View key={item} style={styles.item} accessible accessibilityLabel={item}>
            <Icon name="minus-circle-outline" size={20} color="textSecondary" />
            <AppText variant="bodyM" style={styles.flex}>
              {item}
            </AppText>
          </View>
        ))}
      </Section>

      <Section style={styles.section}>
        <SwitchRow title={tr('account.clearPhone')} subtitle={tr('account.clearPhoneBody')} value={clearPhone} onValueChange={setClearPhone} />
      </Section>

      <View style={[styles.content, styles.fields]}>
        {!guest ? (
          <TextField
            label={tr('account.yourPassword')}
            kind="password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setPasswordError(null);
            }}
            error={passwordError}
            returnKeyType="next"
          />
        ) : null}
        <TextField
          label={tr('account.typeToConfirm', { word })}
          value={typed}
          onChangeText={setTyped}
          placeholder={word}
          autoCapitalize="characters"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          testID="delete-account-confirm"
        />
        <Button
          label={tr('account.exportFirst')}
          icon="download-outline"
          variant="ghost"
          size="M"
          loading={exporting}
          onPress={() => void onExport()}
          style={[styles.export, { borderRadius: t.radius.md }]}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  fields: { paddingTop: 24, gap: 16 },
  section: { marginTop: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, minHeight: 48, paddingVertical: 10 },
  flex: { flex: 1 },
  export: { alignSelf: 'flex-start', marginLeft: -20 },
});
