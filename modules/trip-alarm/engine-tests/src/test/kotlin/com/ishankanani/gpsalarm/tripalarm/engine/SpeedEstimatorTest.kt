package com.ishankanani.gpsalarm.tripalarm.engine

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SpeedEstimatorTest {
  private val origin = TripSimulator.ORIGIN

  private fun fixAt(northM: Double, timeMs: Long, speed: Double? = null, accuracy: Double = 10.0): Fix {
    val (lat, lon) = Geo.offset(origin.first, origin.second, northM, 0.0)
    return Fix(lat, lon, accuracy, timeMs, speed)
  }

  @Test
  fun `needs some history before answering`() {
    val e = SpeedEstimator(windowMs = 120_000, maxAccuracyM = 100.0)
    e.add(fixAt(0.0, 0))
    e.add(fixAt(100.0, 5_000))
    assertNull(e.speedMps())
  }

  @Test
  fun `uses reported doppler speed when available`() {
    val e = SpeedEstimator(windowMs = 120_000, maxAccuracyM = 100.0)
    for (i in 0..6) e.add(fixAt(i * 50.0, i * 5_000L, speed = 20.0))
    assertEquals(20.0, e.speedMps()!!, 0.001)
  }

  @Test
  fun `falls back to path length over time`() {
    val e = SpeedEstimator(windowMs = 120_000, maxAccuracyM = 100.0)
    for (i in 0..6) e.add(fixAt(i * 60.0, i * 5_000L))
    assertEquals(12.0, e.speedMps()!!, 0.05)
  }

  @Test
  fun `ignores coarse fixes`() {
    val e = SpeedEstimator(windowMs = 120_000, maxAccuracyM = 100.0)
    e.add(fixAt(0.0, 0))
    e.add(fixAt(5_000.0, 10_000, accuracy = 1_500.0))
    e.add(fixAt(300.0, 30_000))
    assertEquals(10.0, e.speedMps()!!, 0.05)
  }

  @Test
  fun `drops samples older than the window`() {
    val e = SpeedEstimator(windowMs = 60_000, maxAccuracyM = 100.0)
    for (i in 0..12) e.add(fixAt(i * 100.0, i * 10_000L, speed = 10.0))
    for (i in 13..20) e.add(fixAt(1_200.0 + (i - 12) * 300.0, i * 10_000L, speed = 30.0))
    assertEquals(30.0, e.speedMps()!!, 0.001)
  }
}
