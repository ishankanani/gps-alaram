import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { initialsOf } from '../typography';
import { AppText } from './AppText';
import { Icon } from './Icon';

export type AvatarSize = 32 | 36 | 40 | 64;

type Props = {
  size?: AvatarSize;
  /** Signed in: initials from the name, or from the email's local part. Leave both out for a guest. */
  name?: string | null;
  email?: string | null;
  /** A 2 dp amber ring with a 2 dp gap around the avatar. */
  pro?: boolean;
  /** Admin lists: a disabled user (fill avatar with a danger cancel badge). */
  disabled?: boolean;
  /** Admin lists: an admin (primary shield badge). */
  admin?: boolean;
  /** The surface behind the avatar, for the Pro ring's gap. Defaults to surface1. */
  surface?: 'bg' | 'surface1' | 'surface2' | 'surface3';
  style?: StyleProp<ViewStyle>;
};

/** Avatar (3.14). Decorative: the row or card around it carries the name. */
export function Avatar({ size = 40, name, email, pro, disabled, admin, surface = 'surface1', style }: Props) {
  const t = useTheme();
  const initials = disabled ? '' : initialsOf(name, email);
  const guest = !initials;
  const variant = size >= 64 ? 'titleM' : size >= 40 ? 'labelL' : 'labelM';
  const circle = (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: guest ? t.color.fill : t.color.primarySoft,
        },
      ]}>
      {guest ? (
        <Icon name="account-outline" size={Math.round(size * 0.55)} color="textSecondary" />
      ) : (
        <AppText variant={variant} color="onPrimarySoft" maxFontSizeMultiplier={1}>
          {initials}
        </AppText>
      )}
      {disabled ? (
        <View style={[styles.badge, { backgroundColor: t.color.danger, borderColor: t.color[surface] }]}>
          <Icon name="cancel" size={10} color="onDanger" />
        </View>
      ) : admin ? (
        <View style={[styles.badge, { backgroundColor: t.color.primary, borderColor: t.color[surface] }]}>
          <Icon name="shield-crown" size={10} color="onPrimary" />
        </View>
      ) : null}
    </View>
  );
  if (!pro) {
    return (
      <View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {circle}
      </View>
    );
  }
  const outer = size + 8;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.ring,
        {
          width: outer,
          height: outer,
          borderRadius: outer / 2,
          borderColor: t.color.accent,
          backgroundColor: t.color[surface],
        },
        // In light mode amber alone is hard to see on white: a thin darker edge outside the ring.
        t.dark ? null : { outlineColor: t.color.accentEdge, outlineWidth: 1, outlineStyle: 'solid' },
        style,
      ]}>
      {circle}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
