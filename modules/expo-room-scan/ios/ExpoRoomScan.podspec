Pod::Spec.new do |s|
  s.name           = 'ExpoRoomScan'
  s.version        = '0.1.0'
  s.summary        = 'Apple RoomPlan scanning for Aperiv Field'
  s.description    = 'Captures, exports, and shares RoomPlan room scans.'
  s.author         = 'Aperiv'
  s.homepage       = 'https://github.com/rob9206/aperiv-field'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version = '5.9'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'RoomPlan'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
