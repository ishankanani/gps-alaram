import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { AppText, Avatar, Button, Card, Icon, IconButton, Skeleton, Touchable, useTheme, useToast } from '../../ui';
import { copyText } from './shared';

type Props = {
  guest: boolean;
  name: string | null;
  email: string | null;
  publicId: string | null;
  pro: boolean;
  /** Guests: "Create free account" (hidden when sign-up is off) and "Sign in". */
  signUpEnabled: boolean;
  /** A guest with a gift or code: it is tied to this phone (backend-spec 3.8). */
  giftWarning: boolean;
  onEdit: () => void;
  onSignUp: () => void;
  onSignIn: () => void;
};

/** The SW- ID as a chip; tapping copies it (toast "ID copied"). 48 dp tall to touch. */
export function IdChip({ publicId }: { publicId: string | null }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const toast = useToast();
  if (!publicId) {
    return (
      <AppText variant="bodyS" color="textTertiary">
        {tr('account.idPending')}
      </AppText>
    );
  }
  return (
    <Touchable
      onPress={() => {
        void copyText(publicId).then((ok) => {
          if (ok) toast.show({ id: 'id-copied', message: tr('account.idCopied'), icon: 'content-copy' });
        });
      }}
      accessibilityRole="button"
      accessibilityLabel={tr('account.idCopy', { id: publicId })}
      style={styles.chipTarget}
      testID="account-id-chip">
      <View style={[styles.chip, { backgroundColor: t.color.fill, borderRadius: t.radius.sm }]}>
        <AppText variant="labelM" tabular selectable={false}>
          {publicId}
        </AppText>
        <Icon name="content-copy" size={16} color="textSecondary" />
      </View>
    </Touchable>
  );
}

/**
 * Identity at the top of Account (4.3 and the critiques' guest layout): a 64 avatar, the name or
 * "Guest", the email or "Not signed in", the ID chip. Guests get one benefit line and a tonal
 * "Create free account" plus a ghost "Sign in", so "Get Pro" stays the only primary button.
 */
export function ProfileCard({ guest, name, email, publicId, pro, signUpEnabled, giftWarning, onEdit, onSignUp, onSignIn }: Props) {
  const { t: tr } = useI18n();
  return (
    <Card style={styles.card} testID="account-profile">
      <View style={styles.row}>
        <Avatar size={64} name={guest ? null : name} email={guest ? null : email} pro={pro} />
        <View style={styles.text}>
          <AppText variant="titleS" numberOfLines={2}>
            {guest ? tr('account.guest') : name || email || tr('account.noName')}
          </AppText>
          <AppText variant="bodyM" color="textSecondary" numberOfLines={1}>
            {guest ? tr('account.notSignedIn') : name ? email : null}
          </AppText>
          <IdChip publicId={publicId} />
        </View>
        {!guest ? <IconButton icon="pencil-outline" accessibilityLabel={tr('account.editProfile')} onPress={onEdit} testID="account-edit" /> : null}
      </View>
      {guest ? (
        <View style={styles.guest}>
          <AppText variant="bodyM" color="textSecondary">
            {tr('account.guestBody')}
          </AppText>
          {giftWarning ? (
            <View style={styles.warning}>
              <Icon name="alert-outline" size={16} color="warning" />
              <AppText variant="bodyS" color="textSecondary" style={styles.flex}>
                {tr('account.guestGiftWarning')}
              </AppText>
            </View>
          ) : null}
          <View style={styles.buttons}>
            {signUpEnabled ? (
              <Button label={tr('account.createAccount')} variant="secondary" size="M" block onPress={onSignUp} testID="account-sign-up" />
            ) : null}
            <Button label={tr('account.signIn')} variant="ghost" size="M" block onPress={onSignIn} testID="account-sign-in" />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

/** First load: the profile card's shape while the ID is created. */
export function ProfileCardSkeleton() {
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Skeleton shape="circle" height={64} />
        <View style={styles.text}>
          <Skeleton width="50%" height={17} />
          <Skeleton width="35%" height={15} />
          <Skeleton width={140} height={26} shape="block" />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  text: { flex: 1, gap: 4, alignItems: 'flex-start' },
  chipTarget: { minHeight: 48, justifyContent: 'center', marginVertical: -8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8 },
  guest: { gap: 12 },
  warning: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  flex: { flex: 1 },
  buttons: { gap: 4 },
});
