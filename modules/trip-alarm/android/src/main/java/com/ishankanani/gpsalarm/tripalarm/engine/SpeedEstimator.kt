package com.ishankanani.gpsalarm.tripalarm.engine

import kotlin.math.max

/**
 * Average ground speed over a rolling window.
 *
 * Prefers the Doppler speed the GPS reports, which is accurate and immune to position jitter.
 * Falls back to path length over time when fixes carry no speed.
 */
class SpeedEstimator(
  private val windowMs: Long,
  private val maxAccuracyM: Double,
) {
  private val samples = ArrayDeque<Fix>()

  /** Widens the window so slow fix rates (far tier) still leave a few samples in it. */
  var minWindowMs: Long = 0

  fun add(fix: Fix) {
    if (fix.accuracyM > maxAccuracyM) return
    samples.addLast(fix)
    val window = max(windowMs, minWindowMs)
    while (samples.size > 2 && fix.timeMs - samples.first().timeMs > window) {
      samples.removeFirst()
    }
  }

  /** Average speed in m/s over the window, or null when there is not enough recent data. */
  fun speedMps(): Double? = average(samples)

  /**
   * Average over just the last [recentMs]. After a station stop the window average lags behind
   * the train pulling away; dead reckoning uses whichever is higher so it errs towards ringing early.
   */
  fun recentSpeedMps(recentMs: Long = 20_000): Double? {
    val last = samples.lastOrNull() ?: return null
    return average(samples.filter { last.timeMs - it.timeMs <= recentMs }, minSpanMs = 8_000)
  }

  /** The Doppler speed of the latest accurate fix: the most current number we have. */
  fun latestReportedMps(): Double? = samples.lastOrNull()?.speedMps?.takeIf { it >= 0 }

  private fun average(window: List<Fix>, minSpanMs: Long = 15_000): Double? {
    if (window.size < 2) return null
    val spanMs = window.last().timeMs - window.first().timeMs
    if (spanMs < minSpanMs) return null

    val reported = window.mapNotNull { it.speedMps }.filter { it >= 0 }
    if (reported.size >= 3 && reported.size * 2 >= window.size) {
      return reported.average()
    }

    var path = 0.0
    for (i in 1 until window.size) {
      val a = window[i - 1]
      val b = window[i]
      path += Geo.distanceM(a.lat, a.lon, b.lat, b.lon)
    }
    return path / (spanMs / 1000.0)
  }
}
