import Foundation
import UIKit
import UserNotifications

/// Every notification of a trip on iOS:
///
/// - The alarm: a series of Time Sensitive notifications with the alarm sound (28 s each), one
///   every 30 s for 10 minutes ("Vibrate only": a silent sound every 10 s, so each one vibrates).
///   They are scheduled up front, so they ring even if iOS suspends or closes the app. With
///   Critical Alerts built in (StopWakeCriticalAlerts in Info.plist, set by the config plugin when
///   the entitlement exists) and allowed by the user, they are Critical and ring through silent mode.
/// - The watchdog backup: a "Tracking stopped" notification a few minutes ahead that the running
///   app keeps pushing back. If iOS closes the app mid-trip, it fires (the iOS twin of Android's
///   AlarmManager backup).
/// - Warnings (GPS lost, location off), a test banner and the "rang for 10 minutes" note.
///
/// Also the notification center delegate: Dismiss / Snooze / Not yet act on the trip, even when the
/// app was closed and iOS launches it in the background to handle the button.
final class TripNotifications: NSObject, UNUserNotificationCenterDelegate {
  static let shared = TripNotifications()

  static let alarmPrefix = "stopwake.alarm."
  static let alarmEndId = "stopwake.alarm.end"
  static let backupId = "stopwake.backup"
  static let warningId = "stopwake.warning"
  static let testId = "stopwake.test"
  static let categoryAlarm = "stopwake.alarm"
  static let categoryAlarmUncertain = "stopwake.alarm.uncertain"
  static let actionDismiss = "stopwake.dismiss"
  static let actionSnooze = "stopwake.snooze"
  static let actionKeep = "stopwake.keep"
  private static let threadId = "stopwake.trip"
  private static let kindKey = "stopwake"
  /// The most alarm notifications pending at once (iOS keeps at most 64 per app).
  private static let maxAlarms = 60
  /// How long the alarm repeats before it gives up, like Android's auto-silence.
  static let alarmDurationSec: TimeInterval = 600

  /// Critical Alerts are part of this build (the entitlement is in the provisioning profile).
  static var criticalAlertsBuilt: Bool {
    (Bundle.main.object(forInfoDictionaryKey: "StopWakeCriticalAlerts") as? Bool) ?? false
  }

  struct Settings {
    var authorized = false
    var sound = false
    var timeSensitive = false
    var critical = false
  }

  private let center = UNUserNotificationCenter.current()
  private weak var previousDelegate: UNUserNotificationCenterDelegate?
  private var installed = false
  private let lock = NSLock()
  private var cached = Settings()

  private override init() {
    super.init()
  }

  /// Becomes the notification delegate (keeping any other one for notifications that are not ours).
  /// Call on the main thread while the app finishes launching.
  func install() {
    if installed { return }
    installed = true
    if let current = center.delegate, current !== self { previousDelegate = current }
    center.delegate = self
    registerCategories()
    refreshSettings()
  }

  /// The alarm's buttons, in the app's language (registered again when the language changes).
  func registerCategories() {
    let dismiss = UNNotificationAction(identifier: Self.actionDismiss, title: L10n["dismiss"], options: [])
    let snooze = UNNotificationAction(identifier: Self.actionSnooze, title: L10n["snooze"], options: [])
    let keep = UNNotificationAction(identifier: Self.actionKeep, title: L10n["notYetLong"], options: [])
    center.setNotificationCategories([
      UNNotificationCategory(identifier: Self.categoryAlarm, actions: [dismiss, snooze], intentIdentifiers: [], options: []),
      UNNotificationCategory(identifier: Self.categoryAlarmUncertain, actions: [dismiss, snooze, keep], intentIdentifiers: [], options: []),
    ])
  }

  // MARK: - Permission and settings

