import XCTest
@testable import TripAlarmCore

// Port of engine-tests/.../TripEngineTest.kt: the same scenarios, seeds and bounds. A missed stop
// seen on a real trip becomes a scenario in both files.
final class TripEngineTests: XCTestCase {
  private func move(_ km: Double, _ kmh: Double) -> Segment { .move(distanceM: km * 1000, speedMps: kmh / 3.6) }

  private func config(_ target: (lat: Double, lon: Double), _ radiusM: Double) -> TripConfig {
    TripConfig(targetLat: target.lat, targetLon: target.lon, radiusM: radiusM)
  }

  func testRegionalTrainRingsInsideTheRadiusBeforeTheStop() {
    let r = TripSimulator.run(Scenario(segments: [move(45.0, 120.0)], targetAlongM: 40_000.0, radiusM: 500.0))
    XCTAssertNotNil(r.trigger)
    XCTAssertTrue([.arrived, .passedThrough].contains(r.trigger!), "\(String(describing: r.trigger))")
    let remaining = r.remainingM!
    XCTAssertTrue((0.0...700.0).contains(remaining), "rang with \(remaining) m to go")
  }

  func testHighSpeedTrainRingsEvenWhenItCrossesTheRadiusBetweenTwoFixes() {
    // 300 km/h covers 415 m between 5 s fixes, more than the 300 m wide circle.
    let r = TripSimulator.run(Scenario(segments: [move(60.0, 300.0)], targetAlongM: 50_000.0, radiusM: 150.0))
    XCTAssertTrue([.arrived, .passedThrough].contains(r.trigger!), "\(String(describing: r.trigger))")
    XCTAssertGreaterThan(r.remainingM!, -450.0, "rang \(-r.remainingM!) m after the stop")
  }

  func testTimeBeforeArrivalRingsAboutThatManyMinutesOut() {
    let speed = 50 / 3.6
    let r = TripSimulator.run(Scenario(segments: [move(30.0, 50.0)], targetAlongM: 28_000.0, radiusM: 300.0, minutesBefore: 10))
    XCTAssertEqual(r.trigger, .eta)
    let minutesLeft = r.remainingM! / speed / 60
    XCTAssertTrue((9.0...10.5).contains(minutesLeft), "rang \(minutesLeft) min before arrival")
  }

  func testATunnelBeforeTheStopFallsBackToDeadReckoningAndStillRingsEarly() {
    let r = TripSimulator.run(
      Scenario(
        segments: [move(35.0, 110.0)], targetAlongM: 30_000.0, radiusM: 400.0,
        gpsOutage: { $0 > 22_000 }, networkOutage: { $0 > 22_000 }
      )
    )
    XCTAssertEqual(r.trigger, .estimated)
    let remaining = r.remainingM!
    XCTAssertTrue((0.0...8_000.0).contains(remaining), "rang with \(remaining) m to go")
    XCTAssertGreaterThanOrEqual(r.signalLostCount, 1)
  }

  func testATunnelWithOnlyCoarseCellFixesStillRingsByDeadReckoning() {
    let r = TripSimulator.run(
      Scenario(
        segments: [move(35.0, 110.0)], targetAlongM: 30_000.0, radiusM: 300.0,
        networkAccuracyM: 1_500.0, gpsOutage: { $0 > 24_000 }
      )
    )
    XCTAssertNotNil(r.trigger)
    XCTAssertGreaterThanOrEqual(r.remainingM!, 0.0, "rang \(-r.remainingM!) m after the stop")
  }

  func testAPinPlacedOffTheTrackRingsOnceWeStartMovingAway() {
    let r = TripSimulator.run(Scenario(segments: [move(30.0, 100.0)], targetAlongM: 20_000.0, radiusM: 300.0, targetOffsetM: 900.0))
    XCTAssertEqual(r.trigger, .closestPointPassed)
    let pastClosest = -r.remainingM!
    XCTAssertTrue((0.0...1_500.0).contains(pastClosest), "rang \(pastClosest) m past the closest point")
  }

  func testWaitingAtThePlatformDoesNotRingOrInventASpeed() {
    let r = TripSimulator.run(
      Scenario(segments: [.stop(seconds: 600), move(12.0, 80.0)], targetAlongM: 10_000.0, radiusM: 500.0, gpsAccuracyM: 15.0)
    )
    XCTAssertGreaterThan(r.triggerSec!, 600, "rang during the wait at \(r.triggerSec!) s")
    XCTAssertTrue((0.0...700.0).contains(r.remainingM!))
  }

  func testTrackingStepsFromFarToNearAsTheStopApproaches() {
    let r = TripSimulator.run(Scenario(segments: [move(70.0, 90.0)], targetAlongM: 65_000.0, radiusM: 500.0))
    XCTAssertNotNil(r.trigger)
    // Starts near to get a quick first fix, drops to far, then steps back in.
    XCTAssertEqual(r.tiers, [.near, .far, .mid, .near])
    XCTAssertEqual(r.gpsIntervalsMs, [5_000, 120_000, 30_000, 5_000])
  }

