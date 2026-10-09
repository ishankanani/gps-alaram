package com.ishankanani.gpsalarm.tripalarm

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.ishankanani.gpsalarm.tripalarm.engine.AlarmMode
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.zip.GZIPInputStream
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class TripOptions(
  @Field var latitude: Double = 0.0,
  @Field var longitude: Double = 0.0,
  @Field var radiusM: Double = 500.0,
  @Field var mode: String = "arrive",
  @Field var minutesBefore: Int? = null,
  @Field var label: String = "",
  @Field var strength: String = "normal",
  @Field var useMiles: Boolean = false,
  /** Set all three for a demo ride: simulated movement from this point instead of GPS. */
  @Field var demoFromLatitude: Double? = null,
  @Field var demoFromLongitude: Double? = null,
  @Field var demoSpeedMps: Double? = null,
) : Record

class PreciseLocationRequiredException :
  CodedException("Precise location permission is needed to track a trip")

class InvalidTripException(message: String) : CodedException(message)

private const val BUFFER_BYTES = 1 shl 16

class TripAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("TripAlarm")

    Events(TripEvents.STATUS, TripEvents.ALARM, TripEvents.TRIP_ENDED)

    OnCreate {
      L10n.load(context)
      Notifications.ensureChannels(context)
      TripEvents.sink = { name, body -> sendEvent(name, body) }
    }

    OnDestroy {
      TripEvents.sink = null
      TripEvents.appInForeground = false
    }

    OnActivityEntersForeground { TripEvents.appInForeground = true }

    OnActivityEntersBackground { TripEvents.appInForeground = false }

    AsyncFunction("startTrip") { options: TripOptions ->
      startTrip(options)
    }

    AsyncFunction<Unit>("stopTrip") {
      if (TripService.instance != null) {
        TripService.send(context, TripService.ACTION_STOP)
      } else {
        TripStore.clear(context)
      }
    }

    AsyncFunction<Unit>("dismissAlarm") { TripService.send(context, TripService.ACTION_DISMISS) }

    AsyncFunction<Unit>("snoozeAlarm") { TripService.send(context, TripService.ACTION_SNOOZE) }

    AsyncFunction<Unit>("keepTracking") { TripService.send(context, TripService.ACTION_KEEP_TRACKING) }

    Function("getActiveTrip") { activeTrip() }

    /** Native texts (alarm screen, notifications) follow the language picked in the app. */
    Function("setLanguage") { code: String ->
      L10n.set(context, code)
      // Re-registering channels renames them in the system settings.
      Notifications.ensureChannels(context)
    }

    AsyncFunction("testAlarm") { strength: String ->
      val ctx = context
      if (!AlarmPlayer.isRinging) {
        AlarmPlayer.start(ctx, AlarmStrength.parse(strength))
        val intent = AlarmActivity.intent(ctx, Texts.REASON_TEST)
        (appContext.currentActivity ?: ctx).startActivity(intent)
      }
    }.runOnQueue(Queues.MAIN)

    Function("getSetupStatus") { setupStatus() }

    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        val enabled = context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()
        promise.resolve(mapOf("granted" to enabled))
      } else {
        Permissions.askForPermissionsWithPermissionsManager(
          appContext.permissions,
          promise,
          Manifest.permission.POST_NOTIFICATIONS,
        )
      }
    }

    Function("openSettings") { kind: String -> openSettings(kind) }

    Function("listTripLogs") {
      TripLog.list(context).map {
        mapOf("name" to it.name, "sizeBytes" to it.length().toDouble(), "modifiedAt" to it.lastModified().toDouble())
      }
    }

    AsyncFunction("shareTripLog") { name: String ->
      val ctx = context
      val file = TripLog.find(ctx, name) ?: throw InvalidTripException("No trip log named $name")
      val send = Intent(Intent.ACTION_SEND)
        .setType("text/plain")
        .putExtra(Intent.EXTRA_SUBJECT, name)
        .putExtra(Intent.EXTRA_TEXT, file.readText())
      val chooser = Intent.createChooser(send, L10n["shareLog"])
      val activity = appContext.currentActivity
      if (activity != null) {
        activity.startActivity(chooser)
      } else {
        ctx.startActivity(chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }.runOnQueue(Queues.MAIN)

    /** Unpacks a downloaded stop pack (.gz) and returns the size of the result in bytes. */
    AsyncFunction("gunzip") { source: String, destination: String ->
      gunzip(fileOf(source), fileOf(destination)).toDouble()
    }
  }

  private fun fileOf(uriOrPath: String): File =
    File(if (uriOrPath.startsWith("file:")) Uri.parse(uriOrPath).path ?: uriOrPath else uriOrPath)

  private fun gunzip(source: File, destination: File): Long {
    if (!source.isFile) throw InvalidTripException("No file at ${source.path}")
    destination.parentFile?.mkdirs()
    GZIPInputStream(BufferedInputStream(FileInputStream(source), BUFFER_BYTES)).use { input ->
      FileOutputStream(destination).use { output -> input.copyTo(output, BUFFER_BYTES) }
    }
    return destination.length()
  }

  private fun startTrip(options: TripOptions): Map<String, Any?> {
    val ctx = context
    if (ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      throw PreciseLocationRequiredException()
    }
    if (options.latitude !in -90.0..90.0 || options.longitude !in -180.0..180.0) {
      throw InvalidTripException("Destination coordinates are out of range")
    }
    if (options.radiusM !in 50.0..50_000.0) {
      throw InvalidTripException("Radius must be between 50 m and 50 km")
    }
    val now = System.currentTimeMillis()
    val trip = ActiveTrip(
      id = now.toString(),
      label = options.label.trim().ifEmpty { L10n["yourStop"] },
      latitude = options.latitude,
      longitude = options.longitude,
      radiusM = options.radiusM,
      mode = if (options.mode.equals("leave", ignoreCase = true)) AlarmMode.LEAVE else AlarmMode.ARRIVE,
      minutesBefore = options.minutesBefore?.takeIf { it > 0 },
      strength = AlarmStrength.parse(options.strength),
      useMiles = options.useMiles,
      startedAtWallMs = now,
      demoFromLat = options.demoFromLatitude?.takeIf { it in -90.0..90.0 },
      demoFromLon = options.demoFromLongitude?.takeIf { it in -180.0..180.0 },
      demoSpeedMps = options.demoSpeedMps?.takeIf { it in 1.0..100.0 },
    )
    TripService.start(ctx, trip)
    return trip.toMap()
  }

  private fun activeTrip(): Map<String, Any?>? {
    val service = TripService.instance
    if (service?.currentTrip != null) return service.statusMap()
    // A trip was saved but nothing runs it: the process was killed.
    val saved = TripStore.load(context) ?: return null
    return mapOf("trip" to saved.first.toMap(), "state" to "stopped")
  }

  private fun setupStatus(): Map<String, Any?> {
    val ctx = context
    val fine = ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val coarse = ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    val lm = ctx.getSystemService(LocationManager::class.java)
    val locationOn = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      lm.isLocationEnabled
    } else {
      lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }

    val nm = ctx.getSystemService(NotificationManager::class.java)
    Notifications.ensureChannels(ctx)
    val alarmChannelOn = Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
      nm.getNotificationChannel(Notifications.CHANNEL_ALARM)?.importance != NotificationManager.IMPORTANCE_NONE
    val fullScreen = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || nm.canUseFullScreenIntent()

    val am = ctx.getSystemService(AlarmManager::class.java)
    val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()

    val pm = ctx.getSystemService(PowerManager::class.java)
    val unrestricted = pm.isIgnoringBatteryOptimizations(ctx.packageName)

    return mapOf(
      "location" to if (fine) "precise" else if (coarse) "approximate" else "none",
      "locationServices" to locationOn,
      "notifications" to (nm.areNotificationsEnabled() && alarmChannelOn),
      "fullScreenAlarm" to fullScreen,
      "exactAlarms" to exact,
      "batteryUnrestricted" to unrestricted,
      "manufacturer" to Build.MANUFACTURER,
      "sdkInt" to Build.VERSION.SDK_INT,
    )
  }

  private fun openSettings(kind: String): Boolean {
    val ctx = context
    val pkg = Uri.parse("package:${ctx.packageName}")
    val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
    val intent = when (kind) {
      "notifications" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
        } else {
          appDetails
        }
      "fullScreenAlarm" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg)
        } else {
          appDetails
        }
      "exactAlarms" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg) else appDetails
      "battery" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
      "location" -> Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
      else -> appDetails
    }
    return launch(intent) || (intent !== appDetails && launch(appDetails))
  }

  private fun launch(intent: Intent): Boolean = try {
    val activity = appContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    true
  } catch (e: ActivityNotFoundException) {
    false
  }
}
