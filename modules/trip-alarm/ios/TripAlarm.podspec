Pod::Spec.new do |s|
  s.name           = 'TripAlarm'
  s.version        = '1.0.0'
  s.summary        = 'StopWake trip alarm: background location, the trip engine and the alarm'
  s.description    = 'The iOS side of the trip-alarm Expo module (same JS API as Android).'
  s.author         = 'StopWake'
  s.homepage       = 'https://ishankanani.github.io/gps-alaram/'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'CoreLocation', 'UserNotifications', 'AVFoundation', 'AudioToolbox'

  # Engine/ and Support/ are pure Foundation and also built by ../ios-engine-tests (swift test).
  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
