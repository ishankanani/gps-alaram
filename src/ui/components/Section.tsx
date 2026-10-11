import { Children, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { RowPositionContext } from './ListItem';
import { SkeletonRow } from './Skeleton';

export type SectionAction = { label: string; onPress: () => void; accessibilityLabel?: string };

type HeaderProps = {
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

/** Sentence-case group header (3.6): labelM textSecondary, aligned with the rows' text. */
export function SectionHeader({ title, count, action, trailing, first, inSheet, style }: HeaderProps) {
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
        style={styles.headerText}>
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

type SectionProps = Partial<Omit<HeaderProps, 'style'>> & {
  children?: ReactNode;
  /** A note under the section (bodyS textTertiary). */
  footer?: string;
  /** Three skeleton rows instead of the children. */
  loading?: boolean;
  /** Shown inside the container when there are no rows (an inline EmptyState). */
  empty?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * A grouped list (3.7): a surface1 container with radius lg and 16 side margins that clips the rows'
 * ripples. Inside the MapSheet and modal sheets it is full-bleed. For long virtualized lists use
 * ListItem's grouped/isFirst/isLast instead.
 */
export function Section({ title, count, action, trailing, first, inSheet, children, footer, loading, empty, style }: SectionProps) {
  const t = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  let content: ReactNode;
  if (loading) {
    content = (
      <>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </>
    );
  } else if (rows.length === 0 && empty) {
    content = empty;
  } else {
    content = rows.map((row, i) => (
      <RowPositionContext.Provider
        key={row.key ?? i}
        value={{ first: i === 0, last: i === rows.length - 1, inSection: true, inSheet: !!inSheet }}>
        {row}
      </RowPositionContext.Provider>
    ));
  }
  return (
    <View style={style}>
      {title ? <SectionHeader title={title} count={count} action={action} trailing={trailing} first={first} inSheet={inSheet} /> : null}
      <View
        style={
          inSheet
            ? null
            : [styles.container, { backgroundColor: t.color.surface1, borderRadius: t.radius.lg }]
        }>
        {content}
      </View>
      {footer ? (
        <AppText variant="bodyS" color="textTertiary" style={[styles.footer, inSheet ? styles.footerSheet : null]}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerText: { flex: 1 },
  container: { marginHorizontal: 16, overflow: 'hidden' },
  footer: { paddingTop: 8, paddingHorizontal: 32 },
  footerSheet: { paddingHorizontal: 16 },
});