  func testWakeMeMinutesBeforePullsHighAccuracyTrackingInEarlier() {
    let r = TripSimulator.run(Scenario(segments: [move(80.0, 160.0)], targetAlongM: 75_000.0, radiusM: 500.0, minutesBefore: 20))
    XCTAssertEqual(r.trigger, .eta)
    let minutesLeft = r.remainingM! / (160 / 3.6) / 60
    XCTAssertTrue((18.5...20.5).contains(minutesLeft), "rang \(minutesLeft) min before arrival")
  }

  func testACoarseCellFixLandingInsideTheRadiusDoesNotRing() {
    let engine = TripEngine(config: config(TripSimulator.pointAlong(10_000.0), 300.0), startedAtMs: 0)
    let near = TripSimulator.pointAlong(9_900.0)
    let u = engine.onFix(Fix(lat: near.lat, lon: near.lon, accuracyM: 1_500.0, timeMs: 1_000, provider: "network"))
    XCTAssertNil(u.trigger)
  }

  func testAFixCachedFromBeforeTheTripIsIgnored() {
    let target = TripSimulator.pointAlong(10_000.0)
    let engine = TripEngine(config: config(target, 300.0), startedAtMs: 600_000)
    let u = engine.onFix(Fix(lat: target.lat, lon: target.lon, accuracyM: 10.0, timeMs: 100_000))
    XCTAssertNil(u.trigger)
    XCTAssertNil(u.status.distanceM)
  }

  func testSignalLostIsReportedOnceAndRecoveryIsReportedOnTheNextFix() {
    let engine = TripEngine(config: config(TripSimulator.pointAlong(10_000.0), 300.0), startedAtMs: 0)
    let start = TripSimulator.pointAlong(0.0)
    _ = engine.onFix(Fix(lat: start.lat, lon: start.lon, accuracyM: 10.0, timeMs: 1_000))
    let checkAt = engine.nextCheckAtMs()!
    XCTAssertEqual(checkAt, 61_000)
    XCTAssertFalse(engine.onTick(checkAt - 1).signalLost)
    let lost = engine.onTick(checkAt)
    XCTAssertTrue(lost.signalLost)
    XCTAssertEqual(lost.status.health, .lost)
    XCTAssertFalse(engine.onTick(checkAt + 5_000).signalLost)
    let back = engine.onFix(Fix(lat: start.lat, lon: start.lon, accuracyM: 10.0, timeMs: checkAt + 6_000))
    XCTAssertTrue(back.signalRecovered)
    XCTAssertEqual(back.status.health, .good)
  }

  func testWithoutGpsThePositionIsEstimatedTowardsTheStopAtTheLastSpeed() {
    let target = TripSimulator.pointAlong(10_000.0)
    let engine = TripEngine(config: config(target, 300.0), startedAtMs: 0)
    var t: Int64 = 0
    var along = 0.0
    // A minute at 20 m/s with GPS, then into a tunnel at 1.2 km.
    while along <= 1_200.0 {
      let p = TripSimulator.pointAlong(along)
      let s = engine.onFix(Fix(lat: p.lat, lon: p.lon, accuracyM: 8.0, timeMs: t, speedMps: 20.0)).status
      XCTAssertFalse(s.estimated)
      along += 100.0
      t += 5_000
    }
    let lastFixAt = t - 5_000
    // Before the signal counts as lost, the map keeps the last fix.
    XCTAssertFalse(engine.status(lastFixAt + 30_000).estimated)
    let lostAt = engine.nextCheckAtMs()!
    _ = engine.onTick(lostAt)
    let s = engine.status(lostAt + 20_000)
    XCTAssertTrue(s.estimated)
    let expected = 10_000.0 - 1_200.0 - 20.0 * Double(lostAt + 20_000 - lastFixAt) / 1000.0
    XCTAssertLessThan(abs(s.distanceM! - expected), 50.0, "estimated \(s.distanceM!), expected \(expected)")
    // The estimate lies on the way to the stop and stops at the stop.
    let far = engine.status(lostAt + 3_600_000)
    XCTAssertEqual(far.distanceM!, 0.0, accuracy: 1.0)
    XCTAssertEqual(far.latitude!, target.lat, accuracy: 1e-6)
  }

  func testKeepTrackingAfterAnUncertainAlarmWatchesAgainFromHere() {
    let target = TripSimulator.pointAlong(10_000.0, sideM: 1_000.0)
    let engine = TripEngine(config: config(target, 300.0), startedAtMs: 0)
    var t: Int64 = 0
    var along = 0.0
    var trigger: TriggerReason?
    while trigger == nil && along < 20_000 {
      let p = TripSimulator.pointAlong(along)
      trigger = engine.onFix(Fix(lat: p.lat, lon: p.lon, accuracyM: 10.0, timeMs: t, speedMps: 25.0)).trigger
      along += 125.0
      t += 5_000
    }
    XCTAssertEqual(trigger, .closestPointPassed)

    let rearmed = engine.rearm(t)
    XCTAssertNil(rearmed.status.trigger)
    // Still moving away from the pin: no instant repeat of the same alarm.
    for _ in 0..<3 {
      let p = TripSimulator.pointAlong(along)
      XCTAssertNil(engine.onFix(Fix(lat: p.lat, lon: p.lon, accuracyM: 10.0, timeMs: t, speedMps: 25.0)).trigger)
      along += 125.0
      t += 5_000
    }
    // Dead reckoning has nothing to estimate while we move away.
    XCTAssertNil(engine.onTick(t + 30_000).trigger)
  }

