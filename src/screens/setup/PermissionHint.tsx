import { StyleSheet, View } from 'react-native';

import { useI18n, type Key } from '../../i18n';
import { AppText, Icon, useTheme, type IconName } from '../../ui';

export type HintKind = 'location' | 'precise' | 'notifications';

const SENTENCE: Record<HintKind, Key> = {
  location: 'onboarding.setup.hint.location',
  precise: 'onboarding.setup.hint.precise',
  notifications: 'onboarding.setup.hint.notifications',
};

/**
 * Which choices to tap in the system's permission window (ui-critiques: "Get ready" shows them):
 * a small drawing of Android's dialog with the right options marked. Read as one sentence.
 */
export function PermissionHint({ kind }: { kind: HintKind }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const sentence = tr(SENTENCE[kind]);
  return (
    <View style={styles.wrap}>
      <AppText variant="bodyS" color="textSecondary">
        {sentence}
      </AppText>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.dialog, { backgroundColor: t.color.surface3, borderRadius: t.radius.lg, borderColor: t.color.border }]}>
        {kind === 'precise' ? (
          <View style={styles.settingRow}>
            <Icon name="crosshairs-gps" size={20} color="textSecondary" />
            <AppText variant="bodyM" allowFontScaling={false} style={styles.flex}>
              {tr('onboarding.setup.mock.precise')}
            </AppText>
            <View style={[styles.switchTrack, { backgroundColor: t.color.primary }]}>
              <View style={[styles.switchThumb, { backgroundColor: t.color.switchThumb }]} />
            </View>
          </View>
        ) : (
          <>
            <AppText variant="bodyS" weight="medium" align="center" allowFontScaling={false}>
              {tr(kind === 'location' ? 'onboarding.setup.mock.location' : 'onboarding.setup.mock.notifications')}
            </AppText>
            {kind === 'location' ? (
              <View style={styles.tiles}>
                <Tile icon="crosshairs-gps" label={tr('onboarding.setup.mock.precise')} chosen />
                <Tile icon="map-marker-radius-outline" label={tr('onboarding.setup.mock.approximate')} />
              </View>
            ) : null}
            <Choice label={tr(kind === 'location' ? 'onboarding.setup.mock.whileUsing' : 'onboarding.setup.mock.allow')} chosen />
            {kind === 'location' ? <Choice label={tr('onboarding.setup.mock.onlyThisTime')} /> : null}
            <Choice label={tr('onboarding.setup.mock.dontAllow')} />
          </>
        )}
      </View>
    </View>
  );
}

function Tile({ icon, label, chosen }: { icon: IconName; label: string; chosen?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.tile,
        {
          borderRadius: t.radius.md,
          borderColor: chosen ? t.color.primary : t.color.border,
          borderWidth: chosen ? 2 : 1,
          backgroundColor: chosen ? t.color.primarySoft : 'transparent',
        },
      ]}>
      <Icon name={icon} size={20} color={chosen ? 'onPrimarySoft' : 'textSecondary'} />
      <AppText variant="labelS" color={chosen ? 'onPrimarySoft' : 'textSecondary'} allowFontScaling={false}>
        {label}
      </AppText>
    </View>
  );
}

function Choice({ label, chosen }: { label: string; chosen?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.choice,
        { borderRadius: t.radius.pill, backgroundColor: chosen ? t.color.primarySoft : t.color.fill },
        chosen ? { borderWidth: 2, borderColor: t.color.primary } : null,
      ]}>
      <AppText variant="labelM" color={chosen ? 'onPrimarySoft' : 'textSecondary'} allowFontScaling={false} numberOfLines={1}>
        {label}
      </AppText>
      {chosen ? <Icon name="gesture-tap" size={16} color="onPrimarySoft" style={styles.tap} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  dialog: { padding: 12, gap: 8, borderWidth: StyleSheet.hairlineWidth, maxWidth: 320 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8 },
  choice: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, gap: 6 },
  tap: { position: 'absolute', right: 10 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  switchTrack: { width: 36, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 2 },
  switchThumb: { width: 16, height: 16, borderRadius: 8 },
});
