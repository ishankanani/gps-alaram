import { Switch, View } from 'react-native';

import { useTheme } from '../theme';
import type { IconName } from './Icon';
import { ListItem, type ListItemProps } from './ListItem';
import { PlanBadge } from './PlanBadge';

type Props = Pick<ListItemProps, 'subtitle' | 'icon' | 'iconColor' | 'leading' | 'disabled' | 'dense' | 'isFirst' | 'isLast' | 'grouped' | 'testID'> & {
  title: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Pro-only: shows a PRO badge instead of the switch; tapping calls onLockedPress (the Paywall). */
  locked?: boolean;
  onLockedPress?: () => void;
  icon?: IconName;
};

/** A row with a switch (3.15): the whole row toggles and reads as one switch. */
export function SwitchRow({ title, value, onValueChange, locked, onLockedPress, disabled, ...rest }: Props) {
  const t = useTheme();
  if (locked) {
    return (
      <ListItem
        {...rest}
        title={title}
        disabled={disabled}
        onPress={onLockedPress}
        trailing={<PlanBadge variant="pro" size="sm" />}
        accessibilityRole="button"
      />
    );
  }
  return (
    <ListItem
      {...rest}
      title={title}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      trailing={
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Switch
            value={value}
            onValueChange={onValueChange}
            disabled={disabled}
            trackColor={{ false: t.color.fieldBorder, true: t.color.primary }}
            thumbColor={t.color.switchThumb}
            ios_backgroundColor={t.color.fieldBorder}
          />
        </View>
      }
    />
  );
}
