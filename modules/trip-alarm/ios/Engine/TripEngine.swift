import Foundation

/// Decides when to ring and how hard to track. Pure logic: no CoreLocation, no clocks, no I/O.
/// A faithful port of android/.../engine/TripEngine.kt; change both together.
///
/// The controller feeds it every location fix (`onFix`) and calls `onTick` at `nextCheckAtMs()` so
/// the watchdog can run when fixes stop arriving. Every time is in the same monotonic clock.
///
/// Arrive mode rings on the first of:
/// - a fix inside the radius,
/// - two consecutive fixes whose straight line passes through the radius (fast trains),
/// - the time-before-arrival threshold, when one is set,
/// - coming close and then moving away (the pin is off the route, so we never enter the radius),
/// - GPS going quiet past the time dead reckoning says we would arrive.
final class TripEngine {
  /// Providers may hand out a cached fix taken shortly before the trip started.
  static let staleFixGraceMs: Int64 = 30_000
  static let bootstrapMs: Int64 = 60_000
  static let leaveNearM = 1_000.0
  static let leaveMidM = 5_000.0

  let config: TripConfig
  private let startedAtMs: Int64
  private let params: EngineParams

  private let speedEstimator: SpeedEstimator
  // Coarse fixes may ring a big circle (a 5 km radius on cell towers alone), but only if they are
  // accurate to half the radius, so a noisy fix cannot ring much more than one radius early.
  private let triggerAccuracyM: Double
  private let approachZoneM: Double
  private let recedeMarginM: Double

  private var lastFix: Fix?
  private var lastTriggerFix: Fix?
  private var lastGoodFixMs: Int64?
  private var lastWatchdogFixMs: Int64?
  private var distanceM: Double?
  private var initialDistanceM: Double?
  private var closestM = Double.infinity
  private var recedingCount = 0
  private var armed: Bool
  private var outsideCount = 0
  private var lost = false
  private var fallbackAtMs: Int64?
  private var bootstrapping = true

  private(set) var trigger: TriggerReason?

  /// Starts in the near tier so the first fix and the first speed estimate come quickly. The first
  /// real decision is made once speed is known (or after `bootstrapMs`), without hysteresis.
  private(set) var plan: TrackingPlan

  init(config: TripConfig, startedAtMs: Int64, params: EngineParams = EngineParams()) {
    self.config = config
    self.startedAtMs = startedAtMs
    self.params = params
    speedEstimator = SpeedEstimator(windowMs: params.speedWindowMs, maxAccuracyM: params.speedMaxAccuracyM)
    triggerAccuracyM = max(params.triggerAccuracyM, config.radiusM * 0.5)
    approachZoneM = config.radiusM + max(1_000.0, config.radiusM)
    recedeMarginM = max(250.0, config.radiusM * 0.5)
    armed = config.mode == .arrive
    plan = TripEngine.planFor(.near, params)
  }

  func onFix(_ fix: Fix) -> EngineUpdate {
    let prev = lastFix
    let usable = !fix.accuracyM.isNaN &&
      fix.accuracyM <= params.maxUsableAccuracyM &&
      fix.timeMs >= startedAtMs - TripEngine.staleFixGraceMs &&
      (prev == nil || fix.timeMs > prev!.timeMs)
    if !usable { return update(prev?.timeMs ?? fix.timeMs) }

    lastFix = fix
    let d = Geo.distanceM(fix.lat, fix.lon, config.targetLat, config.targetLon)
    distanceM = d
    speedEstimator.add(fix)
    if fix.accuracyM <= params.goodAccuracyM { lastGoodFixMs = fix.timeMs }

    var recovered = false
    if fix.accuracyM <= params.watchdogAccuracyM {
      lastWatchdogFixMs = fix.timeMs
      if lost {
        lost = false
        recovered = true
      }
    }

    var newTrigger: TriggerReason?
    if trigger == nil {
      switch config.mode {
      case .arrive: newTrigger = evaluateArrive(fix, d)
      case .leave: newTrigger = evaluateLeave(fix, d)
      }
      if fix.accuracyM <= triggerAccuracyM { lastTriggerFix = fix }
    }
    if let newTrigger { trigger = newTrigger }

    let planChanged = updatePlan(d, fix.timeMs)
    fallbackAtMs = trigger == nil ? computeFallback() : nil

    return EngineUpdate(
      status: status(fix.timeMs),
      planChanged: planChanged,
      trigger: newTrigger,
      signalLost: false,
      signalRecovered: recovered
    )
  }

