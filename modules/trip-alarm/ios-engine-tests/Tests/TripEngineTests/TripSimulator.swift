import Foundation
@testable import TripAlarmCore

// Port of engine-tests/.../TripSimulator.kt: synthetic trips with GPS noise, stops and tunnels.

enum Segment {
  case move(distanceM: Double, speedMps: Double)
  case stop(seconds: Int)
}

/// A trip along a straight line from `TripSimulator.origin` heading north-east. The stop sits
/// `targetAlongM` metres along the line, pushed `targetOffsetM` metres sideways (a pin off the track).
struct Scenario {
  var segments: [Segment]
  var targetAlongM: Double
  var radiusM: Double
  var targetOffsetM: Double = 0.0
  var mode: AlarmMode = .arrive
  var minutesBefore: Int? = nil
  var gpsAccuracyM: Double = 10.0
  var networkAccuracyM: Double = 800.0
  /// True while the GPS cannot see the sky, given the true position along the route.
  var gpsOutage: (Double) -> Bool = { _ in false }
  var networkOutage: (Double) -> Bool = { _ in false }
  var seed: Int64 = 7
}

struct SimResult {
  var trigger: TriggerReason?
  var triggerSec: Int?
  /// True distance along the route when the alarm rang.
  var alongAtTriggerM: Double?
  /// Route distance still to go to the stop when the alarm rang (negative: already passed).
  var remainingM: Double?
  var tiers: [Tier]
  var gpsIntervalsMs: [Int64?]
  var signalLostCount: Int
}

enum TripSimulator {
  static let origin = (lat: 49.1427, lon: 9.2109) // Heilbronn Hbf
  private static let headingRad = 0.7 // roughly north-east
  private static let startMs: Int64 = 1_000_000

  static func pointAlong(_ alongM: Double, sideM: Double = 0.0) -> (lat: Double, lon: Double) {
    let north = alongM * cos(headingRad) - sideM * sin(headingRad)
    let east = alongM * sin(headingRad) + sideM * cos(headingRad)
    return Geo.offset(origin.lat, origin.lon, northM: north, eastM: east)
  }

  static func run(_ s: Scenario, extraSeconds: Int = 900) -> SimResult {
    let target = pointAlong(s.targetAlongM, sideM: s.targetOffsetM)
    let engine = TripEngine(
      config: TripConfig(targetLat: target.lat, targetLon: target.lon, radiusM: s.radiusM, mode: s.mode, minutesBefore: s.minutesBefore),
      startedAtMs: startMs
    )
    var rnd = JavaRandom(s.seed)
    let line = timeline(s.segments)
    let endSec = line.count + extraSeconds

    var lastGpsSec = -1_000_000
    var lastNetworkSec = -1_000_000
    var tiers = [engine.plan.tier]
    var gpsIntervals: [Int64?] = [engine.plan.gpsIntervalMs]
    var lostCount = 0

    func record(_ u: EngineUpdate) {
      if u.signalLost { lostCount += 1 }
      if u.planChanged {
        tiers.append(u.status.tier)
        gpsIntervals.append(engine.plan.gpsIntervalMs)
      }
    }

    for t in 0..<endSec {
      let (along, speed) = t < line.count ? line[t] : (line[line.count - 1].0, 0.0)
      let nowMs = startMs + Int64(t) * 1000
      let plan = engine.plan

      if let gpsInterval = plan.gpsIntervalMs {
        let gpsEvery = Int(gpsInterval / 1000)
        if t - lastGpsSec >= gpsEvery && !s.gpsOutage(along) {
          lastGpsSec = t
          // Same evaluation order as Kotlin: the position noise first, then the speed noise.
          let fix = noisyFix(along, s.gpsAccuracyM, nowMs, &rnd, speedBase: speed, provider: "gps")
          record(engine.onFix(fix))
        }
      }
      let networkEvery = Int(plan.networkIntervalMs / 1000)
      if t - lastNetworkSec >= networkEvery && !s.networkOutage(along) {
        lastNetworkSec = t
        record(engine.onFix(noisyFix(along, s.networkAccuracyM, nowMs, &rnd, speedBase: nil, provider: "network")))
      }
      if let checkAt = engine.nextCheckAtMs(), nowMs >= checkAt { record(engine.onTick(nowMs)) }

      if let trigger = engine.trigger {
        return SimResult(
          trigger: trigger, triggerSec: t, alongAtTriggerM: along, remainingM: s.targetAlongM - along,
          tiers: tiers, gpsIntervalsMs: gpsIntervals, signalLostCount: lostCount
        )
      }
    }
    return SimResult(trigger: nil, triggerSec: nil, alongAtTriggerM: nil, remainingM: nil, tiers: tiers, gpsIntervalsMs: gpsIntervals, signalLostCount: lostCount)
  }

  /// True (along-route distance, speed) for every second of the trip.
  private static func timeline(_ segments: [Segment]) -> [(Double, Double)] {
    var out: [(Double, Double)] = []
    var along = 0.0
    for seg in segments {
      switch seg {
      case let .stop(seconds):
        for _ in 0..<seconds { out.append((along, 0.0)) }
      case let .move(distanceM, speedMps):
        let end = along + distanceM
        while along < end {
          out.append((along, speedMps))
          along = min(end, along + speedMps)
        }
      }
    }
    out.append((along, 0.0))
    return out
  }

  /// Kotlin evaluates `speed + rnd.nextGaussian() * 0.3` at the call site, before the position
  /// noise inside noisyFix. `speedBase` non-nil reproduces that order exactly.
  private static func noisyFix(
    _ along: Double, _ accuracyM: Double, _ nowMs: Int64, _ rnd: inout JavaRandom,
    speedBase: Double?, provider: String
  ) -> Fix {
    var reported: Double?
    if let base = speedBase {
      reported = base + rnd.nextGaussian() * 0.3
    }
    let sigma = accuracyM / 1.5
    let alongNoise = rnd.nextGaussian() * sigma
    let sideNoise = rnd.nextGaussian() * sigma
    let p = pointAlong(along + alongNoise, sideM: sideNoise)
    return Fix(lat: p.lat, lon: p.lon, accuracyM: accuracyM, timeMs: nowMs, speedMps: reported.map { max($0, 0.0) }, provider: provider)
  }
}
