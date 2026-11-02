import Foundation

// Swift port of android/.../engine/Models.kt. Pure Foundation: no UIKit, CoreLocation or Expo, so
// the engine builds and is unit tested on its own (modules/trip-alarm/ios-engine-tests).
// Keep it in step with the Kotlin engine: same rules, same numbers, same tests.

enum AlarmMode: String {
  case arrive = "ARRIVE"
  case leave = "LEAVE"
}

/// How far we are from needing to ring, which decides how hard we track. Ordered like Kotlin's ordinal.
enum Tier: Int {
  case far = 0
  case mid = 1
  case near = 2

  var name: String {
    switch self {
    case .far: return "FAR"
    case .mid: return "MID"
    case .near: return "NEAR"
    }
  }
}

enum GpsHealth: String {
  case waiting = "WAITING"
  case good = "GOOD"
  case weak = "WEAK"
  case lost = "LOST"
}

enum TriggerReason: String {
  /// A fix landed inside the radius.
  case arrived = "ARRIVED"
  /// The time-before-arrival threshold was reached.
  case eta = "ETA"
  /// Two consecutive fixes straddle the radius: we went through it between fixes.
  case passedThrough = "PASSED_THROUGH"
  /// We came close to the target and are now moving away (the pin is off the route).
  case closestPointPassed = "CLOSEST_POINT_PASSED"
  /// GPS went quiet and the dead-reckoning estimate says we have arrived.
  case estimated = "ESTIMATED"
  /// Leave mode: we are outside the perimeter.
  case leftArea = "LEFT_AREA"
}

struct TripConfig {
  var targetLat: Double
  var targetLon: Double
  var radiusM: Double
  var mode: AlarmMode = .arrive
  /// Arrive mode only: also ring this many minutes before arrival. Nil turns it off.
  var minutesBefore: Int? = nil
}

/// One location fix. `timeMs` must use a monotonic clock shared with the `nowMs` values passed to the engine.
struct Fix {
  var lat: Double
  var lon: Double
  var accuracyM: Double
  var timeMs: Int64
  var speedMps: Double? = nil
  var provider: String = "gps"
}

struct TrackingPlan: Equatable {
  var tier: Tier
  /// Requested interval for precise (GPS) fixes, or nil to leave GPS off.
  var gpsIntervalMs: Int64?
  /// Requested interval for coarse (cell/Wi-Fi) fixes.
  var networkIntervalMs: Int64
  /// Keep the CPU awake so callbacks and the watchdog run on time (Android); best accuracy on iOS.
  var holdWakeLock: Bool

  /// The interval at which we expect fixes to arrive.
  var expectedIntervalMs: Int64 { gpsIntervalMs ?? networkIntervalMs }
}

struct TripStatus {
  /// The last usable fix, or with `estimated` the dead-reckoning guess while GPS is lost.
  var latitude: Double?
  var longitude: Double?
  var distanceM: Double?
  var etaSec: Double?
  var speedMps: Double?
  var accuracyM: Double?
  var lastFixAgeMs: Int64?
  var health: GpsHealth
  var tier: Tier
  /// Leave mode: false until the first fix inside the perimeter. Always true for arrive.
  var armed: Bool
  var closestDistanceM: Double?
  /// When the dead-reckoning alarm would fire if no new fix arrives (monotonic ms).
  var fallbackAtMs: Int64?
  var trigger: TriggerReason?
  /// Position, distance and ETA are estimated from the last speed: no GPS right now.
  var estimated: Bool = false
}

struct EngineUpdate {
  var status: TripStatus
  /// The tracking plan changed and location requests should be re-issued.
  var planChanged: Bool
  /// Set exactly once, on the update that decided to ring.
  var trigger: TriggerReason?
  /// GPS just went quiet for longer than the tier allows.
  var signalLost: Bool
  /// A usable fix arrived after a signal-lost period.
  var signalRecovered: Bool
}

struct EngineParams {
  /// Rolling window for the average-speed estimate.
  var speedWindowMs: Int64 = 120_000
  /// Fixes worse than this are not used for speed (network fixes jump around).
  var speedMaxAccuracyM: Double = 100.0
  /// Ignore fixes worse than this entirely.
  var maxUsableAccuracyM: Double = 5_000.0
  /// A fix must be at least this good (or within half the radius) to ring the alarm.
  var triggerAccuracyM: Double = 250.0
  /// Coarser fixes still count for the time-before-arrival trigger, since the error is small in time.
  var etaTriggerAccuracyM: Double = 1_000.0
  /// Fixes better than this keep the GPS health "good".
  var goodAccuracyM: Double = 100.0
  /// Fixes worse than this do not reset the signal-lost watchdog.
  var watchdogAccuracyM: Double = 500.0
  /// Assumed speed when we have no estimate yet (a fast regional train).
  var unknownSpeedMps: Double = 33.0
  /// Below this the vehicle counts as stopped: no ETA, no dead reckoning.
  var minMovingSpeedMps: Double = 1.0
  /// Fire the dead-reckoning alarm this fraction of the way to the estimated arrival.
  var fallbackSafety: Double = 0.85
  var nearDistanceM: Double = 5_000.0
  var midDistanceM: Double = 20_000.0
  var nearEtaMarginSec: Double = 15 * 60.0
  var midEtaMarginSec: Double = 30 * 60.0
  /// Leave the closer tier only when the distance is this much past the boundary.
  var tierHysteresis: Double = 1.2
  var farGpsIntervalMs: Int64 = 120_000
  var farNetworkIntervalMs: Int64 = 60_000
  var midIntervalMs: Int64 = 30_000
  var nearGpsIntervalMs: Int64 = 5_000
  var nearNetworkIntervalMs: Int64 = 10_000
  /// Never call the signal lost sooner than this after the last fix.
  var minLostAfterMs: Int64 = 60_000
}

/// Kotlin's Double.toLong(): truncates, NaN becomes 0, infinities clamp. Swift's Int64(_:) would trap.
@inline(__always)
func engineToInt64(_ value: Double) -> Int64 {
  if value.isNaN { return 0 }
  if value >= 9.2e18 { return Int64.max }
  if value <= -9.2e18 { return Int64.min }
  return Int64(value)
}
