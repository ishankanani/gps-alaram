import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import type { IconName } from './Icon';
import { ListItem } from './ListItem';

/** The grabber (3.17): 36 x 4, radius 2, borderStrong, centred 8 from the top. */
export function SheetGrabber({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[styles.grabberZone, style]} pointerEvents="none">
      <View style={[styles.grabber, { backgroundColor: t.color.borderStrong }]} />
    </View>
  );
}

type ContentProps = {
  title?: string;
  message?: string;
  children?: ReactNode;
  /** A Button L under the options. */
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The content of a ModalSheet route (native formSheet, fitToContents): our own grabber on Android,
 * a titleS title, an optional message, options, an optional footer. Never a flex: 1 root, which a
 * fitToContents sheet would measure as nothing, and never a text input.
 */
export function ModalSheetContent({ title, message, children, footer, style }: ContentProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ paddingBottom: Math.max(insets.bottom, 8) + 8 }, style]}>
      {Platform.OS === 'android' ? <SheetGrabber /> : <View style={styles.iosTop} />}
      {title ? (
        <AppText variant="titleS" style={styles.title}>
          {title}
        </AppText>
      ) : null}
      {message ? (
        <AppText variant="bodyM" color="textSecondary" style={styles.message}>
          {message}
        </AppText>
      ) : null}
      {children}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

type OptionProps = {
  label: string;
  description?: string;
  icon?: IconName;
  /** Single-choice sheets: a radio on each row. */
  selected?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  /** A PRO badge: tapping should open the Paywall. */
  locked?: boolean;
  onPress: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  testID?: string;
};

/** A ModalSheet row: a dense radio row for pickers, or an action row (24 icon and bodyL). */
export function SheetOption({ label, description, icon, selected, destructive, disabled, locked, onPress, isFirst, isLast, testID }: OptionProps) {
  return (
    <ListItem
      title={label}
      subtitle={description}
      icon={icon}
      selected={selected}
      destructive={destructive}
      disabled={disabled}
      locked={locked}
      dense={selected != null}
      onPress={onPress}
      isFirst={isFirst}
      isLast={isLast ?? true}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  grabberZone: { height: 24, alignItems: 'center', paddingTop: 8 },
  grabber: { width: 36, height: 4, borderRadius: 2 },
  iosTop: { height: 16 },
  title: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  message: { paddingHorizontal: 16, paddingBottom: 8 },
  footer: { paddingHorizontal: 16, paddingTop: 8 },
});
