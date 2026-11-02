// swift-tools-version:5.9
// The iOS twin of ../engine-tests: runs the pure-Swift parts of the iOS module (the trip engine in
// ../ios/Engine and the Foundation-only helpers in ../ios/Support) without Xcode, a simulator or
// Expo: `swift test` in this folder, on macOS or Linux. Sources/TripAlarmCore holds symlinks to
// those two folders, so the tests build exactly the files the app compiles.
import PackageDescription

let package = Package(
  name: "TripEngineTests",
  platforms: [.macOS(.v13), .iOS(.v16)],
  targets: [
    .target(name: "TripAlarmCore", path: "Sources/TripAlarmCore"),
    .testTarget(name: "TripEngineTests", dependencies: ["TripAlarmCore"], path: "Tests/TripEngineTests"),
  ]
)
