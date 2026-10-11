import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// One place for haptics (2.8 and the critiques): Android uses performAndroidHapticsAsync, which
// feels like the system and respects its touch-feedback setting; iOS keeps the feedback
// generators. Never on scroll or map pans. A missing haptics engine is never an error.

const android = Platform.OS === 'android';

function run(task: () => Promise<void>) {
  try {
    task().catch(() => {});
  } catch {
    // No haptics on this device.
  }
}

export const haptics = {
  /** Segment, chip and tab changes. */
  selection() {
    run(() =>
      android ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick) : Haptics.selectionAsync(),
    );
  },
  /** An alarm or a trip starts. */
  confirm() {
    run(() =>
      android
        ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    );
  },
  /** Arrived, purchase, redeem and admin save succeeded. */
  success() {
    run(() =>
      android
        ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
        : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    );
  },
  /** Validation errors, a required permission is missing. */
  warning() {
    run(() =>
      android
        ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject)
        : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    );
  },
};
