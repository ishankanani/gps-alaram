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
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';

import type { Place } from '../lib/geocode';
import type { Bounds, Stop } from '../lib/stations/search';
import { Icon } from '../ui/components';
import { KIND_COLOR, KIND_ICON, useTheme } from '../ui/theme';
import { circlePolygon, GERMANY_CENTER, GERMANY_ZOOM, MAP_STYLE, stopsToGeoJSON } from './geo';

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
  const camera = useRef<CameraRef>(null);
  const stopsById = useMemo(() => new globalThis.Map(stops.map((s) => [s.id, s])), [stops]);
  const stopData = useMemo(() => stopsToGeoJSON(stops), [stops]);
  const radiusData = useMemo(
    () => (selected && radiusM ? circlePolygon(selected.latitude, selected.longitude, radiusM) : null),
    [selected, radiusM],
  );

  useImperativeHandle(ref, () => ({
    flyTo: (latitude, longitude, zoom = 15) =>
      camera.current?.flyTo({ center: [longitude, latitude], zoom, duration: 900 }),
  }));

  function onStopPress(event: NativeSyntheticEvent<PressEventWithFeatures>) {
    event.stopPropagation();
    const id = event.nativeEvent.features[0]?.properties?.id;
    const stop = typeof id === 'number' ? stopsById.get(id) : undefined;
    if (stop) onPressStop(stop);
  }

  const selectedKind = selected?.kind ?? 'place';
  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={MAP_STYLE}
      logo={false}
      compass={false}
      tintColor={t.primary}
      attributionPosition={{ bottom: bottomInset + 8, left: 8 }}
      onPress={() => onPressMap()}
      onLongPress={(e) => onLongPress(e.nativeEvent.lngLat[1], e.nativeEvent.lngLat[0])}
      onRegionDidChange={(e) => onViewChange(e.nativeEvent.bounds, e.nativeEvent.zoom)}>
      <Camera
        ref={camera}
        initialViewState={
          initialCenter
            ? { center: [initialCenter.longitude, initialCenter.latitude], zoom: 13.5 }
            : { center: GERMANY_CENTER, zoom: GERMANY_ZOOM }
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
        <Layer
          id="stops-label-big"
          type="symbol"
          minzoom={10.5}
          filter={['>=', ['get', 'rank'], 250]}
          layout={{
            'text-field': ['get', 'title'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 13,
            'text-offset': [0, 1.1],
            'text-anchor': 'top',
            'text-optional': true,
          }}
          paint={{ 'text-color': '#1F2937', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.6 }}
        />
        <Layer
          id="stops-label"
          type="symbol"
          minzoom={15.5}
          filter={['<', ['get', 'rank'], 250]}
          layout={{
            'text-field': ['get', 'title'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 12,
            'text-offset': [0, 1],
            'text-anchor': 'top',
            'text-optional': true,
          }}
          paint={{ 'text-color': '#374151', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.4 }}
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
