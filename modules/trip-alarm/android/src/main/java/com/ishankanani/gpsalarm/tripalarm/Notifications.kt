package com.ishankanani.gpsalarm.tripalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.provider.Settings

object Notifications {
  const val CHANNEL_TRIP = "trip"
  const val CHANNEL_ALARM = "alarm"
  const val CHANNEL_ALARM_FALLBACK = "alarm_fallback"
  const val CHANNEL_WARNING = "warning"

  const val ID_TRIP = 7101
  const val ID_ALARM = 7102
  const val ID_WARNING = 7103

  private const val REQ_OPEN_APP = 1
  private const val REQ_STOP = 2
  private const val REQ_DISMISS = 3
  private const val REQ_SNOOZE = 4
  private const val REQ_KEEP = 5
  private const val REQ_ALARM_SCREEN = 6
  private const val REQ_LOCATION_SETTINGS = 7

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(NotificationManager::class.java)

    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_TRIP, L10n["channelTrip"], NotificationManager.IMPORTANCE_LOW).apply {
        description = L10n["channelTripDesc"]
        setShowBadge(false)
      },
    )
    // The service plays the alarm itself (looping, escalating), so this channel stays silent.
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ALARM, L10n["channelAlarm"], NotificationManager.IMPORTANCE_HIGH).apply {
        description = L10n["channelAlarmDesc"]
        setSound(null, null)
        enableVibration(false)
        setBypassDnd(true)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      },
    )
    // Used when the app process is gone, so the notification has to make the noise.
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ALARM_FALLBACK, L10n["channelFallback"], NotificationManager.IMPORTANCE_HIGH).apply {
        description = L10n["channelFallbackDesc"]
        setSound(alarmSoundUri(), alarmAudioAttributes())
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 900, 500, 900, 500, 900)
        setBypassDnd(true)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      },
    )
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_WARNING, L10n["channelWarning"], NotificationManager.IMPORTANCE_HIGH).apply {
        description = L10n["channelWarningDesc"]
        enableVibration(true)
      },
    )
  }

  fun alarmSoundUri() =
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ?: Settings.System.DEFAULT_ALARM_ALERT_URI

  fun alarmAudioAttributes(): AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()

  fun tripNotification(context: Context, title: String, text: String, subText: String?): Notification =
    builder(context, CHANNEL_TRIP)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle(title)
      .setContentText(text)
      .setSubText(subText)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_NAVIGATION)
      .setContentIntent(openAppIntent(context))
      .addAction(action(context, L10n["stopTrip"], TripService.ACTION_STOP, REQ_STOP))
      .build()

  fun alarmNotification(context: Context, reason: String, title: String, text: String): Notification {
    val b = builder(context, CHANNEL_ALARM)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(Notification.BigTextStyle().bigText(text))
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setContentIntent(alarmScreenIntent(context, reason))
      .setFullScreenIntent(alarmScreenIntent(context, reason), true)
      .addAction(action(context, L10n["dismiss"], TripService.ACTION_DISMISS, REQ_DISMISS))
      .addAction(action(context, L10n["snooze"], TripService.ACTION_SNOOZE, REQ_SNOOZE))
    if (Texts.canKeepTracking(reason)) {
      b.addAction(action(context, L10n["notYet"], TripService.ACTION_KEEP_TRACKING, REQ_KEEP))
    }
    @Suppress("DEPRECATION")
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) b.setPriority(Notification.PRIORITY_MAX)
    return b.build()
  }

  /**
   * Rings when the service is not running (process killed, phone rebooted). The notification makes
   * the noise itself: alarm-stream sound that repeats until the notification is opened or cleared.
   */
  fun showTrackingStopped(context: Context, trip: ActiveTrip) {
    ensureChannels(context)
    val (title, text) = Texts.alarm(Texts.REASON_TRACKING_STOPPED, trip, null)
    val reason = Texts.REASON_TRACKING_STOPPED
    val b = builder(context, CHANNEL_ALARM_FALLBACK)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(Notification.BigTextStyle().bigText(text))
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setAutoCancel(true)
      .setContentIntent(alarmScreenIntent(context, reason))
      .setFullScreenIntent(alarmScreenIntent(context, reason), true)
    @Suppress("DEPRECATION")
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      b.setPriority(Notification.PRIORITY_MAX)
        .setSound(alarmSoundUri(), alarmAudioAttributes())
        .setVibrate(longArrayOf(0, 900, 500, 900, 500, 900))
    }
    val n = b.build()
    n.flags = n.flags or Notification.FLAG_INSISTENT
    notify(context, ID_ALARM, n)
  }

  /** Silent warnings go on the quiet trip channel; the warning channel always makes a sound. */
  fun showWarning(context: Context, title: String, text: String, silent: Boolean, openLocationSettings: Boolean = false) {
    val b = builder(context, if (silent) CHANNEL_TRIP else CHANNEL_WARNING)
      .setSmallIcon(android.R.drawable.stat_sys_warning)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(Notification.BigTextStyle().bigText(text))
      .setAutoCancel(true)
      .setContentIntent(if (openLocationSettings) locationSettingsIntent(context) else openAppIntent(context))
    notify(context, ID_WARNING, b.build())
  }

  fun cancel(context: Context, id: Int) {
    context.getSystemService(NotificationManager::class.java).cancel(id)
  }

  fun notify(context: Context, id: Int, notification: Notification) {
    try {
      context.getSystemService(NotificationManager::class.java).notify(id, notification)
    } catch (_: SecurityException) {
      // Notifications permission revoked mid-trip: nothing we can show.
    }
  }

  fun alarmScreenIntent(context: Context, reason: String): PendingIntent {
    val intent = AlarmActivity.intent(context, reason)
    return PendingIntent.getActivity(context, REQ_ALARM_SCREEN, intent, flags())
  }

  fun openAppIntent(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    return PendingIntent.getActivity(context, REQ_OPEN_APP, launch, flags())
  }

  private fun locationSettingsIntent(context: Context): PendingIntent {
    val intent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(context, REQ_LOCATION_SETTINGS, intent, flags())
  }

  private fun action(context: Context, title: String, serviceAction: String, requestCode: Int): Notification.Action {
    val intent = Intent(context, TripService::class.java).setAction(serviceAction)
    val pi = PendingIntent.getService(context, requestCode, intent, flags())
    @Suppress("DEPRECATION")
    return Notification.Action.Builder(null, title, pi).build()
  }

  private fun flags() = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  @Suppress("DEPRECATION")
  private fun builder(context: Context, channel: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, channel) else Notification.Builder(context)
}
