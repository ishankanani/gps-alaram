import Foundation
import XCTest
@testable import TripAlarmCore

// The Foundation-only helpers of the iOS module: texts, strings, the generated alarm sound, gunzip.
final class SupportTests: XCTestCase {
  override func tearDown() {
    L10n.set("en")
    super.tearDown()
  }

  func testEveryLanguageHasEveryEnglishKey() {
    let english = Set(NativeStrings.tables["en"]!.keys)
    XCTAssertGreaterThan(english.count, 40)
    for (lang, table) in NativeStrings.tables {
      XCTAssertEqual(Set(table.keys).symmetricDifference(english), [], "\(lang)")
    }
  }

  func testPlaceholdersMatchEnglish() {
    let placeholder = try! NSRegularExpression(pattern: "\\{(\\w+)\\}")
    func names(_ s: String) -> [String] {
      placeholder.matches(in: s, range: NSRange(s.startIndex..., in: s)).map { (s as NSString).substring(with: $0.range(at: 1)) }.sorted()
    }
    let english = NativeStrings.tables["en"]!
    for (lang, table) in NativeStrings.tables {
      for (key, text) in table { XCTAssertEqual(names(text), names(english[key]!), "\(lang) \(key)") }
    }
  }

  func testUnknownLanguagesFallBackToEnglish() {
    L10n.set("xx")
    XCTAssertEqual(L10n.lang, "en")
    XCTAssertEqual(L10n["wakeUp"], "Wake up!")
    XCTAssertNil(L10n.optional("noSuchKey"))
  }

  func testDistancesAndDurationsLikeAndroid() {
    L10n.set("en")
    XCTAssertEqual(Texts.distance(347, useMiles: false), "350 m")
    XCTAssertEqual(Texts.distance(1_234, useMiles: false), "1.2 km")
    XCTAssertEqual(Texts.distance(12_600, useMiles: false), "13 km")
    XCTAssertEqual(Texts.distance(100, useMiles: true), "330 ft")
    XCTAssertEqual(Texts.distance(3_218.688, useMiles: true), "2.0 mi")
    XCTAssertEqual(Texts.duration(20), "<1 min")
    XCTAssertEqual(Texts.duration(300), "5 min")
    XCTAssertEqual(Texts.duration(3_900), "1 h 5 min")
    L10n.set("de")
    XCTAssertEqual(Texts.distance(1_234, useMiles: false), "1,2 km")
  }

  func testAlarmTexts() {
    L10n.set("en")
    let trip = ActiveTrip(
      id: "1", label: "Ulm Hbf", latitude: 48.4, longitude: 9.98, radiusM: 300, mode: "ARRIVE", minutesBefore: 3,
      strength: "heavy", wakeStyle: "vibrate", useMiles: false, startedAtWallMs: 0
    )
    let status = TripStatus(
      latitude: nil, longitude: nil, distanceM: 420, etaSec: 95, speedMps: 10, accuracyM: 5, lastFixAgeMs: 0,
      health: .good, tier: .near, armed: true, closestDistanceM: nil, fallbackAtMs: nil, trigger: .arrived
    )
    XCTAssertEqual(Texts.alarm("ARRIVED", trip, status).body, "You are 420 m from Ulm Hbf.")
    XCTAssertEqual(Texts.alarm("ETA", trip, status).body, "About 2 min to Ulm Hbf.")
    XCTAssertEqual(Texts.ringsWhen(trip), "Rings 3 min before or within 300 m")
    XCTAssertTrue(Texts.canKeepTracking("ESTIMATED"))
    XCTAssertFalse(Texts.canKeepTracking("ARRIVED"))
  }

  func testTripOptionsParseLikeAndroid() {
    XCTAssertEqual(AlarmStrength.parse("HEAVY"), .heavy)
    XCTAssertEqual(AlarmStrength.parse("loud"), .normal)
    XCTAssertEqual(WakeStyle.parse(nil), .soundVibration)
    XCTAssertEqual(WakeStyle.parse("vibrate"), .vibrate)
    XCTAssertEqual(WakeStyle.parse("disco"), .soundVibration)
    XCTAssertFalse(WakeStyle.vibrate.playsSound)
    XCTAssertFalse(WakeStyle.sound.vibrates)
    XCTAssertEqual(AlarmSound.notificationFileName(.normal, .vibrate), AlarmSound.silentFileName)
  }

  func testATripSurvivesEncodingAndOldTripsWithoutWakeStyleStillLoad() throws {
    let old = #"{"id":"7","label":"A","latitude":1,"longitude":2,"radiusM":300,"mode":"LEAVE","strength":"gentle","useMiles":true,"startedAtWallMs":5}"#
    let trip = try JSONDecoder().decode(ActiveTrip.self, from: Data(old.utf8))
    XCTAssertEqual(trip.style, .soundVibration)
    XCTAssertEqual(trip.alarmMode, .leave)
    XCTAssertNil(trip.minutesBefore)
    XCTAssertFalse(trip.isDemo)
    let map = trip.toMap()
    XCTAssertEqual(map["mode"] as? String, "leave")
    XCTAssertEqual(map["wakeStyle"] as? String, "soundVibration")
    XCTAssertTrue(map["minutesBefore"] is NSNull)
  }

  func testTheAlarmSoundIsAValidWavUnderThirtySeconds() {
    let samples = AlarmSound.alarmSamples(amplitude: 1.0)
    let data = AlarmSound.wav(samples: samples)
    XCTAssertEqual(String(decoding: data[0..<4], as: UTF8.self), "RIFF")
    XCTAssertEqual(String(decoding: data[8..<12], as: UTF8.self), "WAVE")
    XCTAssertEqual(data.count, 44 + samples.count * 2)
    let seconds = Double(samples.count) / Double(AlarmSound.sampleRate)
    XCTAssertLessThan(seconds, 30)
    XCTAssertGreaterThan(seconds, 25)
    // Loud but not clipping, and with pauses between the beeps.
    let peak = samples.map { abs(Int($0)) }.max()!
    XCTAssertGreaterThan(peak, 25_000)
    XCTAssertLessThanOrEqual(peak, 32_767)
    XCTAssertGreaterThan(samples.filter { $0 == 0 }.count, samples.count / 5)
    let gentle = AlarmSound.alarmSamples(amplitude: AlarmStrength.gentle.amplitude, seconds: 1).map { abs(Int($0)) }.max()!
    XCTAssertLessThan(gentle, peak / 2 + 1_000)
  }

  func testGzipHeaderParsing() throws {
    // "hi\n" gzipped by `gzip -n`: no name, no extra fields.
    let plain: [UInt8] = [0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, 0xcb, 0xc8, 0xe4, 0x02, 0x00, 0x7a, 0x7a, 0x6f, 0xed, 0x03, 0x00, 0x00, 0x00]
    let (range, size) = try Gunzip.deflateRange(Data(plain))
    XCTAssertEqual(range, 10..<15)
    XCTAssertEqual(size, 3)
    // The same with a file name ("a\0") in the header.
    var named = plain
    named[3] = 0x08
    named.insert(contentsOf: [0x61, 0x00], at: 10)
    XCTAssertEqual(try Gunzip.deflateRange(Data(named)).range, 12..<17)
    XCTAssertThrowsError(try Gunzip.deflateRange(Data([0x50, 0x4b] + plain.dropFirst(2))))
  }
}
