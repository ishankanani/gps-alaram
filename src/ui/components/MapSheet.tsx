import { useEffect, useMemo, useState, type ReactNode, type Ref } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Keyboard,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type PanResponderInstance,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../../i18n';
import { settleSnap, sheetGeometry, shouldDismiss, SNAP_ORDER, stepSnap, type SheetGeometry, type SheetSnap } from '../sheetGeometry';
import { useTheme } from '../theme';
import { SheetGrabber } from './Sheet';

export type { SheetSnap } from '../sheetGeometry';

/**
 * The MapSheet snaps for the current screen: computed from the safe-area frame (not the window,
 * which differs under edge-to-edge) and `bottomOffset`, the height of whatever is visible under
 * the sheet (the tab bar with its TripBar, or 0 when it is hidden).
 */
export function useSheetGeometry(bottomOffset: number): SheetGeometry {
  const frame = useSafeAreaFrame();
  const insets = useSafeAreaInsets();
  return useMemo(() => sheetGeometry(frame.height, insets.top, bottomOffset), [frame.height, insets.top, bottomOffset]);
}

/** A header drag starts only after 8 dp of mostly vertical movement, so taps on the header's buttons still work. */
function isVerticalDrag(dx: number, dy: number) {
  return Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx);
}

type SnapProps = {
  /** browse and search modes: the sheet snaps to peek, half and expanded. */
  mode: 'snap';
  snap: SheetSnap;
  /** The user dragged (or used the accessibility actions) to another snap. */
  onSnapChange: (snap: SheetSnap) => void;
  /** Height of what is visible under the sheet (tab bar and TripBar); 0 when the tab bar is hidden. */
  bottomOffset: number;
  /** Called once a move has finished, with the visible height: update the camera padding here. */
  onSettle?: (snap: SheetSnap, visibleHeight: number) => void;
  scrollRef?: Ref<ScrollView>;
};

type FitProps = {
  /** stop mode: a single detent that fits its content, up to 80 % of the frame. */
  mode: 'fit';
  /** A drag down past 25 % of the height, a downward fling or the accessibility action. */
  onDismiss: () => void;
  /** The sticky footer (Start alarm), inside the sheet under the scrolling content. */
  footer?: ReactNode;
  /** The sheet's height once laid out (camera padding, map controls). */
  onHeight?: (height: number) => void;
  scrollRef?: Ref<ScrollView>;
};

export type MapSheetProps = (SnapProps | FitProps) & {
  /** The drag zone under the grabber: the search field, or the stop header. */
  header?: ReactNode;
  /** The scrolling content. */
  children?: ReactNode;
  /**
   * Driven with the sheet's translateY (native driver), for map controls that ride on the sheet
   * top. Snap mode: the visible height is the geometry's layoutHeight minus this value.
   */
  position?: Animated.Value;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * MapSheet (3.17 and the critiques' layout model), built with Animated and PanResponder only.
 *
 * Snap mode (browse, search): an absolutely positioned sheet as tall as its expanded snap that
 * reaches the screen bottom behind the tab bar and moves with translateY. After each settle, the
 * content's bottom padding makes every row reachable. Content scrolls only at half and expanded.
 *
 * Fit mode (stop): its own height (content plus footer, at most 80 % of the frame); translateY only
 * enters, leaves and follows a drag to dismiss.
 *
 * Only the header drags. Every drag has a tap or back equivalent, and the grabber is an
 * adjustable control for screen readers.
 */
export function MapSheet(props: MapSheetProps) {
  return props.mode === 'snap' ? <SnapSheet {...props} /> : <FitSheet {...props} />;
}

function useKeyboardHeight(enabled: boolean): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
      setHeight(0);
    };
  }, [enabled]);
  return enabled ? height : 0;
}

/** The snap sheet's gesture state, outside React: the sheet follows the finger on the Animated value alone. */
class SnapDrag {
  dragging = false;
  private start = 0;
  private position = 0;
  private velocity = 0;
  private geometry: SheetGeometry;
  private snap: SheetSnap;
  private onSnapChange: (snap: SheetSnap) => void = () => {};
  private springConfig: { damping: number; stiffness: number; mass: number };
  readonly responder: PanResponderInstance;

