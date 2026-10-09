#!/usr/bin/env python3
"""Extracts public transport stops from an OpenStreetMap extract, for a country stop pack.

Usage: osm-stops.py <relations.osm.pbf> <stops.osm.pbf> <out.ndjson>

Both inputs may be the same file. In CI they are made smaller first with osmium-tool:
  relations: route and stop_area relations only (no members)
  stops:     stop nodes, platform/station ways with their nodes, and place nodes for town names

Each output line is one named stop element:
  {"name", "lat", "lon", "modes": [...], "routes": {mode: [route ids]}, "station", "en", "alt": [...],
   "place", "place_en"}
Modes are train, suburban (S-Bahn, S-tog and other commuter trains), metro, tram, bus and ferry.
tools/build-osm-pack.ts merges them into stops and builds the SQLite pack.
"""

import json
import math
import re
import sys

import osmium

ROUTE_MODES = {
    "train": "train",
    "subway": "metro",
    "light_rail": "tram",
    "tram": "tram",
    "monorail": "metro",
    "bus": "bus",
    "trolleybus": "bus",
    "coach": None,
    "ferry": "ferry",
    "funicular": "tram",
}
PLACE_RANK = {"city": 3, "town": 2, "village": 1}
SUBURBAN_REF = re.compile(r"^S\s?\d")


def route_mode(tags):
    mode = ROUTE_MODES.get(tags.get("route", ""))
    if mode == "train":
        network = tags.get("network", "")
        if (
            tags.get("service") == "commuter"
            or SUBURBAN_REF.match(tags.get("ref", ""))
            or "S-Bahn" in network
            or "S-tog" in network
        ):
            return "suburban"
    return mode
ALT_NAME_KEYS = ("alt_name", "official_name", "short_name", "name:de", "name:fr", "name:it", "name:nl", "name:en", "name:ja-Latn", "name:ja_rm")


def stop_modes(tags):
    """Transport modes a stop element says it serves, from its own tags."""
    modes = set()
    railway = tags.get("railway")
    station = tags.get("station")
    if railway in ("station", "halt"):
        if station == "subway" or tags.get("subway") == "yes":
            modes.add("metro")
        elif station == "light_rail" or tags.get("light_rail") == "yes":
            modes.add("tram")
        else:
            modes.add("train")
    if railway == "tram_stop" or tags.get("tram") == "yes" or tags.get("light_rail") == "yes":
        modes.add("tram")
    if tags.get("subway") == "yes" or tags.get("monorail") == "yes":
        modes.add("metro")
    if tags.get("train") == "yes":
        modes.add("train")
    if tags.get("highway") == "bus_stop" or tags.get("bus") == "yes" or tags.get("trolleybus") == "yes":
        modes.add("bus")
    if tags.get("amenity") == "ferry_terminal" or tags.get("ferry") == "yes":
        modes.add("ferry")
    return modes


def is_stop(tags):
    pt = tags.get("public_transport")
    return (
        pt in ("platform", "stop_position", "station")
        or tags.get("railway") in ("station", "halt", "tram_stop")
        or tags.get("highway") == "bus_stop"
        or tags.get("amenity") == "ferry_terminal"
    )


class Relations(osmium.SimpleHandler):
    """Route relations: which routes (and of which mode) each stop element belongs to."""

    def __init__(self):
        super().__init__()
        self.routes = {}  # ("n"|"w", id) -> set of route ids
        self.route_mode = {}  # route id -> mode
        self.area_members = {}  # stop_area id -> list of member keys

    def relation(self, r):
        tags = r.tags
        if tags.get("type") == "route":
            mode = route_mode(tags)
            if not mode:
                return
            self.route_mode[r.id] = mode
            for m in r.members:
                if m.type in ("n", "w"):
                    self.routes.setdefault((m.type, m.ref), set()).add(r.id)
        elif tags.get("public_transport") == "stop_area":
            self.area_members[r.id] = [(m.type, m.ref) for m in r.members if m.type in ("n", "w")]

    def spread_over_stop_areas(self):
        """A route that stops at one member of a stop area serves the whole station."""
        for members in self.area_members.values():
            shared = set()
            for key in members:
                shared |= self.routes.get(key, set())
            if shared:
                for key in members:
                    self.routes.setdefault(key, set()).update(shared)


class Stops(osmium.SimpleHandler):
    def __init__(self, relations):
        super().__init__()
        self.rel = relations
        self.stops = []
        self.places = []  # (lat, lon, name, rank, English name)

    def _add(self, kind, osm_id, tags, lat, lon):
        name = tags.get("name")
        if not name:
            return
        route_ids = self.rel.routes.get((kind, osm_id), set())
        modes = stop_modes(tags) | {self.rel.route_mode[r] for r in route_ids if r in self.rel.route_mode}
        if not modes:
            return
        alt = sorted({tags.get(k) for k in ALT_NAME_KEYS if tags.get(k) and tags.get(k) != name})
        routes = {}
        for r in sorted(route_ids):
            if r in self.rel.route_mode:
                routes.setdefault(self.rel.route_mode[r], []).append(r)
        self.stops.append(
            {
                "name": name,
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "modes": sorted(modes),
                "routes": routes,
                "station": tags.get("public_transport") == "station" or tags.get("railway") in ("station", "halt"),
                "en": tags.get("name:en"),
                "alt": alt,
            }
        )

    def node(self, n):
        tags = n.tags
        place = tags.get("place")
        if place in PLACE_RANK and tags.get("name"):
            self.places.append((n.location.lat, n.location.lon, tags.get("name"), PLACE_RANK[place], tags.get("name:en")))
        if is_stop(tags):
            self._add("n", n.id, tags, n.location.lat, n.location.lon)

    def way(self, w):
        if not is_stop(w.tags):
            return
        lats, lons = [], []
        for nd in w.nodes:
            if nd.location.valid():
                lats.append(nd.location.lat)
                lons.append(nd.location.lon)
        if lats:
            self._add("w", w.id, w.tags, sum(lats) / len(lats), sum(lons) / len(lons))


def attach_places(stops, places):
    """Adds the nearest town or city, so stops with common names can be told apart."""
    cell = 0.1
    grid = {}
    for p in places:
        grid.setdefault((int(p[0] // cell), int(p[1] // cell)), []).append(p)
    for s in stops:
        cy, cx = int(s["lat"] // cell), int(s["lon"] // cell)
        best = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for lat, lon, name, rank, en in grid.get((cy + dy, cx + dx), ()):
                    d = math.hypot(lat - s["lat"], (lon - s["lon"]) * math.cos(math.radians(s["lat"])))
                    # Prefer bigger places a little: a stop in a city suburb belongs to the city.
                    score = d / (1 + 0.6 * rank)
                    if best is None or score < best[0]:
                        best = (score, name, en)
        s["place"] = best[1] if best else None
        s["place_en"] = best[2] if best else None


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    rel_path, stops_path, out_path = sys.argv[1:]
    relations = Relations()
    relations.apply_file(rel_path)
    relations.spread_over_stop_areas()
    stops = Stops(relations)
    stops.apply_file(stops_path, locations=True)
    attach_places(stops.stops, stops.places)
    with open(out_path, "w", encoding="utf-8") as f:
        for s in stops.stops:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    print(f"{len(stops.stops)} stop elements, {len(relations.route_mode)} routes, {len(stops.places)} places", file=sys.stderr)


if __name__ == "__main__":
    main()
