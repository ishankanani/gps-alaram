import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type MapRef,
} from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import type { StopKind } from '../lib/stations/text';
import { StopPin } from '../ui/components/StopPin';
import { useTheme } from '../ui/theme';
import { boundsOf, circlePolygon, headingOf, lineFeature, puckFeature, type LatLon } from './geo';
import { useMapStyle } from './useMapStyle';

// SDF icons (white shapes the map tints): the puck's arrow, the dashed ring and the "≈" mark.
const PUCK_IMAGES = {
  'puck-arrow': { source: require('./assets/puck-arrow.png'), sdf: true },
  'puck-ring-dashed': { source: require('./assets/puck-ring-dashed.png'), sdf: true },
  'puck-approx': { source: require('./assets/puck-approx.png'), sdf: true },
};

export type TripMapHandle = {
  /** Fits you and the stop again and follows from now on. */
  recentre: () => void;
  showAttribution: () => void;
};

type Props = {
  ref?: Ref<TripMapHandle>;
  destination: LatLon;
  kind: StopKind | 'place';
  radiusM: number;
  /** Where you are: the last GPS fix, or an estimate while GPS is lost. */
  user: LatLon | null;
  /** The position is an estimate (tunnel, underground): orange puck, dashed ring and "≈". */
  estimated: boolean;
  /** Where you have been on this trip, oldest first. */
  trail: LatLon[];
  /** Space the overlays take at the top (destination card) and bottom (panel). */
  padding: { top: number; bottom: number };
  /** The camera stopped following because you moved the map (show the recentre control). */
  onFollowingChange?: (following: boolean) => void;
};

/** After you pan or zoom, the camera follows again after this long without touching the map. */
const HANDS_OFF_MS = 30_000;
const REFIT_EVERY_MS = 15_000;

