import ExpoModulesCore
import UIKit

/// Hooks into app launch (listed under apple.appDelegateSubscribers in expo-module.config.json):
/// becomes the notification delegate before launch ends, so the alarm's Dismiss / Snooze buttons
/// work even when iOS launches the app in the background to handle them, and picks up a trip that
/// was running when iOS closed the app.
public final class TripAlarmAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    TripController.shared.prepare()
    TripController.shared.restoreOnLaunch(launchedForLocation: launchOptions?[.location] != nil)
    return true
  }

  public func applicationWillTerminate(_ application: UIApplication) {
    TripController.shared.appWillTerminate()
  }
}
