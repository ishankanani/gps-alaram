import { Camera, GeoJSONSource, Layer, Map, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import type { Feature, LineString } from 'geojson';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { StopKind } from '../lib/stations/text';
import { Icon } from '../ui/components';
import { KIND_COLOR, KIND_ICON, useTheme } from '../ui/theme';
import { bearingDeg, boundsOf, circlePolygon } from './geo';
import { useMapStyle } from './useMapStyle';

type Point = { latitude: number; longitude: number };

type Props = {
  destination: Point;
  kind: StopKind | 'place';
  radiusM: number;
  /** Where the user is: the last GPS fix, or an estimate while GPS is lost. */
  user: Point | null;
  /** The position is a dead-reckoning estimate (tunnel, underground). */
  estimated: boolean;
  /** Where the user has been on this trip, oldest first. */
  trail: Point[];
  /** Space taken by overlays at the top and bottom, kept clear when fitting the camera. */
  padding: { top: number; bottom: number };
};

/** After the user pans or zooms, leave the camera alone for this long. */
const HANDS_OFF_MS = 30_000;
const REFIT_EVERY_MS = 15_000;

function line(points: Point[]): Feature<LineString> {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: points.map((p) => [p.longitude, p.latitude]) },
    properties: {},
  };
}

/** The trip at a glance: you moving towards the stop, the way you came and the alarm circle. */
export function TripMap({ destination, kind, radiusM, user, estimated, trail, padding }: Props) {
  const t = useTheme();
  const mapStyle = useMapStyle();
  const camera = useRef<CameraRef>(null);
  const lastFit = useRef(0);
  const touchedAt = useRef(0);
  const circle = useMemo(
    () => circlePolygon(destination.latitude, destination.longitude, radiusM),
    [destination.latitude, destination.longitude, radiusM],
  );
  const trailLine = useMemo(() => (trail.length >= 2 ? line(trail) : null), [trail]);
  const ahead = useMemo(() => (user ? line([user, destination]) : null), [user, destination]);
  // The arrow points the way you are going: from the last trail point that is a few metres back.
  const heading = useMemo(() => {
    if (!user) return null;
    for (let i = trail.length - 2; i >= 0; i--) {
      const b = bearingDeg(trail[i], user);
      if (b != null) return b;
    }
    return bearingDeg(user, destination);
  }, [trail, user, destination]);

  useEffect(() => {
    if (!user) return;
    const now = Date.now();
    if (now - touchedAt.current < HANDS_OFF_MS || now - lastFit.current < REFIT_EVERY_MS) return;
    lastFit.current = now;
    camera.current?.fitBounds(boundsOf([user, destination], 0.2), {
      padding: { top: padding.top, right: 56, bottom: padding.bottom, left: 56 },
      duration: 800,
    });
  }, [user, destination, padding.top, padding.bottom]);

  const youColor = estimated ? t.warn : t.primary;
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
          <GeoJSONSource id="trip-radius" data={circle}>
            <Layer id="trip-radius-fill" type="fill" paint={{ 'fill-color': t.accent, 'fill-opacity': 0.18 }} />
            <Layer id="trip-radius-line" type="line" paint={{ 'line-color': t.accent, 'line-width': 2.5 }} />
          </GeoJSONSource>
          {ahead ? (
            <GeoJSONSource id="trip-ahead" data={ahead}>
              <Layer
                id="trip-ahead-line"
                type="line"
                layout={{ 'line-cap': 'round' }}
                paint={{ 'line-color': youColor, 'line-width': 3, 'line-opacity': 0.55, 'line-dasharray': [1, 2] }}
              />
            </GeoJSONSource>
          ) : null}
          {trailLine ? (
            <GeoJSONSource id="trip-trail" data={trailLine}>
              <Layer
                id="trip-trail-line"
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{ 'line-color': t.primary, 'line-width': 5, 'line-opacity': 0.75 }}
              />
            </GeoJSONSource>
          ) : null}
          <Marker lngLat={[destination.longitude, destination.latitude]} anchor="bottom">
            <View style={styles.pin}>
              <Icon name="map-marker" size={50} color={KIND_COLOR[kind]} />
              <View style={styles.pinIcon}>
                <Icon name={KIND_ICON[kind]} size={15} color={KIND_COLOR[kind]} />
              </View>
            </View>
          </Marker>
          {user ? (
            <Marker lngLat={[user.longitude, user.latitude]} anchor="center">
              <View style={styles.youWrap}>
                <View style={[styles.you, { backgroundColor: youColor, borderStyle: estimated ? 'dashed' : 'solid' }]}>
                  {heading != null ? (
                    <View style={{ transform: [{ rotate: `${heading}deg` }] }}>
                      <Icon name="navigation" size={18} color="#FFFFFF" />
                    </View>
                  ) : (
                    <View style={styles.youDot} />
                  )}
                </View>
                {estimated ? <Text style={[styles.approx, { color: youColor }]}>≈</Text> : null}
              </View>
            </Marker>
          ) : null}
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
  youWrap: { width: 44, height: 56, alignItems: 'center', justifyContent: 'center' },
  you: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  youDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  approx: { position: 'absolute', top: 0, alignSelf: 'center', fontSize: 16, fontWeight: '900' },
});
