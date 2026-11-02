import Foundation

/// Native strings (notifications) in the language picked in the app, the iOS twin of L10n.kt. The
/// tables are generated into NativeStrings.swift from shared/native-strings.json (itself exported
/// from L10n.kt), so a language added on Android reaches iOS by re-running the generators:
///
///   node tools/export-native-strings.mjs && node modules/trip-alarm/tools/gen-ios-strings.mjs
enum L10n {
  private static let keyLang = "stopwake.tripalarm.lang"
  private static let lock = NSLock()
  private static var current = "en"
  private static var loaded = false

  static var lang: String {
    lock.lock()
    defer { lock.unlock() }
    if !loaded {
      loaded = true
      let saved = UserDefaults.standard.string(forKey: keyLang) ?? ""
      current = NativeStrings.tables[saved] != nil ? saved : "en"
    }
    return current
  }

  static func set(_ code: String) {
    let next = NativeStrings.tables[code] != nil ? code : "en"
    lock.lock()
    current = next
    loaded = true
    lock.unlock()
    UserDefaults.standard.set(next, forKey: keyLang)
  }

  static var decimalSeparator: Character { NativeStrings.decimalComma.contains(lang) ? "," : "." }

  static subscript(_ key: String) -> String {
    NativeStrings.tables[lang]?[key] ?? NativeStrings.tables["en"]?[key] ?? key
  }

  /// The string, or nil when no table has it yet (keys added on Android before their translations).
  static func optional(_ key: String) -> String? {
    NativeStrings.tables[lang]?[key] ?? NativeStrings.tables["en"]?[key]
  }

  static func format(_ key: String, _ values: [String: String]) -> String {
    var text = self[key]
    for (name, value) in values {
      text = text.replacingOccurrences(of: "{\(name)}", with: value)
    }
    return text
  }
}
