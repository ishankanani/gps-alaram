package com.ishankanani.gpsalarm.tripalarm.engine

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TripEngineTest {
  private fun move(km: Double, kmh: Double) = Segment.Move(km * 1000, kmh / 3.6)

  @Test
  fun `regional train rings inside the radius before the stop`() {
    val r = TripSimulator.run(
      Scenario(segments = listOf(move(45.0, 120.0)), targetAlongM = 40_000.0, radiusM = 500.0),
    )
    assertNotNull(r.trigger)
    assertTrue(r.trigger in setOf(TriggerReason.ARRIVED, TriggerReason.PASSED_THROUGH), "${r.trigger}")
    val remaining = r.remainingM!!
    assertTrue(remaining in 0.0..700.0, "rang with $remaining m to go")
  }

  @Test
  fun `high speed train rings even when it crosses the radius between two fixes`() {
    // 300 km/h covers 415 m between 5 s fixes, more than the 300 m wide circle.
    val r = TripSimulator.run(
      Scenario(segments = listOf(move(60.0, 300.0)), targetAlongM = 50_000.0, radiusM = 150.0),
    )
    assertTrue(r.trigger in setOf(TriggerReason.ARRIVED, TriggerReason.PASSED_THROUGH), "${r.trigger}")
    assertTrue(r.remainingM!! > -450.0, "rang ${-r.remainingM!!} m after the stop")
  }

  @Test
  fun `time before arrival rings about that many minutes out`() {
    val speed = 50 / 3.6
    val r = TripSimulator.run(
      Scenario(
        segments = listOf(move(30.0, 50.0)),
        targetAlongM = 28_000.0,
        radiusM = 300.0,
        minutesBefore = 10,
      ),
    )
    assertEquals(TriggerReason.ETA, r.trigger)
    val minutesLeft = r.remainingM!! / speed / 60
    assertTrue(minutesLeft in 9.0..10.5, "rang $minutesLeft min before arrival")
  }

  @Test
  fun `a tunnel before the stop falls back to dead reckoning and still rings early`() {
    val r = TripSimulator.run(
      Scenario(
        segments = listOf(move(35.0, 110.0)),
        targetAlongM = 30_000.0,
        radiusM = 400.0,
        gpsOutage = { it > 22_000 },
        networkOutage = { it > 22_000 },
      ),
    )
    assertEquals(TriggerReason.ESTIMATED, r.trigger)
    val remaining = r.remainingM!!
    assertTrue(remaining in 0.0..8_000.0, "rang with $remaining m to go")
    assertTrue(r.signalLostCount >= 1)
  }

  @Test
  fun `a tunnel with only coarse cell fixes still rings by dead reckoning`() {
    val r = TripSimulator.run(
      Scenario(
        segments = listOf(move(35.0, 110.0)),
        targetAlongM = 30_000.0,
        radiusM = 300.0,
        networkAccuracyM = 1_500.0,
        gpsOutage = { it > 24_000 },
      ),
    )
    assertNotNull(r.trigger)
    assertTrue(r.remainingM!! >= 0.0, "rang ${-r.remainingM!!} m after the stop")
  }

  @Test
  fun `a pin placed off the track rings once we start moving away`() {
    val r = TripSimulator.run(
      Scenario(
        segments = listOf(move(30.0, 100.0)),
        targetAlongM = 20_000.0,
        targetOffsetM = 900.0,
        radiusM = 300.0,
      ),
    )
    assertEquals(TriggerReason.CLOSEST_POINT_PASSED, r.trigger)
    val pastClosest = -r.remainingM!!
    assertTrue(pastClosest in 0.0..1_500.0, "rang $pastClosest m past the closest point")
  }

  @Test
  fun `waiting at the platform does not ring or invent a speed`() {
    val r = TripSimulator.run(
      Scenario(
        segments = listOf(Segment.Stop(600), move(12.0, 80.0)),
        targetAlongM = 10_000.0,
        radiusM = 500.0,
        gpsAccuracyM = 15.0,
      ),
    )
    assertTrue(r.triggerSec!! > 600, "rang during the wait at ${r.triggerSec} s")
    assertTrue(r.remainingM!! in 0.0..700.0)
  }

  @Test
  fun `tracking steps from far to near as the stop approaches`() {
    val r = TripSimulator.run(
      Scenario(segments = listOf(move(70.0, 90.0)), targetAlongM = 65_000.0, radiusM = 500.0),
    )
    assertNotNull(r.trigger)
    // Starts near to get a quick first fix, drops to far, then steps back in.
    assertEquals(listOf(Tier.NEAR, Tier.FAR, Tier.MID, Tier.NEAR), r.tiers)
    assertEquals(listOf<Long?>(5_000, 120_000, 30_000, 5_000), r.gpsIntervalsMs)
  }

  @Test
  fun `wake me minutes before pulls high accuracy tracking in earlier`() {
    val r = TripSimulator.run(
      Scenario(
        segments = listOf(move(80.0, 160.0)),
        targetAlongM = 75_000.0,
        radiusM = 500.0,
        minutesBefore = 20,
      ),
    )
    assertEquals(TriggerReason.ETA, r.trigger)
    val minutesLeft = r.remainingM!! / (160 / 3.6) / 60
    assertTrue(minutesLeft in 18.5..20.5, "rang $minutesLeft min before arrival")
  }

  @Test
  fun `a coarse cell fix landing inside the radius does not ring`() {
    val target = TripSimulator.pointAlong(10_000.0)
    val engine = TripEngine(TripConfig(target.first, target.second, 300.0), startedAtMs = 0)
    val near = TripSimulator.pointAlong(9_900.0)
    val u = engine.onFix(Fix(near.first, near.second, accuracyM = 1_500.0, timeMs = 1_000, provider = "network"))
    assertNull(u.trigger)
  }

  @Test
  fun `a fix cached from before the trip is ignored`() {
    val target = TripSimulator.pointAlong(10_000.0)
    val engine = TripEngine(TripConfig(target.first, target.second, 300.0), startedAtMs = 600_000)
    val u = engine.onFix(Fix(target.first, target.second, accuracyM = 10.0, timeMs = 100_000))
    assertNull(u.trigger)
    assertNull(u.status.distanceM)
  }

  @Test
  fun `signal lost is reported once and recovery is reported on the next fix`() {
    val target = TripSimulator.pointAlong(10_000.0)
    val engine = TripEngine(TripConfig(target.first, target.second, 300.0), startedAtMs = 0)
    val start = TripSimulator.pointAlong(0.0)
    engine.onFix(Fix(start.first, start.second, 10.0, timeMs = 1_000))
    val checkAt = engine.nextCheckAtMs()!!
    assertEquals(61_000, checkAt)
    assertFalse(engine.onTick(checkAt - 1).signalLost)
    val lost = engine.onTick(checkAt)
    assertTrue(lost.signalLost)
    assertEquals(GpsHealth.LOST, lost.status.health)
    assertFalse(engine.onTick(checkAt + 5_000).signalLost)
    val back = engine.onFix(Fix(start.first, start.second, 10.0, timeMs = checkAt + 6_000))
    assertTrue(back.signalRecovered)
    assertEquals(GpsHealth.GOOD, back.status.health)
  }

  @Test
  fun `without GPS the position is estimated towards the stop at the last speed`() {
    val target = TripSimulator.pointAlong(10_000.0)
    val engine = TripEngine(TripConfig(target.first, target.second, 300.0), startedAtMs = 0)
    var t = 0L
    var along = 0.0
    // A minute at 20 m/s with GPS, then into a tunnel at 1.2 km.
    while (along <= 1_200.0) {
      val p = TripSimulator.pointAlong(along)
      val s = engine.onFix(Fix(p.first, p.second, 8.0, t, speedMps = 20.0)).status
      assertFalse(s.estimated)
      along += 100.0
      t += 5_000
    }
    val lastFixAt = t - 5_000
    // Before the signal counts as lost, the map keeps the last fix.
    assertFalse(engine.status(lastFixAt + 30_000).estimated)
    val lostAt = engine.nextCheckAtMs()!!
    engine.onTick(lostAt)
    val s = engine.status(lostAt + 20_000)
    assertTrue(s.estimated)
    val expected = 10_000.0 - 1_200.0 - 20.0 * (lostAt + 20_000 - lastFixAt) / 1000.0
    assertTrue(kotlin.math.abs(s.distanceM!! - expected) < 50.0, "estimated ${s.distanceM}, expected $expected")
    // The estimate lies on the way to the stop and stops at the stop.
    val far = engine.status(lostAt + 3_600_000)
    assertEquals(0.0, far.distanceM!!, 1.0)
    assertEquals(target.first, far.latitude!!, 1e-6)
  }

  @Test
  fun `keep tracking after an uncertain alarm watches again from here`() {
    val target = TripSimulator.pointAlong(10_000.0, sideM = 1_000.0)
    val engine = TripEngine(TripConfig(target.first, target.second, 300.0), startedAtMs = 0)
    var t = 0L
    var along = 0.0
    var trigger: TriggerReason? = null
    while (trigger == null && along < 20_000) {
      val p = TripSimulator.pointAlong(along)
      trigger = engine.onFix(Fix(p.first, p.second, 10.0, t, speedMps = 25.0)).trigger
      along += 125.0
      t += 5_000
    }
    assertEquals(TriggerReason.CLOSEST_POINT_PASSED, trigger)

    val rearmed = engine.rearm(t)
    assertNull(rearmed.status.trigger)
    // Still moving away from the pin: no instant repeat of the same alarm.
    for (i in 0 until 3) {
      val p = TripSimulator.pointAlong(along)
      assertNull(engine.onFix(Fix(p.first, p.second, 10.0, t, speedMps = 25.0)).trigger)
      along += 125.0
      t += 5_000
    }
    // Dead reckoning has nothing to estimate while we move away.
    assertNull(engine.onTick(t + 30_000).trigger)
  }

  @Test
  fun `already at the destination rings straight away`() {
    val target = TripSimulator.pointAlong(0.0)
    val engine = TripEngine(TripConfig(target.first, target.second, 300.0), startedAtMs = 0)
    assertEquals(TriggerReason.ARRIVED, engine.onFix(Fix(target.first, target.second, 10.0, 1_000)).trigger)
    assertNull(engine.nextCheckAtMs())
  }

  @Test
  fun `leave mode rings just after leaving the area`() {
    val r = TripSimulator.run(
      Scenario(
        segments = listOf(Segment.Stop(120), Segment.Move(1_000.0, 1.4)),
        targetAlongM = 0.0,
        radiusM = 300.0,
        mode = AlarmMode.LEAVE,
      ),
    )
    assertEquals(TriggerReason.LEFT_AREA, r.trigger)
    val outside = r.alongAtTriggerM!! - 300.0
    assertTrue(outside in -10.0..60.0, "rang $outside m outside the boundary")
  }

  @Test
  fun `leave mode does not ring before you have been inside`() {
    val r = TripSimulator.run(
      Scenario(
        segments = listOf(Segment.Move(2_000.0, 1.4)),
        targetAlongM = -1_000.0,
        radiusM = 300.0,
        mode = AlarmMode.LEAVE,
      ),
    )
    assertNull(r.trigger)
  }

  @Test
  fun `a thousand randomised trips never miss the stop or ring absurdly early`() {
    val rnd = java.util.Random(2026)
    for (i in 0 until 1000) {
      val kmh = 20.0 + rnd.nextDouble() * 280.0
      val radius = listOf(100.0, 200.0, 300.0, 500.0, 1_000.0, 2_000.0)[rnd.nextInt(6)]
      val targetKm = 5.0 + rnd.nextDouble() * 60.0
      val minutes = if (rnd.nextBoolean()) null else listOf(5, 10, 15)[rnd.nextInt(3)]
      val segments = mutableListOf<Segment>()
      var km = 0.0
      while (km < targetKm + 10) {
        val leg = 2.0 + rnd.nextDouble() * 10.0
        segments += move(leg, kmh)
        if (rnd.nextInt(3) == 0) segments += Segment.Stop(30 + rnd.nextInt(120))
        km += leg
      }
      val tunnelStart = if (rnd.nextInt(4) == 0) (targetKm - rnd.nextDouble() * 3) * 1000 else Double.MAX_VALUE
      val tunnelEnd = tunnelStart + 2_000
      val s = Scenario(
        segments = segments,
        targetAlongM = targetKm * 1000,
        radiusM = radius,
        minutesBefore = minutes,
        gpsOutage = { it in tunnelStart..tunnelEnd },
        networkOutage = { it in tunnelStart..tunnelEnd },
        seed = i.toLong(),
      )
      val r = TripSimulator.run(s)
      val label = "trip $i: $kmh km/h, radius $radius, stop at $targetKm km, minutes $minutes, tunnel at $tunnelStart"
      assertNotNull(r.trigger, "$label never rang")
      // At worst one fix interval late (5 s near the stop), or the tunnel's dead-reckoning slack.
      val lateAllowanceM = kmh / 3.6 * 6 + radius
      assertTrue(r.remainingM!! > -lateAllowanceM, "$label rang ${-r.remainingM!!} m after the stop (${r.trigger})")
      // And not absurdly early: the radius plus the error of a fix allowed to ring it (cell fixes
      // count for big circles), plus a fix or two of travel, or the requested minutes.
      if (tunnelStart == Double.MAX_VALUE) {
        val fixErrorM = if (radius * 0.5 >= 800.0) 1_600.0 else 50.0
        // The minutes trigger accepts fixes whose error is worth up to a minute of travel.
        val etaSlackSec = if (minutes != null) minutes * 60 + 60 else 15
        val earlyAllowanceM = radius + fixErrorM + kmh / 3.6 * etaSlackSec
        assertTrue(r.remainingM!! < earlyAllowanceM, "$label rang ${r.remainingM} m early (${r.trigger})")
      }
    }
  }

  @Test
  fun `results are stable across noise seeds`() {
    for (seed in 1L..25L) {
      val r = TripSimulator.run(
        Scenario(segments = listOf(move(25.0, 140.0)), targetAlongM = 22_000.0, radiusM = 300.0, seed = seed),
      )
      assertNotNull(r.trigger, "seed $seed never rang")
      assertTrue(r.remainingM!! in -400.0..600.0, "seed $seed rang with ${r.remainingM} m to go")
    }
  }
}
