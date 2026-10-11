import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { NavigationContext } from '@react-navigation/native';
import { useContext, useEffect, useRef, useState, type ReactElement, type ReactNode, type Ref } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { useToastInset } from './Toast';
import { LargeHeader } from './LargeHeader';
import { TopBar, type TopBarProps } from './TopBar';

export type ScreenProps = {
  children?: ReactNode;
  /** A fixed TopBar; it fades to surface2 once the content scrolls. */
  topBar?: Omit<TopBarProps, 'scrolled'>;
  /** Tab roots: a LargeHeader in the content, and a compact bar after 40 dp of scroll. */
  largeTitle?: string;
  largeTrailing?: ReactNode;
  /** Wrap the content in a ScrollView (default). */
  scroll?: boolean;
  /** Forms: keep fields and the footer above the keyboard. */
  keyboard?: boolean;
  /** A StickyFooter. */
  footer?: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  scrollRef?: Ref<ScrollView>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

type TabPressTarget = { addListener?: (event: 'tabPress', cb: () => void) => () => void; isFocused?: () => boolean };

/**
 * A screen (3.29): safe-area insets, the bg background, a ScrollView that keeps taps while the
 * keyboard is up, KeyboardAvoidingView for forms, room for the tab bar on tab roots, and content
 * at most 600 dp wide. Re-tapping a tab scrolls its root back to the top.
 */
export function Screen({
  children,
  topBar,
  largeTitle,
  largeTrailing,
  scroll = true,
  keyboard,
  footer,
  refreshControl,
  scrollRef,
  onScroll,
  contentStyle,
  style,
  testID,
}: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const navigation = useContext(NavigationContext) as TabPressTarget | undefined;
  const [scrolled, setScrolled] = useState(false);
  const [compact, setCompact] = useState(false);
  const ownScroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (tabBarHeight === undefined || !navigation?.addListener) return;
    return navigation.addListener('tabPress', () => {
      if (navigation.isFocused?.()) ownScroll.current?.scrollTo({ y: 0, animated: true });
    });
  }, [navigation, tabBarHeight]);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y;
    if (y > 4 !== scrolled) setScrolled(y > 4);
    if (y > 40 !== compact) setCompact(y > 40);
    onScroll?.(event);
  }

  const hasHeader = !!topBar || !!largeTitle;
  const bottom = footer ? 24 : (tabBarHeight ?? insets.bottom) + 24;
  const width = styles.width;

  const body = scroll ? (
    <ScrollView
      ref={(node) => {
        ownScroll.current = node;
        setRef(scrollRef, node);
      }}
      keyboardShouldPersistTaps="handled"
      onScroll={handleScroll}
      scrollEventThrottle={16}
      refreshControl={refreshControl}
      style={styles.flex}
      contentContainerStyle={[width, { paddingBottom: bottom }, contentStyle]}>
      {largeTitle ? <LargeHeader title={largeTitle} trailing={largeTrailing} /> : null}
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, width, contentStyle]}>
      {largeTitle ? <LargeHeader title={largeTitle} trailing={largeTrailing} /> : null}
      {children}
    </View>
  );

  return (
    <View testID={testID} style={[styles.flex, { backgroundColor: t.color.bg, paddingTop: hasHeader ? 0 : insets.top }, style]}>
      {topBar ? <TopBar {...topBar} scrolled={scrolled} /> : null}
      {keyboard ? (
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          {body}
          {footer}
        </KeyboardAvoidingView>
      ) : (
        <>
          {body}
          {footer}
        </>
      )}
      {largeTitle ? <CompactHeader visible={compact} title={largeTitle} /> : null}
    </View>
  );
}

/** The compact bar of a tab root, faded in over 150 ms after 40 dp of scroll. */
function CompactHeader({ visible, title }: { visible: boolean; title: string }) {
  const t = useTheme();
  const [fade] = useState(() => new Animated.Value(0));
  const duration = t.motion.duration.headerFade;
  useEffect(() => {
    const anim = Animated.timing(fade, { toValue: visible ? 1 : 0, duration, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [visible, duration, fade]);
  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[styles.compact, { opacity: fade }]}>
      <TopBar title={title} leading="none" scrolled />
    </Animated.View>
  );
}

type FooterProps = {
  children: ReactNode;
  /** A helper line above the button (bodyS textSecondary, centred). */
  helper?: string;
  /** A hairline on top, when content scrolls beneath the footer. */
  divider?: boolean;
  /** Pad by the bottom inset (when no tab bar is visible). Default true. */
  insetBottom?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * StickyFooter (3.29): surface2, padding 16 plus the bottom inset, holding a Button L. Toasts sit
 * 12 above it while it is on screen.
 */
export function StickyFooter({ children, helper, divider = true, insetBottom = true, style }: FooterProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  useToastInset(height, height > 0);
  return (
    <View
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      style={[
        styles.footer,
        {
          backgroundColor: t.color.surface2,
          paddingBottom: 16 + (insetBottom ? insets.bottom : 0),
          borderTopWidth: divider ? StyleSheet.hairlineWidth : 0,
          borderTopColor: t.color.border,
        },
        style,
      ]}>
      <View style={styles.width}>
        {helper ? (
          <AppText variant="bodyS" color="textSecondary" align="center" style={styles.helper}>
            {helper}
          </AppText>
        ) : null}
        <View style={styles.footerContent}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  width: { width: '100%', maxWidth: 600, alignSelf: 'center' },
  compact: { position: 'absolute', top: 0, left: 0, right: 0 },
  footer: { paddingTop: 16, paddingHorizontal: 16 },
  helper: { marginBottom: 8 },
  footerContent: { gap: 8 },
});
