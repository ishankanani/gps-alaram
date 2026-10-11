import { useEffect, useState, type Ref } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  TextInput,
  View,
  type ReturnKeyTypeOptions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useI18n } from '../../i18n';
import { useTheme } from '../theme';
import { textStyle } from '../typography';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';

export type TextFieldKind = 'text' | 'name' | 'email' | 'password' | 'newPassword' | 'oneTimeCode';
export type TextFieldVariant = 'default' | 'multiline' | 'decimal' | 'number' | 'code';

export type TextFieldProps = {
  /** Always visible above the field. No floating labels. */
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Helper line under the field (bodyS textTertiary). */
  helper?: string;
  /** Error line in danger; announced to screen readers. */
  error?: string | null;
  /** A 20 dp leading icon. */
  icon?: IconName;
  kind?: TextFieldKind;
  variant?: TextFieldVariant;
  /** With multiline: shows the "84/140" counter. */
  maxLength?: number;
  /** A unit after the value ("CHF"). */
  unit?: string;
  /** A clear button while there is text. */
  clearable?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Read-only fields: a copy button. */
  onCopy?: () => void;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  inputRef?: Ref<TextInput>;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const AUTOFILL: Record<TextFieldKind, Pick<TextInputProps, 'textContentType' | 'autoComplete' | 'keyboardType' | 'autoCapitalize'>> = {
  text: {},
  name: { textContentType: 'name', autoComplete: 'name', autoCapitalize: 'words' },
  email: { textContentType: 'emailAddress', autoComplete: 'email', keyboardType: 'email-address', autoCapitalize: 'none' },
  password: { textContentType: 'password', autoComplete: 'current-password', autoCapitalize: 'none' },
  newPassword: { textContentType: 'newPassword', autoComplete: 'new-password', autoCapitalize: 'none' },
  oneTimeCode: { textContentType: 'oneTimeCode', autoComplete: 'one-time-code', autoCapitalize: 'characters' },
};

/**
 * TextField (3.8). Validate on blur and on submit, not on every keystroke, and clear the error as
 * soon as the user edits (the caller owns both).
 */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  helper,
  error,
  icon,
  kind = 'text',
  variant = 'default',
  maxLength,
  unit,
  clearable,
  disabled,
  readOnly,
  onCopy,
  returnKeyType,
  onSubmitEditing,
  onFocus,
  onBlur,
  autoFocus,
  autoCapitalize,
  inputRef,
  testID,
  style,
}: TextFieldProps) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const secure = (kind === 'password' || kind === 'newPassword') && !revealed;
  const multiline = variant === 'multiline';
  const numeric = variant === 'decimal' || variant === 'number' || variant === 'code';
  const strong = focused || !!error;
  const borderWidth = strong ? 2 : 1;
  const inputStyle = textStyle('bodyL', { lang, os: Platform.OS, tabular: numeric });

  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  return (
    <View style={[styles.wrap, style]}>
      {label ? (
        <AppText variant="labelM" color="textSecondary">
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          {
            minHeight: multiline ? 104 : 52,
            borderRadius: t.radius.md,
            borderWidth,
            borderColor: error ? t.color.danger : focused ? t.color.focus : readOnly ? t.color.border : t.color.fieldBorder,
            backgroundColor: readOnly ? 'transparent' : focused ? t.color.surface1 : t.color.fill,
            // Keep the text still when the border thickens.
            paddingLeft: (icon ? 12 : 16) - (borderWidth - 1),
            paddingRight: 4 - (borderWidth - 1),
            alignItems: multiline ? 'flex-start' : 'center',
          },
        ]}>
        {icon ? <Icon name={icon} size={20} color="textSecondary" style={multiline ? styles.iconTop : null} /> : null}
        <TextInput
          ref={inputRef}
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.color.textSecondary}
          editable={!disabled && !readOnly}
          secureTextEntry={secure}
          multiline={multiline}
          numberOfLines={multiline ? 5 : 1}
          maxLength={maxLength}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          autoFocus={autoFocus}
          autoCorrect={kind === 'text' && variant === 'default' ? undefined : false}
          accessibilityLabel={label ?? placeholder}
          accessibilityHint={error ?? helper}
          accessibilityState={{ disabled: !!disabled }}
          selectionColor={t.color.primary}
          cursorColor={t.color.primary}
          keyboardAppearance={t.dark ? 'dark' : 'light'}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          {...AUTOFILL[kind]}
          {...(variant === 'decimal' ? { keyboardType: 'decimal-pad' as const } : null)}
          {...(variant === 'number' ? { keyboardType: 'number-pad' as const } : null)}
          {...(variant === 'code' ? { autoCapitalize: 'characters' as const } : null)}
          {...(autoCapitalize ? { autoCapitalize } : null)}
          style={[
            inputStyle,
            styles.input,
            {
              color: disabled ? t.color.textDisabled : t.color.text,
              marginLeft: icon ? 8 : 0,
              letterSpacing: variant === 'code' ? 1 : inputStyle.letterSpacing,
              maxHeight: multiline ? inputStyle.lineHeight * 5 + 24 : undefined,
              textAlignVertical: multiline ? 'top' : 'center',
            },
          ]}
        />
        {clearable && value && !disabled && !readOnly ? (
          <IconButton icon="close-circle" accessibilityLabel={tr('ui.clear')} color="textSecondary" onPress={() => onChangeText('')} />
        ) : null}
        {kind === 'password' || kind === 'newPassword' ? (
          <IconButton
            icon={revealed ? 'eye-off-outline' : 'eye-outline'}
            accessibilityLabel={tr(revealed ? 'ui.hidePassword' : 'ui.showPassword')}
            color="textSecondary"
            onPress={() => setRevealed(!revealed)}
          />
        ) : null}
        {unit ? (
          <AppText variant="bodyM" color="textSecondary" style={styles.unit}>
            {unit}
          </AppText>
        ) : null}
        {readOnly && onCopy ? (
          <IconButton icon="content-copy" accessibilityLabel={tr('ui.copy')} color="textSecondary" onPress={onCopy} />
        ) : null}
        {!clearable && !unit && !onCopy && kind !== 'password' && kind !== 'newPassword' ? <View style={styles.endPad} /> : null}
      </View>
      {error || helper || (multiline && maxLength) ? (
        <View style={styles.below}>
          {error ? (
            <View style={styles.errorRow}>
              <Icon name="alert-circle-outline" size={16} color="danger" />
              <AppText variant="bodyS" color="danger" style={styles.flex}>
                {error}
              </AppText>
            </View>
          ) : helper ? (
            <AppText variant="bodyS" color="textTertiary" style={styles.flex}>
              {helper}
            </AppText>
          ) : (
            <View style={styles.flex} />
          )}
          {multiline && maxLength ? (
            <AppText variant="bodyS" color="textTertiary" tabular>
              {`${value.length}/${maxLength}`}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: { flexDirection: 'row' },
  iconTop: { marginTop: 14 },
  input: { flex: 1, paddingVertical: 14, includeFontPadding: false },
  unit: { paddingHorizontal: 12 },
  endPad: { width: 12 },
  below: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errorRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  flex: { flex: 1 },
});
