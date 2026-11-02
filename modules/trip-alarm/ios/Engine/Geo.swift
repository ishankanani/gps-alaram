import Foundation

// Swift port of android/.../engine/Geo.kt. Uses Java's degree/radian constants so both engines
// compute the same numbers.

enum Geo {
  static let earthRadiusM = 6_371_008.8
  private static let degreesToRadians = 0.017453292519943295
  private static let radiansToDegrees = 57.29577951308232

  static func toRadians(_ degrees: Double) -> Double { degrees * degreesToRadians }
  static func toDegrees(_ radians: Double) -> Double { radians * radiansToDegrees }

  /// Great-circle (haversine) distance in metres.
  static func distanceM(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
    let p1 = toRadians(lat1)
    let p2 = toRadians(lat2)
    let dp = p2 - p1
    let dl = toRadians(lon2 - lon1)
    let a = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
    return 2 * earthRadiusM * asin(min(1.0, sqrt(a)))
  }

  /// Smallest distance from point P to the segment A-B, in metres (flat projection centred on P,
  /// accurate to well under 1% for the few-km segments between two fixes).
  static func distanceToSegmentM(
    _ pLat: Double, _ pLon: Double,
    _ aLat: Double, _ aLon: Double,
    _ bLat: Double, _ bLon: Double
  ) -> Double {
    let cosLat = cos(toRadians(pLat))
    let ax = toRadians(aLon - pLon) * earthRadiusM * cosLat
    let ay = toRadians(aLat - pLat) * earthRadiusM
    let bx = toRadians(bLon - pLon) * earthRadiusM * cosLat
    let by = toRadians(bLat - pLat) * earthRadiusM
    let dx = bx - ax
    let dy = by - ay
    let len2 = dx * dx + dy * dy
    let t = len2 == 0.0 ? 0.0 : min(1.0, max(0.0, -(ax * dx + ay * dy) / len2))
    return hypot(ax + t * dx, ay + t * dy)
  }

  /// Moves a point by `northM` and `eastM` metres. Used by tests, the trip simulator and demo rides.
  static func offset(_ lat: Double, _ lon: Double, northM: Double, eastM: Double) -> (lat: Double, lon: Double) {
    let dLat = toDegrees(northM / earthRadiusM)
    let dLon = toDegrees(eastM / (earthRadiusM * cos(toRadians(lat))))
    return (lat + dLat, lon + dLon)
  }
}
