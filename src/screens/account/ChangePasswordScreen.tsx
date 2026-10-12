import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { changePassword, useApiLanguage } from '../../api/account';
import { isApiError } from '../../api/errors';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useToast } from '../../state';
import { Banner, Button, haptics, Screen, StickyFooter, TextField } from '../../ui';
import { errorText, fieldErrorText } from './shared';

/**
 * Route `ChangePassword` (ui-direction-a 4.3): current, new and repeat (POST /me/password). The
 * server signs out every other phone; the toast says so.
 */
export function ChangePasswordScreen({ navigation }: RootScreenProps<'ChangePassword'>) {
  const { t: tr } = useI18n();
  useApiLanguage();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);
  const [repeatError, setRepeatError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextRef = useRef<TextInput>(null);
  const repeatRef = useRef<TextInput>(null);

  async function submit() {
    if (busy) return;
    const length = [...next.normalize('NFKC')].length;
    const badCurrent = current ? null : tr('errors.field.required');
    const badNext = !next ? tr('errors.field.required') : length < 8 ? tr('errors.password.too_short') : length > 128 ? tr('errors.password.too_long') : null;
    const badRepeat = !badNext && repeat !== next ? tr('account.passwordMismatch') : null;
    setCurrentError(badCurrent);
    setNextError(badNext);
    setRepeatError(badRepeat);
    setError(null);
    if (badCurrent || badNext || badRepeat) {
      haptics.warning();
      return;
    }
    setBusy(true);
    try {
      const revoked = await changePassword(current, next);
      haptics.success();
      toast.show({ id: 'password-changed', message: tr(revoked > 0 ? 'account.passwordChanged' : 'account.passwordChangedAlone'), icon: 'lock-check-outline' });
      navigation.goBack();
    } catch (e) {
      setBusy(false);
      haptics.warning();
      if (isApiError(e) && e.code === 'invalid_credentials') {
        setCurrentError(tr('errors.invalid_credentials'));
        setCurrent('');
        return;
      }
      const field = fieldErrorText(e, 'newPassword', tr, 'password');
      if (field) setNextError(field);
      else setError(errorText(e, tr));
    }
  }

  return (
    <Screen
      topBar={{ title: tr('account.passwordTitle') }}
      keyboard
      testID="screen-ChangePassword"
      footer={
        <StickyFooter>
          <Button label={tr('account.passwordTitle')} onPress={() => void submit()} loading={busy} block testID="change-password-submit" />
        </StickyFooter>
      }>
      <View style={styles.content}>
        {error ? <Banner tone="danger" body={error} /> : null}
        <TextField
          label={tr('account.currentPassword')}
          kind="password"
          value={current}
          onChangeText={(text) => {
            setCurrent(text);
            setCurrentError(null);
          }}
          error={currentError}
          returnKeyType="next"
          onSubmitEditing={() => nextRef.current?.focus()}
          autoFocus
        />
        <TextField
          label={tr('account.newPassword')}
          kind="newPassword"
          value={next}
          inputRef={nextRef}
          helper={tr('account.passwordHelper')}
          onChangeText={(text) => {
            setNext(text);
            setNextError(null);
          }}
          error={nextError}
          returnKeyType="next"
          onSubmitEditing={() => repeatRef.current?.focus()}
        />
        <TextField
          label={tr('account.repeatPassword')}
          kind="newPassword"
          value={repeat}
          inputRef={repeatRef}
          onChangeText={(text) => {
            setRepeat(text);
            setRepeatError(null);
          }}
          error={repeatError}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
});
