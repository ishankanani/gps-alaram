import { useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type TextInput, type ViewStyle } from 'react-native';

import { useI18n, type Key } from '../../i18n';
import { dateFromParts, datePartOrder, partsFromDate, type DatePart } from '../dateParts';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { TextField } from './TextField';

type Props = {
  label?: string;
  value: Date | null;
  /** A date once all three parts form a real date, otherwise null. */
  onChange: (date: Date | null) => void;
  /** The preview line, e.g. "Thu, 31 Dec 2026 · in 82 days" (bodyS textSecondary). */
  helper?: string;
  /** A rule the caller checks ("Pick a date in the future."); shown in danger. */
  error?: string | null;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const WIDTH: Record<DatePart, number> = { day: 56, month: 56, year: 80 };
const MAX: Record<DatePart, number> = { day: 2, month: 2, year: 4 };
const LABEL: Record<DatePart, Key> = { day: 'ui.date.day', month: 'ui.date.month', year: 'ui.date.year' };

/**
 * DateField (3.29): three number fields for day, month and year in the language's order, widths
 * 56 / 56 / 80 with a gap of 8, and a preview line. Focus moves on once a part is complete.
 */
export function DateField({ label, value, onChange, helper, error, disabled, testID, style }: Props) {
  const { t: tr, lang } = useI18n();
  const [parts, setParts] = useState<Record<DatePart, string>>(() => partsFromDate(value));
  const [touched, setTouched] = useState(false);
  const time = value?.getTime() ?? null;
  const [lastTime, setLastTime] = useState(time);
  const refs = useRef<Partial<Record<DatePart, TextInput | null>>>({});
  const order = datePartOrder(lang);

  // The caller replaced the date (a preset chip): show it. Compared by time, so a new Date object
  // with the same day never resets what the user is typing.
  if (time !== lastTime) {
    setLastTime(time);
    const current = dateFromParts(parts.day, parts.month, parts.year);
    if (time !== (current?.getTime() ?? null)) setParts(partsFromDate(value));
  }

  function change(part: DatePart, text: string) {
    const digits = text.replace(/\D/g, '').slice(0, MAX[part]);
    const next = { ...parts, [part]: digits };
    setParts(next);
    const date = dateFromParts(next.day, next.month, next.year);
    setLastTime(date?.getTime() ?? null);
    onChange(date);
    const i = order.indexOf(part);
    if (digits.length === MAX[part] && i < order.length - 1) refs.current[order[i + 1]]?.focus();
  }

  const complete = !!parts.day && !!parts.month && parts.year.length === 4;
  const invalid = touched && (parts.day || parts.month || parts.year) && (!complete || !dateFromParts(parts.day, parts.month, parts.year));
  const shownError = error ?? (invalid ? tr('ui.date.invalid') : null);

  return (
    <View style={[styles.wrap, style]} testID={testID}>
      {label ? (
        <AppText variant="labelM" color="textSecondary">
          {label}
        </AppText>
      ) : null}
      <View style={styles.row}>
        {order.map((part, i) => (
          <TextField
            key={part}
            inputRef={(node) => {
              refs.current[part] = node;
            }}
            value={parts[part]}
            onChangeText={(text) => change(part, text)}
            placeholder={tr(LABEL[part])}
            variant="number"
            maxLength={MAX[part]}
            disabled={disabled}
            returnKeyType={i === order.length - 1 ? 'done' : 'next'}
            onSubmitEditing={() => refs.current[order[i + 1]]?.focus()}
            onBlur={() => setTouched(true)}
            testID={testID ? `${testID}-${part}` : undefined}
            style={{ width: WIDTH[part] }}
          />
        ))}
      </View>
      {shownError ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Icon name="alert-circle-outline" size={16} color="danger" />
          <AppText variant="bodyS" color="danger" style={styles.flex}>
            {shownError}
          </AppText>
        </View>
      ) : helper ? (
        <AppText variant="bodyS" color="textSecondary" tabular>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', gap: 8 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  flex: { flex: 1 },
});
