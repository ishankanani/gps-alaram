import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Touchable } from './Touchable';

export type CardProps = {
  /** Header title (titleS). */
  title?: string;
  /** A Badge or IconButton next to the title. */
  headerTrailing?: ReactNode;
  /** Body sentence (bodyM, textSecondary). */
  body?: string;
  children?: ReactNode;
  /** Buttons M, gap 8. */
  actions?: ReactNode;
  /** 'block' stacks full-width actions; 'end' right-aligns them in a row. */
  actionsLayout?: 'block' | 'end';
  /** outlined: 1 px border; raised: elevation 1 (only over the map). */
  variant?: 'default' | 'outlined' | 'raised';
  /** Makes the whole card one target. */
  onPress?: () => void;
  chevron?: boolean;
  /** A coloured border, e.g. 1.5 px accent around a Pro plan card. */
  borderColor?: ColorToken;
  borderWidth?: number;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Card (3.4): surface1, radius lg, padding 16, gap 12, no shadow on bg. */
export function Card({
  title,
  headerTrailing,
  body,
  children,
  actions,
  actionsLayout = 'block',
  variant = 'default',
  onPress,
  chevron,
  borderColor,
  borderWidth,
  accessibilityLabel,
  testID,
  style,
}: CardProps) {
  const t = useTheme();
  const containerStyle = [
    styles.card,
    { backgroundColor: t.color.surface1, borderRadius: t.radius.lg },
    variant === 'outlined' ? { borderWidth: 1, borderColor: t.color.border } : null,
    variant === 'raised' ? t.elevation(1) : null,
    borderColor ? { borderWidth: borderWidth ?? 1.5, borderColor: t.color[borderColor] } : null,
    style,
  ];
  const content = (
    <>
      {title || headerTrailing ? (
        <View style={styles.header}>
          {title ? (
            <AppText variant="titleS" style={styles.title}>
              {title}
            </AppText>
          ) : (
            <View style={styles.title} />
          )}
          {headerTrailing}
        </View>
      ) : null}
      {body ? (
        <AppText variant="bodyM" color="textSecondary">
          {body}
        </AppText>
      ) : null}
      {children}
      {actions ? <View style={actionsLayout === 'end' ? styles.actionsEnd : styles.actionsBlock}>{actions}</View> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={containerStyle} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Touchable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, body].filter(Boolean).join('. ')}
      style={[containerStyle, styles.pressable]}>
      <View style={styles.pressableRow}>
        <View style={styles.pressableContent}>{content}</View>
        {chevron ? <Icon name="chevron-right" size={20} color="textTertiary" /> : null}
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1 },
  actionsBlock: { gap: 8 },
  actionsEnd: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  pressable: { overflow: 'hidden' },
  pressableRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressableContent: { flex: 1, gap: 12 },
});
