package com.ishankanani.gpsalarm.tripalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import com.ishankanani.gpsalarm.tripalarm.engine.EngineUpdate
import com.ishankanani.gpsalarm.tripalarm.engine.Fix
import com.ishankanani.gpsalarm.tripalarm.engine.Geo
import com.ishankanani.gpsalarm.tripalarm.engine.Tier
import com.ishankanani.gpsalarm.tripalarm.engine.TrackingPlan
import com.ishankanani.gpsalarm.tripalarm.engine.TripEngine
import com.ishankanani.gpsalarm.tripalarm.engine.TripStatus
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min

/**
 * Runs a trip end to end without JavaScript: location updates, the trip engine, the watchdog
 * and the alarm. It is a location foreground service started while the app is open, which is
 * what lets it track with only "while using the app" location permission.
 *
 * Everything runs on the main looper. The watchdog has two clocks: a Handler for normal
 * operation and an AlarmManager backup that still fires in doze or after the process died.
 */
class TripService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var locationManager: LocationManager

  private var trip: ActiveTrip? = null
  private var engine: TripEngine? = null
  private var state = TripState.TRACKING
  private var lastStatus: TripStatus? = null
  private var lastTrigger: String? = null
  private var requestedPlan: TrackingPlan? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var log: TripLog? = null
  private var lastNotificationMs = 0L
  private var scheduledBackupAtMs = 0L
  private var snoozeUntilMs = 0L

  private val gpsListener = Listener()
  private val networkListener = Listener()
  private val tickRunnable = Runnable { tick() }
  private val refreshRunnable = Runnable { refreshEstimate() }
  private val demoRunnable = Runnable { feedDemo() }
  private var demoStartedMs = 0L

  val currentTrip: ActiveTrip? get() = trip
  val currentStatus: TripStatus? get() = lastStatus

  override fun onCreate() {
    super.onCreate()
    instance = this
    L10n.load(this)
    locationManager = getSystemService(LocationManager::class.java)
    Notifications.ensureChannels(this)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        val json = intent.getStringExtra(EXTRA_TRIP)
        if (json == null) {
          stopSelf()
        } else {
          startTrip(ActiveTrip.fromJson(JSONObject(json)))
        }
      }
      ACTION_STOP -> endTrip("stopped")
      ACTION_DISMISS -> endTrip("dismissed")
      ACTION_SNOOZE -> snooze()
      ACTION_KEEP_TRACKING -> keepTracking()
      ACTION_TICK -> tick()
      else -> restore()
    }
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    stopLocationUpdates()
    releaseWakeLock()
    log?.close()
    if (instance === this) instance = null
    super.onDestroy()
  }

  // region trip lifecycle

  private fun startTrip(newTrip: ActiveTrip) {
    if (trip != null) stopLocationUpdates()
    trip = newTrip
    state = TripState.TRACKING
    lastStatus = null
    lastTrigger = null
    requestedPlan = null
    if (!goForeground(newTrip)) return

    TripStore.save(this, newTrip, state)
    val now = SystemClock.elapsedRealtime()
    engine = TripEngine(newTrip.config, startedAtMs = now)
    log?.close()
    log = TripLog.open(this, newTrip, now)
    log?.event(now, null, "start")
    AlarmPlayer.stop(this)
    Notifications.cancel(this, Notifications.ID_ALARM)
    Notifications.cancel(this, Notifications.ID_WARNING)
    applyPlan()
    if (newTrip.isDemo) {
      demoStartedMs = now
      handler.post(demoRunnable)
    }
    scheduleWatchdog()
    emitStatus()
  }

  /** The system restarted us after killing the process (START_STICKY), or a stray action arrived. */
  private fun restore() {
    if (trip != null) return
    val saved = TripStore.load(this)
    if (saved == null || saved.first.isDemo) {
      // A demo ride that was interrupted is simply over.
      if (saved != null) TripStore.clear(this)
      stopSelf()
      return
    }
    // Resuming a location service from the background is not allowed with "while in use"
    // permission, so the best we can do is make sure the user knows the trip stopped.
    if (!goForeground(saved.first)) return
    Notifications.showTrackingStopped(this, saved.first)
    TripStore.clear(this)
    stopForegroundCompat()
    stopSelf()
  }

  private fun goForeground(forTrip: ActiveTrip): Boolean {
    val notification = Notifications.tripNotification(
      this,
      Texts.tripTitle(forTrip),
      Texts.statusLine(forTrip, null),
      Texts.ringsWhen(forTrip),
    )
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(Notifications.ID_TRIP, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
      } else {
        startForeground(Notifications.ID_TRIP, notification)
      }
      true
    } catch (e: Exception) {
      // Missing location permission, or started from the background where Android forbids it.
      Log.e(TAG, "Could not start the trip in the foreground", e)
      Notifications.showTrackingStopped(this, forTrip)
      TripStore.clear(this)
      TripEvents.emit(TripEvents.TRIP_ENDED, mapOf("reason" to "error", "message" to (e.message ?: "")))
      trip = null
      stopSelf()
      false
    }
  }

  private fun endTrip(reason: String) {
    val ended = trip
    val now = SystemClock.elapsedRealtime()
    log?.event(now, lastStatus, "end:$reason")
    log?.close()
    log = null
    AlarmPlayer.stop(this)
    AlarmActivity.closeIfOpen()
    handler.removeCallbacksAndMessages(null)
    cancelBackupAlarm()
    stopLocationUpdates()
    releaseWakeLock()
    Notifications.cancel(this, Notifications.ID_ALARM)
    Notifications.cancel(this, Notifications.ID_WARNING)
    TripStore.clear(this)
    trip = null
    engine = null
    TripEvents.emit(
      TripEvents.TRIP_ENDED,
      mapOf(
        "reason" to reason,
        "trigger" to lastTrigger,
        "tripId" to ended?.id,
        "logName" to ended?.let { "trip-${it.id}.csv" },
      ),
    )
    stopForegroundCompat()
    stopSelf()
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  // endregion

  // region location

  private inner class Listener : LocationListener {
    override fun onLocationChanged(location: Location) = onLocation(location)

    // Overridden explicitly: these are abstract on Android versions before 10.
    override fun onProviderEnabled(provider: String) {}

    override fun onProviderDisabled(provider: String) = onProviderOff()

    @Deprecated("Deprecated in Java")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
  }

  private fun applyPlan() {
    val plan = engine?.plan ?: return
    if (plan == requestedPlan) return
    stopLocationUpdates()
    requestedPlan = plan
    if (trip?.isDemo == true) {
      // A demo ride feeds simulated fixes through the same engine instead of using GPS.
      if (plan.holdWakeLock) acquireWakeLock() else releaseWakeLock()
      return
    }
    val providers = locationManager.allProviders
    try {
      val gpsInterval = plan.gpsIntervalMs
      if (gpsInterval != null && LocationManager.GPS_PROVIDER in providers) {
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, gpsInterval, 0f, gpsListener, Looper.getMainLooper())
      }
      if (LocationManager.NETWORK_PROVIDER in providers) {
        locationManager.requestLocationUpdates(
          LocationManager.NETWORK_PROVIDER, plan.networkIntervalMs, 0f, networkListener, Looper.getMainLooper(),
        )
      }
    } catch (e: SecurityException) {
      Log.e(TAG, "Location permission revoked", e)
      Notifications.showWarning(this, L10n["permissionTitle"], L10n["permission"], silent = false)
    } catch (e: IllegalArgumentException) {
      Log.e(TAG, "Location provider unavailable", e)
    }
    if (plan.holdWakeLock) acquireWakeLock() else releaseWakeLock()
    log?.event(SystemClock.elapsedRealtime(), lastStatus, "plan:${plan.tier}")
  }

  private fun stopLocationUpdates() {
    locationManager.removeUpdates(gpsListener)
    locationManager.removeUpdates(networkListener)
    requestedPlan = null
  }

  private fun onLocation(location: Location) {
    val e = engine ?: return
    val nowMs = SystemClock.elapsedRealtime()
    // Some mock-location apps and old providers leave the fix time empty; treat those as "now".
    val fixMs = location.elapsedRealtimeNanos / 1_000_000
    val fix = Fix(
      lat = location.latitude,
      lon = location.longitude,
      accuracyM = if (location.hasAccuracy()) location.accuracy.toDouble() else 9_999.0,
      timeMs = if (fixMs <= 0 || fixMs > nowMs) nowMs else fixMs,
      speedMps = if (location.hasSpeed()) location.speed.toDouble() else null,
      provider = location.provider ?: "?",
    )
    val update = e.onFix(fix)
    log?.fix(SystemClock.elapsedRealtime(), fix, update.status)
    handle(update)
  }

  /** One simulated fix a second, along the straight line from the demo start to the stop. */
  private fun feedDemo() {
    val t = trip ?: return
    val fromLat = t.demoFromLat ?: return
    val fromLon = t.demoFromLon ?: return
    val speed = t.demoSpeedMps ?: return
    val total = Geo.distanceM(fromLat, fromLon, t.latitude, t.longitude)
    val travelled = min(total, speed * (SystemClock.elapsedRealtime() - demoStartedMs) / 1000.0)
    val f = if (total > 0.0) travelled / total else 1.0
    val location = Location(LocationManager.GPS_PROVIDER).apply {
      latitude = fromLat + (t.latitude - fromLat) * f
      longitude = fromLon + (t.longitude - fromLon) * f
      accuracy = 5f
      this.speed = if (travelled < total) speed.toFloat() else 0f
      time = System.currentTimeMillis()
      elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
    }
    if (state == TripState.TRACKING) onLocation(location)
    handler.postDelayed(demoRunnable, DEMO_INTERVAL_MS)
  }

  private fun onProviderOff() {
    val gpsOn = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
    val networkOn = LocationManager.NETWORK_PROVIDER in locationManager.allProviders &&
      locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    if (!gpsOn && !networkOn && state == TripState.TRACKING) {
      log?.event(SystemClock.elapsedRealtime(), lastStatus, "location-off")
      Notifications.showWarning(
        this,
        L10n["locationOffTitle"],
        L10n["locationOff"],
        silent = false,
        openLocationSettings = true,
      )
    }
  }

  // endregion

  // region engine updates and watchdog

  private fun tick() {
    val now = SystemClock.elapsedRealtime()
    if (state == TripState.SNOOZED) {
      if (now >= snoozeUntilMs) ring(lastTrigger ?: "ARRIVED", resumed = true) else scheduleSnooze()
      return
    }
    val e = engine ?: return
    if (state != TripState.TRACKING) return
    handle(e.onTick(now))
  }

  private fun handle(update: EngineUpdate) {
    val currentTrip = trip ?: return
    val now = SystemClock.elapsedRealtime()
    lastStatus = update.status
    if (update.planChanged) applyPlan()

    if (update.signalLost) {
      log?.event(now, update.status, "signal-lost")
      // Only worth waking someone for when the stop is close; otherwise the notification says it.
      val near = update.status.tier == Tier.NEAR
      Notifications.showWarning(
        this,
        L10n["gpsLostTitle"],
        if (near) L10n["gpsLostNear"] else L10n["gpsLostFar"],
        silent = !near,
      )
    }
    if (update.signalRecovered) {
      log?.event(now, update.status, "signal-back")
      Notifications.cancel(this, Notifications.ID_WARNING)
    }

    val trigger = update.trigger
    if (trigger != null && state == TripState.TRACKING) {
      log?.event(now, update.status, "trigger:${trigger.name}")
      ring(trigger.name, resumed = false)
    } else if (state == TripState.TRACKING) {
      updateTripNotification(currentTrip, force = update.planChanged || update.signalLost || update.signalRecovered)
      scheduleWatchdog()
    }
    handler.removeCallbacks(refreshRunnable)
    if (state == TripState.TRACKING && update.status.estimated) handler.postDelayed(refreshRunnable, ESTIMATE_REFRESH_MS)
    emitStatus()
  }

  /** Without GPS (a tunnel, an underground station) the estimated position moves on: show it. */
  private fun refreshEstimate() {
    val e = engine ?: return
    val currentTrip = trip ?: return
    if (state != TripState.TRACKING) return
    val status = e.status(SystemClock.elapsedRealtime())
    lastStatus = status
    updateTripNotification(currentTrip, force = false)
    emitStatus()
    if (status.estimated) handler.postDelayed(refreshRunnable, ESTIMATE_REFRESH_MS)
  }

  private fun scheduleWatchdog() {
    handler.removeCallbacks(tickRunnable)
    val at = engine?.nextCheckAtMs()
    if (at == null) {
      cancelBackupAlarm()
      return
    }
    val delay = max(0L, at - SystemClock.elapsedRealtime())
    handler.postDelayed(tickRunnable, delay + 50)
    // The backup fires a moment after the handler would have; it only matters if the handler did not.
    setBackupAlarm(at + 1_000)
  }

  private fun setBackupAlarm(atElapsedMs: Long) {
    // Every fix pushes the deadline a few seconds later. Leaving an earlier backup in place is
    // harmless (it just runs a tick that finds nothing to do and reschedules), and it saves
    // re-arming the AlarmManager on every fix.
    val scheduled = scheduledBackupAtMs
    val stillPending = scheduled > SystemClock.elapsedRealtime()
    if (stillPending && scheduled <= atElapsedMs + 2_000) return
    scheduledBackupAtMs = atElapsedMs
    val am = getSystemService(AlarmManager::class.java) ?: return
    val pi = WatchdogReceiver.pendingIntent(this)
    try {
      val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
      if (exact) {
        am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, atElapsedMs, pi)
      } else {
        am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, atElapsedMs, pi)
      }
    } catch (e: SecurityException) {
      am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, atElapsedMs, pi)
    }
  }

  private fun cancelBackupAlarm() {
    scheduledBackupAtMs = 0L
    getSystemService(AlarmManager::class.java)?.cancel(WatchdogReceiver.pendingIntent(this))
  }

  /** Called by [WatchdogReceiver] when the AlarmManager backup fires while we are alive. */
  fun onBackupAlarm() {
    scheduledBackupAtMs = 0L
    tick()
  }

  // endregion

  // region alarm

  private fun ring(reason: String, resumed: Boolean) {
    val currentTrip = trip ?: return
    state = TripState.RINGING
    lastTrigger = reason
    TripStore.save(this, currentTrip, state)
    handler.removeCallbacks(tickRunnable)
    cancelBackupAlarm()

    AlarmPlayer.start(this, currentTrip.strength) { onAutoSilenced() }
    val (title, text) = Texts.alarm(reason, currentTrip, lastStatus)
    // With the app on screen a full-screen intent only shows a heads-up (which would cover the alarm
    // screen), so the alarm screen is opened directly and the notification stays quiet.
    val onScreen = TripEvents.appInForeground
    Notifications.notify(this, Notifications.ID_ALARM, Notifications.alarmNotification(this, reason, title, text, quiet = onScreen))
    if (onScreen) {
      try {
        startActivity(AlarmActivity.intent(this, reason))
      } catch (e: Exception) {
        Log.w(TAG, "Could not open the alarm screen", e)
      }
    }
    updateTripNotification(currentTrip, force = true)
    TripEvents.emit(TripEvents.ALARM, mapOf("reason" to reason, "resumed" to resumed))
    emitStatus()
  }

  private fun snooze() {
    val currentTrip = trip ?: return stopSelfIfIdle()
    if (state != TripState.RINGING) return
    AlarmPlayer.stop(this)
    AlarmActivity.closeIfOpen()
    Notifications.cancel(this, Notifications.ID_ALARM)
    state = TripState.SNOOZED
    TripStore.save(this, currentTrip, state)
    snoozeUntilMs = SystemClock.elapsedRealtime() + SNOOZE_MS
    log?.event(SystemClock.elapsedRealtime(), lastStatus, "snooze")
    scheduleSnooze()
    updateTripNotification(currentTrip, force = true)
    emitStatus()
  }

  private fun scheduleSnooze() {
    handler.removeCallbacks(tickRunnable)
    val delay = max(0L, snoozeUntilMs - SystemClock.elapsedRealtime())
    handler.postDelayed(tickRunnable, delay)
    setBackupAlarm(snoozeUntilMs + 500)
  }

  private fun keepTracking() {
    val currentTrip = trip ?: return stopSelfIfIdle()
    val e = engine ?: return
    if (state == TripState.TRACKING) return
    AlarmPlayer.stop(this)
    AlarmActivity.closeIfOpen()
    Notifications.cancel(this, Notifications.ID_ALARM)
    val now = SystemClock.elapsedRealtime()
    log?.event(now, lastStatus, "keep-tracking")
    state = TripState.TRACKING
    lastTrigger = null
    TripStore.save(this, currentTrip, state)
    handle(e.rearm(now))
  }

  private fun onAutoSilenced() {
    val currentTrip = trip ?: return
    log?.event(SystemClock.elapsedRealtime(), lastStatus, "auto-silenced")
    val (title, _) = Texts.alarm(lastTrigger ?: "ARRIVED", currentTrip, lastStatus)
    Notifications.notify(
      this,
      Notifications.ID_ALARM,
      Notifications.alarmNotification(this, lastTrigger ?: "ARRIVED", title, L10n["autoSilenced"]),
    )
  }

  private fun stopSelfIfIdle() {
    if (trip == null) stopSelf()
  }

  // endregion

  // region notification, status, wake lock

  private fun updateTripNotification(currentTrip: ActiveTrip, force: Boolean) {
    val now = SystemClock.elapsedRealtime()
    if (!force && now - lastNotificationMs < NOTIFICATION_THROTTLE_MS) return
    lastNotificationMs = now
    val text = when (state) {
      TripState.RINGING -> L10n["alarmRinging"]
      TripState.SNOOZED -> L10n["snoozed"]
      TripState.TRACKING -> Texts.statusLine(currentTrip, lastStatus)
    }
    Notifications.notify(
      this,
      Notifications.ID_TRIP,
      Notifications.tripNotification(this, Texts.tripTitle(currentTrip), text, Texts.ringsWhen(currentTrip)),
    )
  }

  private fun emitStatus() {
    TripEvents.emit(TripEvents.STATUS, statusMap())
  }

  fun statusMap(): Map<String, Any?> {
    val s = lastStatus
    return mapOf(
      "trip" to trip?.toMap(),
      "state" to state.name.lowercase(),
      "latitude" to s?.latitude,
      "longitude" to s?.longitude,
      "distanceM" to s?.distanceM,
      "etaSec" to s?.etaSec,
      "speedMps" to s?.speedMps,
      "accuracyM" to s?.accuracyM,
      "lastFixAgeMs" to s?.lastFixAgeMs?.toDouble(),
      "health" to (s?.health?.name?.lowercase() ?: "waiting"),
      "tier" to (s?.tier?.name?.lowercase() ?: engine?.plan?.tier?.name?.lowercase()),
      "armed" to (s?.armed ?: true),
      "trigger" to lastTrigger,
      "estimated" to (s?.estimated ?: false),
    )
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(PowerManager::class.java) ?: return
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "StopWake:near").apply {
      setReferenceCounted(false)
      acquire(WAKE_LOCK_MAX_MS)
    }
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  // endregion

  companion object {
    private const val TAG = "TripService"
    private const val NOTIFICATION_THROTTLE_MS = 5_000L
    private const val SNOOZE_MS = 60_000L
    private const val ESTIMATE_REFRESH_MS = 3_000L
    private const val DEMO_INTERVAL_MS = 1_000L
    private const val WAKE_LOCK_MAX_MS = 3 * 60 * 60_000L

    const val ACTION_START = "com.ishankanani.gpsalarm.tripalarm.START"
    const val ACTION_STOP = "com.ishankanani.gpsalarm.tripalarm.STOP"
    const val ACTION_DISMISS = "com.ishankanani.gpsalarm.tripalarm.DISMISS"
    const val ACTION_SNOOZE = "com.ishankanani.gpsalarm.tripalarm.SNOOZE"
    const val ACTION_KEEP_TRACKING = "com.ishankanani.gpsalarm.tripalarm.KEEP_TRACKING"
    const val ACTION_TICK = "com.ishankanani.gpsalarm.tripalarm.TICK"
    const val EXTRA_TRIP = "trip"

    @Volatile
    var instance: TripService? = null
      private set

    fun start(context: Context, trip: ActiveTrip) {
      val intent = Intent(context, TripService::class.java)
        .setAction(ACTION_START)
        .putExtra(EXTRA_TRIP, trip.toJson().toString())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    /** Sends an action to the running service. Does nothing if no trip is running. */
    fun send(context: Context, action: String) {
      if (instance == null) return
      context.startService(Intent(context, TripService::class.java).setAction(action))
    }
  }
}
