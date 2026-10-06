import { describe, expect, it } from 'vitest';

import { parseCoordinates, parsePhoton } from '../geocode';

describe('parseCoordinates', () => {
  it('reads plain pairs', () => {
    expect(parseCoordinates('49.1427, 9.2109')).toEqual({ latitude: 49.1427, longitude: 9.2109 });
    expect(parseCoordinates(' 28.6139 77.2090 ')).toEqual({ latitude: 28.6139, longitude: 77.209 });
  });

  it('reads Google and OpenStreetMap links', () => {
    expect(parseCoordinates('https://www.google.com/maps/@52.5251,13.3694,15z')).toEqual({
      latitude: 52.5251,
      longitude: 13.3694,
    });
    expect(parseCoordinates('https://maps.google.com/?q=19.0760,72.8777')).toEqual({
      latitude: 19.076,
      longitude: 72.8777,
    });
    expect(parseCoordinates('https://www.openstreetmap.org/?mlat=48.1402&mlon=11.5600#map=17')).toEqual({
      latitude: 48.1402,
      longitude: 11.56,
    });
  });

  it('rejects text and impossible values', () => {
    expect(parseCoordinates('Heilbronn Hbf')).toBeNull();
    expect(parseCoordinates('95.0, 10.0')).toBeNull();
    expect(parseCoordinates('Platz 12, 74072')).toBeNull();
  });
});

describe('parsePhoton', () => {
  it('turns features into places and marks stops', () => {
    const places = parsePhoton({
      features: [
        {
          geometry: { coordinates: [9.2109, 49.1427] },
          properties: {
            name: 'Heilbronn Hbf',
            city: 'Heilbronn',
            state: 'Baden-Württemberg',
            country: 'Germany',
            osm_type: 'N',
            osm_id: 123,
            osm_value: 'station',
          },
        },
        {
          geometry: { coordinates: [9.22, 49.14] },
          properties: { street: 'Bahnhofstraße', housenumber: '5', city: 'Heilbronn', country: 'Germany' },
        },
      ],
    });
    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({
      name: 'Heilbronn Hbf',
      context: 'Heilbronn, Baden-Württemberg, Germany',
      latitude: 49.1427,
      longitude: 9.2109,
      isStop: true,
    });
    expect(places[1]).toMatchObject({ name: 'Bahnhofstraße 5', context: 'Heilbronn, Germany', isStop: false });
  });

  it('drops duplicates and features without coordinates', () => {
    const feature = { geometry: { coordinates: [1, 2] }, properties: { name: 'A', city: 'B' } };
    expect(parsePhoton({ features: [feature, feature, { properties: { name: 'C' } }] })).toHaveLength(1);
    expect(parsePhoton(null)).toEqual([]);
  });
});
