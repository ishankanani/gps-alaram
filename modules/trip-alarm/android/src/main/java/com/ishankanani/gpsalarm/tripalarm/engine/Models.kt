package com.ishankanani.gpsalarm.tripalarm.engine

enum class AlarmMode { ARRIVE, LEAVE }

/** How far we are from needing to ring, which decides how hard we track. */
enum class Tier { FAR, MID, NEAR }

enum class GpsHealth { WAITING, GOOD, WEAK, LOST }

enum class TriggerReason {
  /** A fix landed inside the radius. */
  ARRIVED,

  /** The time-before-arrival threshold was reached. */
  ETA,

  /** Two consecutive fixes straddle the radius: we went through it between fixes. */
  PASSED_THROUGH,

  /** We came close to the target and are now moving away (the pin is off the route). */
  CLOSEST_POINT_PASSED,

  /** GPS went quiet and the dead-reckoning estimate says we have arrived. */
  ESTIMATED,

  /** Leave mode: we are outside the perimeter. */
  LEFT_AREA,
}

data class TripConfig(
  val targetLat: Double,
  val targetLon: Double,
  val radiusM: Double,
  val mode: AlarmMode = AlarmMode.ARRIVE,
  /** Arrive mode only: also ring this many minutes before arrival. Null turns it off. */
  val minutesBefore: Int? = null,
)

/**
 * One location fix. [timeMs] must use a monotonic clock (Android: elapsed realtime) that is
 * shared with the `nowMs` values passed to the engine.
 */
data class Fix(
  val lat: Double,
  val lon: Double,
  val accuracyM: Double,
  val timeMs: Long,
  val speedMps: Double? = null,
  val provider: String = "gps",
)

data class TrackingPlan(
  val tier: Tier,
  /** Requested interval for the GPS provider, or null to leave GPS off. */
  val gpsIntervalMs: Long?,
  /** Requested interval for the network (cell/Wi-Fi) provider. */
  val networkIntervalMs: Long,
  /** Keep the CPU awake so callbacks and the watchdog run on time. */
  val holdWakeLock: Boolean,
) {
  /** The interval at which we expect fixes to arrive. */
  val expectedIntervalMs: Long get() = gpsIntervalMs ?: networkIntervalMs
}

data class TripStatus(
  /**
   * Where the user is, for the trip map: the last usable fix, or with [estimated] the
   * dead-reckoning guess while GPS is lost (in a tunnel or an underground station).
   */
  val latitude: Double?,
  val longitude: Double?,
  val distanceM: Double?,
  val etaSec: Double?,
  val speedMps: Double?,
  val accuracyM: Double?,
  val lastFixAgeMs: Long?,
  val health: GpsHealth,
  val tier: Tier,
  /** Leave mode: false until the first fix inside the perimeter. Always true for arrive. */
  val armed: Boolean,
  val closestDistanceM: Double?,
  /** When the dead-reckoning alarm would fire if no new fix arrives (monotonic ms). */
  val fallbackAtMs: Long?,
  val trigger: TriggerReason?,
  /** Position, distance and ETA are estimated from the last speed: no GPS right now. */
  val estimated: Boolean = false,
)

data class EngineUpdate(
  val status: TripStatus,
  /** The tracking plan changed and location requests should be re-issued. */
  val planChanged: Boolean,
  /** Set exactly once, on the update that decided to ring. */
  val trigger: TriggerReason?,
  /** GPS just went quiet for longer than the tier allows. */
  val signalLost: Boolean,
  /** A usable fix arrived after a signal-lost period. */
  val signalRecovered: Boolean,
)

data class EngineParams(
  /** Rolling window for the average-speed estimate. */
  val speedWindowMs: Long = 120_000,
  /** Fixes worse than this are not used for speed (network fixes jump around). */
  val speedMaxAccuracyM: Double = 100.0,
  /** Ignore fixes worse than this entirely. */
  val maxUsableAccuracyM: Double = 5_000.0,
  /** A fix must be at least this good (or within half the radius) to ring the alarm. */
  val triggerAccuracyM: Double = 250.0,
  /** Coarser fixes still count for the time-before-arrival trigger, since the error is small in time. */
  val etaTriggerAccuracyM: Double = 1_000.0,
  /** Fixes better than this keep the GPS health "good". */
  val goodAccuracyM: Double = 100.0,
  /** Fixes worse than this do not reset the signal-lost watchdog. */
  val watchdogAccuracyM: Double = 500.0,
  /** Assumed speed when we have no estimate yet (a fast regional train). */
  val unknownSpeedMps: Double = 33.0,
  /** Below this the vehicle counts as stopped: no ETA, no dead reckoning. */
  val minMovingSpeedMps: Double = 1.0,
  /** Fire the dead-reckoning alarm this fraction of the way to the estimated arrival. */
  val fallbackSafety: Double = 0.85,
  val nearDistanceM: Double = 5_000.0,
  val midDistanceM: Double = 20_000.0,
  val nearEtaMarginSec: Double = 15 * 60.0,
  val midEtaMarginSec: Double = 30 * 60.0,
  /** Leave the closer tier only when the distance is this much past the boundary. */
  val tierHysteresis: Double = 1.2,
  val farGpsIntervalMs: Long = 120_000,
  val farNetworkIntervalMs: Long = 60_000,
  val midIntervalMs: Long = 30_000,
  val nearGpsIntervalMs: Long = 5_000,
  val nearNetworkIntervalMs: Long = 10_000,
  /** Never call the signal lost sooner than this after the last fix. */
  val minLostAfterMs: Long = 60_000,
)