  func testAlreadyAtTheDestinationRingsStraightAway() {
    let target = TripSimulator.pointAlong(0.0)
    let engine = TripEngine(config: config(target, 300.0), startedAtMs: 0)
    XCTAssertEqual(engine.onFix(Fix(lat: target.lat, lon: target.lon, accuracyM: 10.0, timeMs: 1_000)).trigger, .arrived)
    XCTAssertNil(engine.nextCheckAtMs())
  }

  func testLeaveModeRingsJustAfterLeavingTheArea() {
    let r = TripSimulator.run(
      Scenario(segments: [.stop(seconds: 120), .move(distanceM: 1_000.0, speedMps: 1.4)], targetAlongM: 0.0, radiusM: 300.0, mode: .leave)
    )
    XCTAssertEqual(r.trigger, .leftArea)
    let outside = r.alongAtTriggerM! - 300.0
    XCTAssertTrue((-10.0...60.0).contains(outside), "rang \(outside) m outside the boundary")
  }

  func testLeaveModeDoesNotRingBeforeYouHaveBeenInside() {
    let r = TripSimulator.run(
      Scenario(segments: [.move(distanceM: 2_000.0, speedMps: 1.4)], targetAlongM: -1_000.0, radiusM: 300.0, mode: .leave)
    )
    XCTAssertNil(r.trigger)
  }

  func testAThousandRandomisedTripsNeverMissTheStopOrRingAbsurdlyEarly() {
    var rnd = JavaRandom(2026)
    for i in 0..<1000 {
      let kmh = 20.0 + rnd.nextDouble() * 280.0
      let radius = [100.0, 200.0, 300.0, 500.0, 1_000.0, 2_000.0][Int(rnd.nextInt(6))]
      let targetKm = 5.0 + rnd.nextDouble() * 60.0
      let minutes: Int? = rnd.nextBoolean() ? nil : [5, 10, 15][Int(rnd.nextInt(3))]
      var segments: [Segment] = []
      var km = 0.0
      while km < targetKm + 10 {
        let leg = 2.0 + rnd.nextDouble() * 10.0
        segments.append(move(leg, kmh))
        if rnd.nextInt(3) == 0 { segments.append(.stop(seconds: 30 + Int(rnd.nextInt(120)))) }
        km += leg
      }
      let tunnelStart = rnd.nextInt(4) == 0 ? (targetKm - rnd.nextDouble() * 3) * 1000 : Double.greatestFiniteMagnitude
      let tunnelEnd = tunnelStart + 2_000
      let inTunnel: (Double) -> Bool = { $0 >= tunnelStart && $0 <= tunnelEnd }
      let s = Scenario(
        segments: segments, targetAlongM: targetKm * 1000, radiusM: radius, minutesBefore: minutes,
        gpsOutage: inTunnel, networkOutage: inTunnel, seed: Int64(i)
      )
      let r = TripSimulator.run(s)
      let label = "trip \(i): \(kmh) km/h, radius \(radius), stop at \(targetKm) km, minutes \(String(describing: minutes)), tunnel at \(tunnelStart)"
      guard let trigger = r.trigger, let remaining = r.remainingM else {
        XCTFail("\(label) never rang")
        continue
      }
      // At worst one fix interval late (5 s near the stop), or the tunnel's dead-reckoning slack.
      let lateAllowanceM = kmh / 3.6 * 6 + radius
      XCTAssertGreaterThan(remaining, -lateAllowanceM, "\(label) rang \(-remaining) m after the stop (\(trigger))")
      // And not absurdly early: the radius plus the error of a fix allowed to ring it (cell fixes
      // count for big circles), plus a fix or two of travel, or the requested minutes.
      if tunnelStart == Double.greatestFiniteMagnitude {
        let fixErrorM = radius * 0.5 >= 800.0 ? 1_600.0 : 50.0
        // The minutes trigger accepts fixes whose error is worth up to a minute of travel.
        let etaSlackSec = Double(minutes.map { $0 * 60 + 60 } ?? 15)
        let earlyAllowanceM = radius + fixErrorM + kmh / 3.6 * etaSlackSec
        XCTAssertLessThan(remaining, earlyAllowanceM, "\(label) rang \(remaining) m early (\(trigger))")
      }
    }
  }

  func testResultsAreStableAcrossNoiseSeeds() {
    for seed: Int64 in 1...25 {
      let r = TripSimulator.run(Scenario(segments: [move(25.0, 140.0)], targetAlongM: 22_000.0, radiusM: 300.0, seed: seed))
      XCTAssertNotNil(r.trigger, "seed \(seed) never rang")
      if let remaining = r.remainingM {
        XCTAssertTrue((-400.0...600.0).contains(remaining), "seed \(seed) rang with \(remaining) m to go")
      }
    }
  }
}
