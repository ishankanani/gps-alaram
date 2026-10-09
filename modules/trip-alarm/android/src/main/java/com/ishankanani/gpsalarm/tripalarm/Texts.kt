package com.ishankanani.gpsalarm.tripalarm

import com.ishankanani.gpsalarm.tripalarm.engine.AlarmMode
import com.ishankanani.gpsalarm.tripalarm.engine.GpsHealth
import com.ishankanani.gpsalarm.tripalarm.engine.TripStatus
import java.util.Locale
import kotlin.math.roundToInt

/** Native-side wording for notifications and the alarm screen, in the app's language (see L10n). */
object Texts {
  /** Reasons the alarm screen can show besides the engine's trigger reasons. */
  const val REASON_TEST = "TEST"
  const val REASON_TRACKING_STOPPED = "TRACKING_STOPPED"

  private fun decimal(value: Double, unit: String): String =
    String.format(Locale.US, "%.1f", value).replace('.', L10n.decimalSeparator) + " " + unit

  fun distance(meters: Double, useMiles: Boolean): String {
    if (useMiles) {
      val miles = meters / 1609.344
      return if (miles < 0.1) "${(meters * 3.28084 / 10).roundToInt() * 10} ft" else decimal(miles, "mi")
    }
    return when {
      meters < 1_000 -> "${(meters / 10).roundToInt() * 10} m"
      meters < 10_000 -> decimal(meters / 1000, "km")
      else -> "${(meters / 1000).roundToInt()} km"
    }
  }

  fun duration(seconds: Double): String {
    val minutes = (seconds / 60).roundToInt()
    return when {
      minutes < 1 -> "<1 min"
      minutes < 60 -> "$minutes min"
      else -> "${minutes / 60} h ${minutes % 60} min"
    }
  }

  fun tripTitle(trip: ActiveTrip): String = when {
    trip.isDemo -> L10n.format("demoTitle", "label" to trip.label)
    trip.mode == AlarmMode.LEAVE -> L10n.format("tripLeaving", "label" to trip.label)
    else -> L10n.format("tripTo", "label" to trip.label)
  }

  fun ringsWhen(trip: ActiveTrip): String {
    val radius = distance(trip.radiusM, trip.useMiles)
    return when {
      trip.mode == AlarmMode.LEAVE -> L10n.format("ringsLeave", "radius" to radius)
      trip.minutesBefore != null ->
        L10n.format("ringsBefore", "minutes" to trip.minutesBefore.toString(), "radius" to radius)
      else -> L10n.format("ringsWithin", "radius" to radius)
    }
  }

  fun statusLine(trip: ActiveTrip, status: TripStatus?): String {
    if (status == null || status.distanceM == null) return L10n["waitingGps"]
    val parts = mutableListOf<String>()
    if (trip.mode == AlarmMode.LEAVE && !status.armed) {
      parts += L10n["waitingInside"]
    } else {
      // Without GPS the distance is a guess from the last speed.
      parts += (if (status.estimated) "≈ " else "") + distance(status.distanceM, trip.useMiles)
      status.etaSec?.let { if (trip.mode == AlarmMode.ARRIVE) parts += duration(it) }
    }
    parts += when (status.health) {
      GpsHealth.GOOD -> L10n["gpsGood"]
      GpsHealth.WEAK -> L10n["gpsWeak"]
      GpsHealth.LOST -> L10n["gpsLost"]
      GpsHealth.WAITING -> L10n["waitingGps"]
    }
    return parts.joinToString(" · ")
  }

  /** Title and body for the alarm screen. */
  fun alarm(reason: String, trip: ActiveTrip?, status: TripStatus?): Pair<String, String> {
    val label = trip?.label ?: L10n["yourStop"]
    val distanceText = status?.distanceM?.let { distance(it, trip?.useMiles == true) }
    val wake = L10n["wakeUp"]
    return when (reason) {
      "ARRIVED" -> Pair(
        wake,
        if (distanceText != null) {
          L10n.format("arrived", "distance" to distanceText, "label" to label)
        } else {
          L10n.format("arrivedNoDistance", "label" to label)
        },
      )
      "PASSED_THROUGH" -> Pair(wake, L10n.format("passedThrough", "label" to label))
      "ETA" -> {
        val eta = status?.etaSec?.let { duration(it) } ?: "${trip?.minutesBefore ?: ""} min"
        Pair(wake, L10n.format("eta", "eta" to eta, "label" to label))
      }
      "CLOSEST_POINT_PASSED" -> Pair(L10n["closestTitle"], L10n.format("closest", "label" to label))
      "ESTIMATED" -> Pair(wake, L10n.format("estimated", "label" to label))
      "LEFT_AREA" -> Pair(L10n["leftTitle"], L10n.format("left", "label" to label))
      REASON_TRACKING_STOPPED -> Pair(L10n["stoppedTitle"], L10n.format("stopped", "label" to label))
      REASON_TEST -> Pair(L10n["testTitle"], L10n["test"])
      else -> Pair(wake, label)
    }
  }

  /** Uncertain alarms offer "Not yet, keep tracking". */
  fun canKeepTracking(reason: String) = reason == "CLOSEST_POINT_PASSED" || reason == "ESTIMATED"
}