  constructor(
    private readonly y: Animated.Value,
    geometry: SheetGeometry,
    snap: SheetSnap,
    springConfig: { damping: number; stiffness: number; mass: number },
  ) {
    this.geometry = geometry;
    this.snap = snap;
    this.position = geometry.translate[snap];
    this.springConfig = springConfig;
    this.responder = PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => isVerticalDrag(g.dx, g.dy),
      onMoveShouldSetPanResponder: (_, g) => isVerticalDrag(g.dx, g.dy),
      onPanResponderGrant: () => {
        this.dragging = true;
        this.y.stopAnimation((value) => {
          this.position = value;
        });
        this.start = this.position;
      },
      onPanResponderMove: (_, g) => {
        const { translate } = this.geometry;
        this.position = Math.max(translate.expanded, Math.min(translate.peek, this.start + g.dy));
        this.y.setValue(this.position);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => this.release(g.vy),
      onPanResponderTerminate: (_, g) => this.release(g.vy),
    });
  }

  /** The latest props (called from an effect after every render). */
  sync(geometry: SheetGeometry, snap: SheetSnap, onSnapChange: (snap: SheetSnap) => void) {
    this.geometry = geometry;
    this.snap = snap;
    this.onSnapChange = onSnapChange;
  }

  /** Follows animations started elsewhere, so a drag starts from where the sheet is. */
  track(): () => void {
    const id = this.y.addListener(({ value }) => {
      this.position = value;
    });
    return () => this.y.removeListener(id);
  }

  /** The release velocity of the drag that asked for the current snap (used once). */
  takeVelocity(): number {
    const v = this.velocity;
    this.velocity = 0;
    return v;
  }

  private release(vy: number) {
    this.dragging = false;
    const next = settleSnap(this.geometry, this.position, vy);
    if (next !== this.snap) {
      // The parent owns the snap: it passes `next` back and the sheet springs there.
      this.velocity = vy;
      this.onSnapChange(next);
      return;
    }
    Animated.spring(this.y, { toValue: this.geometry.translate[next], velocity: vy, ...this.springConfig, useNativeDriver: true }).start();
  }
}

function SnapSheet({ snap, onSnapChange, bottomOffset, onSettle, scrollRef, header, children, position, testID, style }: SnapProps & MapSheetProps) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const geometry = useSheetGeometry(bottomOffset);
  const keyboard = useKeyboardHeight(true);
  const { spring } = t.motion;
  const [y] = useState(() => {
    const value = position ?? new Animated.Value(0);
    value.setValue(geometry.translate[snap]);
    return value;
  });
  const [drag] = useState(() => new SnapDrag(y, geometry, snap, spring.sheet));
  const [settled, setSettled] = useState(snap);

  useEffect(() => drag.track(), [drag]);
  useEffect(() => {
    drag.sync(geometry, snap, onSnapChange);
  }, [drag, geometry, snap, onSnapChange]);

  // Move to the requested snap (a drag release, a mode change, the tab bar hiding).
  useEffect(() => {
    if (drag.dragging) return;
    const fling = drag.takeVelocity();
    const anim = t.reduceMotion
      ? Animated.timing(y, { toValue: geometry.translate[snap], duration: 0, useNativeDriver: true })
      : Animated.spring(y, { toValue: geometry.translate[snap], velocity: fling, ...spring.sheet, useNativeDriver: true });
    anim.start(({ finished }) => {
      if (!finished) return;
      setSettled(snap);
      onSettle?.(snap, geometry.heights[snap]);
    });
    return () => anim.stop();
    // onSettle is a notification; a new function identity must not restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, geometry, y, drag, spring.sheet, t.reduceMotion]);

  function step(direction: 'up' | 'down') {
    const next = stepSnap(snap, direction);
    if (next === snap) return;
    onSnapChange(next);
    AccessibilityInfo.announceForAccessibility(tr(direction === 'up' ? 'ui.sheet.expanded' : 'ui.sheet.collapsed'));
  }

  const scrollable = settled !== 'peek';
  return (
    <Animated.View
      testID={testID}
      style={[
        styles.sheet,
        {
          height: geometry.layoutHeight,
          backgroundColor: t.color.surface2,
          borderTopLeftRadius: t.radius.xl,
          borderTopRightRadius: t.radius.xl,
          transform: [{ translateY: y }],
        },
        t.elevation(3, { upward: true }),
        style,
      ]}>
      <View {...drag.responder.panHandlers}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={tr('ui.sheet')}
          accessibilityValue={{ min: 0, max: 2, now: SNAP_ORDER.indexOf(snap) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 'up' : 'down')}>
          <SheetGrabber />
        </View>
        {header}
      </View>
      <ScrollView
        ref={scrollRef}
        scrollEnabled={scrollable}
        keyboardShouldPersistTaps="handled"
        // At peek the rows below the visible part are off screen: keep them away from TalkBack.
        importantForAccessibility={scrollable ? 'auto' : 'no-hide-descendants'}
        accessibilityElementsHidden={!scrollable}
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: geometry.translate[settled] + bottomOffset + keyboard + 16 }}>
        {children}
      </ScrollView>
    </Animated.View>
  );
}

