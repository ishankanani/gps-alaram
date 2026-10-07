import type { Place } from '../geocode';
import type { Stop } from './search';
import { primaryKind } from './text';

/** A stop from the offline database as a destination. */
export function stopToPlace(stop: Stop): Place {
  return {
    id: `stop:${stop.name}`,
    name: stop.title,
    context: stop.place ?? '',
    latitude: stop.latitude,
    longitude: stop.longitude,
    isStop: true,
    kind: primaryKind(stop.modes),
    modes: stop.modes,
  };
}