/** The trip at a glance (4.3 Trip): you moving towards the stop, the way you came and the wake zone. */
export function TripMap({ ref, destination, kind, radiusM, user, estimated, trail, padding, onFollowingChange }: Props) {
  const t = useTheme();
  const { style } = useMapStyle();
  const map = useRef<MapRef>(null);
  const camera = useRef<CameraRef>(null);
  const [fade] = useState(() => new Animated.Value(0));
  // Camera moves before the map has loaded are lost, so the first fit waits for it.
  const [ready, setReady] = useState(false);
  const following = useRef(true);
  const lastFit = useRef(0);
  const touchedAt = useRef(0);
  const m = t.map;

  const zone = useMemo(
    () => circlePolygon(destination.latitude, destination.longitude, radiusM),
    [destination.latitude, destination.longitude, radiusM],
  );
  const trailLine = useMemo(() => (trail.length >= 2 ? lineFeature(trail) : null), [trail]);
  const ahead = useMemo(() => (user ? lineFeature([user, destination]) : null), [user, destination]);
  const puck = useMemo(
    () => (user ? puckFeature(user, headingOf(trail, user, destination), estimated) : null),
    [user, trail, destination, estimated],
  );

  const setFollowing = useCallback(
    (value: boolean) => {
      if (following.current === value) return;
      following.current = value;
      onFollowingChange?.(value);
    },
    [onFollowingChange],
  );

  const fit = useCallback(
    (duration: number) => {
      if (!user) return;
      lastFit.current = Date.now();
      camera.current?.fitBounds(boundsOf([user, destination], 0.2), {
        padding: { top: padding.top, right: 56, bottom: padding.bottom, left: 56 },
        duration,
      });
    },
    [user, destination, padding.top, padding.bottom],
  );

  useImperativeHandle(ref, () => ({
    recentre: () => {
      touchedAt.current = 0;
      setFollowing(true);
      fit(t.motion.duration.cameraRefit);
    },
    showAttribution: () => {
      void map.current?.showAttribution().catch(() => {});
    },
  }));

  useEffect(() => {
    if (!user || !ready) return;
    const now = Date.now();
    if (!following.current) {
      if (now - touchedAt.current < HANDS_OFF_MS) return;
      setFollowing(true);
    }
    if (now - lastFit.current < REFIT_EVERY_MS) return;
    fit(lastFit.current === 0 ? 0 : t.motion.duration.cameraRefit);
  }, [user, ready, fit, setFollowing, t.motion.duration.cameraRefit]);

  // The panel or the card changed size: fit again at once.
  useEffect(() => {
    if (ready && following.current) fit(0);
    // Only on a size change; fit() changes with every fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padding.top, padding.bottom, ready]);

  function onLoaded() {
    setReady(true);
    Animated.timing(fade, { toValue: 1, duration: t.motion.duration.base, useNativeDriver: true }).start();
  }

  const puckColor = estimated ? t.color.warning : m.puck;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: m.placeholder }]}>
      {style ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <Map
            ref={map}
            style={StyleSheet.absoluteFill}
            androidView="texture"
            mapStyle={style}
            logo={false}
            compass={false}
            attribution={false}
            touchRotate={false}
            touchPitch={false}
            preferredFramesPerSecond={30}
            tintColor={t.color.primary}
            onDidFinishLoadingStyle={onLoaded}
            onDidFinishLoadingMap={onLoaded}
            onRegionDidChange={(e) => {
              if (!e.nativeEvent.userInteraction) return;
              touchedAt.current = Date.now();
              setFollowing(false);
            }}>
            <Camera ref={camera} initialViewState={{ center: [destination.longitude, destination.latitude], zoom: 13 }} />
            <Images images={PUCK_IMAGES} />

            <GeoJSONSource id="trip-zone" data={zone}>
              <Layer id="trip-zone-fill" type="fill" paint={{ 'fill-color': m.zoneFill }} />
              <Layer id="trip-zone-line" type="line" paint={{ 'line-color': m.zoneLine, 'line-width': 2 }} />
            </GeoJSONSource>
            {ahead ? (
              <GeoJSONSource id="trip-ahead" data={ahead}>
                <Layer
                  id="trip-ahead-line"
                  type="line"
                  layout={{ 'line-cap': 'round' }}
                  paint={{ 'line-color': m.ahead, 'line-width': 3, 'line-opacity': m.aheadOpacity, 'line-dasharray': [0.5, 2] }}
                />
              </GeoJSONSource>
            ) : null}
            {trailLine ? (
              <GeoJSONSource id="trip-trail" data={trailLine}>
                <Layer
                  id="trip-trail-line"
                  type="line"
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{ 'line-color': m.trail, 'line-width': 5, 'line-opacity': m.trailOpacity }}
                />
              </GeoJSONSource>
            ) : null}

            <Marker lngLat={[destination.longitude, destination.latitude]} anchor="bottom">
              <StopPin kind={kind} />
            </Marker>

            {puck ? (
              <GeoJSONSource id="trip-puck" data={puck}>
                <Layer
                  id="trip-puck-disc"
                  type="circle"
                  paint={{
                    'circle-radius': 13,
                    'circle-color': puckColor,
                    'circle-stroke-color': t.color.onColor,
                    'circle-stroke-width': estimated ? 0 : 3,
                    'circle-pitch-alignment': 'map',
                  }}
                />
                <Layer
                  id="trip-puck-ring"
                  type="symbol"
                  filter={['==', ['get', 'estimated'], true]}
                  layout={{ 'icon-image': 'puck-ring-dashed', 'icon-allow-overlap': true, 'icon-ignore-placement': true }}
                  paint={{ 'icon-color': t.color.onColor }}
                />
                <Layer
                  id="trip-puck-arrow"
                  type="symbol"
                  filter={['==', ['get', 'hasHeading'], true]}
                  layout={{
                    'icon-image': 'puck-arrow',
                    'icon-rotate': ['get', 'heading'],
                    'icon-rotation-alignment': 'map',
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true,
                  }}
                  paint={{ 'icon-color': t.color.onColor }}
                />
                <Layer
                  id="trip-puck-dot"
                  type="circle"
                  filter={['==', ['get', 'hasHeading'], false]}
                  paint={{ 'circle-radius': 4, 'circle-color': t.color.onColor }}
                />
                <Layer
                  id="trip-puck-approx"
                  type="symbol"
                  filter={['==', ['get', 'estimated'], true]}
                  layout={{
                    'icon-image': 'puck-approx',
                    'icon-offset': [0, -26],
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true,
                  }}
                  paint={{ 'icon-color': t.color.warning, 'icon-halo-color': m.halo, 'icon-halo-width': 2 }}
                />
              </GeoJSONSource>
            ) : null}
          </Map>
        </Animated.View>
      ) : null}
    </View>
  );
}
