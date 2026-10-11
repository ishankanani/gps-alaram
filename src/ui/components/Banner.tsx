import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '../../i18n';
import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';

export type BannerTone = 'info' | 'warning' | 'danger' | 'success' | 'promo' | 'neutral';

const TONES: Record<BannerTone, { bg: ColorToken; fg: ColorToken; icon: IconName; strong: ColorToken }> = {
  info: { bg: 'primarySoft', fg: 'onPrimarySoft', icon: 'information-outline', strong: 'primary' },
  warning: { bg: 'warningSoft', fg: 'onWarningSoft', icon: 'alert-outline', strong: 'warning' },
  danger: { bg: 'dangerSoft', fg: 'onDangerSoft', icon: 'alert-circle-outline', strong: 'danger' },
  success: { bg: 'successSoft', fg: 'onSuccessSoft', icon: 'check-circle-outline', strong: 'success' },
  promo: { bg: 'accentSoft', fg: 'accentInk', icon: 'crown-outline', strong: 'accentInk' },
  neutral: { bg: 'fill', fg: 'text', icon: 'information-outline', strong: 'textSecondary' },
};

/** Remote-config announcement levels as banner tones. */
export const ANNOUNCEMENT_TONE: Record<'info' | 'success' | 'warning' | 'critical', BannerTone> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  critical: 'danger',
};

type Props = {
  tone?: BannerTone;
  title?: string;
  body: string;
  /** Overrides the tone's icon (announcements use bullhorn-outline). */
  icon?: IconName;
  /** A ghost Button S in the tone colour. */
  action?: { label: string; onPress: () => void };
  /** A close button; remember the dismissal per banner id. */
  onClose?: () => void;
  /** Over the map: surface2 with elevation 1, the tone only in the icon, so the map stays calm. */
  onMap?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Banner (3.27). Only one banner shows on the map at a time (see the priority in the spec). */
export function Banner({ tone = 'info', title, body, icon, action, onClose, onMap, testID, style }: Props) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const c = TONES[tone];
  const fg: ColorToken = onMap ? 'text' : c.fg;
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
      style={[
        styles.banner,
        {
          backgroundColor: onMap ? t.color.surface2 : t.color[c.bg],
          borderRadius: t.radius.md,
          paddingRight: onClose ? 4 : 16,
        },
        onMap ? t.elevation(1) : null,
        style,
      ]}>
      <Icon name={icon ?? c.icon} size={20} color={onMap ? c.strong : c.fg} style={styles.icon} />
      <View style={styles.text}>
        {title ? (
          <AppText variant="labelM" color={fg}>
            {title}
          </AppText>
        ) : null}
        <AppText variant="bodyM" color={fg} numberOfLines={3}>
          {body}
        </AppText>
        {action ? (
          <Button
            label={action.label}
            onPress={action.onPress}
            variant="ghost"
            size="S"
            color={onMap ? 'primary' : c.fg}
            style={styles.action}
          />
        ) : null}
      </View>
      {onClose ? (
        <IconButton icon="close" accessibilityLabel={tr('common.close')} color={fg} onPress={onClose} style={styles.close} />
      ) : null}
    </View>
  );
}

/**
 * The offline pill on the map: one quiet line, centred, up to 2 lines (radius md when it wraps)
 * and never wider than the screen minus 32.
 */
export function OfflinePill({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [wrapped, setWrapped] = useState(false);
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.pill,
        {
          maxWidth: width - 32,
          backgroundColor: t.color.surface2,
          borderRadius: wrapped ? t.radius.md : t.radius.pill,
        },
        t.elevation(1),
        style,
      ]}>
      <Icon name="wifi-off" size={16} color="warning" />
      <AppText
        variant="labelM"
        numberOfLines={2}
        style={styles.pillText}
        onTextLayout={(e) => setWrapped(e.nativeEvent.lines.length > 1)}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingLeft: 16 },
  icon: { marginTop: 0 },
  text: { flex: 1, gap: 2 },
  action: { marginLeft: -14, marginBottom: -12 },
  close: { marginTop: -12, marginBottom: -12 },
  pill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: { flexShrink: 1 },
});
