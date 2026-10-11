import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useI18n } from '../../i18n';
import { haptics } from '../haptics';
import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';
import { AppText } from './AppText';
import { BADGE_TONES, type BadgeTone } from './Badge';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { useOverlayOpen } from './overlay';
import { TextField } from './TextField';

type DialogProps = {
  visible: boolean;
  /** Scrim tap and Android back: cancel. Ignored while `busy`. */
  onDismiss: () => void;
  title: string;
  message?: string;
  /** A 24 dp icon in a 48 dp circle in the tone's soft colour. */
  icon?: IconName;
  tone?: BadgeTone;
  /** Extra content: a field, a key-value summary. */
  children?: ReactNode;
  /** Buttons M, right-aligned; Cancel first, the confirm button last (it wraps on top). */
  actions?: ReactNode;
  busy?: boolean;
  testID?: string;
};

/**
 * Dialog (3.18) on an RN Modal with our own animation: the scrim fades in over 200 ms and the card
 * comes from opacity 0 and scale 0.96. With a field focused, the card moves up to stay 16 dp above
 * the keyboard.
 */
export function Dialog({ visible, onDismiss, title, message, icon, tone = 'primary', children, actions, busy, testID }: DialogProps) {
  const t = useTheme();
  const window = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [fade] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(0));
  const [cardHeight, setCardHeight] = useState(0);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const { duration: d, easing } = t.motion;
  useOverlayOpen(mounted);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    const anim = Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: visible ? d.base : d.exit,
      easing: visible ? easing.enter : easing.exit,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => anim.stop();
  }, [visible, mounted, fade, d.base, d.exit, easing.enter, easing.exit]);

  useEffect(() => {
    if (!mounted) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setKeyboardTop(e.endCoordinates.screenY),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardTop(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [mounted]);

  useEffect(() => {
    const cardBottom = (window.height + cardHeight) / 2;
    const shift = keyboardTop == null ? 0 : Math.max(0, cardBottom - (keyboardTop - 16));
    const anim = Animated.timing(lift, { toValue: -shift, duration: d.base, easing: easing.standard, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [keyboardTop, cardHeight, window.height, lift, d.base, easing.standard]);

  if (!mounted) return null;
  const toneColors = BADGE_TONES[tone];
  const width = Math.min(window.width - 48, 400);
  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={() => {
        if (!busy) onDismiss();
      }}>
      <View style={styles.root} testID={testID}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.color.scrim, opacity: fade }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!busy) onDismiss();
            }}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Animated.View>
        <Animated.View
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              width,
              backgroundColor: t.color.surface3,
              borderRadius: t.radius.xl,
              opacity: fade,
              transform: [
                { translateY: lift },
                { scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
            t.elevation(3),
          ]}>
          {icon ? (
            <View style={[styles.iconCircle, { backgroundColor: t.color[toneColors.bg] }]}>
              <Icon name={icon} size={24} color={toneColors.strong} />
            </View>
          ) : null}
          <AppText variant="titleM">{title}</AppText>
          {message ? (
            <AppText variant="bodyM" color="textSecondary">
              {message}
            </AppText>
          ) : null}
          {children}
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

export type ConfirmValues = { reason?: string; password?: string };

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  icon?: IconName;
  /** Type-to-confirm: the confirm button stays disabled until this text is typed. */
  requireText?: string;
  /** A one-line reason for the audit log, at least 3 characters. */
  reasonRequired?: boolean;
  reasonLabel?: string;
  /** A secure "Your password" field. */
  requirePassword?: boolean;
  /** While it runs, the confirm button spins and the dialog stays open; a thrown error shows inline. */
  onConfirm: (values: ConfirmValues) => void | Promise<void>;
  onCancel: () => void;
  testID?: string;
};

