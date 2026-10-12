import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { toAdminError, type AdminRequestError } from '../../../api/admin';
import { useI18n } from '../../../i18n';
import {
  AppText,
  Banner,
  Button,
  Card,
  Chip,
  ChipWrap,
  Dialog,
  EmptyState,
  Icon,
  IconButton,
  KeyValueRow,
  SkeletonRow,
  TextField,
  Touchable,
  useTheme,
  BADGE_TONES,
  type BadgeTone,
  type IconName,
} from '../../../ui';
import { flagEmoji } from '../lib/countries';
import type { Preview } from '../lib/plan';
import { errorText, useCopy } from './actions';

/** A failed first load: what failed, the server's words, and Retry (404: "no longer exists"). */
export function ErrorState({
  error,
  title,
  onRetry,
  onBack,
}: {
  error: AdminRequestError | unknown;
  title: string;
  onRetry: () => void;
  onBack?: () => void;
}) {
  const { t } = useI18n();
  const err = toAdminError(error);
  if (err.code === 'not_found') {
    return (
      <EmptyState
        icon="account-question-outline"
        title={t('admin.error.goneTitle')}
        body={t('admin.error.goneBody')}
        action={onBack ? { label: t('admin.error.back'), onPress: onBack } : undefined}
      />
    );
  }
  const offline = err.code === 'network' || err.code === 'timeout';
  return (
    <EmptyState
      icon={offline ? 'wifi-off' : 'cloud-alert-outline'}
      title={offline ? t('admin.error.offlineTitle') : title}
      body={errorText(err, t)}
      action={{ label: t('admin.common.retry'), onPress: onRetry, icon: 'refresh' }}
    />
  );
}

/** Rows of skeletons inside a section-like container while a list loads. */
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  const t = useTheme();
  return (
    <View style={[styles.skeletonBox, { backgroundColor: t.color.surface1, borderRadius: t.radius.lg }]}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

const QUICK_REASONS = [
  'admin.common.reason.beta',
  'admin.common.reason.support',
  'admin.common.reason.press',
  'admin.common.reason.partner',
] as const;

/** The one-line reason with a /500 counter and quick chips (ui-critiques "Give Pro"). */
export function ReasonField({
  value,
  onChange,
  error,
  quick = true,
  disabled,
}: {
  value: string;
  onChange: (text: string) => void;
  error?: string | null;
  quick?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.reason}>
      <TextField
        label={t('admin.common.reasonLabel')}
        value={value}
        onChangeText={(text) => onChange(text.replace(/[\r\n]+/g, ' '))}
        placeholder={t('admin.common.reasonPlaceholder')}
        helper={`${t('admin.common.reasonHelper')} ${t('admin.common.reasonCount', { count: [...value].length })}`}
        error={error}
        maxLength={500}
        disabled={disabled}
        returnKeyType="done"
        testID="admin-reason"
      />
      {quick ? (
        <ChipWrap>
          {QUICK_REASONS.map((key) => (
            <Chip key={key} variant="assist" label={t(key)} onPress={() => onChange(t(key))} disabled={disabled} />
          ))}
        </ChipWrap>
      ) : null}
    </View>
  );
}

/** The SW- ID pill with copy (Account uses the same idea). */
export function IdChip({ id, style }: { id: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const copy = useCopy();
  return (
    <Touchable
      onPress={() => copy(id, id)}
      accessibilityRole="button"
      accessibilityLabel={`${id}, ${tr('admin.common.copy')}`}
      hitSlop={{ top: 6, bottom: 6 }}
      style={[styles.idChip, { backgroundColor: t.color.fill, borderRadius: t.radius.sm }, style]}>
      <AppText variant="labelM" tabular>
        {id}
      </AppText>
      <Icon name="content-copy" size={16} color="textSecondary" />
    </Touchable>
  );
}

/** A 40 dp circle with a country's flag, or a short code ("EU", "🌐"). */
export function FlagBox({ country, size = 40 }: { country: string | null; size?: 24 | 32 | 40 }) {
  const t = useTheme();
  const flag = flagEmoji(country);
  return (
    <View style={[styles.flag, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.color.fill }]}>
      {flag ? (
        <Text style={{ fontSize: size * 0.5 }} allowFontScaling={false}>
          {flag}
        </Text>
      ) : country === 'DEFAULT' || !country ? (
        <Icon name="earth" size={size >= 40 ? 20 : 16} color="textSecondary" />
      ) : (
        <AppText variant="labelS" color="textSecondary">
          {country}
        </AppText>
      )}
    </View>
  );
}

