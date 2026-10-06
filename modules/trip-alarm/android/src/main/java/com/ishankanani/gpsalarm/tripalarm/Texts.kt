package com.ishankanani.gpsalarm.tripalarm

import com.ishankanani.gpsalarm.tripalarm.engine.AlarmMode
import com.ishankanani.gpsalarm.tripalarm.engine.GpsHealth
import com.ishankanani.gpsalarm.tripalarm.engine.TripStatus
import java.util.Locale
import kotlin.math.roundToInt

/** Native-side wording for notifications and the alarm screen. English only for now. */
object Texts {
  /** Reasons the alarm screen can show besides the engine's trigger reasons. */
  const val REASON_TEST = "TEST"
  const val REASON_TRACKING_STOPPED = "TRACKING_STOPPED"

  fun distance(meters: Double, useMiles: Boolean): String {
    if (useMiles) {
      val miles = meters / 1609.344
      return if (miles < 0.1) "${(meters * 3.28084 / 10).roundToInt() * 10} ft" else String.format(Locale.US, "%.1f mi", miles)
    }
    return when {
      meters < 1_000 -> "${(meters / 10).roundToInt() * 10} m"
      meters < 10_000 -> String.format(Locale.US, "%.1f km", meters / 1000)
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

  fun tripTitle(trip: ActiveTrip): String =
    if (trip.mode == AlarmMode.LEAVE) "Leaving ${trip.label}" else "To ${trip.label}"

  fun ringsWhen(trip: ActiveTrip): String {
    val radius = distance(trip.radiusM, trip.useMiles)
    return when {
      trip.mode == AlarmMode.LEAVE -> "Rings when you are more than $radius away"
      trip.minutesBefore != null -> "Rings ${trip.minutesBefore} min before or within $radius"
      else -> "Rings within $radius"
    }
  }

  fun statusLine(trip: ActiveTrip, status: TripStatus?): String {
    if (status == null || status.distanceM == null) return "Waiting for GPS…"
    val parts = mutableListOf<String>()
    if (trip.mode == AlarmMode.LEAVE && !status.armed) {
      parts += "Waiting until you are inside the area"
    } else {
      parts += distance(status.distanceM, trip.useMiles)
      status.etaSec?.let { if (trip.mode == AlarmMode.ARRIVE) parts += duration(it) }
    }
    parts += when (status.health) {
      GpsHealth.GOOD -> "GPS good"
      GpsHealth.WEAK -> "GPS weak"
      GpsHealth.LOST -> "GPS lost, estimating"
      GpsHealth.WAITING -> "Waiting for GPS"
    }
    return parts.joinToString(" · ")
  }

  /** Title and body for the alarm screen. */
  fun alarm(reason: String, trip: ActiveTrip?, status: TripStatus?): Pair<String, String> {
    val label = trip?.label ?: "your stop"
    val distanceText = status?.distanceM?.let { distance(it, trip?.useMiles == true) }
    return when (reason) {
      "ARRIVED" -> Pair("Wake up!", "You are ${distanceText ?: "almost"} from $label.")
      "PASSED_THROUGH" -> Pair("Wake up!", "You are at $label.")
      "ETA" -> Pair(
        "Wake up!",
        "About ${status?.etaSec?.let { duration(it) } ?: "${trip?.minutesBefore} min"} to $label.",
      )
      "CLOSEST_POINT_PASSED" -> Pair(
        "Check where you are",
        "This is the closest you get to $label${distanceText?.let { " ($it away)" } ?: ""}. Your route does not pass the pin itself.",
      )
      "ESTIMATED" -> Pair("Wake up!", "GPS signal lost. By our estimate you are near $label now.")
      "LEFT_AREA" -> Pair("You left the area", "You are outside $label.")
      REASON_TRACKING_STOPPED -> Pair(
        "Tracking stopped",
        "Your phone stopped the trip to $label. Check where you are, then open the app to start it again.",
      )
      REASON_TEST -> Pair("Test alarm", "This is how your alarm will sound and look.")
      else -> Pair("Wake up!", label)
    }
  }

  /** Uncertain alarms offer "Not yet, keep tracking". */
  fun canKeepTracking(reason: String) = reason == "CLOSEST_POINT_PASSED" || reason == "ESTIMATED"
}