  /// Runs the watchdog. Call it at `nextCheckAtMs()`, or any time; extra calls are harmless.
  func onTick(_ nowMs: Int64) -> EngineUpdate {
    if trigger != nil { return update(nowMs) }

    var signalLost = false
    let base = lastWatchdogFixMs ?? startedAtMs
    if !lost && nowMs - base >= lostAfterMs() {
      lost = true
      signalLost = true
    }

    var newTrigger: TriggerReason?
    if let fallbackAt = fallbackAtMs, nowMs >= fallbackAt {
      newTrigger = .estimated
      trigger = newTrigger
      fallbackAtMs = nil
    }

    return EngineUpdate(
      status: status(nowMs),
      planChanged: false,
      trigger: newTrigger,
      signalLost: signalLost,
      signalRecovered: false
    )
  }

  /// "Not there yet, keep tracking": clears an uncertain alarm (closest point passed, or estimated
  /// while GPS was out) and starts watching again from the current position.
  func rearm(_ nowMs: Int64) -> EngineUpdate {
    trigger = nil
    fallbackAtMs = nil
    lastTriggerFix = nil
    initialDistanceM = distanceM
    closestM = distanceM ?? Double.infinity
    recedingCount = 0
    // Restart the watchdog clock so a long-lost signal does not ring again immediately.
    lastWatchdogFixMs = nowMs
    lost = false
    return update(nowMs)
  }

  /// When `onTick` next has something to decide, or nil when nothing is pending.
  func nextCheckAtMs() -> Int64? {
    if trigger != nil { return nil }
    let lostAt: Int64? = lost ? nil : (lastWatchdogFixMs ?? startedAtMs) + lostAfterMs()
    return [lostAt, fallbackAtMs].compactMap { $0 }.min()
  }

  func status(_ nowMs: Int64) -> TripStatus {
    let speed = speedEstimator.speedMps()
    let currentHealth = health(nowMs)
    let guess = currentHealth == .lost ? estimate(nowMs) : nil
    let d = guess?.distanceM ?? distanceM
    return TripStatus(
      latitude: guess?.lat ?? lastFix?.lat,
      longitude: guess?.lon ?? lastFix?.lon,
      distanceM: d,
      etaSec: d.flatMap { etaSec($0, speed) },
      speedMps: speed,
      accuracyM: lastFix?.accuracyM,
      lastFixAgeMs: lastFix.map { max(0, nowMs - $0.timeMs) },
      health: currentHealth,
      tier: plan.tier,
      armed: armed,
      closestDistanceM: closestM.isFinite ? closestM : nil,
      fallbackAtMs: fallbackAtMs,
      trigger: trigger,
      estimated: guess != nil
    )
  }

  private struct Estimate {
    let lat: Double
    let lon: Double
    let distanceM: Double
  }

  /// Where we probably are without GPS: from the last fix, towards the stop at the average speed.
  /// Only for showing progress; the alarm itself uses `computeFallback`, which errs towards early.
  private func estimate(_ nowMs: Int64) -> Estimate? {
    if config.mode != .arrive { return nil }
    guard let base = lastFix, let speed = speedEstimator.speedMps() else { return nil }
    if speed < params.minMovingSpeedMps { return nil }
    let fromBase = Geo.distanceM(base.lat, base.lon, config.targetLat, config.targetLon)
    if fromBase <= 0.0 { return nil }
    let travelled = min(fromBase, speed * Double(max(0, nowMs - base.timeMs)) / 1000.0)
    let f = travelled / fromBase
    return Estimate(
      lat: base.lat + (config.targetLat - base.lat) * f,
      lon: base.lon + (config.targetLon - base.lon) * f,
      distanceM: fromBase - travelled
    )
  }

