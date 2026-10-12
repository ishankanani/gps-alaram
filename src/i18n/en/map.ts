/**
 * English strings of the map home: MapSheet browse, search and stop modes, banners and map controls.
 * Owned by package M: map and trip. Keys use the prefix "map." and define the set the other
 * languages translate. Numbers and units are joined by a non-breaking space ( ).
 *
 * Also used from core.ts: home.search, home.favourites, home.recent, place.* (Wake me, Time,
 * Distance, When I arrive, When I leave, Start alarm, {distance} away, Dropped pin, My location,
 * Save to / Remove from favourites), search.addresses, search.locating, search.locationFailed,
 * kind.*, strength.*, country.*.
 */
export const map = {
  // Map controls and overlays
  'map.control.locate': 'Show my location',
  'map.control.locateDenied': 'Location is off. Open setup',
  'map.control.credits': 'Map credits',
  'map.zoomHint': 'Zoom in to see all stops',
  'map.offline': 'Offline · stops and alarms work',
  'map.firstOffline': 'The map needs internet the first time. Search and alarms work offline.',
  'map.pinCrosshair': 'Pin position',

  // Update required (below the server's minimum version; alarms keep working)
  'map.update.body': 'Update StopWake. Your alarms keep working.',
  'map.update.action': 'Update',
  'map.announcement.open': 'Learn more',

  // Country pack suggestion
  'map.pack.title': 'Stops for {country} · {size}',
  'map.pack.body': 'Download them to find stops here, also without internet.',
  'map.pack.download': 'Download',
  'map.pack.downloading': 'Downloading {percent} %',
  'map.pack.installing': 'Installing…',
  'map.pack.failed': 'The download stopped. Try again.',
  'map.pack.hint': 'Looking for {country}? Download its stops ({size}).',

  // Browse mode
  'map.nearby.title': 'Nearby stops',
  'map.nearby.within': 'Within {distance}',
  'map.nearby.showAll': 'Show all nearby',
  'map.nearby.showFewer': 'Show fewer',
  'map.nearby.emptyTitle': 'No stops nearby',
  'map.nearby.emptyBody': 'Search for your destination instead.',
  'map.location.title': 'See stops near you',
  'map.location.body': 'Allow location to list the stops around you.',
  'map.location.allow': 'Allow location',
  'map.location.deniedBody': 'Location is off for StopWake. Turn it on to list the stops around you.',
  'map.location.openSetup': 'Open setup',
  'map.longPressHint': 'Long-press the map to drop a pin anywhere.',

  // Search mode
  'map.search.leaveHere': 'Ring when I leave here',
  'map.search.leaveHereBody': 'Wakes you once you are away from where you are now',
  'map.search.dropPin': 'Drop a pin on the map',
  'map.search.tip': 'Tip: paste coordinates or a Google Maps link.',
  'map.search.stops': 'Stops',
  'map.search.addressesOffline': 'Addresses need internet. Stops work offline.',
  'map.search.noResultsTitle': 'No matches for “{query}”',
  'map.search.noResultsBody': 'Check the spelling or add the town, like “Bahnhofstraße Ulm”.',
  'map.search.recentsCleared': 'Recent stops cleared',
  'map.search.undo': 'Undo',

  // Pin mode (drop a pin without long-press)
  'map.pin.title': 'Move the map to place the pin',
  'map.pin.finding': 'Finding the address…',
  'map.pin.use': 'Use this spot',

  // Stop mode
  'map.stop.minutes': '{minutes} min',
  'map.stop.trainWarning': '{distance} is only seconds on a train. Wake 2 min before instead?',
  'map.stop.useTwoMinutes': 'Use 2 min',
  'map.stop.options': 'Alarm options',
  'map.stop.optionsArrive': 'Arrive',
  'map.stop.optionsLeave': 'Leave',
  'map.stop.whenLabel': 'When the alarm rings',
  'map.stop.strengthLabel': 'Alarm strength',
  'map.stop.demo': 'Try a demo trip',
  'map.stop.demoBody': 'A 1-minute simulation to see and hear the alarm.',
  'map.stop.switch': 'Switch alarm to this stop',
  'map.stop.saved': 'Saved to favourites',
  'map.stop.removed': 'Removed from favourites',
  'map.stop.notFound': 'That stop isn’t in the stops on this phone.',

  // The rule line (also on the Trip screen)
  'map.rule.time': 'Rings about {minutes} min before you arrive',
  'map.rule.distance': 'Rings {distance} before the stop',
  'map.rule.leave': 'Rings when you’re {distance} away',
} as const satisfies Record<string, string>;
