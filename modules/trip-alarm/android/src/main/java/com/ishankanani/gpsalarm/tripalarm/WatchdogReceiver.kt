package com.ishankanani.gpsalarm.tripalarm

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The AlarmManager backup for the trip watchdog. If the service is alive it just runs a tick. If
 * the process died mid-trip (an aggressive battery saver), nothing is tracking any more, so ring
 * the "tracking stopped" alarm rather than let the user sleep through their stop.
 */
class WatchdogReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val service = TripService.instance
    if (service != null) {
      service.onBackupAlarm()
      return
    }
    val saved = TripStore.load(context) ?: return
    Notifications.showTrackingStopped(context, saved.first)
    TripStore.clear(context)
  }

  companion object {
    private const val REQUEST_CODE = 42

    fun pendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
      context,
      REQUEST_CODE,
      Intent(context, WatchdogReceiver::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}

/** A reboot ends any trip. Tell the user instead of failing silently. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    val saved = TripStore.load(context) ?: return
    Notifications.showTrackingStopped(context, saved.first)
    TripStore.clear(context)
  }
}
