import Foundation

/// The alarm sounds, generated as WAV files on first use instead of shipped as binaries.
///
/// Notification sounds must be in the app bundle or in `Library/Sounds` of the app's container and
/// play at most 30 s, so each file is a 28 s alarm pattern: notifications repeat every 30 s while
/// the alarm rings. "Vibrate only" uses a silent file: a notification with a sound vibrates, one
/// without does not. Pure Foundation, so it is unit tested with the engine.
enum AlarmSound {
  static let sampleRate = 22_050
  static let alarmSeconds = 28.0
  /// Bump when the pattern changes, so phones write the new files.
  static let version = 1

  static func fileName(_ strength: AlarmStrength) -> String { "stopwake-alarm-v\(version)-\(strength.rawValue).wav" }
  static let silentFileName = "stopwake-silent-v\(version).wav"

  /// The sound file name a notification uses for this strength and wake style.
  static func notificationFileName(_ strength: AlarmStrength, _ style: WakeStyle) -> String {
    style.playsSound ? fileName(strength) : silentFileName
  }

  static var soundsDirectory: URL? {
    FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first?.appendingPathComponent("Sounds", isDirectory: true)
  }

  /// Writes any missing sound into Library/Sounds and returns the directory. Cheap when they exist.
  @discardableResult
  static func ensureFiles() -> URL? {
    guard let dir = soundsDirectory else { return nil }
    let fm = FileManager.default
    do {
      try fm.createDirectory(at: dir, withIntermediateDirectories: true)
      for strength in [AlarmStrength.gentle, .normal, .heavy] {
        let url = dir.appendingPathComponent(fileName(strength))
        if !fm.fileExists(atPath: url.path) {
          try wav(samples: alarmSamples(amplitude: strength.amplitude)).write(to: url, options: .atomic)
        }
      }
      let silent = dir.appendingPathComponent(silentFileName)
      if !fm.fileExists(atPath: silent.path) {
        try wav(samples: [Int16](repeating: 0, count: sampleRate)).write(to: silent, options: .atomic)
      }
    } catch {
      return nil
    }
    return dir
  }

  /// The in-app player's file for this strength (the same sound as the notifications).
  static func alarmURL(_ strength: AlarmStrength) -> URL? {
    guard let dir = ensureFiles() else { return nil }
    return dir.appendingPathComponent(fileName(strength))
  }

  /// Four quick two-tone beeps, a pause, repeated: the pattern of a clock alarm.
  static func alarmSamples(amplitude: Double, seconds: Double = alarmSeconds) -> [Int16] {
    let total = Int(Double(sampleRate) * seconds)
    var samples = [Int16](repeating: 0, count: total)
    let beep = 0.16
    let gap = 0.07
    let groupPause = 0.5
    let group = 4 * (beep + gap) + groupPause
    let fade = 0.008
    let peak = max(0.0, min(1.0, amplitude)) * 0.92 * Double(Int16.max)
    for i in 0..<total {
      let t = Double(i) / Double(sampleRate)
      let inGroup = t.truncatingRemainder(dividingBy: group)
      let slot = Int(inGroup / (beep + gap))
      if slot >= 4 { continue }
      let inSlot = inGroup - Double(slot) * (beep + gap)
      if inSlot >= beep { continue }
      // Short fades at both ends so the beeps do not click.
      let envelope = min(1.0, inSlot / fade, (beep - inSlot) / fade)
      let frequency = slot % 2 == 0 ? 2_093.0 : 1_568.0 // C7 and G6: cut through train noise
      // A touch of the octave below makes it fuller on small speakers.
      let wave = 0.8 * sin(2 * .pi * frequency * t) + 0.2 * sin(2 * .pi * frequency / 2 * t)
      samples[i] = Int16(max(-32767.0, min(32767.0, (wave * envelope * peak).rounded())))
    }
    return samples
  }

  /// A mono 16-bit PCM WAV file.
  static func wav(samples: [Int16]) -> Data {
    var data = Data()
    func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }
    func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { data.append(contentsOf: $0) } }
    let byteCount = UInt32(samples.count * 2)
    data.append(contentsOf: Array("RIFF".utf8))
    u32(36 + byteCount)
    data.append(contentsOf: Array("WAVE".utf8))
    data.append(contentsOf: Array("fmt ".utf8))
    u32(16)
    u16(1) // PCM
    u16(1) // mono
    u32(UInt32(sampleRate))
    u32(UInt32(sampleRate * 2)) // byte rate
    u16(2) // block align
    u16(16) // bits per sample
    data.append(contentsOf: Array("data".utf8))
    u32(byteCount)
    data.reserveCapacity(data.count + samples.count * 2)
    for s in samples { withUnsafeBytes(of: s.littleEndian) { data.append(contentsOf: $0) } }
    return data
  }
}
