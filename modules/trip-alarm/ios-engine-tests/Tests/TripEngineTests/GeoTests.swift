import XCTest
@testable import TripAlarmCore

// Port of engine-tests/.../GeoTest.kt.
final class GeoTests: XCTestCase {
  func testHaversineMatchesAKnownLongDistance() {
    // Berlin Hbf to München Hbf is about 504 km in a straight line.
    let d = Geo.distanceM(52.5251, 13.3694, 48.1402, 11.5600)
    XCTAssertLessThan(abs(d - 504_000), 5_000, "got \(d)")
  }

  func testOffsetAndDistanceAgreeForShortHops() {
    let p = Geo.offset(49.14, 9.21, northM: 300.0, eastM: 400.0)
    XCTAssertEqual(Geo.distanceM(49.14, 9.21, p.lat, p.lon), 500.0, accuracy: 0.5)
  }

  func testSegmentDistanceIsPerpendicularWhenTheFootIsInside() {
    let a = Geo.offset(49.14, 9.21, northM: -1_000.0, eastM: 120.0)
    let b = Geo.offset(49.14, 9.21, northM: 1_000.0, eastM: 120.0)
    XCTAssertEqual(Geo.distanceToSegmentM(49.14, 9.21, a.lat, a.lon, b.lat, b.lon), 120.0, accuracy: 0.5)
  }

  func testSegmentDistanceFallsBackToTheNearestEnd() {
    let a = Geo.offset(49.14, 9.21, northM: 300.0, eastM: 0.0)
    let b = Geo.offset(49.14, 9.21, northM: 900.0, eastM: 0.0)
    XCTAssertEqual(Geo.distanceToSegmentM(49.14, 9.21, a.lat, a.lon, b.lat, b.lon), 300.0, accuracy: 0.5)
  }
}
