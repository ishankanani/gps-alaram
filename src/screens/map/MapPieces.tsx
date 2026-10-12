import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../../i18n';
import { AppText, Button, Icon, Skeleton, Touchable, useTheme } from '../../ui';

/**
 * Map credits (critiques: attribution): a 16 dp "i" in a small surface2 pill with a 48 dp touch
 * area, opening MapLibre's attribution (OpenStreetMap, OpenFreeMap, OpenMapTiles).
 */
export function CreditsControl({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <Touchable
      onPress={onPress}
      ripple="borderless"
      rippleRadius={24}
      overlay={false}
      accessibilityRole="button"
      accessibilityLabel={tr('map.control.credits')}
      testID="map-credits"
      style={styles.creditsTarget}>
      <View style={[styles.credits, { backgroundColor: t.color.surface2, borderRadius: t.radius.pill }, t.elevation(1)]}>
        <Icon name="information-outline" size={16} color="textSecondary" />
      </View>
    </Touchable>
  );
}

/** The fixed crosshair of pin mode, at the centre of the visible map. */
export function PinCrosshair({ top }: { top: number }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <View pointerEvents="none" style={[styles.crosshair, { top: top - 28 }]} accessibilityLabel={tr('map.pinCrosshair')}>
      <View style={[styles.crosshairRing, { borderColor: t.color.primary, backgroundColor: t.color.surface2 }]}>
        <Icon name="plus" size={24} color="primary" />
      </View>
    </View>
  );
}

type PinSheetProps = {
  /** The address under the crosshair; null while it is looked up. */
  address: string | null;
  onUse: () => void;
  onCancel: () => void;
  busy: boolean;
};

/** Pin mode's sheet content: where the pin is, "Use this spot" and "Cancel". */
export function PinSheetHeader() {
  const { t: tr } = useI18n();
  return (
    <AppText variant="titleS" style={styles.pinTitle} accessibilityRole="header">
      {tr('map.pin.title')}
    </AppText>
  );
}

export function PinSheetContent({ address }: Pick<PinSheetProps, 'address'>) {
  return (
    <View style={styles.pinBody}>
      {address ? (
        <AppText variant="bodyM" color="textSecondary" numberOfLines={2}>
          {address}
        </AppText>
      ) : (
        <Skeleton width="70%" height={15} />
      )}
    </View>
  );
}

export function PinSheetFooter({ onUse, onCancel, busy }: Omit<PinSheetProps, 'address'>) {
  const insets = useSafeAreaInsets();
  const { t: tr } = useI18n();
  return (
    <View style={[styles.pinFooter, { paddingBottom: 16 + insets.bottom }]}>
      <Button label={tr('map.pin.use')} icon="map-marker-check-outline" block loading={busy} onPress={onUse} testID="pin-use" />
      <Button label={tr('ui.cancel')} variant="ghost" size="M" block onPress={onCancel} testID="pin-cancel" />
    </View>
  );
}

const styles = StyleSheet.create({
  creditsTarget: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  credits: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  crosshair: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  crosshairRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center', opacity: 0.92 },
  pinTitle: { paddingHorizontal: 16, paddingBottom: 4 },
  pinBody: { paddingHorizontal: 16, paddingBottom: 8, minHeight: 28, justifyContent: 'center' },
  pinFooter: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
});
