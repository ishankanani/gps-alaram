import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';
import { AppText } from './AppText';
import { BADGE_TONES, type BadgeTone } from './Badge';
import { Icon, type IconName } from './Icon';
import { useOverlayOpen } from './overlay';

export type DialogProps = {
  visible: boolean;
  /** Scrim tap and Android back: cancel. Ignored while `busy`. */
  onDismiss: () => void;
  title: string;
  message?: string;
  /** A 24 dp icon in a 48 dp circle in the tone's soft colour. */
  icon?: IconName;
  tone?: BadgeTone;
  /** Extra content: a field, a key-value summary. */
  children?: ReactNode;
  /** Buttons M, right-aligned; Cancel first, the confirm button last (it wraps on top). */
  actions?: ReactNode;
  busy?: boolean;
  testID?: string;
};

/**
 * Dialog (3.18) on an RN Modal with our own animation: the scrim fades in over 200 ms and the card
 * comes from opacity 0 and scale 0.96. With a field focused, the card moves up to stay 16 dp above
 * the keyboard.
 */
export function Dialog({ visible, onDismiss, title, message, icon, tone = 'primary', children, actions, busy, testID }: DialogProps) {
  const t = useTheme();
  const window = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [fade] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(0));
  const [cardHeight, setCardHeight] = useState(0);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const { duration: d, easing } = t.motion;
  useOverlayOpen(mounted);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    const anim = Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: visible ? d.base : d.exit,
      easing: visible ? easing.enter : easing.exit,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => anim.stop();
  }, [visible, mounted, fade, d.base, d.exit, easing.enter, easing.exit]);

  useEffect(() => {
    if (!mounted) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setKeyboardTop(e.endCoordinates.screenY),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardTop(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [mounted]);

  useEffect(() => {
    const cardBottom = (window.height + cardHeight) / 2;
    const shift = keyboardTop == null ? 0 : Math.max(0, cardBottom - (keyboardTop - 16));
    const anim = Animated.timing(lift, { toValue: -shift, duration: d.base, easing: easing.standard, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [keyboardTop, cardHeight, window.height, lift, d.base, easing.standard]);

  if (!mounted) return null;
  const toneColors = BADGE_TONES[tone];
  const width = Math.min(window.width - 48, 400);
  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={() => {
        if (!busy) onDismiss();
      }}>
      <View style={styles.root} testID={testID}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.color.scrim, opacity: fade }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!busy) onDismiss();
            }}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Animated.View>
        <Animated.View
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              width,
              backgroundColor: t.color.surface3,
              borderRadius: t.radius.xl,
              opacity: fade,
              transform: [
                { translateY: lift },
                { scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
            t.elevation(3),
          ]}>
          {icon ? (
            <View style={[styles.iconCircle, { backgroundColor: t.color[toneColors.bg] }]}>
              <Icon name={icon} size={24} color={toneColors.strong} />
            </View>
          ) : null}
          <AppText variant="titleM">{title}</AppText>
          {message ? (
            <AppText variant="bodyM" color="textSecondary">
              {message}
            </AppText>
          ) : null}
          {children}
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** A soft-tone circle with an icon, for dialog-like content outside Dialog. */
export function ToneIcon({ icon, tone = 'primary', style }: { icon: IconName; tone?: BadgeTone; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const c = BADGE_TONES[tone];
  return (
    <View style={[styles.iconCircle, { backgroundColor: t.color[c.bg] }, style]}>
      <Icon name={icon} size={24} color={c.strong as ColorToken} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 24, gap: 16 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap-reverse', justifyContent: 'flex-end', gap: 8 },
});
