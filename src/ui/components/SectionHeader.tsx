import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';

export type SectionAction = { label: string; onPress: () => void; accessibilityLabel?: string };

export type SectionHeaderProps = {
  title: string;
  /** Appended as "Favourites · 2 of 3"; pass the formatted count. */
  count?: string;
  /** A ghost Button S: "Clear", "See all", "Edit". */
  action?: SectionAction;
  /** Anything else on the right (a spinner, a bodyS note). */
  trailing?: ReactNode;
  /** The first header on a screen sits 16 from the top instead of 24. */
  first?: boolean;
  /** Inside the MapSheet: titleS in text, 16 from the left (the sheet is the surface). */
  inSheet?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Sentence-case group header (3.6): labelM textSecondary, 24 above (16 for the first one), 8 below,
 * 32 from the left so it lines up with the rows' text. Inside the MapSheet: titleS in text.
 */
export function SectionHeader({ title, count, action, trailing, first, inSheet, style }: SectionHeaderProps) {
  return (
    <View
      style={[
        styles.header,
        // A ghost Button S brings its own 48 dp touch area, so the padding shrinks around it.
        action
          ? { paddingTop: first ? 4 : 12, paddingBottom: 0, paddingLeft: inSheet ? 16 : 32, paddingRight: 8 }
          : { paddingTop: first ? 16 : 24, paddingBottom: 8, paddingLeft: inSheet ? 16 : 32, paddingRight: 16 },
        style,
      ]}>
      <AppText
        variant={inSheet ? 'titleS' : 'labelM'}
        color={inSheet ? 'text' : 'textSecondary'}
        accessibilityRole="header"
        style={styles.text}>
        {count ? `${title} · ${count}` : title}
      </AppText>
      {trailing}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          accessibilityLabel={action.accessibilityLabel}
          variant="ghost"
          size="S"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1 },
});