  func requestAuthorization(_ completion: @escaping (Bool) -> Void) {
    var options: UNAuthorizationOptions = [.alert, .sound, .badge]
    if Self.criticalAlertsBuilt { options.insert(.criticalAlert) }
    center.requestAuthorization(options: options) { [weak self] granted, _ in
      self?.refreshSettings { completion(granted) }
    }
  }

  func refreshSettings(_ completion: (() -> Void)? = nil) {
    center.getNotificationSettings { [weak self] settings in
      self?.store(settings)
      completion?()
    }
  }

  private func store(_ s: UNNotificationSettings) {
    var next = Settings()
    next.authorized = s.authorizationStatus == .authorized
    next.sound = s.soundSetting != .disabled
    // Not supported means the build lacks the entitlement: nothing the user can change.
    next.timeSensitive = s.timeSensitiveSetting != .disabled
    next.critical = Self.criticalAlertsBuilt && s.criticalAlertSetting == .enabled
    lock.lock()
    cached = next
    lock.unlock()
  }

  /// Fresh settings for the setup checklist. Off the main thread it waits briefly for iOS's answer;
  /// on the main thread (or if iOS is slow) it returns the last known ones.
  func settingsNow(timeout: TimeInterval = 0.5) -> Settings {
    if !Thread.isMainThread {
      let done = DispatchSemaphore(value: 0)
      refreshSettings { done.signal() }
      _ = done.wait(timeout: .now() + timeout)
    }
    lock.lock()
    defer { lock.unlock() }
    return cached
  }

