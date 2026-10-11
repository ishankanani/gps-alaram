import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n, type Key } from '../../i18n';
import { modeBadges } from '../../lib/stations/text';
import { BADGE_COLOR, BADGE_FALLBACK, BADGE_SHAPE, BADGE_SPOKEN_KEY, BADGE_TEXT_KEY } from '../colors';
import { modeBadgeSize } from '../tokens';
import { AppText } from './AppText';
import { Badge } from './Badge';

export type ModeBadgeSize = keyof typeof modeBadgeSize;

/** A badge from modeBadges() as the rider reads it: "S", "ICE", or "Tram" in their language. */
export function badgeText(badge: string, tr: (key: Key) => string): string {
  const key = (BADGE_TEXT_KEY as Record<string, string>)[badge];
  return key ? tr(key as Key) : badge;
}

/** What TalkBack says for a badge: "Regional train", "S-Bahn". */
export function badgeSpoken(badge: string, tr: (key: Key) => string): string {
  const key = (BADGE_SPOKEN_KEY as Record<string, string>)[badge];
  return key ? tr(key as Key) : badge;
}

type Props = { badge: string; size?: ModeBadgeSize; style?: StyleProp<ViewStyle> };

/**
 * One line badge (3.12) in its transport colour, the same in both themes. S is a circle and U a
 * square, like German station signs. Heights are minimums so the text can grow with font scale.
 */
export function ModeBadge({ badge, size = 'md', style }: Props) {
  const { t: tr } = useI18n();
  const s = modeBadgeSize[size];
  const shape = BADGE_SHAPE[badge];
  return (
    <View
      style={[
        styles.badge,
        {
          minHeight: s.height,
          minWidth: s.height,
          paddingHorizontal: shape ? 0 : s.paddingHorizontal,
          borderRadius: shape === 'circle' ? s.height / 2 : shape === 'square' ? 3 : s.radius,
          backgroundColor: BADGE_COLOR[badge] ?? BADGE_FALLBACK,
        },
        style,
      ]}>
      <AppText
        variant={size === 'lg' ? 'labelM' : 'labelS'}
        weight="bold"
        color="onColor"
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={[
          { fontSize: s.fontSize, lineHeight: s.lineHeight },
          size === 'md' ? styles.mdTracking : null,
        ]}>
        {badgeText(badge, tr)}
      </AppText>
    </View>
  );
}

type RowProps = {
  /** The stop's MODE bitmask. */
  modes: number;
  size?: ModeBadgeSize;
  /** After this many badges, a neutral "+N". */
  max?: number;
  style?: StyleProp<ViewStyle>;
};

/** The lines that serve a stop, most important first; read as one label ("ICE, IC, Regional train"). */
export function ModeBadgeRow({ modes, size = 'md', max = 5, style }: RowProps) {
  const { t: tr } = useI18n();
  const badges = modeBadges(modes);
  if (badges.length === 0) return null;
  const shown = badges.slice(0, max);
  const more = badges.length - shown.length;
  return (
    <View
      accessible
      accessibilityLabel={badges.map((b) => badgeSpoken(b, tr)).join(', ')}
      style={[styles.row, style]}>
      {shown.map((b) => (
        <ModeBadge key={b} badge={b} size={size} />
      ))}
      {more > 0 ? <Badge label={`+${more}`} size="sm" count accessibilityLabel={tr('ui.more', { count: more })} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', paddingVertical: 1 },
  mdTracking: { letterSpacing: 0.2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
});
