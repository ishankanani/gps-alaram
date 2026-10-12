import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  NativeUserLocation,
  type CameraRef,
  type MapRef,
  type PressEventWithFeatures,
  type ViewPadding,
} from '@maplibre/maplibre-react-native';
import type { ExpressionSpecification, FilterSpecification, SymbolLayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import { useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Animated, PixelRatio, StyleSheet, View, type NativeSyntheticEvent } from 'react-native';

import type { Bounds, Stop } from '../lib/stations/search';
import type { StopKind } from '../lib/stations/text';
import { StopPin } from '../ui/components/StopPin';
import { useTheme } from '../ui/theme';
import { circlePolygon, stopsToGeoJSON, type InitialView, type LatLon } from './geo';
import { useMapStyle } from './useMapStyle';

export type CameraView = { center: [number, number]; zoom: number };

export type FlyOptions = {
  zoom?: number;
  /** Zoom in at least this far, keeping a closer zoom the user chose. */
  minZoom?: number;
  /** Space the sheet and overlays take, so the point lands in the middle of the visible map. */
  padding?: ViewPadding;
};

export type HomeMapHandle = {
  flyTo: (point: LatLon, options?: FlyOptions) => void;
  /** MapLibre's attribution dialog (OpenStreetMap, OpenFreeMap, OpenMapTiles). */
  showAttribution: () => void;
  /** The map position under a point of the view, in dp (the pin-mode crosshair). */
  unproject: (x: number, y: number) => Promise<LatLon | null>;
};

export type MapPin = LatLon & { kind: StopKind | 'place'; key: string };

export type ViewChange = { bounds: Bounds; zoom: number; center: LatLon; byUser: boolean };

type Props = {
  ref?: Ref<HomeMapHandle>;
  stops: Stop[];
  /** The StopPin: the selected stop or place, or the running trip's destination. */
  pin: MapPin | null;
  /** The selected stop's place id: its own dot and label are hidden under the pin. */
  hiddenStopId: string | null;
  /** The amber wake zone (waking by distance, leave mode, or a minimised trip). */
  zone: (LatLon & { radiusM: number }) | null;
  showUser: boolean;
  /** Where the camera opens (kept across remounts by the screen). */
  initialView: InitialView;
  onPressStop: (stop: Stop) => void;
  onPressMap: () => void;
  onLongPress: (point: LatLon) => void;
  onViewChange: (view: ViewChange) => void;
};

/** Stop name under its dot. */
const LABEL = {
  'text-field': ['get', 'title'],
  'text-offset': [0, 1],
  'text-anchor': 'top',
  'text-max-width': 9,
  'text-optional': true,
  'symbol-sort-key': ['-', 0, ['get', 'rank']],
} satisfies SymbolLayerSpecification['layout'];

const STOP_RADIUS: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  9,
  ['case', ['>=', ['get', 'rank'], 380], 5, 3],
  13,
  ['case', ['>=', ['get', 'rank'], 380], 8, 5],
  16,
  ['case', ['>=', ['get', 'rank'], 380], 11, 8],
];

/** 2.7: map stop dots get 16 dp of extra touch area on each side. */
const HITBOX = { top: 16, right: 16, bottom: 16, left: 16 };

/** MapLibre text ignores the system font scale; follow it up to 1.3 (critiques: map labels). */
const LABEL_SCALE = Math.min(PixelRatio.getFontScale(), 1.3);

function initialViewState(view: InitialView) {
  return 'bounds' in view
    ? { bounds: view.bounds, padding: { top: 48, right: 24, bottom: 240, left: 24 } }
    : { center: view.center, zoom: view.zoom };
}

/**
 * The home map (4.3 Map home): the calm base map, every stop as a dot with its name, the user's
 * position, the selected stop's StopPin and the amber wake zone. Rotation and pitch are off, the
 * attribution lives in a map control of the screen, and the map fades in over `map.placeholder`
 * once its style has loaded, so it never flashes a light default in dark mode.
 */
