import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { useI18n } from '../../i18n';
import { haptics } from '../haptics';
import { AppText } from './AppText';
import type { BadgeTone } from './Badge';
import { Button } from './Button';
import { Dialog } from './Dialog';
import type { IconName } from './Icon';
import { TextField } from './TextField';

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
