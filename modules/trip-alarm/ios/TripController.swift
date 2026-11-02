import CoreLocation
import ExpoModulesCore
import Foundation
import UIKit

/// Runs a trip end to end without JavaScript: location updates, the trip engine, the watchdog and
/// the alarm. The iOS twin of Android's TripService.
///
/// Tracking uses CLLocationManager with background location updates (the `location` background
/// mode) started while the app is open, so "While Using the App" permission is enough: iOS keeps
/// the app running with the blue location indicator. On iOS 17+ a CLBackgroundActivitySession makes
/// that explicit. With "Always" permission, significant-change monitoring is added, which lets iOS
/// relaunch the app after it was closed so the trip continues.
///
/// Battery: the engine's tier picks the accuracy (far: about 100 m, which mostly avoids GPS; mid:
/// 10 m; near: best), and fixes reach the engine at most every 15 s / 5 s / 1 s.
///
/// Everything runs on the main thread. The JS module reads `activeTripSnapshot()` and
/// `setupStatus()` from its own thread; those only touch lock-protected copies.
final class TripController: NSObject, CLLocationManagerDelegate {
  static let shared = TripController()

  /// How long the watchdog backup notification waits (the running app pushes it back every minute).
  private static let backupDelaySec: TimeInterval = 180
  private static let heartbeatSec: TimeInterval = 60
  private static let snoozeMs: Int64 = 60_000
  private static let estimateRefreshSec: TimeInterval = 3
  private static let demoIntervalSec: TimeInterval = 1

  /// Events for the JS module (onStatus, onAlarm, onTripEnded). Called on the main thread.
  var sink: ((String, [String: Any]) -> Void)?

  private var manager: CLLocationManager?
  private var prepared = false
  private var appActive = false

  private var trip: ActiveTrip?
  private var engine: TripEngine?
  private var state = TripState.tracking
  private var lastStatus: TripStatus?
  private var lastTrigger: String?
  private var appliedTier: Tier?
  private var updating = false
  private var log: TripLog?
  private var backgroundSession: AnyObject?

  private var tickTimer: Timer?
  private var refreshTimer: Timer?
  private var demoTimer: Timer?
  private var heartbeatTimer: Timer?
  private var autoSilenceTimer: Timer?
  private var snoozeUntilMs: Int64 = 0
  private var lastForwardMs: Int64 = 0
  private var lastBackupMs: Int64 = 0
  private var demoStartedMs: Int64 = 0

  private let lock = NSLock()
  private var snapshot: [String: Any]?
  private var authStatus = CLAuthorizationStatus.notDetermined
  private var fullAccuracy = false

  private let notifications = TripNotifications.shared

  private override init() {
    super.init()
  }

  // MARK: - Setup

  /// Creates the location manager and the observers. Idempotent; main thread.
  func prepare() {
    if prepared { return }
    prepared = true
    let m = CLLocationManager()
    m.delegate = self
    manager = m
    readAuthorization(m)
    appActive = UIApplication.shared.applicationState == .active
    let center = NotificationCenter.default
    center.addObserver(self, selector: #selector(didBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    center.addObserver(self, selector: #selector(willResignActive), name: UIApplication.willResignActiveNotification, object: nil)
    notifications.install()
    DispatchQueue.global(qos: .utility).async { AlarmSound.ensureFiles() }
  }

  private static var hasLocationBackgroundMode: Bool {
    let modes = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] ?? []
    return modes.contains("location")
  }

  private func readAuthorization(_ m: CLLocationManager) {
    let status = m.authorizationStatus
    let full = m.accuracyAuthorization == .fullAccuracy
    lock.lock()
    authStatus = status
    fullAccuracy = full
    lock.unlock()
  }

  /// Precise "While Using" or "Always" permission: what a trip needs.
  var hasPreciseLocation: Bool {
    lock.lock()
    defer { lock.unlock() }
    return (authStatus == .authorizedWhenInUse || authStatus == .authorizedAlways) && fullAccuracy
  }