export function HomeMap({
  ref,
  stops,
  pin,
  hiddenStopId,
  zone,
  showUser,
  initialView,
  onPressStop,
  onPressMap,
  onLongPress,
  onViewChange,
}: Props) {
  const t = useTheme();
  const { style } = useMapStyle();
  const map = useRef<MapRef>(null);
  const camera = useRef<CameraRef>(null);
  const loaded = useRef(false);
  const pending = useRef<{ point: LatLon; options: FlyOptions } | null>(null);
  const zoomNow = useRef('zoom' in initialView ? initialView.zoom : 5);
  const [fade] = useState(() => new Animated.Value(0));
  const [initial] = useState(() => initialViewState(initialView));
  const stopsById = useMemo(() => new globalThis.Map(stops.map((s) => [s.id, s])), [stops]);
  const stopData = useMemo(() => stopsToGeoJSON(stops), [stops]);
  const zoneData = useMemo(
    () => (zone ? circlePolygon(zone.latitude, zone.longitude, zone.radiusM) : null),
    [zone],
  );
  const hideSelected: FilterSpecification | undefined = hiddenStopId ? ['!=', ['get', 'pid'], hiddenStopId] : undefined;
  const m = t.map;

  function fly(point: LatLon, options: FlyOptions) {
    const zoom = options.zoom ?? Math.max(zoomNow.current, options.minZoom ?? 0);
    camera.current?.flyTo({
      center: [point.longitude, point.latitude],
      zoom,
      padding: options.padding,
      duration: t.motion.duration.camera,
    });
  }

  useImperativeHandle(ref, () => ({
    flyTo: (point, options = {}) => {
      if (!loaded.current || !camera.current) pending.current = { point, options };
      else fly(point, options);
    },
    showAttribution: () => {
      void map.current?.showAttribution().catch(() => {});
    },
    unproject: async (x, y) => {
      try {
        const lngLat = await map.current?.unproject([x, y]);
        return lngLat ? { latitude: lngLat[1], longitude: lngLat[0] } : null;
      } catch {
        return null;
      }
    },
  }));

  function onLoaded() {
    if (!loaded.current) {
      loaded.current = true;
      const next = pending.current;
      pending.current = null;
      if (next) {
        const zoom = next.options.zoom ?? Math.max(zoomNow.current, next.options.minZoom ?? 0);
        camera.current?.jumpTo({ center: [next.point.longitude, next.point.latitude], zoom, padding: next.options.padding });
      }
    }
    Animated.timing(fade, { toValue: 1, duration: t.motion.duration.base, useNativeDriver: true }).start();
  }

  function onStopPress(event: NativeSyntheticEvent<PressEventWithFeatures>) {
    event.stopPropagation();
    const id = event.nativeEvent.features[0]?.properties?.id;
    const stop = typeof id === 'number' ? stopsById.get(id) : undefined;
    if (stop) onPressStop(stop);
  }

  const labelPaint = (color: string) => ({ 'text-color': color, 'text-halo-color': m.halo, 'text-halo-width': 1.6 });

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: m.placeholder }]} pointerEvents="box-none">
      {style ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <Map
            ref={map}
            style={StyleSheet.absoluteFill}
            // A TextureView is part of the normal view tree: it fades with its parent and leaves no
            // hole behind (with a SurfaceView the status bar area stayed black on the next screen).
            androidView="texture"
            mapStyle={style}
            logo={false}
            compass={false}
            attribution={false}
            touchRotate={false}
            touchPitch={false}
            tintColor={t.color.primary}
            onDidFinishLoadingStyle={onLoaded}
            onDidFinishLoadingMap={onLoaded}
            onPress={() => onPressMap()}
            onLongPress={(e) => onLongPress({ latitude: e.nativeEvent.lngLat[1], longitude: e.nativeEvent.lngLat[0] })}
            onRegionDidChange={(e) => {
              const v = e.nativeEvent;
              zoomNow.current = v.zoom;
              onViewChange({
                bounds: v.bounds,
                zoom: v.zoom,
                center: { latitude: v.center[1], longitude: v.center[0] },
                byUser: v.userInteraction,
              });
            }}>
            <Camera ref={camera} initialViewState={initial} />
            {showUser ? <NativeUserLocation /> : null}

            {zoneData ? (
              <GeoJSONSource id="wake-zone" data={zoneData}>
                <Layer id="wake-zone-fill" type="fill" paint={{ 'fill-color': m.zoneFill }} />
                <Layer id="wake-zone-line" type="line" paint={{ 'line-color': m.zoneLine, 'line-width': 2 }} />
              </GeoJSONSource>
            ) : null}

            <GeoJSONSource id="stops" data={stopData} onPress={onStopPress} hitbox={HITBOX}>
              <Layer
                id="stops-dot"
                type="circle"
                filter={hideSelected}
                paint={{
                  'circle-radius': STOP_RADIUS,
                  'circle-color': ['get', 'color'],
                  'circle-stroke-width': m.stopStrokeWidth,
                  'circle-stroke-color': m.stopStroke,
                }}
              />
              {/* Names for every stop: big stations first, the rest as you zoom in. On a collision the
                  more important stop keeps its name; the dot always stays. */}
              <Layer
                id="stops-label-major"
                type="symbol"
                minzoom={9.5}
                filter={hideSelected ? ['all', ['>=', ['get', 'rank'], 380], hideSelected] : ['>=', ['get', 'rank'], 380]}
                layout={{ ...LABEL, 'text-font': ['Noto Sans Bold'], 'text-size': 14 * LABEL_SCALE }}
                paint={labelPaint(m.stopLabelMajor)}
              />
              <Layer
                id="stops-label-mid"
                type="symbol"
                minzoom={12}
                filter={[
                  'all',
                  ['>=', ['get', 'rank'], 200],
                  ['<', ['get', 'rank'], 380],
                  ...(hideSelected ? [hideSelected] : []),
                ]}
                layout={{ ...LABEL, 'text-font': ['Noto Sans Bold'], 'text-size': 12.5 * LABEL_SCALE }}
                paint={labelPaint(m.stopLabelMid)}
              />
              <Layer
                id="stops-label-minor"
                type="symbol"
                minzoom={14}
                filter={hideSelected ? ['all', ['<', ['get', 'rank'], 200], hideSelected] : ['<', ['get', 'rank'], 200]}
                layout={{ ...LABEL, 'text-font': ['Noto Sans Regular'], 'text-size': 12 * LABEL_SCALE }}
                paint={labelPaint(m.stopLabelMinor)}
              />
            </GeoJSONSource>

            {pin ? (
              <Marker key={pin.key} lngLat={[pin.longitude, pin.latitude]} anchor="bottom">
                <StopPin kind={pin.kind} />
              </Marker>
            ) : null}
          </Map>
        </Animated.View>
      ) : null}
    </View>
  );
}
