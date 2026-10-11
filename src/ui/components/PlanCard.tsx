import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { Icon } from './Icon';
import { Touchable } from './Touchable';

type Props = {
  /** "Yearly". */
  title: string;
  /** One accent badge at most ("Save 58 %"); it wraps below the title, never beside the price. */
  badge?: string;
  /** "€0.83 a month · first 7 days free", "Billed monthly", "Pay once, keep it". */
  subtitle?: string;
  /** "€9.99", formatted by the caller (store priceString or formatPrice). */
  price: string;
  /** "/ year". */
  period?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A plan choice on the Paywall (3.29): a radio card, 1 px borderStrong, 2 px primary when selected.
 * The title row wraps so long badges ("7 Tage gratis") never squeeze the price. No status colours.
 */
export function PlanCard({ title, badge, subtitle, price, period, selected, onPress, disabled, testID, style }: Props) {
  const t = useTheme();
  const border = selected ? 2 : 1;
  return (
    <Touchable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={[title, badge, subtitle, period ? `${price} ${period}` : price].filter(Boolean).join(', ')}
      accessibilityState={{ checked: selected, selected, disabled: !!disabled }}
      style={[
        styles.card,
        {
          borderRadius: t.radius.lg,
          borderWidth: border,
          borderColor: selected ? t.color.primary : t.color.borderStrong,
          backgroundColor: selected ? t.color.surface1 : 'transparent',
          // The content stays put when the border thickens.
          padding: 16 - (border - 1),
        },
        style,
      ]}>
      <Icon
        name={selected ? 'radiobox-marked' : 'radiobox-blank'}
        size={24}
        color={disabled ? 'textDisabled' : selected ? 'primary' : 'textTertiary'}
      />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <AppText variant="bodyL" weight="semibold" color={disabled ? 'textDisabled' : 'text'}>
            {title}
          </AppText>
          {badge ? <Badge label={badge} tone="accent" /> : null}
        </View>
        {subtitle ? (
          <AppText variant="bodyS" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={styles.price}>
        <AppText variant="numM" color={disabled ? 'textDisabled' : 'text'} shrink={false} align="right">
          {price}
        </AppText>
        {period ? (
          <AppText variant="bodyS" color="textSecondary" align="right">
            {period}
          </AppText>
        ) : null}
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden' },
  text: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 },
  price: { alignItems: 'flex-end', maxWidth: '45%' },
});
