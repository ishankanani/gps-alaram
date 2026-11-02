import Foundation

/// Average ground speed over a rolling window (port of SpeedEstimator.kt).
///
/// Prefers the Doppler speed the GPS reports, which is accurate and immune to position jitter.
/// Falls back to path length over time when fixes carry no speed.
final class SpeedEstimator {
  private let windowMs: Int64
  private let maxAccuracyM: Double
  private var samples: [Fix] = []

  /// Widens the window so slow fix rates (far tier) still leave a few samples in it.
  var minWindowMs: Int64 = 0

  init(windowMs: Int64, maxAccuracyM: Double) {
    self.windowMs = windowMs
    self.maxAccuracyM = maxAccuracyM
  }

  func add(_ fix: Fix) {
    if fix.accuracyM > maxAccuracyM { return }
    samples.append(fix)
    let window = max(windowMs, minWindowMs)
    while samples.count > 2, fix.timeMs - samples[0].timeMs > window {
      samples.removeFirst()
    }
  }

  /// Average speed in m/s over the window, or nil when there is not enough recent data.
  func speedMps() -> Double? { average(samples) }

  /// Average over just the last `recentMs`. After a station stop the window average lags behind the
  /// train pulling away; dead reckoning uses whichever is higher so it errs towards ringing early.
  func recentSpeedMps(recentMs: Int64 = 20_000) -> Double? {
    guard let last = samples.last else { return nil }
    return average(samples.filter { last.timeMs - $0.timeMs <= recentMs }, minSpanMs: 8_000)
  }

  /// The Doppler speed of the latest accurate fix: the most current number we have.
  func latestReportedMps() -> Double? {
    guard let speed = samples.last?.speedMps, speed >= 0 else { return nil }
    return speed
  }

  private func average(_ window: [Fix], minSpanMs: Int64 = 15_000) -> Double? {
    if window.count < 2 { return nil }
    let spanMs = window[window.count - 1].timeMs - window[0].timeMs
    if spanMs < minSpanMs { return nil }

    let reported = window.compactMap { $0.speedMps }.filter { $0 >= 0 }
    if reported.count >= 3, reported.count * 2 >= window.count {
      return reported.reduce(0, +) / Double(reported.count)
    }

    var path = 0.0
    for i in 1..<window.count {
      let a = window[i - 1]
      let b = window[i]
      path += Geo.distanceM(a.lat, a.lon, b.lat, b.lon)
    }
    return path / (Double(spanMs) / 1000.0)
  }
}
