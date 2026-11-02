import Foundation

/// Native-side wording for notifications, in the app's language (port of Texts.kt).
enum Texts {
  /// Reasons the alarm can show besides the engine's trigger reasons.
  static let reasonTest = "TEST"
  static let reasonTrackingStopped = "TRACKING_STOPPED"

  private static func decimal(_ value: Double, _ unit: String) -> String {
    let text = String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), value)
    return text.replacingOccurrences(of: ".", with: String(L10n.decimalSeparator)) + " " + unit
  }

  /// Kotlin's roundToInt() for the positive values used here (half up).
  private static func round(_ value: Double) -> Int { Int(value.rounded(.toNearestOrAwayFromZero)) }

  static func distance(_ meters: Double, useMiles: Bool) -> String {
    if useMiles {
      let miles = meters / 1609.344
      return miles < 0.1 ? "\(round(meters * 3.28084 / 10) * 10) ft" : decimal(miles, "mi")
    }
    if meters < 1_000 { return "\(round(meters / 10) * 10) m" }
    if meters < 10_000 { return decimal(meters / 1000, "km") }
    return "\(round(meters / 1000)) km"
  }

  static func duration(_ seconds: Double) -> String {
    let minutes = round(seconds / 60)
    if minutes < 1 { return "<1 min" }
    if minutes < 60 { return "\(minutes) min" }
    return "\(minutes / 60) h \(minutes % 60) min"
  }

  static func tripTitle(_ trip: ActiveTrip) -> String {
    if trip.isDemo { return L10n.format("demoTitle", ["label": trip.label]) }
    if trip.alarmMode == .leave { return L10n.format("tripLeaving", ["label": trip.label]) }
    return L10n.format("tripTo", ["label": trip.label])
  }

  static func ringsWhen(_ trip: ActiveTrip) -> String {
    let radius = distance(trip.radiusM, useMiles: trip.useMiles)
    if trip.alarmMode == .leave { return L10n.format("ringsLeave", ["radius": radius]) }
    if let minutes = trip.minutesBefore {
      return L10n.format("ringsBefore", ["minutes": String(minutes), "radius": radius])
    }
    return L10n.format("ringsWithin", ["radius": radius])
  }

  /// Title and body of the alarm notification.
  static func alarm(_ reason: String, _ trip: ActiveTrip?, _ status: TripStatus?) -> (title: String, body: String) {
    let label = trip?.label ?? L10n["yourStop"]
    let distanceText = status?.distanceM.map { distance($0, useMiles: trip?.useMiles == true) }
    let wake = L10n["wakeUp"]
    switch reason {
    case TriggerReason.arrived.rawValue:
      if let distanceText {
        return (wake, L10n.format("arrived", ["distance": distanceText, "label": label]))
      }
      return (wake, L10n.format("arrivedNoDistance", ["label": label]))
    case TriggerReason.passedThrough.rawValue:
      return (wake, L10n.format("passedThrough", ["label": label]))
    case TriggerReason.eta.rawValue:
      let minutes = trip?.minutesBefore.map { String($0) } ?? ""
      let eta = status?.etaSec.map { duration($0) } ?? "\(minutes) min"
      return (wake, L10n.format("eta", ["eta": eta, "label": label]))
    case TriggerReason.closestPointPassed.rawValue:
      return (L10n["closestTitle"], L10n.format("closest", ["label": label]))
    case TriggerReason.estimated.rawValue:
      return (wake, L10n.format("estimated", ["label": label]))
    case TriggerReason.leftArea.rawValue:
      return (L10n["leftTitle"], L10n.format("left", ["label": label]))
    case reasonTrackingStopped:
      return (L10n["stoppedTitle"], L10n.format("stopped", ["label": label]))
    case reasonTest:
      return (L10n["testTitle"], L10n["test"])
    default:
      return (wake, label)
    }
  }

  /// Uncertain alarms offer "Not yet, keep tracking".
  static func canKeepTracking(_ reason: String) -> Bool {
    reason == TriggerReason.closestPointPassed.rawValue || reason == TriggerReason.estimated.rawValue
  }
}
