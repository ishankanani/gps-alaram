import XCTest
@testable import TripAlarmCore

// Port of engine-tests/.../SpeedEstimatorTest.kt.
final class SpeedEstimatorTests: XCTestCase {
  private func fixAt(_ northM: Double, _ timeMs: Int64, speed: Double? = nil, accuracy: Double = 10.0) -> Fix {
    let p = Geo.offset(TripSimulator.origin.lat, TripSimulator.origin.lon, northM: northM, eastM: 0.0)
    return Fix(lat: p.lat, lon: p.lon, accuracyM: accuracy, timeMs: timeMs, speedMps: speed)
  }

  func testNeedsSomeHistoryBeforeAnswering() {
    let e = SpeedEstimator(windowMs: 120_000, maxAccuracyM: 100.0)
    e.add(fixAt(0.0, 0))
    e.add(fixAt(100.0, 5_000))
    XCTAssertNil(e.speedMps())
  }

  func testUsesReportedDopplerSpeedWhenAvailable() {
    let e = SpeedEstimator(windowMs: 120_000, maxAccuracyM: 100.0)
    for i in 0...6 { e.add(fixAt(Double(i) * 50.0, Int64(i) * 5_000, speed: 20.0)) }
    XCTAssertEqual(e.speedMps()!, 20.0, accuracy: 0.001)
  }

  func testFallsBackToPathLengthOverTime() {
    let e = SpeedEstimator(windowMs: 120_000, maxAccuracyM: 100.0)
    for i in 0...6 { e.add(fixAt(Double(i) * 60.0, Int64(i) * 5_000)) }
    XCTAssertEqual(e.speedMps()!, 12.0, accuracy: 0.05)
  }

  func testIgnoresCoarseFixes() {
    let e = SpeedEstimator(windowMs: 120_000, maxAccuracyM: 100.0)
    e.add(fixAt(0.0, 0))
    e.add(fixAt(5_000.0, 10_000, accuracy: 1_500.0))
    e.add(fixAt(300.0, 30_000))
    XCTAssertEqual(e.speedMps()!, 10.0, accuracy: 0.05)
  }

  func testDropsSamplesOlderThanTheWindow() {
    let e = SpeedEstimator(windowMs: 60_000, maxAccuracyM: 100.0)
    for i in 0...12 { e.add(fixAt(Double(i) * 100.0, Int64(i) * 10_000, speed: 10.0)) }
    for i in 13...20 { e.add(fixAt(1_200.0 + Double(i - 12) * 300.0, Int64(i) * 10_000, speed: 30.0)) }
    XCTAssertEqual(e.speedMps()!, 30.0, accuracy: 0.001)
  }
}
