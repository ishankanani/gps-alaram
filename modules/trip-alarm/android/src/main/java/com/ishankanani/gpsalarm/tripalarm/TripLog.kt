package com.ishankanani.gpsalarm.tripalarm

import android.content.Context
import com.ishankanani.gpsalarm.tripalarm.engine.Fix
import com.ishankanani.gpsalarm.tripalarm.engine.TripStatus
import java.io.File
import java.io.FileWriter
import java.util.Locale
import java.util.concurrent.Executors

/**
 * One CSV per trip with every fix and every engine decision, so a missed or early alarm on a real
 * commute can be replayed and understood. Kept on the device; shared only when the user chooses.
 */
class TripLog private constructor(private val file: File, private val startedAtMs: Long) {
  private val writer = Executors.newSingleThreadExecutor()

  fun fix(nowMs: Long, fix: Fix, status: TripStatus) {
    append(
      nowMs,
      fix.provider,
      fmt(fix.lat, 6),
      fmt(fix.lon, 6),
      fmt(fix.accuracyM, 1),
      fix.speedMps?.let { fmt(it, 1) } ?: "",
      status,
      "",
    )
  }

  fun event(nowMs: Long, status: TripStatus?, event: String) {
    append(nowMs, "", "", "", "", "", status, event)
  }

  fun close() {
    writer.shutdown()
  }

  private fun append(
    nowMs: Long,
    provider: String,
    lat: String,
    lon: String,
    accuracy: String,
    speed: String,
    status: TripStatus?,
    event: String,
  ) {
    val line = listOf(
      fmt((nowMs - startedAtMs) / 1000.0, 1),
      provider,
      lat,
      lon,
      accuracy,
      speed,
      status?.distanceM?.let { fmt(it, 0) } ?: "",
      status?.etaSec?.let { fmt(it, 0) } ?: "",
      status?.tier?.name ?: "",
      status?.health?.name ?: "",
      event.replace(',', ';'),
    ).joinToString(",")
    writer.execute {
      try {
        FileWriter(file, true).use { it.write(line + "\n") }
      } catch (_: Exception) {
        // A full disk must not stop the trip.
      }
    }
  }

  companion object {
    private const val DIR = "trip-logs"
    private const val KEEP = 20
    private const val HEADER = "t_s,provider,lat,lon,accuracy_m,speed_mps,distance_m,eta_s,tier,health,event"

    fun open(context: Context, trip: ActiveTrip, startedAtMs: Long): TripLog {
      val dir = dir(context)
      dir.mkdirs()
      val file = File(dir, "trip-${trip.id}.csv")
      if (!file.exists()) {
        file.writeText(
          "# ${trip.label} | ${trip.latitude},${trip.longitude} | radius ${trip.radiusM} m | " +
            "${trip.mode} | minutes ${trip.minutesBefore ?: "-"}\n$HEADER\n",
        )
      }
      prune(dir)
      return TripLog(file, startedAtMs)
    }

    fun list(context: Context): List<File> =
      dir(context).listFiles { f -> f.name.endsWith(".csv") }?.sortedByDescending { it.lastModified() } ?: emptyList()

    fun find(context: Context, name: String): File? = list(context).firstOrNull { it.name == name }

    private fun dir(context: Context) = File(context.filesDir, DIR)

    private fun prune(dir: File) {
      val files = dir.listFiles()?.sortedByDescending { it.lastModified() } ?: return
      files.drop(KEEP).forEach { it.delete() }
    }

    private fun fmt(value: Double, decimals: Int) = String.format(Locale.US, "%.${decimals}f", value)
  }
}
