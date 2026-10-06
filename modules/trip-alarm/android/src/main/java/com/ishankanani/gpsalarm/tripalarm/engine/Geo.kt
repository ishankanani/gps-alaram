package com.ishankanani.gpsalarm.tripalarm.engine

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

object Geo {
  const val EARTH_RADIUS_M = 6_371_008.8

  /** Great-circle (haversine) distance in metres. */
  fun distanceM(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val p1 = Math.toRadians(lat1)
    val p2 = Math.toRadians(lat2)
    val dp = p2 - p1
    val dl = Math.toRadians(lon2 - lon1)
    val a = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
    return 2 * EARTH_RADIUS_M * asin(min(1.0, sqrt(a)))
  }

  /**
   * Smallest distance from point P to the segment A-B, in metres.
   *
   * Uses a flat projection centred on P, which is accurate to well under 1% for the segment
   * lengths we see between two fixes (a few km at most).
   */
  fun distanceToSegmentM(
    pLat: Double,
    pLon: Double,
    aLat: Double,
    aLon: Double,
    bLat: Double,
    bLon: Double,
  ): Double {
    val cosLat = cos(Math.toRadians(pLat))
    val ax = Math.toRadians(aLon - pLon) * EARTH_RADIUS_M * cosLat
    val ay = Math.toRadians(aLat - pLat) * EARTH_RADIUS_M
    val bx = Math.toRadians(bLon - pLon) * EARTH_RADIUS_M * cosLat
    val by = Math.toRadians(bLat - pLat) * EARTH_RADIUS_M
    val dx = bx - ax
    val dy = by - ay
    val len2 = dx * dx + dy * dy
    val t = if (len2 == 0.0) 0.0 else (-(ax * dx + ay * dy) / len2).coerceIn(0.0, 1.0)
    return hypot(ax + t * dx, ay + t * dy)
  }

  /** Moves a point by [northM] and [eastM] metres. Used by tests and the trip simulator. */
  fun offset(lat: Double, lon: Double, northM: Double, eastM: Double): Pair<Double, Double> {
    val dLat = Math.toDegrees(northM / EARTH_RADIUS_M)
    val dLon = Math.toDegrees(eastM / (EARTH_RADIUS_M * cos(Math.toRadians(lat))))
    return Pair(lat + dLat, lon + dLon)
  }
}
