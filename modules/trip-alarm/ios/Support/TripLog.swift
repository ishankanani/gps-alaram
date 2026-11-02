import Foundation

/// One CSV per trip with every fix and every engine decision (same format as TripLog.kt), so a
/// missed or early alarm on a real commute can be replayed. Kept on the phone; shared only when the
/// user chooses.
final class TripLog {
  private static let dirName = "trip-logs"
  private static let keep = 20
  private static let header = "t_s,provider,lat,lon,accuracy_m,speed_mps,distance_m,eta_s,tier,health,event"

  private let url: URL
  private let startedAtMs: Int64
  private let queue = DispatchQueue(label: "stopwake.triplog")

  private init(url: URL, startedAtMs: Int64) {
    self.url = url
    self.startedAtMs = startedAtMs
  }

  func fix(_ nowMs: Int64, _ fix: Fix, _ status: TripStatus) {
    append(nowMs, fix.provider, fmt(fix.lat, 6), fmt(fix.lon, 6), fmt(fix.accuracyM, 1), fix.speedMps.map { fmt($0, 1) } ?? "", status, "")
  }

  func event(_ nowMs: Int64, _ status: TripStatus?, _ event: String) {
    append(nowMs, "", "", "", "", "", status, event)
  }

  private func append(
    _ nowMs: Int64, _ provider: String, _ lat: String, _ lon: String, _ accuracy: String, _ speed: String,
    _ status: TripStatus?, _ event: String
  ) {
    let fields: [String] = [
      fmt(Double(nowMs - startedAtMs) / 1000.0, 1),
      provider,
      lat,
      lon,
      accuracy,
      speed,
      status?.distanceM.map { fmt($0, 0) } ?? "",
      status?.etaSec.map { fmt($0, 0) } ?? "",
      status?.tier.name ?? "",
      status?.health.rawValue ?? "",
      event.replacingOccurrences(of: ",", with: ";"),
    ]
    let line = fields.joined(separator: ",") + "\n"
    let url = self.url
    queue.async {
      // A full disk must not stop the trip.
      guard let data = line.data(using: .utf8), let handle = try? FileHandle(forWritingTo: url) else { return }
      handle.seekToEndOfFile()
      handle.write(data)
      handle.closeFile()
    }
  }

  private func fmt(_ value: Double, _ decimals: Int) -> String {
    String(format: "%.\(decimals)f", locale: Locale(identifier: "en_US_POSIX"), value)
  }

  static func directory() -> URL? {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent(dirName, isDirectory: true)
  }

  static func open(_ trip: ActiveTrip, startedAtMs: Int64) -> TripLog? {
    guard let dir = directory() else { return nil }
    let fm = FileManager.default
    try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
    let url = dir.appendingPathComponent("trip-\(trip.id).csv")
    if !fm.fileExists(atPath: url.path) {
      let minutes = trip.minutesBefore.map { String($0) } ?? "-"
      let head = "# \(trip.label) | \(trip.latitude),\(trip.longitude) | radius \(trip.radiusM) m | \(trip.mode) | minutes \(minutes)\n\(header)\n"
      guard (try? head.write(to: url, atomically: true, encoding: .utf8)) != nil else { return nil }
    }
    prune(dir)
    return TripLog(url: url, startedAtMs: startedAtMs)
  }

  /// Newest first.
  static func list() -> [(url: URL, size: Int, modified: Date)] {
    guard let dir = directory(),
          let urls = try? FileManager.default.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey], options: [.skipsHiddenFiles]
          )
    else { return [] }
    return urls
      .filter { $0.pathExtension == "csv" }
      .map { url in
        let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
        return (url, values?.fileSize ?? 0, values?.contentModificationDate ?? Date(timeIntervalSince1970: 0))
      }
      .sorted { $0.modified > $1.modified }
  }

  static func find(_ name: String) -> URL? { list().first { $0.url.lastPathComponent == name }?.url }

  private static func prune(_ dir: URL) {
    for old in list().dropFirst(keep) { try? FileManager.default.removeItem(at: old.url) }
  }
}
