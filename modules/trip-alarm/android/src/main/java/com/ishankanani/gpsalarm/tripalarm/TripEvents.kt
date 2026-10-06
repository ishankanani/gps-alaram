package com.ishankanani.gpsalarm.tripalarm

/**
 * Hands service events to the JS module when it is alive. The service never depends on anyone
 * listening: with the app closed, events simply go nowhere.
 */
object TripEvents {
  const val STATUS = "onStatus"
  const val ALARM = "onAlarm"
  const val TRIP_ENDED = "onTripEnded"

  @Volatile
  var sink: ((String, Map<String, Any?>) -> Unit)? = null

  /** Whether one of the app's activities is in the foreground (set by the module). */
  @Volatile
  var appInForeground = false

  fun emit(name: String, body: Map<String, Any?>) {
    try {
      sink?.invoke(name, body)
    } catch (_: Exception) {
      // A JS runtime going away mid-emit must never take the tracking service down with it.
    }
  }
}
