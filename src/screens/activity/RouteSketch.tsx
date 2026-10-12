import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';

import type { TripRecord } from '../../lib/history';
import { KIND_COLOR, useTheme } from '../../ui';

const HEIGHT = 220;
const PAD = 28;
const M_PER_DEG_LAT = 110_540;

type Props = { trip: TripRecord; accessibilityLabel: string };

/**
 * The trip at a glance for TripDetail: the way travelled, the amber wake circle and the stop,
 * drawn as a light SVG on the map's land colour. Not a live map: a finished trip needs no tiles,
 * no GL context and no network (ui-critiques: at most one interactive map at a time).
 */
export function RouteSketch({ trip, accessibilityLabel }: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(0);

  const dest = { lat: trip.place.latitude, lon: trip.place.longitude };
  const cosLat = Math.cos((dest.lat * Math.PI) / 180) || 1;
  // Local metres east and north of the stop.
  const toXY = (lat: number, lon: number) => ({
    x: (lon - dest.lon) * M_PER_DEG_LAT * cosLat,
    y: (lat - dest.lat) * M_PER_DEG_LAT,
  });
  const points = trip.trail.map(([lat, lon]) => toXY(lat, lon));
  const radius = Math.max(trip.radiusM, 50);
  let minX = -radius;
  let maxX = radius;
  let minY = -radius;
  let maxY = radius;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  // At least 600 m across, so a short trip doesn't fill the box with one circle.
  const spanX = Math.max(maxX - minX, 600);
  const spanY = Math.max(maxY - minY, 600);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const scale = width > 0 ? Math.min((width - PAD * 2) / spanX, (HEIGHT - PAD * 2) / spanY) : 0;
  const sx = (x: number) => width / 2 + (x - midX) * scale;
  const sy = (y: number) => HEIGHT / 2 - (y - midY) * scale;

  const line = points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const start = points[0];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.box, { backgroundColor: t.map.land, borderRadius: t.radius.lg }]}>
      {scale > 0 ? (
        <Svg width={width} height={HEIGHT}>
          <Rect x={0} y={0} width={width} height={HEIGHT} fill={t.map.land} />
          <Circle
            cx={sx(0)}
            cy={sy(0)}
            r={Math.max(radius * scale, 6)}
            fill={t.map.zoneFill}
            stroke={t.map.zoneLine}
            strokeWidth={1.5}
          />
          {points.length >= 2 ? (
            <Polyline
              points={line}
              fill="none"
              stroke={t.map.trail}
              strokeOpacity={t.map.trailOpacity}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {start && points.length >= 2 ? (
            <Circle cx={sx(start.x)} cy={sy(start.y)} r={5} fill={t.color.surface1} stroke={t.map.trail} strokeWidth={3} />
          ) : null}
          <Circle cx={sx(0)} cy={sy(0)} r={8} fill={KIND_COLOR[trip.place.kind]} stroke={t.map.stopStroke} strokeWidth={2} />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: HEIGHT, marginHorizontal: 16, overflow: 'hidden' },
});
