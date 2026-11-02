import ExpoModulesCore
import UIKit

/// Trip options from JS (TripOptions in src/TripAlarm.types.ts).
struct TripOptions: Record {
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0
  @Field var radiusM: Double = 500
  @Field var mode: String = "arrive"
  @Field var minutesBefore: Int? = nil
  @Field var label: String = ""
  @Field var strength: String = "normal"
  @Field var wakeStyle: String? = nil
  @Field var useMiles: Bool = false
  /// Set all three for a demo ride: simulated movement from this point instead of GPS.
  @Field var demoFromLatitude: Double? = nil
  @Field var demoFromLongitude: Double? = nil
  @Field var demoSpeedMps: Double? = nil
}

final class PreciseLocationRequiredException: Exception {
  override var reason: String {
    "Precise location permission is needed to track a trip"
  }
}

final class InvalidTripException: GenericException<String> {
  override var reason: String {
    param
  }
}

final class TripLogNotFoundException: GenericException<String> {
  override var reason: String {
    "No trip log named \(param)"
  }
}

/// The iOS side of the `TripAlarm` native module: the same JS API and events as Android
/// (android/.../TripAlarmModule.kt). The trip itself runs in TripController, which also works
/// while JavaScript is not running.
public final class TripAlarmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TripAlarm")

    Events("onStatus", "onAlarm", "onTripEnded")

    OnCreate {
      TripController.shared.sink = { [weak self] name, body in
        self?.sendEvent(name, body)
      }
      DispatchQueue.main.async {
        TripController.shared.prepare()
      }
    }

    OnDestroy {
      TripController.shared.sink = nil
    }

    AsyncFunction("startTrip") { (options: TripOptions) -> [String: Any] in
      return try TripController.shared.startTrip(
        latitude: options.latitude,
        longitude: options.longitude,
        radiusM: options.radiusM,
        mode: options.mode,
        minutesBefore: options.minutesBefore,
        label: options.label,
        strength: options.strength,
        wakeStyle: options.wakeStyle ?? WakeStyle.soundVibration.rawValue,
        useMiles: options.useMiles,
        demoFromLatitude: options.demoFromLatitude,
        demoFromLongitude: options.demoFromLongitude,
        demoSpeedMps: options.demoSpeedMps
      )
    }
    .runOnQueue(.main)

    AsyncFunction("stopTrip") {
      TripController.shared.stop()
    }
    .runOnQueue(.main)

    AsyncFunction("dismissAlarm") {
      TripController.shared.dismiss()
    }
    .runOnQueue(.main)

    AsyncFunction("snoozeAlarm") {
      TripController.shared.snooze()
    }
    .runOnQueue(.main)

    AsyncFunction("keepTracking") {
      TripController.shared.keepTracking()
    }
    .runOnQueue(.main)

    Function("getActiveTrip") { () -> [String: Any]? in
      return TripController.shared.activeTripSnapshot()
    }

    /// Native texts (notifications) follow the language picked in the app.
    Function("setLanguage") { (code: String) in
      L10n.set(code)
      DispatchQueue.main.async {
        TripNotifications.shared.registerCategories()
      }
    }

    AsyncFunction("testAlarm") { (strength: String, wakeStyle: String?) in
      TripController.shared.testAlarm(strength: strength, wakeStyle: wakeStyle)
    }
    .runOnQueue(.main)

    Function("getSetupStatus") { () -> [String: Any] in
      return TripController.shared.setupStatus()
    }

    AsyncFunction("requestNotificationPermission") { (promise: Promise) in
      TripNotifications.shared.requestAuthorization { granted in
        promise.resolve(["granted": granted])
      }
    }

    /// iOS has one settings page per app (plus its notification page); every kind opens one of them.
    Function("openSettings") { (kind: String) -> Bool in
      var target = UIApplication.openSettingsURLString
      if kind == "notifications" {
        if #available(iOS 16.0, *) { target = UIApplication.openNotificationSettingsURLString }
      }
      guard let url = URL(string: target) else { return false }
      DispatchQueue.main.async {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
      }
      return true
    }

    Function("listTripLogs") { () -> [[String: Any]] in
      return TripLog.list().map { log in
        [
          "name": log.url.lastPathComponent,
          "sizeBytes": Double(log.size),
          "modifiedAt": log.modified.timeIntervalSince1970 * 1000,
        ]
      }
    }

    AsyncFunction("shareTripLog") { (name: String, promise: Promise) in
      guard let url = TripLog.find(name) else {
        promise.reject(TripLogNotFoundException(name))
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_NO_VIEW", "Nothing on screen to share from")
        return
      }
      let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
      sheet.popoverPresentationController?.sourceView = presenter.view
      presenter.present(sheet, animated: true) {
        promise.resolve()
      }
    }
    .runOnQueue(.main)

    /// Unpacks a downloaded stop pack (.gz) and returns the size of the result in bytes.
    AsyncFunction("gunzip") { (source: String, destination: String) -> Double in
      let size = try Gunzip.unpack(Self.fileURL(source), to: Self.fileURL(destination))
      return Double(size)
    }
  }

  private static func fileURL(_ uriOrPath: String) -> URL {
    if uriOrPath.hasPrefix("file:"), let url = URL(string: uriOrPath) { return url }
    return URL(fileURLWithPath: uriOrPath)
  }
}
