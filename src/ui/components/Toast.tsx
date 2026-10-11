import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { toastTiming } from '../tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { useAnyOverlayOpen } from './overlay';

export type ToastInput = {
  /** A toast with the same id replaces the one showing. */
  id?: string;
  message: string;
  icon?: IconName;
  /** "Undo", "Retry", "View". */
  action?: { label: string; onPress: () => void };
  /** An error that offers Retry: stays 10 s or until tapped. */
  error?: boolean;
  /** Overrides the timing (ms), before the accessibility recommendation stretches it. */
  duration?: number;
};

type Item = ToastInput & { key: number };

export type ToastApi = {
  show: (toast: ToastInput) => void;
  /** Hides the toast with this id, or the current one. */
  hide: (id?: string) => void;
};

type Registry = { set: (key: string, height: number) => void; remove: (key: string) => void };

type HostState = { current: Item | null; inset: number | null; done: (key: number) => void };

const ApiContext = createContext<ToastApi>({ show: () => {}, hide: () => {} });
const RegistryContext = createContext<Registry | null>(null);
const HostContext = createContext<HostState>({ current: null, inset: null, done: () => {} });

/**
 * Toasts (3.19): one at a time, queued; the host is mounted after the navigation (and again
 * inside modal screens on iOS). Mount once near the root.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Item[]>([]);
  const [insets, setInsets] = useState<{ key: string; height: number; order: number }[]>([]);
  const counter = useRef(0);
  const order = useRef(0);

  const show = useCallback((toast: ToastInput) => {
    counter.current += 1;
    const item: Item = { ...toast, key: counter.current };
    setQueue((q) => {
      if (toast.id) {
        const i = q.findIndex((x) => x.id === toast.id);
        if (i >= 0) return q.map((x, j) => (j === i ? item : x));
      }
      return [...q, item];
    });
  }, []);

  const hide = useCallback((id?: string) => {
    setQueue((q) => (id ? q.filter((x) => x.id !== id) : q.slice(1)));
  }, []);

  const done = useCallback((key: number) => setQueue((q) => q.filter((x) => x.key !== key)), []);

  const registry = useMemo<Registry>(
    () => ({
      set: (key, height) => {
        setInsets((list) => {
          const existing = list.find((e) => e.key === key);
          if (existing?.height === height) return list;
          if (existing) return list.map((e) => (e.key === key ? { ...e, height } : e));
          order.current += 1;
          return [...list, { key, height, order: order.current }];
        });
      },
      remove: (key) => setInsets((list) => list.filter((e) => e.key !== key)),
    }),
    [],
  );

  const api = useMemo(() => ({ show, hide }), [show, hide]);
  const latest = insets.reduce<{ height: number; order: number } | null>((best, e) => (!best || e.order > best.order ? e : best), null);
  const host = useMemo<HostState>(
    () => ({ current: queue[0] ?? null, inset: latest?.height ?? null, done }),
    [queue, latest?.height, done],
  );

  return (
    <ApiContext.Provider value={api}>
      <RegistryContext.Provider value={registry}>
        <HostContext.Provider value={host}>
          {children}
          <ToastHost />
        </HostContext.Provider>
      </RegistryContext.Provider>
    </ApiContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ApiContext);
}

/**
 * Tells the toast host what sits at the bottom of the focused screen (TabBar, TripBar, a
 * StickyFooter or the MapSheet footer): toasts float 12 dp above it. The newest active
 * registration wins; without one, toasts sit 16 dp above the bottom inset.
 */
export function useToastInset(height: number, active = true) {
  const registry = useContext(RegistryContext);
  const key = useId();
  useEffect(() => {
    if (!registry || !active || height <= 0) return;
    registry.set(key, height);
    return () => registry.remove(key);
  }, [registry, key, height, active]);
}

/**
 * Where toasts appear. ToastProvider mounts one after its children; mount another inside modal
 * screens on iOS (passive: it shows the toast but leaves timing to the root host).
 */
export function ToastHost({ passive }: { passive?: boolean }) {
  const { current, inset, done } = useContext(HostContext);
  const held = useAnyOverlayOpen();
  const insets = useSafeAreaInsets();
  if (!current || held) return null;
  const bottom = inset != null ? inset + 12 : insets.bottom + 16;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom }]}>
      <ToastView key={current.key} item={current} passive={passive} onDone={done} />
    </View>
  );
}

function ToastView({ item, passive, onDone }: { item: Item; passive?: boolean; onDone: (key: number) => void }) {
  const t = useTheme();
  const [enter] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(0));
  const leaving = useRef(false);
  const { duration: d, easing } = t.motion;

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    Animated.timing(opacity, { toValue: 0, duration: d.exit, easing: easing.exit, useNativeDriver: true }).start(() =>
      onDone(item.key),
    );
  }, [opacity, d.exit, easing.exit, onDone, item.key]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(enter, { toValue: 1, duration: d.base, easing: easing.enter, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: d.base, easing: easing.enter, useNativeDriver: true }),
    ]).start();
    if (passive) return;
    AccessibilityInfo.announceForAccessibility(item.message);
    const base =
      item.duration ?? (item.error && item.action ? toastTiming.errorWithRetry : item.action ? toastTiming.withAction : toastTiming.plain);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    AccessibilityInfo.getRecommendedTimeoutMillis(base)
      .catch(() => base)
      .then((ms) => {
        if (!cancelled) timer = setTimeout(leave, Math.max(ms, base));
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enter, opacity, d.base, easing.enter, passive, item, leave]);

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
      }}>
      <Pressable
        onPress={leave}
        accessibilityRole="alert"
        style={[styles.toast, { backgroundColor: t.color.inverseSurface, borderRadius: t.radius.md }, t.elevation(3)]}>
        {item.icon ? <Icon name={item.icon} size={20} color="onInverse" /> : null}
        <AppText variant="bodyM" color="onInverse" numberOfLines={2} style={styles.message}>
          {item.message}
        </AppText>
        {item.action ? (
          <Button
            label={item.action.label}
            variant="ghost"
            size="S"
            color="inversePrimary"
            onPress={() => {
              item.action?.onPress();
              leave();
            }}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16 },
  toast: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    paddingLeft: 16,
    paddingRight: 8,
  },
  message: { flex: 1, paddingVertical: 6 },
});
