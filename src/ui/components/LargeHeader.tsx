import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';

/**
 * LargeHeader (3.24) for tab roots (Saved, Activity, Account): the title in titleL with trailing
 * actions beside it. Screen fades a compact TopBar in once the content has scrolled 40 dp.
 */
export function LargeHeader({ title, trailing, style }: { title: string; trailing?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.large, { paddingTop: insets.top + 12 }, style]}>
      <AppText variant="titleL" style={styles.title}>
        {title}
      </AppText>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  large: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  title: { flexShrink: 1, flexGrow: 1 },
  trailing: { flexDirection: 'row', alignItems: 'center' },
});