/** ConfirmDialog (3.18): replaces every Alert.alert. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  icon,
  requireText,
  reasonRequired,
  reasonLabel,
  requirePassword,
  onConfirm,
  onCancel,
  testID,
}: ConfirmDialogProps) {
  const { t: tr } = useI18n();
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);

  // A fresh form every time the dialog opens.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setTyped('');
      setReason('');
      setPassword('');
      setError(null);
      setBusy(false);
    }
  }

  const ready =
    (!requireText || typed.trim().toLocaleUpperCase() === requireText.trim().toLocaleUpperCase()) &&
    (!reasonRequired || reason.trim().length >= 3) &&
    (!requirePassword || password.length > 0);

  async function confirm() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ reason: reasonRequired ? reason.trim() : undefined, password: requirePassword ? password : undefined });
      setBusy(false);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error && e.message ? e.message : tr('ui.failed'));
      haptics.warning();
    }
  }

  return (
    <Dialog
      visible={visible}
      onDismiss={onCancel}
      busy={busy}
      title={title}
      message={message}
      icon={icon ?? (tone === 'danger' ? 'alert-outline' : undefined)}
      tone={tone === 'danger' ? 'danger' : 'primary'}
      testID={testID}
      actions={
        <>
          <Button label={cancelLabel ?? tr('ui.cancel')} variant="ghost" size="M" onPress={onCancel} disabled={busy} />
          <Button
            label={confirmLabel}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="M"
            onPress={() => void confirm()}
            loading={busy}
            disabled={!ready}
            testID={testID ? `${testID}-confirm` : undefined}
          />
        </>
      }>
      {reasonRequired ? (
        <TextField
          label={reasonLabel ?? tr('ui.reason')}
          value={reason}
          onChangeText={(text) => {
            setReason(text);
            setError(null);
          }}
          maxLength={500}
          helper={tr('ui.reasonShort')}
          returnKeyType="done"
        />
      ) : null}
      {requirePassword ? (
        <TextField
          label={tr('ui.password')}
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setError(null);
          }}
          kind="password"
          returnKeyType="done"
        />
      ) : null}
      {requireText ? (
        <TextField
          label={tr('ui.typeToConfirm', { text: requireText })}
          value={typed}
          onChangeText={(text) => {
            setTyped(text);
            setError(null);
          }}
          autoCapitalize="characters"
          returnKeyType="done"
        />
      ) : null}
      {error ? (
        <AppText variant="bodyS" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </Dialog>
  );
}

// ---- Imperative dialogs: confirm() and alert() from anywhere (providers, handlers) ----

export type ConfirmRequest = Omit<ConfirmDialogProps, 'visible' | 'onConfirm' | 'onCancel'> & {
  /** Optional async work; the dialog stays open and spins while it runs. */
  onConfirm?: (values: ConfirmValues) => void | Promise<void>;
};

export type AlertRequest = {
  title: string;
  message?: string;
  icon?: IconName;
  tone?: BadgeTone;
  /** Defaults to "Close". */
  buttonLabel?: string;
};

type Request =
  | { kind: 'confirm'; options: ConfirmRequest; resolve: (result: ConfirmValues | null) => void }
  | { kind: 'alert'; options: AlertRequest; resolve: () => void };

export type DialogsApi = {
  /** Resolves to the entered values when confirmed, or null when cancelled. */
  confirm: (options: ConfirmRequest) => Promise<ConfirmValues | null>;
  alert: (options: AlertRequest) => Promise<void>;
};

const DialogsContext = createContext<DialogsApi | null>(null);

/** Hosts the dialogs opened through useDialogs(); one at a time, in order. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const [visible, setVisible] = useState(true);
  const current = queue[0] ?? null;
  const closing = useRef(false);

  const api = useMemo<DialogsApi>(
    () => ({
      confirm: (options) => new Promise((resolve) => setQueue((q) => [...q, { kind: 'confirm', options, resolve }])),
      alert: (options) => new Promise((resolve) => setQueue((q) => [...q, { kind: 'alert', options, resolve }])),
    }),
    [],
  );

  const finish = useCallback((after: () => void) => {
    if (closing.current) return;
    closing.current = true;
    setVisible(false);
    // Let the exit animation play before the next dialog (or nothing) takes its place.
    setTimeout(() => {
      after();
      closing.current = false;
      setQueue((q) => q.slice(1));
      setVisible(true);
    }, 160);
  }, []);

  return (
    <DialogsContext.Provider value={api}>
      {children}
      {current?.kind === 'confirm' ? (
        <ConfirmDialog
          {...current.options}
          visible={visible}
          onCancel={() => finish(() => current.resolve(null))}
          onConfirm={async (values) => {
            await current.options.onConfirm?.(values);
            finish(() => current.resolve(values));
          }}
        />
      ) : current?.kind === 'alert' ? (
        <AlertDialog request={current.options} visible={visible} onClose={() => finish(current.resolve)} />
      ) : null}
    </DialogsContext.Provider>
  );
}

function AlertDialog({ request, visible, onClose }: { request: AlertRequest; visible: boolean; onClose: () => void }) {
  const { t: tr } = useI18n();
  return (
    <Dialog
      visible={visible}
      onDismiss={onClose}
      title={request.title}
      message={request.message}
      icon={request.icon}
      tone={request.tone}
      actions={<Button label={request.buttonLabel ?? tr('common.close')} variant="primary" size="M" onPress={onClose} />}
    />
  );
}

/** confirm() and alert() as promises, for code that cannot render a ConfirmDialog itself. */
export function useDialogs(): DialogsApi {
  const api = useContext(DialogsContext);
  if (!api) throw new Error('useDialogs() needs a DialogProvider');
  return api;
}

/** A soft-tone circle with an icon, for dialog-like content outside Dialog. */
export function ToneIcon({ icon, tone = 'primary', style }: { icon: IconName; tone?: BadgeTone; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const c = BADGE_TONES[tone];
  return (
    <View style={[styles.iconCircle, { backgroundColor: t.color[c.bg] }, style]}>
      <Icon name={icon} size={24} color={c.strong as ColorToken} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 24, gap: 16 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap-reverse', justifyContent: 'flex-end', gap: 8 },
});
