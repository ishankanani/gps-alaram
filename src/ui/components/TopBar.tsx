import { NavigationContext } from '@react-navigation/native';
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../../i18n';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { IconButton } from './IconButton';

export type TopBarProps = {
  title?: string;
  /** arrow-left on pushed screens, close on modals. */
  leading?: 'back' | 'close' | 'none';
  /** Defaults to going back in the current navigator. */
  onLeadingPress?: () => void;
  /** Up to 2 IconButtons, or 1 ghost Button S ("Restore"). */
  trailing?: ReactNode;
  /** Admin screens append a neutral "Admin" badge. */
  admin?: boolean;
  /** The content has scrolled more than 4 dp: the bar fades to surface2 with a hairline. */
  scrolled?: boolean;
  /** No background at all (the Paywall's bar over its hero). */
  transparent?: boolean;
  /** Pad by the status bar inset (default). Off inside sheets and dialogs. */
  insetTop?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * TopBar (3.24) for pushed and modal screens: 56 dp below the status bar, title in titleS. Its
 * background matches the screen until the content scrolls, then fades to surface2 over 150 ms.
 */
export function TopBar({
  title,
  leading = 'back',
  onLeadingPress,
  trailing,
  admin,
  scrolled = false,
  transparent,
  insetTop = true,
  testID,
  style,
}: TopBarProps) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const navigation = useContext(NavigationContext);
  const [fade] = useState(() => new Animated.Value(scrolled ? 1 : 0));
  const duration = t.motion.duration.headerFade;

  useEffect(() => {
    const anim = Animated.timing(fade, { toValue: scrolled ? 1 : 0, duration, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [scrolled, duration, fade]);

  const back = onLeadingPress ?? (() => navigation?.goBack());
  return (
    <View
      testID={testID}
      style={[
        { paddingTop: insetTop ? insets.top : 0, backgroundColor: transparent ? 'transparent' : t.color.bg },
        style,
      ]}>
      {transparent ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: fade,
              backgroundColor: t.color.surface2,
              borderBottomWidth: t.dark ? 0 : StyleSheet.hairlineWidth,
              borderBottomColor: t.color.border,
            },
          ]}
        />
      )}
      <View style={[styles.bar, { paddingLeft: leading === 'none' ? 16 : 4 }]}>
        {leading !== 'none' ? (
          <IconButton
            icon={leading === 'close' ? 'close' : 'arrow-left'}
            accessibilityLabel={tr(leading === 'close' ? 'common.close' : 'common.back')}
            onPress={back}
            testID={testID ? `${testID}-leading` : undefined}
          />
        ) : null}
        <View style={[styles.titleRow, { marginLeft: leading === 'none' ? 0 : 4 }]}>
          {title ? (
            <AppText variant="titleS" numberOfLines={1} style={styles.title}>
              {title}
            </AppText>
          ) : (
            <View style={styles.title} />
          )}
          {admin ? <Badge label={tr('nav.admin')} tone="neutral" /> : null}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
    </View>
  );
}

/**
 * LargeHeader (3.24) for tab roots (Saved, Activity, Account): the title in titleL with trailing
 * actions beside it. Screen fades a compact TopBar in once the content has scrolled 40 dp.
 */
export function LargeHeader({ title, trailing, style }: { title: string; trailing?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.large, { paddingTop: insets.top + 12 }, style]}>
      <AppText variant="titleL" style={styles.title}>
        {title}
      </AppText>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
  title: { flexShrink: 1, flexGrow: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center' },
  large: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
});
