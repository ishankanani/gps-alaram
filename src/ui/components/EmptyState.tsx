import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

type Action = { label: string; onPress: () => void; icon?: IconName };

type Props = {
  icon: IconName;
  /** What is missing. */
  title: string;
  /** How to fill it. */
  body?: string;
  /** The button that does it. */
  action?: Action;
  /** A second, ghost action (full variant only). */
  secondaryAction?: Action;
  /** full: centred on a screen; inline: inside a section or a sheet. */
  variant?: 'full' | 'inline';
  style?: StyleProp<ViewStyle>;
};

/** EmptyState (3.20): the title says what is missing, the body how to fill it, the button does it. */
export function EmptyState({ icon, title, body, action, secondaryAction, variant = 'full', style }: Props) {
  const t = useTheme();
  const full = variant === 'full';
  const circle = full ? 72 : 48;
  return (
    <View style={[full ? styles.full : styles.inline, style]}>
      <View style={[styles.circle, { width: circle, height: circle, borderRadius: circle / 2, backgroundColor: t.color.fill }]}>
        <Icon name={icon} size={full ? 32 : 24} color="textSecondary" />
      </View>
      <View style={[styles.text, full ? styles.textFull : null]}>
        <AppText
          variant={full ? 'titleS' : 'bodyL'}
          weight={full ? undefined : 'medium'}
          align={full ? 'center' : undefined}
          accessibilityRole={full ? 'header' : undefined}>
          {title}
        </AppText>
        {body ? (
          <AppText variant="bodyM" color="textSecondary" align={full ? 'center' : undefined} numberOfLines={full ? 3 : undefined}>
            {body}
          </AppText>
        ) : null}
      </View>
      {action || secondaryAction ? (
        <View style={full ? styles.actionsFull : styles.actionsInline}>
          {action ? (
            <Button
              label={action.label}
              icon={action.icon}
              onPress={action.onPress}
              size={full ? 'M' : 'S'}
              variant={full ? 'primary' : 'secondary'}
            />
          ) : null}
          {full && secondaryAction ? (
            <Button label={secondaryAction.label} icon={secondaryAction.icon} onPress={secondaryAction.onPress} size="M" variant="ghost" />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  full: { alignSelf: 'center', alignItems: 'center', maxWidth: 320, width: '100%', paddingVertical: 48, paddingHorizontal: 16 },
  inline: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, padding: 16 },
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { gap: 4, flex: 1, minWidth: 160 },
  textFull: { flex: 0, marginTop: 16, alignItems: 'center', minWidth: 0 },
  actionsFull: { marginTop: 20, gap: 8, alignItems: 'center' },
  actionsInline: { width: '100%', paddingLeft: 64 },
});