  /// Critical Alerts are built in and allowed: the alarm rings through silent mode and Focus.
  var criticalActive: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cached.critical
  }

  // MARK: - The alarm

  private func alarmSound(_ strength: AlarmStrength, _ style: WakeStyle) -> UNNotificationSound {
    AlarmSound.ensureFiles()
    let name = UNNotificationSoundName(AlarmSound.notificationFileName(strength, style))
    if criticalActive {
      return UNNotificationSound.criticalSoundNamed(name, withAudioVolume: style.playsSound ? 1.0 : 0.0)
    }
    return UNNotificationSound(named: name)
  }

  private func alarmIds() -> [String] {
    (0..<Self.maxAlarms).map { Self.alarmPrefix + String($0) } + [Self.alarmEndId]
  }

  /// Schedules the ringing alarm, starting `startIn` seconds from now (0: now). Replaces any earlier series.
  func scheduleAlarm(reason: String, trip: ActiveTrip, status: TripStatus?, startIn: TimeInterval) {
    removeAlarm()
    let (title, body) = Texts.alarm(reason, trip, status)
    let style = trip.style
    let strength = trip.alarmStrength
    let sound = alarmSound(strength, style)
    let every: TimeInterval = style == .vibrate ? 10 : 30
    let count = min(Self.maxAlarms, Int((Self.alarmDurationSec / every).rounded(.up)))
    let category = Texts.canKeepTracking(reason) ? Self.categoryAlarmUncertain : Self.categoryAlarm
    for i in 0..<count {
      let content = UNMutableNotificationContent()
      content.title = title
      content.body = body
      content.sound = sound
      content.categoryIdentifier = category
      content.threadIdentifier = Self.threadId
      content.userInfo = [Self.kindKey: "alarm", "reason": reason]
      content.interruptionLevel = criticalActive ? .critical : .timeSensitive
      content.relevanceScore = 1.0
      add(Self.alarmPrefix + String(i), content, after: startIn + Double(i) * every)
    }
    // When the series ends: a quiet note that the alarm gave up, like Android's auto-silence.
    let end = UNMutableNotificationContent()
    end.title = title
    end.body = L10n["autoSilenced"]
    end.categoryIdentifier = category
    end.threadIdentifier = Self.threadId
    end.userInfo = [Self.kindKey: "alarmEnd"]
    end.interruptionLevel = .active
    add(Self.alarmEndId, end, after: startIn + Self.alarmDurationSec)
  }

  func removeAlarm() {
    let ids = alarmIds()
    center.removePendingNotificationRequests(withIdentifiers: ids)
    center.removeDeliveredNotifications(withIdentifiers: ids)
  }

  // MARK: - Watchdog backup and "tracking stopped"

  /// Rings "Tracking stopped" in `seconds` unless called again (or cancelled) before then.
  func scheduleBackup(trip: ActiveTrip, after seconds: TimeInterval) {
    add(Self.backupId, trackingStoppedContent(trip), after: max(1, seconds))
  }

  func cancelBackup() {
    center.removePendingNotificationRequests(withIdentifiers: [Self.backupId])
  }

  /// The trip ended without the user (the app is being closed): say so now.
  func showTrackingStopped(_ trip: ActiveTrip) {
    // Same identifier: replaces the pending backup, which still rings if this request is lost.
    add(Self.backupId, trackingStoppedContent(trip), after: 0)
  }

  private func trackingStoppedContent(_ trip: ActiveTrip) -> UNMutableNotificationContent {
    let (title, body) = Texts.alarm(Texts.reasonTrackingStopped, trip, nil)
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = alarmSound(trip.alarmStrength, trip.style)
    content.threadIdentifier = Self.threadId
    content.userInfo = [Self.kindKey: "stopped"]
    content.interruptionLevel = criticalActive ? .critical : .timeSensitive
    content.relevanceScore = 1.0
    return content
  }

  // MARK: - Warnings, test

  /// Loud warnings break through Focus with the default sound; quiet ones only appear in the list.
  func showWarning(title: String, body: String, loud: Bool) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.threadIdentifier = Self.threadId
    content.userInfo = [Self.kindKey: "warning"]
    content.sound = loud ? UNNotificationSound.default : nil
    content.interruptionLevel = loud ? .timeSensitive : .passive
    add(Self.warningId, content, after: 0)
  }

  func cancelWarning() {
    center.removePendingNotificationRequests(withIdentifiers: [Self.warningId])
    center.removeDeliveredNotifications(withIdentifiers: [Self.warningId])
  }

  /// What the alarm notification looks like (the in-app test plays the sound itself).
  func showTest(strength: AlarmStrength, style: WakeStyle) {
    let (title, body) = Texts.alarm(Texts.reasonTest, nil, nil)
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = alarmSound(strength, style)
    content.threadIdentifier = Self.threadId
    content.userInfo = [Self.kindKey: "test"]
    content.interruptionLevel = .timeSensitive
    add(Self.testId, content, after: 0)
  }

  private func add(_ id: String, _ content: UNMutableNotificationContent, after seconds: TimeInterval) {
    let trigger: UNNotificationTrigger? = seconds < 1 ? nil : UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
    center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger)) { _ in }
  }

  // MARK: - UNUserNotificationCenterDelegate

  private func kind(_ notification: UNNotification) -> String? {
    notification.request.content.userInfo[Self.kindKey] as? String
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    guard let kind = kind(notification) else {
      if let previous = previousDelegate,
         previous.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler) != nil {
        return
      }
      completionHandler([])
      return
    }
    switch kind {
    case "alarm", "alarmEnd":
      // On screen the trip screen shows the alarm and the in-app player rings: list only.
      completionHandler([.list])
    case "test":
      completionHandler([.banner, .list])
    default:
      completionHandler([.banner, .list, .sound])
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    guard kind(response.notification) != nil else {
      if let previous = previousDelegate,
         previous.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler) != nil {
        return
      }
      completionHandler()
      return
    }
    let action = response.actionIdentifier
    DispatchQueue.main.async {
      let controller = TripController.shared
      controller.prepare()
      switch action {
      case Self.actionDismiss: controller.dismiss()
      case Self.actionSnooze: controller.snooze()
      case Self.actionKeep: controller.keepTracking()
      default: break // Opened: the app shows the trip.
      }
      completionHandler()
    }
  }
}
