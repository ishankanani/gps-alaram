import { Children, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { RowPositionContext } from './ListItem';
import { SectionHeader, type SectionHeaderProps } from './SectionHeader';
import { SkeletonRow } from './Skeleton';

export type { SectionAction } from './SectionHeader';

type SectionProps = Partial<Omit<SectionHeaderProps, 'style'>> & {
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
  container: { marginHorizontal: 16, overflow: 'hidden' },
  footer: { paddingTop: 8, paddingHorizontal: 32 },
  footerSheet: { paddingHorizontal: 16 },
});
