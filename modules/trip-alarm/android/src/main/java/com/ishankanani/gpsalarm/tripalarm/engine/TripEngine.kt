package com.ishankanani.gpsalarm.tripalarm.engine

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Decides when to ring and how hard to track. Pure logic: no Android, no clocks, no I/O.
 *
 * The service feeds it every location fix ([onFix]) and calls [onTick] at [nextCheckAtMs] so the
 * watchdog can run when fixes stop arriving. Every time is in the same monotonic clock.
 *
 * Arrive mode rings on the first of:
 * - a fix inside the radius,
 * - two consecutive fixes whose straight line passes through the radius (fast trains),
 * - the time-before-arrival threshold, when one is set,
 * - coming close and then moving away (the pin is off the route, so we never enter the radius),
 * - GPS going quiet past the time dead reckoning says we would arrive.
 */
class TripEngine(
  val config: TripConfig,
  private val startedAtMs: Long,
  private val params: EngineParams = EngineParams(),
) {
  private val speedEstimator = SpeedEstimator(params.speedWindowMs, params.speedMaxAccuracyM)
  // Coarse fixes may ring a big circle (a 5 km radius on cell towers alone), but only if they are
  // accurate to half the radius, so a noisy fix cannot ring much more than one radius early.
  private val triggerAccuracyM = max(params.triggerAccuracyM, config.radiusM * 0.5)
  private val approachZoneM = config.radiusM + max(1_000.0, config.radiusM)
  private val recedeMarginM = max(250.0, config.radiusM * 0.5)

  private var lastFix: Fix? = null
  private var lastTriggerFix: Fix? = null
  private var lastGoodFixMs: Long? = null
  private var lastWatchdogFixMs: Long? = null
  private var distanceM: Double? = null
  private var initialDistanceM: Double? = null
  private var closestM = Double.POSITIVE_INFINITY
  private var recedingCount = 0
  private var armed = config.mode == AlarmMode.ARRIVE
  private var outsideCount = 0
  private var lost = false
  private var fallbackAtMs: Long? = null
  private var bootstrapping = true

  var trigger: TriggerReason? = null
    private set

  /**
   * Starts in the near tier so the first fix and the first speed estimate come quickly. The first
   * real decision is made once speed is known (or after [BOOTSTRAP_MS]), without hysteresis.
   */
  var plan: TrackingPlan = planFor(Tier.NEAR)
    private set

  fun onFix(fix: Fix): EngineUpdate {
    val prev = lastFix
    val usable = !fix.accuracyM.isNaN() &&
      fix.accuracyM <= params.maxUsableAccuracyM &&
      fix.timeMs >= startedAtMs - STALE_FIX_GRACE_MS &&
      (prev == null || fix.timeMs > prev.timeMs)
    if (!usable) return update(prev?.timeMs ?: fix.timeMs)

    lastFix = fix
    val d = Geo.distanceM(fix.lat, fix.lon, config.targetLat, config.targetLon)
    distanceM = d
    speedEstimator.add(fix)
    if (fix.accuracyM <= params.goodAccuracyM) lastGoodFixMs = fix.timeMs

    var recovered = false
    if (fix.accuracyM <= params.watchdogAccuracyM) {
      lastWatchdogFixMs = fix.timeMs
      if (lost) {
        lost = false
        recovered = true
      }
    }

    var newTrigger: TriggerReason? = null
    if (trigger == null) {
      newTrigger = when (config.mode) {
        AlarmMode.ARRIVE -> evaluateArrive(fix, d)
        AlarmMode.LEAVE -> evaluateLeave(fix, d)
      }
      if (fix.accuracyM <= triggerAccuracyM) lastTriggerFix = fix
    }
    if (newTrigger != null) trigger = newTrigger

    val planChanged = updatePlan(d, fix.timeMs)
    fallbackAtMs = if (trigger == null) computeFallback() else null

    return EngineUpdate(
      status = status(fix.timeMs),
      planChanged = planChanged,
      trigger = newTrigger,
      signalLost = false,
      signalRecovered = recovered,
    )
  }

  /** Runs the watchdog. Call it at [nextCheckAtMs], or any time; extra calls are harmless. */
  fun onTick(nowMs: Long): EngineUpdate {
    if (trigger != null) return update(nowMs)

    var signalLost = false
    val base = lastWatchdogFixMs ?: startedAtMs
    if (!lost && nowMs - base >= lostAfterMs()) {
      lost = true
      signalLost = true
    }

    var newTrigger: TriggerReason? = null
    val fallbackAt = fallbackAtMs
    if (fallbackAt != null && nowMs >= fallbackAt) {
      newTrigger = TriggerReason.ESTIMATED
      trigger = newTrigger
      fallbackAtMs = null
    }

    return EngineUpdate(
      status = status(nowMs),
      planChanged = false,
      trigger = newTrigger,
      signalLost = signalLost,
      signalRecovered = false,
    )
  }

  /**
   * "Not there yet, keep tracking": clears an uncertain alarm (closest point passed, or estimated
   * while GPS was out) and starts watching again from the current position.
   */
  fun rearm(nowMs: Long): EngineUpdate {
    trigger = null
    fallbackAtMs = null
    lastTriggerFix = null
    initialDistanceM = distanceM
    closestM = distanceM ?: Double.POSITIVE_INFINITY
    recedingCount = 0
    // Restart the watchdog clock so a long-lost signal does not ring again immediately.
    lastWatchdogFixMs = nowMs
    lost = false
    return update(nowMs)
  }

  /** When [onTick] next has something to decide, or null when nothing is pending. */
  fun nextCheckAtMs(): Long? {
    if (trigger != null) return null
    val lostAt = if (lost) null else (lastWatchdogFixMs ?: startedAtMs) + lostAfterMs()
    val fallbackAt = fallbackAtMs
    return listOfNotNull(lostAt, fallbackAt).minOrNull()
  }

  fun status(nowMs: Long): TripStatus {
    val speed = speedEstimator.speedMps()
    val d = distanceM
    return TripStatus(
      distanceM = d,
      etaSec = if (d != null) etaSec(d, speed) else null,
      speedMps = speed,
      accuracyM = lastFix?.accuracyM,
      lastFixAgeMs = lastFix?.let { max(0L, nowMs - it.timeMs) },
      health = health(nowMs),
      tier = plan.tier,
      armed = armed,
      closestDistanceM = if (closestM.isFinite()) closestM else null,
      fallbackAtMs = fallbackAtMs,
      trigger = trigger,
    )
  }

  private fun evaluateArrive(fix: Fix, d: Double): TriggerReason? {
    val radius = config.radiusM
    if (fix.accuracyM <= triggerAccuracyM) {
      if (d <= radius) return TriggerReason.ARRIVED

      val prev = lastTriggerFix
      if (prev != null) {
        val passM = Geo.distanceToSegmentM(
          config.targetLat, config.targetLon, prev.lat, prev.lon, fix.lat, fix.lon,
        )
        if (passM <= radius) return TriggerReason.PASSED_THROUGH
      }

      // Compare with the accuracy taken into account, so one lucky coarse fix cannot fake an
      // approach: closest is the farthest we could have been, receding needs the nearest we
      // could be now to be clearly beyond it.
      val initial = initialDistanceM ?: d.also { initialDistanceM = it }
      if (d + fix.accuracyM < closestM) {
        closestM = d + fix.accuracyM
        recedingCount = 0
      } else if (d - fix.accuracyM >= closestM + recedeMarginM) {
        recedingCount++
      }
      val approached = initial - closestM >= max(500.0, radius)
      if (approached && closestM <= approachZoneM && recedingCount >= 2) {
        return TriggerReason.CLOSEST_POINT_PASSED
      }
    }

    val minutes = config.minutesBefore
    val speed = speedEstimator.speedMps()
    if (minutes != null && speed != null) {
      // A coarse fix is fine on a fast train but minutes off on a slow bus: only accept fixes
      // whose stated error is worth at most half a minute of travel (real errors run larger).
      val maxAccuracy = min(params.etaTriggerAccuracyM, max(triggerAccuracyM, speed * 30))
      val eta = etaSec(d, speed)
      if (fix.accuracyM <= maxAccuracy && eta != null && eta <= minutes * 60.0) return TriggerReason.ETA
    }
    return null
  }

  private fun evaluateLeave(fix: Fix, d: Double): TriggerReason? {
    if (fix.accuracyM > triggerAccuracyM) return null
    val radius = config.radiusM
    if (!armed) {
      if (d <= radius) armed = true
      return null
    }
    if (d <= radius) {
      outsideCount = 0
      return null
    }
    outsideCount++
    val clearlyOutside = d - radius >= max(fix.accuracyM * 0.5, 10.0)
    return if (clearlyOutside || outsideCount >= 3) TriggerReason.LEFT_AREA else null
  }

  private fun updatePlan(d: Double, nowMs: Long): Boolean {
    val speed = fastestSpeed()
    val firstDecision = bootstrapping
    if (bootstrapping) {
      if (speed == null && nowMs - startedAtMs < BOOTSTRAP_MS) return false
      bootstrapping = false
    }
    val planningSpeed = if (speed != null) max(speed * 1.25, params.minMovingSpeedMps) else params.unknownSpeedMps
    val entering = tierFor(d, planningSpeed, 1.0)
    val leaving = tierFor(d, planningSpeed, params.tierHysteresis)
    val current = plan.tier
    val next = when {
      firstDecision -> entering
      entering.ordinal > current.ordinal -> entering
      leaving.ordinal < current.ordinal -> leaving
      else -> current
    }
    if (next == current) return false
    plan = planFor(next)
    speedEstimator.minWindowMs = plan.expectedIntervalMs * 3
    return true
  }

  /** Thresholds are multiplied by [scale], so a scale above 1 gives the hysteresis band. */
  private fun tierFor(d: Double, planningSpeedMps: Double, scale: Double): Tier {
    val radius = config.radiusM
    return when (config.mode) {
      AlarmMode.ARRIVE -> {
        val marginSec = (config.minutesBefore ?: 0) * 60.0
        when {
          d <= (params.nearDistanceM + radius) * scale ||
            d <= (marginSec + params.nearEtaMarginSec) * planningSpeedMps * scale -> Tier.NEAR
          d <= (params.midDistanceM + radius) * scale ||
            d <= (marginSec + params.midEtaMarginSec) * planningSpeedMps * scale -> Tier.MID
          else -> Tier.FAR
        }
      }
      AlarmMode.LEAVE -> {
        val toBoundary = abs(d - radius)
        when {
          toBoundary <= LEAVE_NEAR_M * scale || toBoundary <= 5 * 60.0 * planningSpeedMps * scale -> Tier.NEAR
          toBoundary <= LEAVE_MID_M * scale || toBoundary <= 15 * 60.0 * planningSpeedMps * scale -> Tier.MID
          else -> Tier.FAR
        }
      }
    }
  }

  private fun planFor(tier: Tier): TrackingPlan = when (tier) {
    Tier.FAR -> TrackingPlan(tier, params.farGpsIntervalMs, params.farNetworkIntervalMs, holdWakeLock = false)
    Tier.MID -> TrackingPlan(tier, params.midIntervalMs, params.midIntervalMs, holdWakeLock = false)
    Tier.NEAR -> TrackingPlan(tier, params.nearGpsIntervalMs, params.nearNetworkIntervalMs, holdWakeLock = true)
  }

  /**
   * Dead reckoning from the last fix good enough to ring on: when would we reach the trigger if we
   * kept the average speed? Coarse fixes do not move this, so a cell tower that keeps reporting the
   * same spot in a tunnel cannot postpone the alarm forever.
   */
  private fun computeFallback(): Long? {
    if (config.mode != AlarmMode.ARRIVE) return null
    val base = lastTriggerFix ?: return null
    val speed = fastestSpeed() ?: return null
    if (speed < params.minMovingSpeedMps) return null

    val d = Geo.distanceM(base.lat, base.lon, config.targetLat, config.targetLon)
    var remainingM = d - config.radiusM
    config.minutesBefore?.let { remainingM = min(remainingM, d - speed * it * 60.0) }
    val untilTriggerMs = (max(0.0, remainingM) / speed * params.fallbackSafety * 1000).toLong()
    // Give the next fix a fair chance to arrive (two intervals), but no more: at 190 km/h a
    // minute of waiting is 3 km, well past the stop.
    return base.timeMs + max(untilTriggerMs, plan.expectedIntervalMs * 2)
  }

  /**
   * The highest of the window average, the last few seconds and the latest Doppler reading. A
   * train pulling out of a station is faster than any average says: err towards ringing early.
   */
  private fun fastestSpeed(): Double? {
    val average = speedEstimator.speedMps() ?: return null
    return maxOf(average, speedEstimator.recentSpeedMps() ?: 0.0, speedEstimator.latestReportedMps() ?: 0.0)
  }

  private fun lostAfterMs(): Long = max(params.minLostAfterMs, plan.expectedIntervalMs * 2 + 30_000)

  private fun health(nowMs: Long): GpsHealth {
    val base = lastWatchdogFixMs
    if (base == null) return if (nowMs - startedAtMs >= lostAfterMs()) GpsHealth.LOST else GpsHealth.WAITING
    if (lost || nowMs - base >= lostAfterMs()) return GpsHealth.LOST
    val good = lastGoodFixMs
    return if (good != null && nowMs - good <= plan.expectedIntervalMs * 2 + 10_000) GpsHealth.GOOD else GpsHealth.WEAK
  }

  private fun etaSec(d: Double, speedMps: Double?): Double? =
    if (speedMps != null && speedMps >= params.minMovingSpeedMps) d / speedMps else null

  private fun update(nowMs: Long) = EngineUpdate(
    status = status(nowMs),
    planChanged = false,
    trigger = null,
    signalLost = false,
    signalRecovered = false,
  )

  private companion object {
    /** Providers may hand out a cached fix taken shortly before the trip started. */
    const val STALE_FIX_GRACE_MS = 30_000L
    const val BOOTSTRAP_MS = 60_000L
    const val LEAVE_NEAR_M = 1_000.0
    const val LEAVE_MID_M = 5_000.0
  }
}
