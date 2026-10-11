import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ModalSheetContent, SheetOption } from '../ui/components/Sheet';
import { resolveRequest } from './results';
import type { RootScreenProps } from './types';

/** More rows than this scroll in a sheet with half and full detents. */
export const SHEET_SCROLL_AFTER = 6;

/**
 * The ModalSheet route: a native formSheet fitting its content (never a flex: 1 root, which
 * fitToContents would measure as nothing). The choice goes back through results.ts; leaving the
 * sheet any other way answers null.
 */
export function ModalSheetScreen({ route, navigation }: RootScreenProps<'ModalSheet'>) {
  const { requestId, title, message, options } = route.params;

  // Back, a swipe down or a tap outside: no choice.
  useEffect(() => navigation.addListener('beforeRemove', () => resolveRequest(requestId, null)), [navigation, requestId]);

  const rows = options.map((option, i) => (
    <SheetOption
      key={option.id}
      label={option.label}
      description={option.description}
      icon={option.icon}
      selected={option.selected === undefined && options.some((o) => o.selected !== undefined) ? false : option.selected}
      destructive={option.destructive}
      disabled={option.disabled}
      locked={option.locked}
      isFirst={i === 0}
      isLast={i === options.length - 1}
      testID={`sheet-option-${option.id}`}
      onPress={() => {
        resolveRequest(requestId, option.id);
        navigation.goBack();
      }}
    />
  ));

  // Long lists use fixed detents (half and full): only then may the content fill the sheet.
  const scroll = options.length > SHEET_SCROLL_AFTER;
  return (
    <ModalSheetContent title={title} message={message} style={scroll ? styles.fill : undefined}>
      {scroll ? <ScrollView style={styles.fill}>{rows}</ScrollView> : <View>{rows}</View>}
    </ModalSheetContent>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