/** A 32 dp soft-tone circle with an icon (audit rows, store events). */
export function ToneCircle({ icon, tone, size = 32 }: { icon: IconName; tone: BadgeTone; size?: 32 | 40 }) {
  const t = useTheme();
  const c = BADGE_TONES[tone];
  return (
    <View style={[styles.flag, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.color[c.bg] }]}>
      <Icon name={icon} size={size === 32 ? 18 : 20} color={c.strong} />
    </View>
  );
}

/** The footer of a paged list: spinner, Load more ("50 of 200"), the end, or Retry. */
export function ListFooter({
  loadingMore,
  hasMore,
  error,
  count,
  total,
  onMore,
  auto,
}: {
  loadingMore: boolean;
  hasMore: boolean;
  error: AdminRequestError | null;
  count: number;
  total?: number | null;
  onMore: () => void;
  /** Infinite scroll: no button, the list loads on reaching the end. */
  auto?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useI18n();
  if (count === 0) return null;
  let body: ReactNode;
  if (loadingMore) body = <ActivityIndicator color={t.color.primary} accessibilityLabel={tr('admin.common.loadingMore')} />;
  else if (error) {
    body = (
      <View style={styles.footerRow}>
        <AppText variant="bodyS" color="textSecondary">
          {tr('admin.common.moreFailed')}
        </AppText>
        <Button label={tr('admin.common.retry')} variant="ghost" size="S" onPress={onMore} />
      </View>
    );
  } else if (hasMore && !auto) {
    body = (
      <View style={styles.footerCol}>
        {total != null ? (
          <AppText variant="bodyS" color="textTertiary" tabular>
            {tr('admin.common.shownOf', { shown: count, total })}
          </AppText>
        ) : null}
        <Button label={tr('admin.common.loadMore')} variant="secondary" size="M" onPress={onMore} testID="admin-load-more" />
      </View>
    );
  } else if (!hasMore) {
    body = (
      <AppText variant="bodyS" color="textTertiary" align="center">
        {tr('admin.common.everyone')}
      </AppText>
    );
  }
  return <View style={styles.footer}>{body}</View>;
}

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** JSON or other raw text in a monospace block that scrolls sideways, with Copy. */
export function CodeBlock({ text, label }: { text: string; label: string }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const copy = useCopy();
  return (
    <View style={[styles.code, { backgroundColor: t.color.surface1, borderRadius: t.radius.lg }]}>
      <View style={styles.codeHeader}>
        <AppText variant="labelM" color="textSecondary" style={styles.flex}>
          {label}
        </AppText>
        <IconButton icon="content-copy" accessibilityLabel={`${tr('admin.common.copy')}: ${label}`} onPress={() => copy(text, label)} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.codeScroll}>
        <Text selectable style={[styles.codeText, { color: t.color.text, fontFamily: MONO }]}>
          {text}
        </Text>
      </ScrollView>
    </View>
  );
}

