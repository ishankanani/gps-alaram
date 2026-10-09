package com.ishankanani.gpsalarm.tripalarm

import android.content.Context
import com.ishankanani.gpsalarm.tripalarm.engine.AlarmMode
import com.ishankanani.gpsalarm.tripalarm.engine.TripConfig
import org.json.JSONObject

enum class AlarmStrength(
  /** Share of the alarm stream's maximum volume we raise it to. */
  val streamFraction: Double,
  /** Player volume we start at, ramping up to full over [rampMs]. */
  val startVolume: Float,
  val rampMs: Long,
  val flash: Boolean,
) {
  GENTLE(0.6, 0.15f, 30_000, flash = false),
  NORMAL(0.85, 0.3f, 20_000, flash = false),
  HEAVY(1.0, 0.6f, 8_000, flash = true);

  companion object {
    fun parse(value: String?): AlarmStrength =
      entries.firstOrNull { it.name.equals(value, ignoreCase = true) } ?: NORMAL
  }
}

enum class TripState { TRACKING, RINGING, SNOOZED }

/** Everything needed to run (or resume) a trip. Survives process death via [TripStore]. */
data class ActiveTrip(
  val id: String,
  val label: String,
  val latitude: Double,
  val longitude: Double,
  val radiusM: Double,
  val mode: AlarmMode,
  val minutesBefore: Int?,
  val strength: AlarmStrength,
  val useMiles: Boolean,
  val startedAtWallMs: Long,
  /** A demo ride starts here and moves to the stop at [demoSpeedMps], with simulated fixes. */
  val demoFromLat: Double? = null,
  val demoFromLon: Double? = null,
  val demoSpeedMps: Double? = null,
) {
  val config: TripConfig get() = TripConfig(latitude, longitude, radiusM, mode, minutesBefore)
  val isDemo: Boolean get() = demoSpeedMps != null && demoFromLat != null && demoFromLon != null

  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("label", label)
    .put("latitude", latitude)
    .put("longitude", longitude)
    .put("radiusM", radiusM)
    .put("mode", mode.name)
    .put("minutesBefore", minutesBefore ?: JSONObject.NULL)
    .put("strength", strength.name)
    .put("useMiles", useMiles)
    .put("startedAtWallMs", startedAtWallMs)
    .put("demoFromLat", demoFromLat ?: JSONObject.NULL)
    .put("demoFromLon", demoFromLon ?: JSONObject.NULL)
    .put("demoSpeedMps", demoSpeedMps ?: JSONObject.NULL)

  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "label" to label,
    "latitude" to latitude,
    "longitude" to longitude,
    "radiusM" to radiusM,
    "mode" to mode.name.lowercase(),
    "minutesBefore" to minutesBefore,
    "strength" to strength.name.lowercase(),
    "useMiles" to useMiles,
    "startedAt" to startedAtWallMs.toDouble(),
    "demo" to isDemo,
  )

  companion object {
    fun fromJson(json: JSONObject) = ActiveTrip(
      id = json.getString("id"),
      label = json.optString("label"),
      latitude = json.getDouble("latitude"),
      longitude = json.getDouble("longitude"),
      radiusM = json.getDouble("radiusM"),
      mode = AlarmMode.valueOf(json.getString("mode")),
      minutesBefore = if (json.isNull("minutesBefore")) null else json.getInt("minutesBefore"),
      strength = AlarmStrength.parse(json.optString("strength")),
      useMiles = json.optBoolean("useMiles"),
      startedAtWallMs = json.getLong("startedAtWallMs"),
      demoFromLat = json.optDoubleOrNull("demoFromLat"),
      demoFromLon = json.optDoubleOrNull("demoFromLon"),
      demoSpeedMps = json.optDoubleOrNull("demoSpeedMps"),
    )

    private fun JSONObject.optDoubleOrNull(key: String): Double? = if (isNull(key)) null else optDouble(key)
  }
}

/** The active trip, kept in shared preferences so a restarted process knows a trip was running. */
object TripStore {
  private const val PREFS = "trip_alarm"
  private const val KEY_TRIP = "active_trip"
  private const val KEY_STATE = "state"

  fun save(context: Context, trip: ActiveTrip, state: TripState) {
    prefs(context).edit()
      .putString(KEY_TRIP, trip.toJson().toString())
      .putString(KEY_STATE, state.name)
      .commit()
  }

  fun load(context: Context): Pair<ActiveTrip, TripState>? {
    val p = prefs(context)
    val raw = p.getString(KEY_TRIP, null) ?: return null
    return try {
      val state = TripState.valueOf(p.getString(KEY_STATE, null) ?: TripState.TRACKING.name)
      Pair(ActiveTrip.fromJson(JSONObject(raw)), state)
    } catch (e: Exception) {
      clear(context)
      null
    }
  }

  fun clear(context: Context) {
    prefs(context).edit().clear().commit()
  }

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