  @objc private func didBecomeActive() {
    appActive = true
    notifications.refreshSettings()
    if let trip, state == .ringing, !AlarmPlayer.shared.isRinging {
      AlarmPlayer.shared.start(
        strength: trip.alarmStrength, style: trip.style, maxSeconds: TripNotifications.alarmDurationSec,
        ignoreSilentSwitch: notifications.criticalActive
      )
    }
  }

  @objc private func willResignActive() {
    appActive = false
    // In the background the notifications ring; the in-app player could not keep playing anyway.
    AlarmPlayer.shared.stop()
  }

  // MARK: - Lifecycle

  /// After a launch: picks up a trip that was running when iOS closed the app. With "Always"
  /// permission tracking continues (also when iOS relaunched the app for a location event);
  /// otherwise the saved trip stays for the app to report as stopped (the backup notification has
  /// already told the user).
  func restoreOnLaunch(launchedForLocation: Bool) {
    prepare()
    guard trip == nil, let saved = TripStore.load() else { return }
    if saved.trip.isDemo {
      TripStore.clear()
      return
    }
    lock.lock()
    let always = authStatus == .authorizedAlways
    lock.unlock()
    if always && saved.state == .tracking {
      start(saved.trip, resumed: true)
    }
  }

  /// The user closed the app from the app switcher while a trip was tracking.
  func appWillTerminate() {
    guard let trip, !trip.isDemo, state == .tracking else { return }
    log?.event(MonoClock.nowMs(), lastStatus, "terminated")
    notifications.showTrackingStopped(trip)
  }

  func startTrip(
    latitude: Double, longitude: Double, radiusM: Double, mode: String, minutesBefore: Int?, label: String,
    strength: String, wakeStyle: String, useMiles: Bool,
    demoFromLatitude: Double?, demoFromLongitude: Double?, demoSpeedMps: Double?
  ) throws -> [String: Any] {
    prepare()
    if !hasPreciseLocation { throw PreciseLocationRequiredException() }
    if !(-90.0...90.0).contains(latitude) || !(-180.0...180.0).contains(longitude) {
      throw InvalidTripException("Destination coordinates are out of range")
    }
    if !(50.0...50_000.0).contains(radiusM) {
      throw InvalidTripException("Radius must be between 50 m and 50 km")
    }
    let now = Date().timeIntervalSince1970 * 1000
    let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
    let newTrip = ActiveTrip(
      id: String(Int64(now)),
      label: trimmed.isEmpty ? L10n["yourStop"] : trimmed,
      latitude: latitude,
      longitude: longitude,
      radiusM: radiusM,
      mode: mode.lowercased() == "leave" ? AlarmMode.leave.rawValue : AlarmMode.arrive.rawValue,
      minutesBefore: minutesBefore.flatMap { $0 > 0 ? $0 : nil },
      strength: AlarmStrength.parse(strength).rawValue,
      wakeStyle: WakeStyle.parse(wakeStyle).rawValue,
      useMiles: useMiles,
      startedAtWallMs: now,
      demoFromLat: demoFromLatitude.flatMap { (-90.0...90.0).contains($0) ? $0 : nil },
      demoFromLon: demoFromLongitude.flatMap { (-180.0...180.0).contains($0) ? $0 : nil },
      demoSpeedMps: demoSpeedMps.flatMap { (1.0...100.0).contains($0) ? $0 : nil }
    )
    start(newTrip, resumed: false)
    return newTrip.toMap()
  }

  private func start(_ newTrip: ActiveTrip, resumed: Bool) {
    if trip != nil {
      stopLocation()
      invalidateTimers()
    }
    trip = newTrip
    state = .tracking
    lastStatus = nil
    lastTrigger = nil
    appliedTier = nil
    lastForwardMs = 0
    TripStore.save(newTrip, .tracking)

    let now = MonoClock.nowMs()
    engine = TripEngine(config: newTrip.config, startedAtMs: now)
    log = TripLog.open(newTrip, startedAtMs: now)
    log?.event(now, nil, resumed ? "resumed" : "start")
    AlarmPlayer.shared.stop()
    notifications.removeAlarm()
    notifications.cancelWarning()
    beginBackgroundSession()
    applyPlan()
    if newTrip.isDemo {
      demoStartedMs = now
      demoTimer = Timer.scheduledTimer(withTimeInterval: Self.demoIntervalSec, repeats: true) { [weak self] _ in
        self?.feedDemo()
      }
    }
    heartbeatTimer = Timer.scheduledTimer(withTimeInterval: Self.heartbeatSec, repeats: true) { [weak self] _ in
      self?.heartbeat()
    }
    scheduleWatchdog()
    refreshBackup(force: true)
    emitStatus()
  }

