import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  NativeUserLocation,
  type CameraRef,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import type { ExpressionSpecification, SymbolLayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import { useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';

import type { Place } from '../lib/geocode';
import type { Bounds, Stop } from '../lib/stations/search';
import { Icon } from '../ui/components';
import { KIND_COLOR, KIND_ICON, useTheme } from '../ui/theme';
import { circlePolygon, GERMANY_CENTER, GERMANY_ZOOM, stopsToGeoJSON } from './geo';
import { useMapStyle } from './useMapStyle';

type CameraView = { center: [number, number]; zoom: number };

export type HomeMapHandle = {
  flyTo: (latitude: number, longitude: number, zoom?: number) => void;
};

type Props = {
  ref?: Ref<HomeMapHandle>;
  stops: Stop[];
  selected: Place | null;
  /** Alarm radius to preview around the selected place. */
  radiusM: number | null;
  showUser: boolean;
  initialCenter: { latitude: number; longitude: number } | null;
  /** Keeps the attribution clear of the bottom sheet. */
  bottomInset: number;
  onPressStop: (stop: Stop) => void;
  onPressMap: () => void;
  onLongPress: (latitude: number, longitude: number) => void;
  onViewChange: (bounds: Bounds, zoom: number) => void;
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

export function HomeMap({
  ref,
  stops,
  selected,
  radiusM,
  showUser,
  initialCenter,
  bottomInset,
  onPressStop,
  onPressMap,
  onLongPress,
  onViewChange,
}: Props) {
  const t = useTheme();
  const mapStyle = useMapStyle();
  const camera = useRef<CameraRef>(null);
  // Camera moves asked for before the map is ready: where to open, or where to go once loaded.
  const [startView, setStartView] = useState<CameraView | null>(null);
  const loaded = useRef(false);
  const pendingView = useRef<CameraView | null>(null);
  const stopsById = useMemo(() => new globalThis.Map(stops.map((s) => [s.id, s])), [stops]);
  const stopData = useMemo(() => stopsToGeoJSON(stops), [stops]);
  const radiusData = useMemo(
    () => (selected && radiusM ? circlePolygon(selected.latitude, selected.longitude, radiusM) : null),
    [selected, radiusM],
  );

  useImperativeHandle(ref, () => ({
    flyTo: (latitude, longitude, zoom = 15) => {
      const view: CameraView = { center: [longitude, latitude], zoom };
      if (!camera.current) setStartView(view);
      else if (!loaded.current) pendingView.current = view;
      else camera.current.flyTo({ ...view, duration: 900 });
    },
  }));

  function onLoaded() {
    loaded.current = true;
    const view = pendingView.current;
    pendingView.current = null;
    if (view) camera.current?.flyTo({ ...view, duration: 0 });
  }

  function onStopPress(event: NativeSyntheticEvent<PressEventWithFeatures>) {
    event.stopPropagation();
    const id = event.nativeEvent.features[0]?.properties?.id;
    const stop = typeof id === 'number' ? stopsById.get(id) : undefined;
    if (stop) onPressStop(stop);
  }

  const selectedKind = selected?.kind ?? 'place';
  if (!mapStyle) return <View style={[StyleSheet.absoluteFill, { backgroundColor: t.surfaceAlt }]} />;
  return (
    <Map
      style={StyleSheet.absoluteFill}
      // A TextureView is part of the normal view tree, so leaving the map leaves no hole
      // behind (with a SurfaceView the status bar area stayed black on the next screen).
      androidView="texture"
      mapStyle={mapStyle}
      logo={false}
      compass={false}
      tintColor={t.primary}
      attributionPosition={{ bottom: bottomInset + 8, left: 8 }}
      onDidFinishLoadingMap={onLoaded}
      onPress={() => onPressMap()}
      onLongPress={(e) => onLongPress(e.nativeEvent.lngLat[1], e.nativeEvent.lngLat[0])}
      onRegionDidChange={(e) => onViewChange(e.nativeEvent.bounds, e.nativeEvent.zoom)}>
      <Camera
        ref={camera}
        initialViewState={
          startView ??
          (initialCenter
            ? { center: [initialCenter.longitude, initialCenter.latitude], zoom: 13.5 }
            : { center: GERMANY_CENTER, zoom: GERMANY_ZOOM })
        }
      />
      {showUser ? <NativeUserLocation /> : null}

      {radiusData ? (
        <GeoJSONSource id="alarm-radius" data={radiusData}>
          <Layer id="alarm-radius-fill" type="fill" paint={{ 'fill-color': t.primary, 'fill-opacity': 0.12 }} />
          <Layer id="alarm-radius-line" type="line" paint={{ 'line-color': t.primary, 'line-width': 2 }} />
        </GeoJSONSource>
      ) : null}

      <GeoJSONSource id="stops" data={stopData} onPress={onStopPress} hitbox={{ top: 14, right: 14, bottom: 14, left: 14 }}>
        <Layer
          id="stops-dot"
          type="circle"
          paint={{
            'circle-radius': STOP_RADIUS,
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF',
          }}
        />
        {/* Names for every stop: big stations first, the rest as you zoom in. On a collision the
            more important stop keeps its name; the dot always stays. */}
        <Layer
          id="stops-label-major"
          type="symbol"
          minzoom={9.5}
          filter={['>=', ['get', 'rank'], 380]}
          layout={{ ...LABEL, 'text-font': ['Noto Sans Bold'], 'text-size': 14 }}
          paint={{ 'text-color': '#111827', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.8 }}
        />
        <Layer
          id="stops-label-mid"
          type="symbol"
          minzoom={12}
          filter={['all', ['>=', ['get', 'rank'], 200], ['<', ['get', 'rank'], 380]]}
          layout={{ ...LABEL, 'text-font': ['Noto Sans Bold'], 'text-size': 12.5 }}
          paint={{ 'text-color': '#1F2937', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.6 }}
        />
        <Layer
          id="stops-label-minor"
          type="symbol"
          minzoom={14}
          filter={['<', ['get', 'rank'], 200]}
          layout={{ ...LABEL, 'text-font': ['Noto Sans Regular'], 'text-size': 12 }}
          paint={{ 'text-color': '#374151', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5 }}
        />
      </GeoJSONSource>

      {selected ? (
        <Marker lngLat={[selected.longitude, selected.latitude]} anchor="bottom">
          <View style={styles.pin}>
            <Icon name="map-marker" size={54} color={KIND_COLOR[selectedKind]} />
            <View style={styles.pinIcon}>
              <Icon name={KIND_ICON[selectedKind]} size={16} color={KIND_COLOR[selectedKind]} />
            </View>
          </View>
        </Marker>
      ) : null}
    </Map>
  );
}

const styles = StyleSheet.create({
  pin: { alignItems: 'center', justifyContent: 'flex-start', width: 54, height: 54 },
  pinIcon: {
    position: 'absolute',
    top: 9,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
