package com.ishankanani.gpsalarm.tripalarm.engine

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GeoTest {
  @Test
  fun `haversine matches a known long distance`() {
    // Berlin Hbf to München Hbf is about 504 km in a straight line.
    val d = Geo.distanceM(52.5251, 13.3694, 48.1402, 11.5600)
    assertTrue(abs(d - 504_000) < 5_000, "got $d")
  }

  @Test
  fun `offset and distance agree for short hops`() {
    val (lat, lon) = Geo.offset(49.14, 9.21, northM = 300.0, eastM = 400.0)
    assertEquals(500.0, Geo.distanceM(49.14, 9.21, lat, lon), 0.5)
  }

  @Test
  fun `segment distance is the perpendicular distance when the foot is inside the segment`() {
    val p = Pair(49.14, 9.21)
    val a = Geo.offset(p.first, p.second, northM = -1_000.0, eastM = 120.0)
    val b = Geo.offset(p.first, p.second, northM = 1_000.0, eastM = 120.0)
    assertEquals(120.0, Geo.distanceToSegmentM(p.first, p.second, a.first, a.second, b.first, b.second), 0.5)
  }

  @Test
  fun `segment distance falls back to the nearest end`() {
    val p = Pair(49.14, 9.21)
    val a = Geo.offset(p.first, p.second, northM = 300.0, eastM = 0.0)
    val b = Geo.offset(p.first, p.second, northM = 900.0, eastM = 0.0)
    assertEquals(300.0, Geo.distanceToSegmentM(p.first, p.second, a.first, a.second, b.first, b.second), 0.5)
  }
}
