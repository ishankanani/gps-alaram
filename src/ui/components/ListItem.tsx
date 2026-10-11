import { createContext, useContext, type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PlanBadge } from './PlanBadge';
import { Touchable } from './Touchable';

/** Where a row sits in its group; set by Section, or by isFirst/isLast in virtualized lists. */
export type RowPosition = { first: boolean; last: boolean; inSection: boolean; inSheet: boolean };

export const RowPositionContext = createContext<RowPosition | null>(null);

export type ListItemProps = {
  title: string;
  titleLines?: 1 | 2;
  subtitle?: string;
  subtitleLines?: 1 | 2;
  /** ModeBadgeRow and the town or a time (bodyS textTertiary), gap 4. */
  meta?: ReactNode;
  /** A 24 dp leading icon in textSecondary (or iconColor). */
  icon?: IconName;
  iconColor?: ColorToken;
  /** A 40 dp KindIcon, Avatar or flag box. */
  leading?: ReactNode;
  /** Width of `leading`, for the divider inset; defaults to 40. */
  leadingWidth?: number;
  /** A value on the right (bodyM textSecondary, at most 40 % of the row). */
  value?: string;
  /** A number on the right (labelM, tabular). */
  numeric?: string;
  chevron?: boolean;
  loading?: boolean;
  trailing?: ReactNode;
  /** Pickers: a trailing radio (or check). false shows the empty radio. */
  selected?: boolean;
  selection?: 'radio' | 'check';
  destructive?: boolean;
  disabled?: boolean;
  /** A trailing PRO badge; tapping should open the Paywall. */
  locked?: boolean;
  /** Admin lists and pickers: 48 dp rows. */
  dense?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Virtualized grouped lists (SectionList, FlatList): the row draws its own section corners. */
  grouped?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  /** Whether the row is one accessibility element (default). Turn off when trailing holds its own controls. */
  accessible?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: { checked?: boolean; selected?: boolean; disabled?: boolean };
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A row (3.5). The whole row is one target with a full-bleed ripple (clipped by its Section);
 * dividers are inset to the text and left out after the last row.
 */
export function ListItem(props: ListItemProps) {
  const {
    title,
    titleLines = 1,
    subtitle,
    subtitleLines = 1,
    meta,
    icon,
    iconColor,
    leading,
    leadingWidth = 40,
    value,
    numeric,
    chevron,
    loading,
    trailing,
    selected,
    selection = 'radio',
    destructive,
    disabled,
    locked,
    dense,
    onPress,
    onLongPress,
    grouped,
    isFirst,
    isLast,
    accessible = true,
    accessibilityRole,
    accessibilityLabel,
    accessibilityHint,
    accessibilityState,
    accessibilityActions,
    onAccessibilityAction,
    testID,
    style,
  } = props;
  const t = useTheme();
  const context = useContext(RowPositionContext);
  const first = isFirst ?? context?.first ?? true;
  const last = isLast ?? context?.last ?? true;
  const inSheet = context?.inSheet ?? false;
  const twoLines = !!subtitle || titleLines === 2;
  const minHeight = dense ? 48 : meta ? 72 : twoLines ? 64 : 56;
  const leadSize = icon ? 24 : leading ? leadingWidth : 0;
  const dividerInset = 16 + (leadSize ? leadSize + 16 : 0);
  const titleColor: ColorToken = disabled ? 'textDisabled' : destructive ? 'danger' : 'text';
  const subColor: ColorToken = disabled ? 'textDisabled' : 'textSecondary';
  const role: AccessibilityRole | undefined =
    accessibilityRole ?? (selected != null ? 'radio' : onPress ? 'button' : undefined);
  const label = accessibilityLabel ?? [title, subtitle, value ?? numeric].filter(Boolean).join(', ');

  let trailingNode: ReactNode = trailing ?? null;
  if (selected != null) {
    trailingNode = (
      <Icon
        name={selection === 'check' ? (selected ? 'check' : 'blank') : selected ? 'radiobox-marked' : 'radiobox-blank'}
        size={24}
        color={selected ? 'primary' : 'textTertiary'}
      />
    );
  } else if (locked) {
    trailingNode = <PlanBadge variant="pro" size="sm" />;
  } else if (loading) {
    trailingNode = <ActivityIndicator size={20} color={t.color.primary} />;
  }

  const body = (
    <>
      {icon ? (
        <Icon name={icon} size={24} color={destructive ? 'danger' : (iconColor ?? 'textSecondary')} style={disabled ? styles.dim : null} />
      ) : leading ? (
        <View style={disabled ? styles.dim : null}>{leading}</View>
      ) : null}
      <View style={styles.text}>
        <AppText variant={dense ? 'bodyM' : 'bodyL'} weight="medium" color={titleColor} numberOfLines={titleLines}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodyM" color={subColor} numberOfLines={subtitleLines}>
            {subtitle}
          </AppText>
        ) : null}
        {meta ? <View style={styles.meta}>{meta}</View> : null}
      </View>
      {value ? (
        <AppText variant="bodyM" color="textSecondary" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {numeric ? (
        <AppText variant="labelM" color="textSecondary" tabular numberOfLines={1}>
          {numeric}
        </AppText>
      ) : null}
      {trailingNode}
      {chevron ? <Icon name="chevron-right" size={20} color="textTertiary" /> : null}
    </>
  );

  const rowStyle = [
    styles.row,
    { minHeight, paddingVertical: dense ? 8 : 12 },
    grouped
      ? [
          styles.grouped,
          { backgroundColor: t.color.surface1 },
          first ? { borderTopLeftRadius: t.radius.lg, borderTopRightRadius: t.radius.lg } : null,
          last ? { borderBottomLeftRadius: t.radius.lg, borderBottomRightRadius: t.radius.lg } : null,
        ]
      : null,
    style,
  ];
  const divider = !last ? (
    <View pointerEvents="none" style={[styles.divider, { left: dividerInset, backgroundColor: t.color.border }]} />
  ) : null;
  const a11y = {
    accessible,
    accessibilityRole: role,
    accessibilityLabel: label,
    accessibilityHint,
    accessibilityState: {
      disabled: !!disabled,
      ...(selected != null ? { checked: selected, selected } : null),
      ...accessibilityState,
    },
    accessibilityActions,
    onAccessibilityAction,
  };

  if (!onPress && !onLongPress) {
    return (
      <View testID={testID} style={rowStyle} {...a11y}>
        {body}
        {divider}
      </View>
    );
  }
  return (
    <Touchable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      rippleColor={inSheet ? t.color.ripple : undefined}
      style={rowStyle}
      {...a11y}>
      {body}
      {divider}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 16,
  },
  grouped: { marginHorizontal: 16, overflow: 'hidden' },
  text: { flex: 1, gap: 2, marginRight: -4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 2 },
  value: { maxWidth: '40%', textAlign: 'right' },
  divider: { position: 'absolute', right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  dim: { opacity: 0.5 },
});
