package com.ishankanani.gpsalarm.tripalarm

import android.animation.ObjectAnimator
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import android.window.OnBackInvokedDispatcher
import java.lang.ref.WeakReference

/**
 * The full-screen alarm. Shows over the lock screen and turns the screen on. Plain Android views,
 * no React Native: it has to work even when the JS app is not running.
 *
 * Dismissing takes a deliberate slide that must start at the left edge, so a sleepy tap or a
 * pocket cannot end the alarm; the back button does nothing.
 */
class AlarmActivity : Activity() {
  private var reason = "ARRIVED"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    current = WeakReference(this)
    L10n.load(this)
    showOverLockScreen()
    reason = intent.getStringExtra(EXTRA_REASON) ?: reason
    setContentView(buildContent())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {}
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    reason = intent.getStringExtra(EXTRA_REASON) ?: reason
    setContentView(buildContent())
  }

  override fun onDestroy() {
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  @Deprecated("Deprecated in Java")
  @Suppress("DEPRECATION")
  override fun onBackPressed() {
    // Ignored on purpose: the alarm ends by sliding, snoozing or keeping tracking.
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun buildContent(): View {
    val service = TripService.instance
    val trip = service?.currentTrip ?: TripStore.load(this)?.first
    val (title, body) = Texts.alarm(reason, trip, service?.currentStatus)

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setBackgroundColor(BACKGROUND)
      setPadding(dp(24), dp(72), dp(24), dp(40))
      fitsSystemWindows = true
    }
    root.addView(
      TextView(this).apply {
        text = title
        textSize = 40f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(Color.WHITE)
        gravity = Gravity.CENTER
      },
    )
    root.addView(
      TextView(this).apply {
        text = body
        textSize = 20f
        setTextColor(MUTED)
        gravity = Gravity.CENTER
        setPadding(0, dp(16), 0, 0)
      },
    )
    root.addView(View(this), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
    root.addView(slideToDismiss(), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(76)))

    val tripAlarm = reason != Texts.REASON_TEST && reason != Texts.REASON_TRACKING_STOPPED
    if (tripAlarm) root.addView(button(L10n["snooze"]) { act(TripService.ACTION_SNOOZE) })
    if (Texts.canKeepTracking(reason)) root.addView(button(L10n["notYetLong"]) { act(TripService.ACTION_KEEP_TRACKING) })
    return root
  }

  private fun slideToDismiss(): View {
    val frame = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        cornerRadius = dp(38).toFloat()
        setColor(TRACK)
      }
    }
    val label = TextView(this).apply {
      text = L10n["slide"]
      textSize = 18f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
    }
    frame.addView(label, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))

    val seek = SeekBar(this).apply {
      max = 100
      progressDrawable = ColorDrawable(Color.TRANSPARENT)
      thumb = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(ACCENT)
        setSize(dp(64), dp(64))
      }
      splitTrack = false
      setPadding(dp(38), 0, dp(38), 0)
      setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
        override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
          label.alpha = 1f - progress / 100f
        }

        override fun onStartTrackingTouch(bar: SeekBar) {}

        override fun onStopTrackingTouch(bar: SeekBar) {
          if (bar.progress >= 90) {
            dismiss()
          } else {
            ObjectAnimator.ofInt(bar, "progress", 0).setDuration(200).start()
          }
        }
      })
    }
    // Only a drag that starts on the thumb counts; tapping the far end of the track does not.
    // The whole gesture is swallowed, not just the touch-down, so a stray move cannot start a drag.
    var ignoreGesture = false
    seek.setOnTouchListener { v, event ->
      if (event.actionMasked == MotionEvent.ACTION_DOWN) ignoreGesture = event.x > v.width * 0.3f
      ignoreGesture
    }
    frame.addView(seek, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    return frame
  }

  private fun button(text: String, onClick: () -> Unit) = Button(this).apply {
    this.text = text
    isAllCaps = false
    textSize = 18f
    setTextColor(Color.WHITE)
    background = GradientDrawable().apply {
      cornerRadius = dp(28).toFloat()
      setStroke(dp(2), TRACK)
    }
    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56)).apply {
      topMargin = dp(16)
    }
    setOnClickListener { onClick() }
  }

  private fun dismiss() {
    when (reason) {
      Texts.REASON_TEST -> AlarmPlayer.stop(this)
      Texts.REASON_TRACKING_STOPPED -> {
        Notifications.cancel(this, Notifications.ID_ALARM)
        TripStore.clear(this)
      }
      else -> {
        if (TripService.instance != null) {
          TripService.send(this, TripService.ACTION_DISMISS)
        } else {
          // The service is gone; make sure nothing keeps ringing.
          AlarmPlayer.stop(this)
          Notifications.cancel(this, Notifications.ID_ALARM)
          TripStore.clear(this)
        }
      }
    }
    finish()
  }

  private fun act(action: String) {
    TripService.send(this, action)
    finish()
  }

  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

  companion object {
    const val EXTRA_REASON = "reason"
    private val BACKGROUND = Color.rgb(15, 27, 45)
    private val MUTED = Color.rgb(201, 212, 229)
    private val TRACK = Color.argb(70, 255, 255, 255)
    private val ACCENT = Color.rgb(255, 176, 32)

    private var current: WeakReference<AlarmActivity>? = null

    fun intent(context: Context, reason: String): Intent =
      Intent(context, AlarmActivity::class.java)
        .putExtra(EXTRA_REASON, reason)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)

    fun closeIfOpen() {
      current?.get()?.let { activity -> activity.runOnUiThread { activity.finish() } }
    }
  }
}