/** "Plan now → After" (ui-critiques: every plan action shows what it will do). */
export function PreviewCard({ preview, extra }: { preview: Preview; extra?: string | null }) {
  const { t } = useI18n();
  return (
    <Card title={t('admin.preview.title')} testID="admin-preview">
      <View style={styles.previewRows}>
        <View style={styles.previewRow}>
          <AppText variant="labelS" color="textSecondary">
            {t('admin.preview.now')}
          </AppText>
          <AppText variant="bodyM">{preview.before}</AppText>
        </View>
        <Icon name="arrow-down" size={16} color="textTertiary" />
        <View style={styles.previewRow}>
          <AppText variant="labelS" color="textSecondary">
            {t('admin.preview.after')}
          </AppText>
          <AppText variant="bodyL" weight="semibold" color={preview.unchanged ? 'textSecondary' : 'text'}>
            {preview.after}
          </AppText>
        </View>
        {extra ? (
          <AppText variant="bodyS" color="textSecondary">
            {extra}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

/** An inline failure under a form: the form stays as it was. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Banner tone="danger" body={message} style={styles.formError} />;
}

/** A dialog with one text field (audit filters by admin or user). */
export function PromptDialog({
  visible,
  title,
  message,
  label,
  placeholder,
  initial,
  confirmLabel,
  onSubmit,
  onCancel,
  validate,
}: {
  visible: boolean;
  title: string;
  message?: string;
  label: string;
  placeholder?: string;
  initial: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  validate?: (value: string) => string | null;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setValue(initial);
      setError(null);
    }
  }
  const submit = () => {
    const problem = validate?.(value.trim()) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    onSubmit(value.trim());
  };
  return (
    <Dialog
      visible={visible}
      onDismiss={onCancel}
      title={title}
      message={message}
      actions={
        <>
          <Button label={t('admin.common.cancel')} variant="ghost" size="M" onPress={onCancel} />
          <Button label={confirmLabel} variant="primary" size="M" onPress={submit} />
        </>
      }>
      <TextField
        label={label}
        value={value}
        onChangeText={(text) => {
          setValue(text);
          setError(null);
        }}
        placeholder={placeholder}
        error={error}
        autoCapitalize="characters"
        autoFocus
        clearable
        returnKeyType="done"
        onSubmitEditing={submit}
      />
    </Dialog>
  );
}

/** A Card of KeyValueRows with dividers between them. */
export function KeyValueCard({
  title,
  rows,
  footer,
}: {
  title?: string;
  rows: { label: string; value: string; numeric?: boolean; onCopy?: () => void; hidden?: boolean }[];
  footer?: ReactNode;
}) {
  const t = useTheme();
  const shown = rows.filter((r) => !r.hidden);
  return (
    <View>
      {title ? (
        <AppText variant="labelM" color="textSecondary" accessibilityRole="header" style={styles.kvTitle}>
          {title}
        </AppText>
      ) : null}
      <View style={[styles.kv, { backgroundColor: t.color.surface1, borderRadius: t.radius.lg }]}>
        {shown.map((r, i) => (
          <KeyValueRow key={`${r.label}-${i}`} label={r.label} value={r.value} numeric={r.numeric} onCopy={r.onCopy} last={i === shown.length - 1} />
        ))}
        {footer}
      </View>
    </View>
  );
}

/** A small caption line under a section (bodyS tertiary, aligned with the rows). */
export function Footnote({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <AppText variant="bodyS" color="textTertiary" style={[styles.footnote, style]}>
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  skeletonBox: { marginHorizontal: 16, marginTop: 8, overflow: 'hidden' },
  reason: { gap: 12 },
  idChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 32, paddingHorizontal: 10 },
  flag: { alignItems: 'center', justifyContent: 'center' },
  footer: { paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center', minHeight: 72, justifyContent: 'center' },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerCol: { alignItems: 'center', gap: 8 },
  code: { marginHorizontal: 16, overflow: 'hidden' },
  codeHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4, minHeight: 48 },
  codeScroll: { paddingHorizontal: 16, paddingBottom: 16 },
  codeText: { fontSize: 12, lineHeight: 18 },
  previewRows: { gap: 6 },
  previewRow: { gap: 2 },
  formError: { marginHorizontal: 16, marginTop: 16 },
  kvTitle: { paddingTop: 24, paddingBottom: 8, paddingLeft: 32, paddingRight: 16 },
  kv: { marginHorizontal: 16, overflow: 'hidden' },
  footnote: { paddingTop: 8, paddingHorizontal: 32 },
});