/** The fit sheet's gesture state, outside React. */
class FitDrag {
  private height = 0;
  private start = 0;
  private position: number;
  private onDismiss: () => void = () => {};
  readonly responder: PanResponderInstance;

  constructor(
    private readonly y: Animated.Value,
    initial: number,
    private readonly motion: {
      spring: { damping: number; stiffness: number; mass: number };
      exit: number;
      easing: (value: number) => number;
    },
  ) {
    this.position = initial;
    this.responder = PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => isVerticalDrag(g.dx, g.dy),
      onMoveShouldSetPanResponder: (_, g) => isVerticalDrag(g.dx, g.dy),
      onPanResponderGrant: () => {
        this.y.stopAnimation((value) => {
          this.position = value;
        });
        this.start = this.position;
      },
      onPanResponderMove: (_, g) => {
        this.position = Math.max(0, this.start + g.dy);
        this.y.setValue(this.position);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => this.release(g.vy),
      onPanResponderTerminate: (_, g) => this.release(g.vy),
    });
  }

  sync(onDismiss: () => void) {
    this.onDismiss = onDismiss;
  }

  measured(height: number) {
    this.height = height;
  }

  track(): () => void {
    const id = this.y.addListener(({ value }) => {
      this.position = value;
    });
    return () => this.y.removeListener(id);
  }

  dismiss() {
    Animated.timing(this.y, {
      toValue: this.height || 1000,
      duration: this.motion.exit,
      easing: this.motion.easing,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) this.onDismiss();
    });
  }

  private release(vy: number) {
    if (shouldDismiss(this.height, this.position, vy)) this.dismiss();
    else Animated.spring(this.y, { toValue: 0, velocity: vy, ...this.motion.spring, useNativeDriver: true }).start();
  }
}

function FitSheet({ onDismiss, footer, onHeight, scrollRef, header, children, position, testID, style }: FitProps & MapSheetProps) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const frame = useSafeAreaFrame();
  const maxHeight = Math.round(frame.height * 0.8);
  const { spring, duration, easing } = t.motion;
  const [y] = useState(() => {
    const value = position ?? new Animated.Value(0);
    value.setValue(frame.height);
    return value;
  });
  const [drag] = useState(() => new FitDrag(y, frame.height, { spring: spring.sheet, exit: duration.exit, easing: easing.exit }));
  const [entered, setEntered] = useState(false);

  useEffect(() => drag.track(), [drag]);
  useEffect(() => {
    drag.sync(onDismiss);
  }, [drag, onDismiss]);

  function onLayout(e: LayoutChangeEvent) {
    const height = e.nativeEvent.layout.height;
    drag.measured(height);
    onHeight?.(height);
    if (entered) return;
    setEntered(true);
    y.setValue(height);
    Animated.timing(y, { toValue: 0, duration: duration.slow, easing: easing.enter, useNativeDriver: true }).start();
  }

  return (
    <Animated.View
      testID={testID}
      onLayout={onLayout}
      style={[
        styles.sheet,
        {
          maxHeight,
          backgroundColor: t.color.surface2,
          borderTopLeftRadius: t.radius.xl,
          borderTopRightRadius: t.radius.xl,
          transform: [{ translateY: y }],
        },
        t.elevation(3, { upward: true }),
        style,
      ]}>
      <View {...drag.responder.panHandlers}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={tr('ui.sheet')}
          accessibilityActions={[{ name: 'decrement' }]}
          onAccessibilityAction={() => drag.dismiss()}>
          <SheetGrabber />
        </View>
        {header}
      </View>
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" style={styles.fitScroll} bounces={false}>
        {children}
      </ScrollView>
      {footer}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  flex: { flex: 1 },
  fitScroll: { flexGrow: 0, flexShrink: 1 },
});
