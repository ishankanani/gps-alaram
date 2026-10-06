package com.ishankanani.gpsalarm.tripalarm.engine

import java.util.Random
import kotlin.math.cos
import kotlin.math.sin

sealed class Segment {
  data class Move(val distanceM: Double, val speedMps: Double) : Segment()
  data class Stop(val seconds: Int) : Segment()
}

/**
 * A trip along a straight line from [ORIGIN] heading north-east. The stop sits [targetAlongM]
 * metres along the line, pushed [targetOffsetM] metres sideways (a pin placed off the track).
 */
data class Scenario(
  val segments: List<Segment>,
  val targetAlongM: Double,
  val radiusM: Double,
  val targetOffsetM: Double = 0.0,
  val mode: AlarmMode = AlarmMode.ARRIVE,
  val minutesBefore: Int? = null,
  val gpsAccuracyM: Double = 10.0,
  val networkAccuracyM: Double = 800.0,
  /** True while the GPS cannot see the sky, given the true position along the route. */
  val gpsOutage: (alongM: Double) -> Boolean = { false },
  val networkOutage: (alongM: Double) -> Boolean = { false },
  val seed: Long = 7,
)

data class SimResult(
  val trigger: TriggerReason?,
  val triggerSec: Int?,
  /** True distance along the route when the alarm rang. */
  val alongAtTriggerM: Double?,
  /** Route distance still to go to the stop when the alarm rang (negative: already passed). */
  val remainingM: Double?,
  val tiers: List<Tier>,
  val gpsIntervalsMs: List<Long?>,
  val signalLostCount: Int,
)

object TripSimulator {
  val ORIGIN = Pair(49.1427, 9.2109) // Heilbronn Hbf
  private const val HEADING_RAD = 0.7 // roughly north-east
  private const val START_MS = 1_000_000L

  fun pointAlong(alongM: Double, sideM: Double = 0.0): Pair<Double, Double> {
    val north = alongM * cos(HEADING_RAD) - sideM * sin(HEADING_RAD)
    val east = alongM * sin(HEADING_RAD) + sideM * cos(HEADING_RAD)
    return Geo.offset(ORIGIN.first, ORIGIN.second, north, east)
  }

  fun run(s: Scenario, extraSeconds: Int = 900): SimResult {
    val (targetLat, targetLon) = pointAlong(s.targetAlongM, s.targetOffsetM)
    val engine = TripEngine(
      TripConfig(targetLat, targetLon, s.radiusM, s.mode, s.minutesBefore),
      startedAtMs = START_MS,
    )
    val rnd = Random(s.seed)
    val timeline = timeline(s.segments)
    val endSec = timeline.size + extraSeconds

    var lastGpsSec = -1_000_000
    var lastNetworkSec = -1_000_000
    val tiers = mutableListOf(engine.plan.tier)
    val gpsIntervals = mutableListOf(engine.plan.gpsIntervalMs)
    var lostCount = 0

    fun record(u: EngineUpdate) {
      if (u.signalLost) lostCount++
      if (u.planChanged) {
        tiers += u.status.tier
        gpsIntervals += engine.plan.gpsIntervalMs
      }
    }

    for (t in 0 until endSec) {
      val (along, speed) = timeline.getOrElse(t) { Pair(timeline.last().first, 0.0) }
      val nowMs = START_MS + t * 1000L
      val plan = engine.plan

      val gpsEvery = plan.gpsIntervalMs?.let { (it / 1000).toInt() }
      if (gpsEvery != null && t - lastGpsSec >= gpsEvery && !s.gpsOutage(along)) {
        lastGpsSec = t
        val fix = noisyFix(along, s.gpsAccuracyM, nowMs, rnd, speed + rnd.nextGaussian() * 0.3, "gps")
        record(engine.onFix(fix))
      }
      val networkEvery = (plan.networkIntervalMs / 1000).toInt()
      if (t - lastNetworkSec >= networkEvery && !s.networkOutage(along)) {
        lastNetworkSec = t
        record(engine.onFix(noisyFix(along, s.networkAccuracyM, nowMs, rnd, null, "network")))
      }
      val checkAt = engine.nextCheckAtMs()
      if (checkAt != null && nowMs >= checkAt) record(engine.onTick(nowMs))

      val trigger = engine.trigger
      if (trigger != null) {
        return SimResult(trigger, t, along, s.targetAlongM - along, tiers, gpsIntervals, lostCount)
      }
    }
    return SimResult(null, null, null, null, tiers, gpsIntervals, lostCount)
  }

  /** True (along-route distance, speed) for every second of the trip. */
  private fun timeline(segments: List<Segment>): List<Pair<Double, Double>> {
    val out = mutableListOf<Pair<Double, Double>>()
    var along = 0.0
    for (seg in segments) {
      when (seg) {
        is Segment.Stop -> repeat(seg.seconds) { out += Pair(along, 0.0) }
        is Segment.Move -> {
          val end = along + seg.distanceM
          while (along < end) {
            out += Pair(along, seg.speedMps)
            along = minOf(end, along + seg.speedMps)
          }
        }
      }
    }
    out += Pair(along, 0.0)
    return out
  }

  private fun noisyFix(
    along: Double,
    accuracyM: Double,
    nowMs: Long,
    rnd: Random,
    speed: Double?,
    provider: String,
  ): Fix {
    val sigma = accuracyM / 1.5
    val (lat, lon) = pointAlong(along + rnd.nextGaussian() * sigma, rnd.nextGaussian() * sigma)
    return Fix(lat, lon, accuracyM, nowMs, speed?.coerceAtLeast(0.0), provider)
  }
}
