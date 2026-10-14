"""Attribute ALPR cameras to the agency (or network) whose public records
describe who can search them.

Rules are deliberately conservative — every inference is backed by a public
record about that agency's system (see data/alpr_access.json for sources):

  tagged   : the OpenStreetMap `operator` tag names the operator.
  inferred : no tag, but the camera's vendor matches a verified agency system
             AND it sits inside that agency's jurisdiction.
  network  : vendor is a shared county network; the operator itself is unknown.

Anything else is left unattributed — e.g. an untagged Flock camera in Modesto
could belong to a business or HOA, so we don't guess.

Pure functions only (no I/O) so they're unit-tested directly.
"""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import Literal

Basis = Literal["tagged", "inferred", "network"]

# Curated, sourced profiles (built by scripts/build_alpr_access.py).
ALPR_ACCESS_FILE = Path(__file__).resolve().parent.parent / "cameras" / "data" / "alpr_access.json"

# OSM operator tag (lower-cased, substring) -> profile id
_OPERATOR_TAGS: tuple[tuple[str, str], ...] = (
    ("modesto police", "modesto-pd"),
    ("turlock police", "turlock-pd"),
    ("stanislaus county sheriff", "stanislaus-sheriff"),
    ("home depot", "retail-home-depot"),
    ("lowe's", "retail-lowes"),
    ("lowes", "retail-lowes"),
)

# Epic iO was formerly IntelliSite; OSM uses both names.
_EPIC = ("epic io", "epic iq", "intelisite", "intellisite")
# Areas covered by the Sheriff's Epic iO contracts (Board of Supervisors, 2025-06-10).
_SHERIFF_EPIC_AREAS = {None, "PATTERSON", "WATERFORD", "HUGHSON"}  # None = unincorporated


def _vendor(tags: dict) -> str:
    return str(tags.get("manufacturer") or tags.get("brand") or "").lower()


def by_operator(operator: object) -> str | None:
    """Profile for an OSM operator tag, or None if we have no records for it.
    Location-independent, so it's safe to apply statewide."""
    op = str(operator or "").lower().replace("\u2019", "'")  # curly apostrophe
    return next((profile for needle, profile in _OPERATOR_TAGS if needle in op), None)


def assign(tags: dict, city: str | None) -> tuple[str | None, Basis | None]:
    """Return (profile_id, basis) for one county camera, or (None, None) if unknown.

    The vendor + jurisdiction rules assume a Stanislaus County location; only
    call this for cameras inside the county (see `enrich`).
    """
    if tags.get("operator"):
        profile = by_operator(tags["operator"])
        # Tagged with an operator we have no records for: don't guess further.
        return (profile, "tagged") if profile else (None, None)

    vendor = _vendor(tags)
    if city == "MODESTO" and "motorola" in vendor:
        return "modesto-pd", "inferred"
    if city == "TURLOCK" and "flock" in vendor:
        return "turlock-pd", "inferred"
    if any(e in vendor for e in _EPIC):
        if city in _SHERIFF_EPIC_AREAS:
            return "stanislaus-sheriff", "inferred"
        return "epic-io-network", "network"
    return None, None


# ---------- geometry ----------


def _in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _in_polygon(lon: float, lat: float, rings: list) -> bool:
    if not rings or not _in_ring(lon, lat, rings[0]):
        return False
    return not any(_in_ring(lon, lat, hole) for hole in rings[1:])


def point_in_geometry(lon: float, lat: float, geometry: dict) -> bool:
    gtype = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if gtype == "Polygon":
        return _in_polygon(lon, lat, coords)
    if gtype == "MultiPolygon":
        return any(_in_polygon(lon, lat, poly) for poly in coords)
    return False


# (name, geometry, (min_lon, min_lat, max_lon, max_lat))
_Indexed = list[tuple[str, dict, tuple[float, float, float, float]]]


def _index_cities(city_features: Iterable[dict]) -> _Indexed:
    """Precompute each shape's bounding box once, so lookups can skip the
    (vast majority of) polygons nowhere near a point."""
    out: _Indexed = []
    for f in city_features:
        name = str((f.get("properties") or {}).get("name") or "").upper()
        geom = f.get("geometry") or {}
        polys = geom.get("coordinates") or []
        if geom.get("type") == "Polygon":
            polys = [polys]
        elif geom.get("type") != "MultiPolygon":
            continue
        pts = [pt for poly in polys for ring in poly[:1] for pt in ring]
        if name and pts:
            xs, ys = [pt[0] for pt in pts], [pt[1] for pt in pts]
            out.append((name, geom, (min(xs), min(ys), max(xs), max(ys))))
    return out


def city_for(lon: float, lat: float, city_features: Iterable[dict]) -> str | None:
    """Incorporated city containing the point, or None if unincorporated.

    The county's city-limits layer also has "COUNTY" islands (unincorporated
    pockets inside cities); those take precedence over the surrounding city.
    """
    return _city_at(lon, lat, _index_cities(city_features))


def _city_at(lon: float, lat: float, indexed: _Indexed) -> str | None:
    city = None
    for name, geom, (x0, y0, x1, y1) in indexed:
        if not (x0 <= lon <= x1 and y0 <= lat <= y1) or not point_in_geometry(lon, lat, geom):
            continue
        if name == "COUNTY":
            return None
        city = city or name
    return city


def enrich(fc: dict, raw_by_osm_id: dict[int, dict], city_features: list[dict]) -> dict[str, int]:
    """Add `agency` / `agency_basis` to ALPR features. Returns counts for reporting.

    County cameras (osm_id in `raw_by_osm_id`, with full OSM tags) get every
    rule; cameras elsewhere get only the location-independent operator-tag
    rule (e.g. a Home Depot reader in Fresno), counted under "statewide:"."""
    counts: dict[str, int] = {}
    cities = _index_cities(city_features)  # once, not per point
    for f in fc.get("features", []):
        props = f.setdefault("properties", {})
        props.pop("agency", None)
        props.pop("agency_basis", None)
        raw = raw_by_osm_id.get(props.get("osm_id"))
        if (f.get("geometry") or {}).get("type") != "Point":
            continue
        if raw is None:
            profile = by_operator(props.get("operator"))
            if profile:
                props["agency"], props["agency_basis"] = profile, "tagged"
                counts[f"statewide:{profile}"] = counts.get(f"statewide:{profile}", 0) + 1
            continue
        lon, lat = f["geometry"]["coordinates"][:2]
        profile, basis = assign(raw.get("tags", {}), _city_at(lon, lat, cities))
        key = f"{profile}:{basis}" if profile else "unattributed"
        counts[key] = counts.get(key, 0) + 1
        if profile:
            props["agency"] = profile
            props["agency_basis"] = basis
    return counts
