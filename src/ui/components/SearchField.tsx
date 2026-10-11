import { useEffect, type Ref } from 'react';
import { Platform, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '../../i18n';
import { useTheme } from '../theme';
import { textStyle } from '../typography';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Touchable } from './Touchable';

type Common = {
  placeholder: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

type SheetProps = Common & {
  variant: 'sheet';
  /** Browse mode: false, the field is a button that opens search mode. Search mode: true. */
  active: boolean;
  /** Browse mode: switch the sheet to search mode. */
  onActivate?: () => void;
  /** Search mode: the back arrow that replaces the magnifier. */
  onBack?: () => void;
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
  inputRef?: Ref<TextInput>;
};

type InlineProps = Common & {
  variant: 'inline';
  value: string;
  onChangeText: (text: string) => void;
  /** Called 250 ms after the last keystroke (and at once when cleared). */
  onSearch?: (query: string) => void;
  inputRef?: Ref<TextInput>;
};

export type SearchFieldProps = SheetProps | InlineProps;

/** SearchField (3.9): the MapSheet's search row, or the inline search pinned under a TopBar. */
export function SearchField(props: SearchFieldProps) {
  return props.variant === 'sheet' ? <SheetSearch {...props} /> : <InlineSearch {...props} />;
}

function SheetSearch({ active, onActivate, onBack, value = '', onChangeText, onSubmitEditing, autoFocus, inputRef, placeholder, testID, style }: SheetProps) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const box = [styles.field, { minHeight: 48, borderRadius: t.radius.md, backgroundColor: t.color.fill }, style];
  if (!active) {
    return (
      <Touchable
        testID={testID}
        onPress={onActivate}
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        style={[box, styles.button]}>
        <Icon name="magnify" size={22} color="textSecondary" />
        <AppText variant="bodyL" color="textSecondary" numberOfLines={1} style={styles.flex}>
          {placeholder}
        </AppText>
      </Touchable>
    );
  }
  return (
    <View style={[box, styles.activeField]}>
      <IconButton icon="arrow-left" accessibilityLabel={tr('common.back')} onPress={onBack} />
      <TextInput
        ref={inputRef}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={t.color.textSecondary}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={placeholder}
        selectionColor={t.color.primary}
        cursorColor={t.color.primary}
        keyboardAppearance={t.dark ? 'dark' : 'light'}
        style={[textStyle('bodyL', { lang, os: Platform.OS }), styles.input, { color: t.color.text }]}
      />
      {value ? (
        <IconButton icon="close-circle" accessibilityLabel={tr('ui.clear')} color="textSecondary" onPress={() => onChangeText?.('')} />
      ) : null}
    </View>
  );
}

function InlineSearch({ value, onChangeText, onSearch, inputRef, placeholder, testID, style }: InlineProps) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();

  useEffect(() => {
    if (!onSearch) return;
    const timer = setTimeout(() => onSearch(value), value ? 250 : 0);
    return () => clearTimeout(timer);
  }, [value, onSearch]);

  return (
    <View style={[styles.field, styles.inline, { minHeight: 44, borderRadius: t.radius.md, backgroundColor: t.color.fill }, style]}>
      <Icon name="magnify" size={20} color="textSecondary" />
      <TextInput
        ref={inputRef}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.color.textSecondary}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={placeholder}
        selectionColor={t.color.primary}
        cursorColor={t.color.primary}
        keyboardAppearance={t.dark ? 'dark' : 'light'}
        style={[textStyle('bodyM', { lang, os: Platform.OS }), styles.input, { color: t.color.text }]}
      />
      {value ? (
        <IconButton icon="close-circle" accessibilityLabel={tr('ui.clear')} color="textSecondary" onPress={() => onChangeText('')} />
      ) : (
        <View style={styles.endPad} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center' },
  button: { paddingHorizontal: 12, gap: 8, overflow: 'hidden' },
  activeField: { paddingRight: 0 },
  inline: { paddingLeft: 12, gap: 8 },
  input: { flex: 1, paddingVertical: 10, includeFontPadding: false },
  flex: { flex: 1 },
  endPad: { width: 8 },
});
