import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../../i18n';
import { resolveRequest } from '../../navigation/results';
import type { RootScreenProps } from '../../navigation/types';
import { Button, ListItem, Screen, SearchField, StickyFooter } from '../../ui';
import { COUNTRIES, flagEmoji, searchCountries } from './lib/countries';

/**
 * Route `CountryPicker` (ui-direction-a 4.1): every country with its own search. Single choice
 * answers on tap; multiple choice (announcement countries) answers with Done. It answers
 * `route.params.requestId` through resolveRequest() with ISO codes (an empty list means "any"), or
 * null when closed.
 */
export function CountryPickerScreen({ navigation, route }: RootScreenProps<'CountryPicker'>) {
  const { t } = useI18n();
  const { requestId, multiple, title } = route.params;
  const [selected, setSelected] = useState<string[]>(route.params.selected ?? []);
  const [query, setQuery] = useState('');

  useEffect(() => navigation.addListener('beforeRemove', () => resolveRequest<string[]>(requestId, null)), [navigation, requestId]);

  // The chosen countries first (multiple choice), then everything A–Z.
  const rows = useMemo(() => {
    const found = searchCountries(query);
    if (!multiple || query.trim()) return found;
    const chosen = COUNTRIES.filter((c) => selected.includes(c.code));
    return [...chosen, ...found.filter((c) => !selected.includes(c.code))];
  }, [query, multiple, selected]);

  const answer = (codes: string[]) => {
    resolveRequest<string[]>(requestId, codes);
    navigation.goBack();
  };

  const toggle = (code: string) => {
    if (!multiple) {
      answer([code]);
      return;
    }
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));
  };

  return (
    <Screen
      topBar={{ title: title ?? t('admin.country.title'), leading: 'close' }}
      scroll={false}
      keyboard
      footer={
        multiple ? (
          <StickyFooter>
            <View style={styles.footer}>
              <Button label={t('admin.common.clear')} variant="ghost" size="L" onPress={() => setSelected([])} disabled={selected.length === 0} />
              <Button
                label={selected.length ? t('admin.country.doneCount', { count: selected.length }) : t('admin.country.doneAny')}
                variant="primary"
                size="L"
                onPress={() => answer(selected)}
                style={styles.flex}
                testID="country-picker-done"
              />
            </View>
          </StickyFooter>
        ) : undefined
      }
      testID="screen-CountryPicker">
      <View style={styles.search}>
        <SearchField variant="inline" value={query} onChangeText={setQuery} placeholder={t('admin.country.search')} testID="country-picker-search" />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(c) => c.code}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          !multiple && !query.trim() ? (
            <ListItem
              grouped
              isFirst
              isLast
              dense
              icon="earth"
              title={t('admin.country.any')}
              selected={selected.length === 0}
              onPress={() => answer([])}
              style={styles.anyRow}
            />
          ) : null
        }
        renderItem={({ item, index }) => (
          <ListItem
            grouped
            dense
            isFirst={index === 0}
            isLast={index === rows.length - 1}
            leading={
              <Text style={styles.flag} allowFontScaling={false}>
                {flagEmoji(item.code)}
              </Text>
            }
            leadingWidth={28}
            title={item.name}
            value={item.code}
            selected={selected.includes(item.code)}
            selection={multiple ? 'check' : 'radio'}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            onPress={() => toggle(item.code)}
            testID={`country-${item.code}`}
          />
        )}
        ListEmptyComponent={<ListItem title={t('admin.country.none')} disabled />}
        contentContainerStyle={styles.content}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  flag: { fontSize: 22, width: 28, textAlign: 'center' },
  anyRow: { marginBottom: 16 },
  content: { paddingBottom: 32 },
  footer: { flexDirection: 'row', gap: 8 },
});
