// The direct path bundles only this icon font instead of all 19 (about 3 MB less).
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { modeBadges, type StopKind } from '../lib/stations/text';
import { BADGE_COLOR, KIND_COLOR, KIND_ICON, radius, useTheme } from './theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <MaterialCommunityIcons name={name} size={size} color={color ?? t.text} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, shadowColor: t.shadow }, style]}>
      {children}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.title, { color: t.text }]}>{children}</Text>;
}

export function Heading({ children, numberOfLines }: { children: ReactNode; numberOfLines?: number }) {
  const t = useTheme();
  return (
    <Text style={[styles.heading, { color: t.text }]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.label, { color: t.muted }]}>{children}</Text>;
}

export function Body({ children, muted, center }: { children: ReactNode; muted?: boolean; center?: boolean }) {
  const t = useTheme();
  return (
    <Text style={[styles.body, { color: muted ? t.muted : t.text }, center && styles.center]}>{children}</Text>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  busy,
  disabled,
  compact,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const t = useTheme();
  const colors: Record<ButtonKind, [string, string]> = {
    primary: [t.primary, t.onPrimary],
    accent: [t.accent, t.onAccent],
    danger: [t.bad, '#FFFFFF'],
    secondary: [t.primarySoft, t.primary],
    ghost: ['transparent', t.primary],
  };
  const [bg, fg] = colors[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        kind === 'primary' && !disabled && styles.buttonRaised,
        kind === 'primary' && { shadowColor: t.primary },
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <MaterialCommunityIcons name={icon} size={compact ? 18 : 22} color={fg} /> : null}
          <Text style={[styles.buttonText, compact && styles.buttonTextCompact, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  size = 48,
  tint,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  size?: number;
  tint?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: t.surface,
          shadowColor: t.shadow,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <MaterialCommunityIcons name={icon} size={size * 0.48} color={tint ?? t.text} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? t.primary : t.surface,
          borderColor: selected ? t.primary : t.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {icon ? <MaterialCommunityIcons name={icon} size={16} color={selected ? t.onPrimary : t.muted} /> : null}
      <Text style={[styles.chipText, { color: selected ? t.onPrimary : t.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Mutually exclusive options in one rounded bar. */
export function Segmented<T extends string | number | boolean | null>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.surfaceAlt }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && [styles.segmentSelected, { backgroundColor: t.surface, shadowColor: t.shadow }]]}>
            {o.icon ? <MaterialCommunityIcons name={o.icon} size={18} color={selected ? t.primary : t.muted} /> : null}
            <Text style={[styles.segmentText, { color: selected ? t.text : t.muted }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A round, coloured transport icon (train red, S-Bahn green, bus purple, ...). */
export function KindIcon({ kind, size = 40 }: { kind: StopKind | 'place'; size?: number }) {
  return (
    <View style={[styles.kindIcon, { width: size, height: size, borderRadius: size / 2, backgroundColor: KIND_COLOR[kind] }]}>
      <MaterialCommunityIcons name={KIND_ICON[kind]} size={size * 0.55} color="#FFFFFF" />
    </View>
  );
}

/** Small pills for the lines that stop here: ICE, RE, S, U, Tram, Bus. */
export function ModeBadges({ modes }: { modes: number }) {
  const badges = modeBadges(modes);
  if (badges.length === 0) return null;
  return (
    <View style={styles.badges}>
      {badges.map((b) => (
        <View key={b} style={[styles.badge, { backgroundColor: BADGE_COLOR[b] ?? '#607D8B' }]}>
          <Text style={styles.badgeText}>{b}</Text>
        </View>
      ))}
    </View>
  );
}

export function StatusDot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

export function Divider() {
  const t = useTheme();
  return <View style={[styles.divider, { backgroundColor: t.border }]} />;
}

/** A tappable list row with an icon or leading element, title, subtitle and chevron. */
export function Row({
  leading,
  title,
  subtitle,
  right,
  onPress,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      {leading}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: t.text }]} numberOfLines={1}>
          {title}
        </Text>
        {typeof subtitle === 'string' ? (
          <Text style={[styles.rowSubtitle, { color: t.muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : (
          subtitle
        )}
      </View>
      {right ?? (onPress ? <MaterialCommunityIcons name="chevron-right" size={22} color={t.muted} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 12,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  body: { fontSize: 16, lineHeight: 23 },
  center: { textAlign: 'center' },
  button: {
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonCompact: { minHeight: 42, borderRadius: radius.sm, paddingHorizontal: 14 },
  buttonRaised: { shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttonText: { fontSize: 17, fontWeight: '700' },
  buttonTextCompact: { fontSize: 15 },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipText: { fontSize: 15, fontWeight: '600' },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 4, gap: 4 },
  segment: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  segmentSelected: { shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { fontSize: 15, fontWeight: '700' },
  kindIcon: { alignItems: 'center', justifyContent: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  divider: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { fontSize: 14 },
});