  func stop() { end("stopped") }

  func dismiss() { end("dismissed") }

  private func end(_ reason: String) {
    guard let ended = trip else {
      // Nothing runs (a trip saved before iOS closed the app, or the test alarm): clean up.
      AlarmPlayer.shared.stop()
      TripStore.clear()
      notifications.removeAlarm()
      notifications.cancelBackup()
      setSnapshot(nil)
      return
    }
    let now = MonoClock.nowMs()
    log?.event(now, lastStatus, "end:\(reason)")
    log = nil
    AlarmPlayer.shared.stop()
    invalidateTimers()
    stopLocation()
    endBackgroundSession()
    notifications.removeAlarm()
    notifications.cancelWarning()
    notifications.cancelBackup()
    TripStore.clear()
    let trigger = lastTrigger
    trip = nil
    engine = nil
    state = .tracking
    lastStatus = nil
    lastTrigger = nil
    setSnapshot(nil)
    var event: [String: Any] = ["reason": reason, "tripId": ended.id, "logName": "trip-\(ended.id).csv"]
    if let trigger { event["trigger"] = trigger }
    sink?("onTripEnded", event)
  }

  private func invalidateTimers() {
    for timer in [tickTimer, refreshTimer, demoTimer, heartbeatTimer, autoSilenceTimer] { timer?.invalidate() }
    tickTimer = nil
    refreshTimer = nil
    demoTimer = nil
    heartbeatTimer = nil
    autoSilenceTimer = nil
  }

  // MARK: - Location

