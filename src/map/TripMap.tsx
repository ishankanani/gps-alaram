import { Camera, GeoJSONSource, Layer, Map, Marker, NativeUserLocation, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { StopKind } from '../lib/stations/text';
import { Icon } from '../ui/components';
import { KIND_COLOR, KIND_ICON, useTheme } from '../ui/theme';
import { boundsOf, circlePolygon } from './geo';
import { useMapStyle } from './useMapStyle';

type Point = { latitude: number; longitude: number };

type Props = {
  destination: Point;
  kind: StopKind | 'place';
  radiusM: number;
  /** Last GPS fix from the trip, if any yet. */
  user: Point | null;
};

/** After the user pans or zooms, leave the camera alone for this long. */
const HANDS_OFF_MS = 30_000;
const REFIT_EVERY_MS = 15_000;

/** The trip at a glance: you, the stop and the circle where the alarm rings. */
export function TripMap({ destination, kind, radiusM, user }: Props) {
  const t = useTheme();
  const mapStyle = useMapStyle();
  const camera = useRef<CameraRef>(null);
  const lastFit = useRef(0);
  const touchedAt = useRef(0);
  const circle = useMemo(
    () => circlePolygon(destination.latitude, destination.longitude, radiusM),
    [destination.latitude, destination.longitude, radiusM],
  );

  useEffect(() => {
    if (!user) return;
    const now = Date.now();
    if (now - touchedAt.current < HANDS_OFF_MS || now - lastFit.current < REFIT_EVERY_MS) return;
    lastFit.current = now;
    camera.current?.fitBounds(boundsOf([user, destination], 0.25), {
      padding: { top: 48, right: 48, bottom: 48, left: 48 },
      duration: 800,
    });
  }, [user, destination]);

  return (
    <View style={styles.wrap} onTouchStart={() => (touchedAt.current = Date.now())}>
      {mapStyle ? (
        <Map
          style={StyleSheet.absoluteFill}
          androidView="texture"
          mapStyle={mapStyle}
          logo={false}
          compass={false}
          tintColor={t.primary}>
          <Camera ref={camera} initialViewState={{ center: [destination.longitude, destination.latitude], zoom: 13 }} />
          <NativeUserLocation mode="course" />
          <GeoJSONSource id="trip-radius" data={circle}>
            <Layer id="trip-radius-fill" type="fill" paint={{ 'fill-color': t.accent, 'fill-opacity': 0.18 }} />
            <Layer id="trip-radius-line" type="line" paint={{ 'line-color': t.accent, 'line-width': 2.5 }} />
          </GeoJSONSource>
          <Marker lngLat={[destination.longitude, destination.latitude]} anchor="bottom">
            <View style={styles.pin}>
              <Icon name="map-marker" size={50} color={KIND_COLOR[kind]} />
              <View style={styles.pinIcon}>
                <Icon name={KIND_ICON[kind]} size={15} color={KIND_COLOR[kind]} />
              </View>
            </View>
          </Marker>
        </Map>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  pin: { alignItems: 'center', width: 50, height: 50 },
  pinIcon: {
    position: 'absolute',
    top: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
