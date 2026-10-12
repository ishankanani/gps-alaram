import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import type { Place } from '../../lib/geocode';
import { modeBadges } from '../../lib/stations/text';
import { AppText, badgeSpoken, Icon, KindIcon, ModeBadgeRow, Touchable, useTheme, type IconName } from '../../ui';
import { highlightMatch } from './mapLogic';

type Props = {
  place: Place;
  /** Bold the part of the title the query matched (search results). */
  query?: string;
  /** "360 m" from you (labelM, tabular). */
  distance?: string | null;
  /** A leading icon in a 40 dp circle instead of the stop's KindIcon (addresses, actions). */
  icon?: IconName;
  iconTone?: 'fill' | 'primary';
  /** Overrides the subtitle line (town and badges by default). */
  subtitle?: string;
  trailing?: ReactNode;
  last?: boolean;
  onPress: () => void;
  testID?: string;
};

/**
 * A MapSheet row (3.5 inside the sheet: full bleed, no section container): a 40 dp KindIcon, the
 * stop name (one line), the line badges and the town, and the distance from you. TalkBack reads it
 * as one item: name, town, lines and distance.
 */
export function PlaceRow({ place, query, distance, icon, iconTone = 'fill', subtitle, trailing, last, onPress, testID }: Props) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const badges = place.modes ? modeBadges(place.modes) : [];
  const town = subtitle ?? place.context;
  const parts = query ? highlightMatch(place.name, query) : [{ text: place.name, match: false }];
  const label = [place.name, town, badges.map((b) => badgeSpoken(b, tr)).join(', '), distance].filter(Boolean).join(', ');

  return (
    <Touchable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.row, { minHeight: badges.length ? 72 : town ? 64 : 56 }]}>
      {icon ? (
        <View style={[styles.circle, { backgroundColor: iconTone === 'primary' ? t.color.primarySoft : t.color.fill }]}>
          <Icon name={icon} size={20} color={iconTone === 'primary' ? 'onPrimarySoft' : 'textSecondary'} />
        </View>
      ) : (
        <KindIcon kind={place.kind ?? 'place'} size={40} />
      )}
      <View style={styles.text}>
        <AppText variant="bodyL" weight="medium" numberOfLines={1}>
          {parts.map((p, i) =>
            p.match ? (
              <AppText key={i} variant="bodyL" weight="bold">
                {p.text}
              </AppText>
            ) : (
              p.text
            ),
          )}
        </AppText>
        {badges.length || town ? (
          <View style={styles.meta}>
            {place.modes ? <ModeBadgeRow modes={place.modes} /> : null}
            {town ? (
              <AppText variant="bodyS" color="textTertiary" numberOfLines={1} style={styles.town}>
                {town}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>
      {distance ? (
        <AppText variant="labelM" color="textSecondary" tabular numberOfLines={1}>
          {distance}
        </AppText>
      ) : null}
      {trailing}
      {last ? null : <View pointerEvents="none" style={[styles.divider, { backgroundColor: t.color.border }]} />}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  town: { flexShrink: 1 },
  divider: { position: 'absolute', left: 72, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
