package com.ishankanani.gpsalarm.tripalarm

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import kotlin.math.ceil
import kotlin.math.min

/**
 * Plays the alarm on the alarm stream (so it rings in silent and vibrate mode), raises the alarm
 * volume to the chosen strength, ramps the player volume up, vibrates with alarm attributes and,
 * for heavy sleepers, blinks the flashlight. One alarm at a time, shared by trips and the test
 * button. Call from the main thread.
 */
object AlarmPlayer {
  private const val TAG = "AlarmPlayer"
  private const val AUTO_SILENCE_MS = 10 * 60_000L
  private val VIBRATION = longArrayOf(0, 900, 500)

  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var tone: ToneGenerator? = null
  private var vibrator: Vibrator? = null
  private var focusRequest: AudioFocusRequest? = null
  private var savedAlarmVolume: Int? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var torchCameraId: String? = null
  private var torchOn = false
  private var startedAt = 0L
  private var onAutoSilence: (() -> Unit)? = null
  private var appContext: Context? = null

  var isRinging = false
    private set

  fun start(context: Context, strength: AlarmStrength, onAutoSilence: (() -> Unit)? = null) {
    if (isRinging) return
    isRinging = true
    startedAt = SystemClock.elapsedRealtime()
    this.onAutoSilence = onAutoSilence
    val app = context.applicationContext
    appContext = app

    acquireWakeLock(app)
    raiseAlarmVolume(app, strength)
    requestAudioFocus(app)
    if (!startPlayer(app, strength)) startTone()
    startVibration(app)
    if (strength.flash) startFlash(app)
    handler.postDelayed(autoSilence, AUTO_SILENCE_MS)
  }

  fun stop(context: Context) {
    if (!isRinging) return
    isRinging = false
    val app = context.applicationContext
    handler.removeCallbacksAndMessages(null)

    player?.let {
      try {
        it.stop()
      } catch (_: IllegalStateException) {
      }
      it.release()
    }
    player = null
    tone?.release()
    tone = null
    vibrator?.cancel()
    vibrator = null
    setTorch(app, false)
    torchCameraId = null
    torchOn = false
    abandonAudioFocus(app)
    restoreAlarmVolume(app)
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    onAutoSilence = null
  }

  /** Stops on its own after a while, like a clock alarm, so a forgotten phone does not ring all day. */
  private val autoSilence = Runnable {
    val callback = onAutoSilence
    handler.removeCallbacksAndMessages(null)
    player?.let { stopQuietly(it) }
    player = null
    tone?.release()
    tone = null
    vibrator?.cancel()
    appContext?.let { setTorch(it, false) }
    torchCameraId = null
    callback?.invoke()
  }

  private fun stopQuietly(p: MediaPlayer) {
    try {
      p.stop()
    } catch (_: IllegalStateException) {
    }
    p.release()
  }

  private fun alarmAttributes(): AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()

  private fun startPlayer(context: Context, strength: AlarmStrength): Boolean {
    val candidates = listOfNotNull(
      RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM),
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
    )
    for (uri in candidates) {
      val p = MediaPlayer()
      try {
        p.setAudioAttributes(alarmAttributes())
        p.setDataSource(context, uri)
        p.isLooping = true
        p.setVolume(strength.startVolume, strength.startVolume)
        p.prepare()
        p.start()
        player = p
        rampVolume(strength)
        return true
      } catch (e: Exception) {
        Log.w(TAG, "Could not play $uri", e)
        p.release()
      }
    }
    return false
  }

  /** Last resort when no ringtone can be played: loud beeps on the alarm stream. */
  private fun startTone() {
    try {
      tone = ToneGenerator(AudioManager.STREAM_ALARM, ToneGenerator.MAX_VOLUME)
      beep.run()
    } catch (e: RuntimeException) {
      Log.w(TAG, "Could not create tone generator", e)
    }
  }

  private val beep: Runnable = object : Runnable {
    override fun run() {
      tone?.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 700) ?: return
      handler.postDelayed(this, 1_000)
    }
  }

  private fun rampVolume(strength: AlarmStrength) {
    handler.post(object : Runnable {
      override fun run() {
        val p = player ?: return
        val elapsed = SystemClock.elapsedRealtime() - startedAt
        val progress = min(1f, elapsed.toFloat() / strength.rampMs)
        val volume = strength.startVolume + (1f - strength.startVolume) * progress
        try {
          p.setVolume(volume, volume)
        } catch (_: IllegalStateException) {
          return
        }
        if (progress < 1f) handler.postDelayed(this, 500)
      }
    })
  }

  private fun raiseAlarmVolume(context: Context, strength: AlarmStrength) {
    val audio = context.getSystemService(AudioManager::class.java) ?: return
    val max = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM)
    val current = audio.getStreamVolume(AudioManager.STREAM_ALARM)
    val target = ceil(max * strength.streamFraction).toInt().coerceIn(1, max)
    if (current >= target) return
    try {
      audio.setStreamVolume(AudioManager.STREAM_ALARM, target, 0)
      savedAlarmVolume = current
    } catch (e: SecurityException) {
      Log.w(TAG, "Could not raise alarm volume", e)
    }
  }

  private fun restoreAlarmVolume(context: Context) {
    val saved = savedAlarmVolume ?: return
    savedAlarmVolume = null
    try {
      context.getSystemService(AudioManager::class.java)?.setStreamVolume(AudioManager.STREAM_ALARM, saved, 0)
    } catch (_: SecurityException) {
    }
  }

  private fun requestAudioFocus(context: Context) {
    val audio = context.getSystemService(AudioManager::class.java) ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(alarmAttributes())
        .build()
      focusRequest = request
      audio.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      audio.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    }
  }

  private fun abandonAudioFocus(context: Context) {
    val audio = context.getSystemService(AudioManager::class.java) ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { audio.abandonAudioFocusRequest(it) }
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      audio.abandonAudioFocus(null)
    }
  }

  @Suppress("DEPRECATION")
  private fun startVibration(context: Context) {
    val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    } ?: return
    if (!v.hasVibrator()) return
    vibrator = v
    when {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ->
        v.vibrate(
          VibrationEffect.createWaveform(VIBRATION, 0),
          VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM),
        )
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ->
        v.vibrate(VibrationEffect.createWaveform(VIBRATION, 0), alarmAttributes())
      else ->
        v.vibrate(VIBRATION, 0, alarmAttributes())
    }
  }

  private fun startFlash(context: Context) {
    val cameras = context.getSystemService(CameraManager::class.java) ?: return
    torchCameraId = try {
      cameras.cameraIdList.firstOrNull {
        cameras.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
      }
    } catch (e: Exception) {
      null
    }
    if (torchCameraId == null) return
    handler.post(object : Runnable {
      override fun run() {
        if (!isRinging || torchCameraId == null) return
        setTorch(context, !torchOn)
        handler.postDelayed(this, 400)
      }
    })
  }

  private fun setTorch(context: Context, on: Boolean) {
    val id = torchCameraId ?: return
    try {
      context.getSystemService(CameraManager::class.java)?.setTorchMode(id, on)
      torchOn = on
    } catch (e: Exception) {
      // Camera busy or unavailable: give up on the flash, the sound matters more.
      torchCameraId = null
      torchOn = false
    }
  }

  private fun acquireWakeLock(context: Context) {
    val pm = context.getSystemService(PowerManager::class.java) ?: return
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "StopWake:alarm").apply {
      setReferenceCounted(false)
      acquire(AUTO_SILENCE_MS + 60_000)
    }
  }
}