  private func evaluateArrive(_ fix: Fix, _ d: Double) -> TriggerReason? {
    let radius = config.radiusM
    if fix.accuracyM <= triggerAccuracyM {
      if d <= radius { return .arrived }

      if let prev = lastTriggerFix {
        let passM = Geo.distanceToSegmentM(config.targetLat, config.targetLon, prev.lat, prev.lon, fix.lat, fix.lon)
        if passM <= radius { return .passedThrough }
      }

      // Compare with the accuracy taken into account, so one lucky coarse fix cannot fake an
      // approach: closest is the farthest we could have been, receding needs the nearest we could
      // be now to be clearly beyond it.
      let initial: Double
      if let known = initialDistanceM {
        initial = known
      } else {
        initial = d
        initialDistanceM = d
      }
      if d + fix.accuracyM < closestM {
        closestM = d + fix.accuracyM
        recedingCount = 0
      } else if d - fix.accuracyM >= closestM + recedeMarginM {
        recedingCount += 1
      }
      let approached = initial - closestM >= max(500.0, radius)
      if approached && closestM <= approachZoneM && recedingCount >= 2 {
        return .closestPointPassed
      }
    }

    if let minutes = config.minutesBefore, let speed = speedEstimator.speedMps() {
      // A coarse fix is fine on a fast train but minutes off on a slow bus: only accept fixes whose
      // stated error is worth at most half a minute of travel (real errors run larger).
      let maxAccuracy = min(params.etaTriggerAccuracyM, max(triggerAccuracyM, speed * 30))
      if fix.accuracyM <= maxAccuracy, let eta = etaSec(d, speed), eta <= Double(minutes) * 60.0 {
        return .eta
      }
    }
    return nil
  }

  private func evaluateLeave(_ fix: Fix, _ d: Double) -> TriggerReason? {
    if fix.accuracyM > triggerAccuracyM { return nil }
    let radius = config.radiusM
    if !armed {
      if d <= radius { armed = true }
      return nil
    }
    if d <= radius {
      outsideCount = 0
      return nil
    }
    outsideCount += 1
    let clearlyOutside = d - radius >= max(fix.accuracyM * 0.5, 10.0)
    return (clearlyOutside || outsideCount >= 3) ? .leftArea : nil
  }

  private func updatePlan(_ d: Double, _ nowMs: Int64) -> Bool {
    let speed = fastestSpeed()
    let firstDecision = bootstrapping
    if bootstrapping {
      if speed == nil && nowMs - startedAtMs < TripEngine.bootstrapMs { return false }
      bootstrapping = false
    }
    let planningSpeed = speed.map { max($0 * 1.25, params.minMovingSpeedMps) } ?? params.unknownSpeedMps
    let entering = tierFor(d, planningSpeed, 1.0)
    let leaving = tierFor(d, planningSpeed, params.tierHysteresis)
    let current = plan.tier
    let next: Tier
    if firstDecision {
      next = entering
    } else if entering.rawValue > current.rawValue {
      next = entering
    } else if leaving.rawValue < current.rawValue {
      next = leaving
    } else {
      next = current
    }
    if next == current { return false }
    plan = TripEngine.planFor(next, params)
    speedEstimator.minWindowMs = plan.expectedIntervalMs * 3
    return true
  }