  private func beginBackgroundSession() {
    if #available(iOS 17.0, *) {
      if backgroundSession == nil { backgroundSession = CLBackgroundActivitySession() }
    }
  }

  private func endBackgroundSession() {
    if #available(iOS 17.0, *) {
      (backgroundSession as? CLBackgroundActivitySession)?.invalidate()
    }
    backgroundSession = nil
  }

  private func accuracy(for tier: Tier, demo: Bool) -> CLLocationAccuracy {
    // A demo ride only needs location running so iOS keeps the app alive in the background.
    if demo { return kCLLocationAccuracyThreeKilometers }
    switch tier {
    case .far: return kCLLocationAccuracyHundredMeters
    case .mid: return kCLLocationAccuracyNearestTenMeters
    case .near: return kCLLocationAccuracyBest
    }
  }

  /// The shortest gap between fixes handed to the engine (iOS delivers about one a second).
  private func forwardGapMs(_ tier: Tier?) -> Int64 {
    switch tier {
    case .far: return 15_000
    case .mid: return 5_000
    default: return 1_000
    }
  }

  private func applyPlan() {
    guard let trip, let plan = engine?.plan, let m = manager else { return }
    if appliedTier == plan.tier && updating { return }
    appliedTier = plan.tier
    log?.event(MonoClock.nowMs(), lastStatus, "plan:\(plan.tier.name)")
    m.desiredAccuracy = accuracy(for: plan.tier, demo: trip.isDemo)
    m.distanceFilter = kCLDistanceFilterNone
    m.activityType = .otherNavigation
    m.pausesLocationUpdatesAutomatically = false
    if Self.hasLocationBackgroundMode {
      m.allowsBackgroundLocationUpdates = true
      m.showsBackgroundLocationIndicator = true
    }
    if !updating {
      updating = true
      m.startUpdatingLocation()
      if m.authorizationStatus == .authorizedAlways && CLLocationManager.significantLocationChangeMonitoringAvailable() {
        m.startMonitoringSignificantLocationChanges()
      }
    }
  }

  private func stopLocation() {
    guard let m = manager else { return }
    m.stopUpdatingLocation()
    m.stopMonitoringSignificantLocationChanges()
    if Self.hasLocationBackgroundMode { m.allowsBackgroundLocationUpdates = false }
    updating = false
    appliedTier = nil
  }

  /// GPS went quiet: restarting the updates sometimes gets a stuck receiver going again.
  private func kickLocation() {
    guard let m = manager, updating, trip?.isDemo == false else { return }
    m.stopUpdatingLocation()
    m.startUpdatingLocation()
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let trip, !trip.isDemo else { return }
    for location in locations { onLocation(location) }
  }

  private func onLocation(_ location: CLLocation) {
    guard let engine, location.horizontalAccuracy >= 0 else { return }
    let now = MonoClock.nowMs()
    let ageMs = Int64(max(0, Date().timeIntervalSince(location.timestamp)) * 1000)
    let fixMs = now - ageMs
    if lastForwardMs != 0 && fixMs - lastForwardMs < forwardGapMs(appliedTier) { return }
    lastForwardMs = fixMs
    let fix = Fix(
      lat: location.coordinate.latitude,
      lon: location.coordinate.longitude,
      accuracyM: location.horizontalAccuracy,
      timeMs: fixMs,
      speedMps: location.speed >= 0 ? location.speed : nil,
      provider: location.horizontalAccuracy <= 100 ? "gps" : "network"
    )
    let update = engine.onFix(fix)
    log?.fix(now, fix, update.status)
    handle(update)
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    readAuthorization(manager)
    guard let trip, !trip.isDemo, state == .tracking else { return }
    let status = manager.authorizationStatus
    if status == .denied || status == .restricted {
      log?.event(MonoClock.nowMs(), lastStatus, "permission-removed")
      notifications.showWarning(title: L10n["permissionTitle"], body: L10n["permission"], loud: true)
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    // kCLErrorLocationUnknown is temporary; denied is reported by the authorization callback.
    if let e = error as? CLError, e.code == .denied, trip?.isDemo == false, state == .tracking {
      notifications.showWarning(title: L10n["locationOffTitle"], body: L10n["locationOff"], loud: true)
    }
  }

  /// One simulated fix a second, along the straight line from the demo start to the stop.
  private func feedDemo() {
    guard let trip, let engine, let fromLat = trip.demoFromLat, let fromLon = trip.demoFromLon,
          let speed = trip.demoSpeedMps, state == .tracking else { return }
    let total = Geo.distanceM(fromLat, fromLon, trip.latitude, trip.longitude)
    let now = MonoClock.nowMs()
    let travelled = min(total, speed * Double(now - demoStartedMs) / 1000.0)
    let f = total > 0 ? travelled / total : 1.0
    let fix = Fix(
      lat: fromLat + (trip.latitude - fromLat) * f,
      lon: fromLon + (trip.longitude - fromLon) * f,
      accuracyM: 5,
      timeMs: now,
      speedMps: travelled < total ? speed : 0,
      provider: "gps"
    )
    let update = engine.onFix(fix)
    log?.fix(now, fix, update.status)
    handle(update)
  }

  // MARK: - Engine updates and watchdog

  private func heartbeat() {
    refreshBackup(force: true)
    tick()
  }

  private func tick() {
    let now = MonoClock.nowMs()
    if state == .snoozed {
      if now >= snoozeUntilMs { ring(lastTrigger ?? TriggerReason.arrived.rawValue, resumed: true) } else { scheduleSnooze() }
      return
    }
    guard let engine, state == .tracking else { return }
    handle(engine.onTick(now))
  }

  private func handle(_ update: EngineUpdate) {
    guard let trip else { return }
    let now = MonoClock.nowMs()
    lastStatus = update.status
    if update.planChanged { applyPlan() }

    if update.signalLost {
      log?.event(now, update.status, "signal-lost")
      // Only worth waking someone for when the stop is close; otherwise it is a quiet note.
      let near = update.status.tier == .near
      notifications.showWarning(title: L10n["gpsLostTitle"], body: near ? L10n["gpsLostNear"] : L10n["gpsLostFar"], loud: near)
      if !trip.isDemo { kickLocation() }
    }
    if update.signalRecovered {
      log?.event(now, update.status, "signal-back")
      notifications.cancelWarning()
    }

    if let trigger = update.trigger, state == .tracking {
      log?.event(now, update.status, "trigger:\(trigger.rawValue)")
      ring(trigger.rawValue, resumed: false)
    } else if state == .tracking {
      scheduleWatchdog()
      refreshBackup(force: false)
    }
    refreshTimer?.invalidate()
    refreshTimer = nil
    if state == .tracking && update.status.estimated {
      refreshTimer = Timer.scheduledTimer(withTimeInterval: Self.estimateRefreshSec, repeats: false) { [weak self] _ in
        self?.refreshEstimate()
      }
    }
    emitStatus()
  }

  /// Without GPS (a tunnel, an underground station) the estimated position moves on: show it.
  private func refreshEstimate() {
    guard let engine, trip != nil, state == .tracking else { return }
    let status = engine.status(MonoClock.nowMs())
    lastStatus = status
    emitStatus()
    if status.estimated {
      refreshTimer = Timer.scheduledTimer(withTimeInterval: Self.estimateRefreshSec, repeats: false) { [weak self] _ in
        self?.refreshEstimate()
      }
    }
  }

  private func scheduleWatchdog() {
    tickTimer?.invalidate()
    tickTimer = nil
    guard let at = engine?.nextCheckAtMs() else { return }
    let delay = max(0, Double(at - MonoClock.nowMs()) / 1000.0) + 0.05
    tickTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
      self?.tick()
    }
  }

  /// Keeps the "Tracking stopped" backup a few minutes ahead while tracking (throttled).
  private func refreshBackup(force: Bool) {
    guard let trip, state == .tracking else { return }
    let now = MonoClock.nowMs()
    if !force && now - lastBackupMs < 30_000 { return }
    lastBackupMs = now
    notifications.scheduleBackup(trip: trip, after: Self.backupDelaySec)
  }

  // MARK: - Alarm

  private func ring(_ reason: String, resumed: Bool) {
    guard let trip else { return }
    state = .ringing
    lastTrigger = reason
    TripStore.save(trip, .ringing)
    tickTimer?.invalidate()
    tickTimer = nil
    notifications.cancelBackup()
    notifications.scheduleAlarm(reason: reason, trip: trip, status: lastStatus, startIn: 0)
    if appActive {
      AlarmPlayer.shared.start(
        strength: trip.alarmStrength, style: trip.style, maxSeconds: TripNotifications.alarmDurationSec,
        ignoreSilentSwitch: notifications.criticalActive
      )
    }
    autoSilenceTimer?.invalidate()
    autoSilenceTimer = Timer.scheduledTimer(withTimeInterval: TripNotifications.alarmDurationSec, repeats: false) { [weak self] _ in
      self?.log?.event(MonoClock.nowMs(), self?.lastStatus, "auto-silenced")
      AlarmPlayer.shared.stop()
    }
    sink?("onAlarm", ["reason": reason, "resumed": resumed])
    emitStatus()
  }

  func snooze() {
    guard let trip else {
      end("dismissed")
      return
    }
    guard state == .ringing else { return }
    AlarmPlayer.shared.stop()
    autoSilenceTimer?.invalidate()
    autoSilenceTimer = nil
    state = .snoozed
    TripStore.save(trip, .snoozed)
    snoozeUntilMs = MonoClock.nowMs() + Self.snoozeMs
    log?.event(MonoClock.nowMs(), lastStatus, "snooze")
    // Scheduled now, so it rings again even if iOS suspends the app in the meantime.
    notifications.scheduleAlarm(
      reason: lastTrigger ?? TriggerReason.arrived.rawValue, trip: trip, status: lastStatus,
      startIn: Double(Self.snoozeMs) / 1000.0
    )
    scheduleSnooze()
    emitStatus()
  }

  private func scheduleSnooze() {
    tickTimer?.invalidate()
    let delay = max(0, Double(snoozeUntilMs - MonoClock.nowMs()) / 1000.0)
    tickTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
      self?.tick()
    }
  }

  func keepTracking() {
    guard trip != nil, let engine else {
      end("dismissed")
      return
    }
    if state == .tracking { return }
    AlarmPlayer.shared.stop()
    autoSilenceTimer?.invalidate()
    autoSilenceTimer = nil
    notifications.removeAlarm()
    let now = MonoClock.nowMs()
    log?.event(now, lastStatus, "keep-tracking")
    state = .tracking
    lastTrigger = nil
    if let trip { TripStore.save(trip, .tracking) }
    handle(engine.rearm(now))
    refreshBackup(force: true)
  }

  /// Plays the alarm for about 5 s in the app and shows what its notification looks like.
  func testAlarm(strength: String, wakeStyle: String?) {
    prepare()
    if state == .ringing { return }
    let s = AlarmStrength.parse(strength)
    let style = WakeStyle.parse(wakeStyle)
    AlarmPlayer.shared.start(strength: s, style: style, maxSeconds: 5, ignoreSilentSwitch: notifications.criticalActive)
    notifications.showTest(strength: s, style: style)
  }

  // MARK: - Status for JS

  private func statusMap() -> [String: Any] {
    let s = lastStatus
    var map: [String: Any] = [
      "state": state.rawValue,
      "health": (s?.health.rawValue ?? GpsHealth.waiting.rawValue).lowercased(),
      "armed": s?.armed ?? true,
      "estimated": s?.estimated ?? false,
    ]
    if let trip { map["trip"] = trip.toMap() }
    if let v = s?.latitude { map["latitude"] = v }
    if let v = s?.longitude { map["longitude"] = v }
    if let v = s?.distanceM { map["distanceM"] = v }
    if let v = s?.etaSec { map["etaSec"] = v }
    if let v = s?.speedMps { map["speedMps"] = v }
    if let v = s?.accuracyM { map["accuracyM"] = v }
    if let v = s?.lastFixAgeMs { map["lastFixAgeMs"] = Double(v) }
    if let tier = s?.tier ?? engine?.plan.tier { map["tier"] = tier.name.lowercased() }
    if let lastTrigger { map["trigger"] = lastTrigger }
    return map
  }

  private func emitStatus() {
    let map = statusMap()
    setSnapshot(map)
    sink?("onStatus", map)
  }

  private func setSnapshot(_ map: [String: Any]?) {
    lock.lock()
    snapshot = map
    lock.unlock()
  }

  /// The running trip's status, or a saved trip nothing runs any more (state "stopped"). Any thread.
  func activeTripSnapshot() -> [String: Any]? {
    lock.lock()
    let current = snapshot
    lock.unlock()
    if let current { return current }
    guard let saved = TripStore.load() else { return nil }
    return ["trip": saved.trip.toMap(), "state": "stopped"]
  }

  /// The setup checklist (see SetupStatus in TripAlarm.types.ts). Any thread except main preferred.
  func setupStatus() -> [String: Any] {
    lock.lock()
    let status = authStatus
    let full = fullAccuracy
    lock.unlock()
    let settings = notifications.settingsNow()
    let authorized = status == .authorizedWhenInUse || status == .authorizedAlways
    let location = !authorized ? "none" : (full ? "precise" : "approximate")
    return [
      "location": location,
      "locationServices": CLLocationManager.locationServicesEnabled(),
      "notifications": settings.authorized,
      "fullScreenAlarm": settings.timeSensitive,
      "exactAlarms": true,
      "batteryUnrestricted": !ProcessInfo.processInfo.isLowPowerModeEnabled,
      "manufacturer": "Apple",
      "sdkInt": ProcessInfo.processInfo.operatingSystemVersion.majorVersion,
      "platform": "ios",
      "timeSensitive": settings.timeSensitive,
      "notificationSound": settings.sound,
      "criticalAlerts": settings.critical,
      "locationAlways": status == .authorizedAlways,
    ]
  }
}
