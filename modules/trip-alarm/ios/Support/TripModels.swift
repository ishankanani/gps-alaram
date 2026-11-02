import Foundation

// The iOS twin of android/.../TripStore.kt: the alarm options, the active trip (which survives the
// app being closed) and its store.

enum AlarmStrength: String {
  case gentle
  case normal
  case heavy

  static func parse(_ value: String?) -> AlarmStrength {
    AlarmStrength(rawValue: (value ?? "").lowercased()) ?? .normal
  }

  /// Loudness of the generated alarm sound (notification sounds play at the ringer volume).
  var amplitude: Double {
    switch self {
    case .gentle: return 0.45
    case .normal: return 0.75
    case .heavy: return 1.0
    }
  }

  /// In-app player volume we start at, ramping up to full over `rampSec` (like Android).
  var startVolume: Float {
    switch self {
    case .gentle: return 0.15
    case .normal: return 0.3
    case .heavy: return 0.6
    }
  }

  var rampSec: Double {
    switch self {
    case .gentle: return 30
    case .normal: return 20
    case .heavy: return 8
    }
  }
}

/// How the alarm wakes you. Unknown values (older or newer app versions) are the default.
enum WakeStyle: String {
  case soundVibration
  case vibrate
  case sound

  static func parse(_ value: String?) -> WakeStyle {
    guard let value else { return .soundVibration }
    return WakeStyle(rawValue: value) ?? .soundVibration
  }

  var playsSound: Bool { self != .vibrate }
  var vibrates: Bool { self != .sound }
}

enum TripState: String {
  case tracking
  case ringing
  case snoozed
}

/// Everything needed to run (or resume) a trip. Survives the app being closed via `TripStore`.
struct ActiveTrip: Codable {
  var id: String
  var label: String
  var latitude: Double
  var longitude: Double
  var radiusM: Double
  /// "ARRIVE" or "LEAVE", like the Kotlin enum names.
  var mode: String
  var minutesBefore: Int?
  var strength: String
  var wakeStyle: String?
  var useMiles: Bool
  var startedAtWallMs: Double
  /// A demo ride starts here and moves to the stop at `demoSpeedMps`, with simulated fixes.
  var demoFromLat: Double?
  var demoFromLon: Double?
  var demoSpeedMps: Double?

  var alarmMode: AlarmMode { mode == AlarmMode.leave.rawValue ? .leave : .arrive }
  var alarmStrength: AlarmStrength { AlarmStrength.parse(strength) }
  var style: WakeStyle { WakeStyle.parse(wakeStyle) }
  var isDemo: Bool { demoSpeedMps != nil && demoFromLat != nil && demoFromLon != nil }

  var config: TripConfig {
    TripConfig(targetLat: latitude, targetLon: longitude, radiusM: radiusM, mode: alarmMode, minutesBefore: minutesBefore)
  }

  /// The JS `ActiveTrip`.
  func toMap() -> [String: Any] {
    var map: [String: Any] = [
      "id": id,
      "label": label,
      "latitude": latitude,
      "longitude": longitude,
      "radiusM": radiusM,
      "mode": alarmMode == .leave ? "leave" : "arrive",
      "strength": alarmStrength.rawValue,
      "wakeStyle": style.rawValue,
      "useMiles": useMiles,
      "startedAt": startedAtWallMs,
      "demo": isDemo,
    ]
    map["minutesBefore"] = minutesBefore.map { $0 as Any } ?? NSNull()
    return map
  }
}

/// The active trip in UserDefaults, so a relaunched app knows a trip was running.
enum TripStore {
  private static let keyTrip = "stopwake.tripalarm.activeTrip"
  private static let keyState = "stopwake.tripalarm.state"

  static func save(_ trip: ActiveTrip, _ state: TripState) {
    guard let data = try? JSONEncoder().encode(trip) else { return }
    let defaults = UserDefaults.standard
    defaults.set(data, forKey: keyTrip)
    defaults.set(state.rawValue, forKey: keyState)
  }

  static func load() -> (trip: ActiveTrip, state: TripState)? {
    let defaults = UserDefaults.standard
    guard let data = defaults.data(forKey: keyTrip) else { return nil }
    guard let trip = try? JSONDecoder().decode(ActiveTrip.self, from: data) else {
      clear()
      return nil
    }
    let state = TripState(rawValue: defaults.string(forKey: keyState) ?? "") ?? .tracking
    return (trip, state)
  }

  static func clear() {
    let defaults = UserDefaults.standard
    defaults.removeObject(forKey: keyTrip)
    defaults.removeObject(forKey: keyState)
  }
}

/// A monotonic clock in milliseconds that keeps counting while the phone sleeps (the engine's clock).
enum MonoClock {
  static func nowMs() -> Int64 {
    #if canImport(Darwin)
    // CLOCK_MONOTONIC keeps counting during sleep on Apple platforms (CLOCK_UPTIME_RAW does not).
    return Int64(clock_gettime_nsec_np(CLOCK_MONOTONIC) / 1_000_000)
    #else
    var ts = timespec()
    clock_gettime(CLOCK_BOOTTIME, &ts)
    return Int64(ts.tv_sec) * 1000 + Int64(ts.tv_nsec) / 1_000_000
    #endif
  }
}