  /// Thresholds are multiplied by `scale`, so a scale above 1 gives the hysteresis band.
  private func tierFor(_ d: Double, _ planningSpeedMps: Double, _ scale: Double) -> Tier {
    let radius = config.radiusM
    switch config.mode {
    case .arrive:
      let marginSec = Double(config.minutesBefore ?? 0) * 60.0
      if d <= (params.nearDistanceM + radius) * scale ||
        d <= (marginSec + params.nearEtaMarginSec) * planningSpeedMps * scale {
        return .near
      }
      if d <= (params.midDistanceM + radius) * scale ||
        d <= (marginSec + params.midEtaMarginSec) * planningSpeedMps * scale {
        return .mid
      }
      return .far
    case .leave:
      let toBoundary = abs(d - radius)
      if toBoundary <= TripEngine.leaveNearM * scale || toBoundary <= 5 * 60.0 * planningSpeedMps * scale {
        return .near
      }
      if toBoundary <= TripEngine.leaveMidM * scale || toBoundary <= 15 * 60.0 * planningSpeedMps * scale {
        return .mid
      }
      return .far
    }
  }

  private static func planFor(_ tier: Tier, _ params: EngineParams) -> TrackingPlan {
    switch tier {
    case .far:
      return TrackingPlan(tier: tier, gpsIntervalMs: params.farGpsIntervalMs, networkIntervalMs: params.farNetworkIntervalMs, holdWakeLock: false)
    case .mid:
      return TrackingPlan(tier: tier, gpsIntervalMs: params.midIntervalMs, networkIntervalMs: params.midIntervalMs, holdWakeLock: false)
    case .near:
      return TrackingPlan(tier: tier, gpsIntervalMs: params.nearGpsIntervalMs, networkIntervalMs: params.nearNetworkIntervalMs, holdWakeLock: true)
    }
  }

  /// Dead reckoning from the last fix good enough to ring on: when would we reach the trigger if we
  /// kept the average speed? Coarse fixes do not move this, so a cell tower that keeps reporting the
  /// same spot in a tunnel cannot postpone the alarm forever.
  private func computeFallback() -> Int64? {
    if config.mode != .arrive { return nil }
    guard let base = lastTriggerFix, let speed = fastestSpeed() else { return nil }
    if speed < params.minMovingSpeedMps { return nil }

    let d = Geo.distanceM(base.lat, base.lon, config.targetLat, config.targetLon)
    var remainingM = d - config.radiusM
    if let minutes = config.minutesBefore {
      remainingM = min(remainingM, d - speed * Double(minutes) * 60.0)
    }
    let untilTriggerMs = engineToInt64(max(0.0, remainingM) / speed * params.fallbackSafety * 1000)
    // Give the next fix a fair chance to arrive (two intervals), but no more: at 190 km/h a minute
    // of waiting is 3 km, well past the stop.
    return base.timeMs + max(untilTriggerMs, plan.expectedIntervalMs * 2)
  }

  /// The highest of the window average, the last few seconds and the latest Doppler reading. A train
  /// pulling out of a station is faster than any average says: err towards ringing early.
  private func fastestSpeed() -> Double? {
    guard let average = speedEstimator.speedMps() else { return nil }
    return max(average, speedEstimator.recentSpeedMps() ?? 0.0, speedEstimator.latestReportedMps() ?? 0.0)
  }

  private func lostAfterMs() -> Int64 { max(params.minLostAfterMs, plan.expectedIntervalMs * 2 + 30_000) }

  private func health(_ nowMs: Int64) -> GpsHealth {
    guard let base = lastWatchdogFixMs else {
      return nowMs - startedAtMs >= lostAfterMs() ? .lost : .waiting
    }
    if lost || nowMs - base >= lostAfterMs() { return .lost }
    if let good = lastGoodFixMs, nowMs - good <= plan.expectedIntervalMs * 2 + 10_000 { return .good }
    return .weak
  }

  private func etaSec(_ d: Double, _ speedMps: Double?) -> Double? {
    guard let speedMps, speedMps >= params.minMovingSpeedMps else { return nil }
    return d / speedMps
  }

  private func update(_ nowMs: Int64) -> EngineUpdate {
    EngineUpdate(status: status(nowMs), planChanged: false, trigger: nil, signalLost: false, signalRecovered: false)
  }
}
