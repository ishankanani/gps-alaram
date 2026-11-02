import AVFoundation
import AudioToolbox
import Foundation

/// The alarm while StopWake is on screen: the generated alarm sound, looping and ramping up like the
/// Android player, and a repeating vibration. With the phone locked or the app in the background
/// iOS does not let an app without the `audio` background mode start sound, so the alarm then rings
/// through the repeating notifications instead (TripNotifications).
///
/// By default the sound follows the Ring/Silent switch (the owner's choice for v1): on silent only
/// the vibration is felt. With Critical Alerts built in and allowed it plays through silent mode.
/// Main thread only.
final class AlarmPlayer {
  static let shared = AlarmPlayer()

  private var player: AVAudioPlayer?
  private var rampTimer: Timer?
  private var vibrateTimer: Timer?
  private var stopTimer: Timer?
  private var startedAt = Date()
  private var strength = AlarmStrength.normal
  private var onFinished: (() -> Void)?

  private(set) var isRinging = false

  private init() {}

  /// Starts the sound and vibration for `style`; stops on its own after `maxSeconds`.
  func start(strength: AlarmStrength, style: WakeStyle, maxSeconds: TimeInterval, ignoreSilentSwitch: Bool, onFinished: (() -> Void)? = nil) {
    stop()
    isRinging = true
    startedAt = Date()
    self.strength = strength
    self.onFinished = onFinished

    if style.playsSound { startSound(strength, ignoreSilentSwitch: ignoreSilentSwitch) }
    if style.vibrates {
      // Vibrate only: a strong, almost continuous buzz. With sound: a pulse that accompanies it.
      let every: TimeInterval = style == .vibrate ? 0.8 : 1.6
      vibrate()
      vibrateTimer = Timer.scheduledTimer(withTimeInterval: every, repeats: true) { [weak self] _ in
        self?.vibrate()
      }
    }
    stopTimer = Timer.scheduledTimer(withTimeInterval: maxSeconds, repeats: false) { [weak self] _ in
      guard let self else { return }
      let callback = self.onFinished
      self.stop()
      callback?()
    }
  }

  func stop() {
    rampTimer?.invalidate()
    rampTimer = nil
    vibrateTimer?.invalidate()
    vibrateTimer = nil
    stopTimer?.invalidate()
    stopTimer = nil
    onFinished = nil
    if let player {
      player.stop()
      self.player = nil
      try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }
    isRinging = false
  }

  private func vibrate() {
    AudioServicesPlayAlertSound(SystemSoundID(kSystemSoundID_Vibrate))
  }

  private func startSound(_ strength: AlarmStrength, ignoreSilentSwitch: Bool) {
    guard let url = AlarmSound.alarmURL(strength) else { return }
    do {
      let session = AVAudioSession.sharedInstance()
      // soloAmbient follows the Ring/Silent switch and stops other audio; playback ignores the switch.
      try session.setCategory(ignoreSilentSwitch ? .playback : .soloAmbient, mode: .default, options: [])
      try session.setActive(true)
      let p = try AVAudioPlayer(contentsOf: url)
      p.numberOfLoops = -1
      p.volume = strength.startVolume
      _ = p.prepareToPlay()
      guard p.play() else { return }
      player = p
      rampTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] timer in
        guard let self, let player = self.player else {
          timer.invalidate()
          return
        }
        let progress = min(1.0, Date().timeIntervalSince(self.startedAt) / self.strength.rampSec)
        let start = self.strength.startVolume
        player.volume = start + (1 - start) * Float(progress)
        if progress >= 1 { timer.invalidate() }
      }
    } catch {
      // No sound (session refused, e.g. in the background): the notifications and vibration remain.
      player = nil
    }
  }
}
