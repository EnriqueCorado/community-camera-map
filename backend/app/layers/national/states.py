"""State and territory layer packs, from verified specs in
app/layers/data/state_layers/*.json (one file per region). Each spec is a
national-style browser view scoped to one state: the frontend loads it only
from the state's official ArcGIS service, and the sidebar lists it under
"This state" when the map is over that state.

Specs are data, so they are validated strictly here (https ArcGIS layer URLs,
explicit field allowlists, known groups/categories); a bad spec fails loudly
at import (and in CI) instead of shipping.
"""

from __future__ import annotations

import json
import re
from dataclasses import replace
from pathlib import Path

from ..service import Classes, Layer, View

SPEC_DIR = Path(__file__).resolve().parent.parent / "data" / "state_layers"
# USPS code -> {"name", "bbox": [w, s, e, n]} (TIGERweb states, 2-decimal; also
# shipped to the frontend as src/state-bboxes.json for "no data here" notes)
STATES: dict[str, dict] = json.loads((SPEC_DIR.parent / "state_bboxes.json").read_text())

GROUPS = {
    "cameras", "live", "civic", "help", "people", "housing", "growth", "weather",
    "hazards", "roads", "places", "nature", "planning", "infra",
}  # fmt: skip
CATEGORIES = {"boundary", "landuse", "point", "hazard", "park", "info", "roadops", "perimeter"}
GEOMETRIES = {"point", "line", "polygon"}
_URL = re.compile(
    r"^https://[a-z0-9.-]+(?::443)?/[\w./%()-]*/(?:FeatureServer|MapServer)/\d+$", re.I
)
_NAME = re.compile(r"^[a-z]{2}-[a-z0-9-]+$")
_FIELD = re.compile(r"^[A-Za-z_][\w.]{0,63}$")
_PROP = re.compile(r"^[a-z_][a-z0-9_]{0,31}$")


class SpecError(ValueError):
    pass


def _check(spec: dict, where: str) -> None:
    def need(cond: bool, what: str) -> None:
        if not cond:
            raise SpecError(f"{where}: {what}")

    name, st = spec.get("name", ""), spec.get("state", "")
    need(isinstance(name, str) and bool(_NAME.match(name)), f"bad name {name!r}")
    need(st in STATES or st == "US", f"unknown state {st!r}")  # "US": a multi-state source
    need(name.startswith(f"{st.lower()}-"), f"{name}: name must start with '{st.lower()}-'")
    for key in ("title", "title_es", "description", "source"):
        need(isinstance(spec.get(key), str) and spec[key].strip() != "", f"{name}: missing {key}")
    need(spec.get("group") in GROUPS, f"{name}: bad group {spec.get('group')!r}")
    need(spec.get("category") in CATEGORIES, f"{name}: bad category {spec.get('category')!r}")
    v = spec.get("view") or {}
    need(isinstance(v.get("url"), str) and bool(_URL.match(v["url"])), f"{name}: bad view url")
    fields = v.get("fields")
    need(isinstance(fields, dict) and 0 < len(fields) <= 25, f"{name}: fields must be 1-25")
    for src, dst in (fields or {}).items():
        need(
            bool(_FIELD.match(src)) and isinstance(dst, str) and bool(_PROP.match(dst)),
            f"{name}: field {src!r}",
        )
    need(v.get("geometry") in GEOMETRIES, f"{name}: bad geometry")
    need(
        isinstance(v.get("min_zoom", 0), int | float) and 4 <= v.get("min_zoom", 0) <= 18,
        f"{name}: min_zoom 4-18",
    )
    need(
        isinstance(v.get("where", "1=1"), str) and ";" not in v.get("where", ""),
        f"{name}: bad where",
    )


def _layer(spec: dict) -> Layer:
    v = spec["view"]
    polygon = v["geometry"] == "polygon"
    return Layer(
        name=spec["name"],
        title=spec["title"],
        description=spec["description"],
        category=spec["category"],
        coverage="usa" if spec["state"] == "US" else spec["state"],
        view=View(
            v["url"],
            dict(v["fields"]),
            v["geometry"],
            min_zoom=float(v["min_zoom"]),
            where=v.get("where", "1=1"),
            max_features=int(v.get("max_features", 2000)),
            simplify=polygon or bool(v.get("simplify", False)),
            refresh_s=int(v.get("refresh_s", 24 * 3600)),
        ),
        title_es=spec["title_es"],
        group=spec["group"],
    )


def load(spec_dir: Path = SPEC_DIR) -> tuple[dict[str, Layer], dict[str, str], set[str]]:
    """(layers, sources, hosts) from every spec file, in file then list order."""
    layers: dict[str, Layer] = {}
    sources: dict[str, str] = {}
    hosts: set[str] = set()
    for path in sorted(spec_dir.glob("*.json")):
        specs = json.loads(path.read_text())
        if not isinstance(specs, list):
            raise SpecError(f"{path.name}: expected a JSON array")
        for i, spec in enumerate(specs):
            _check(spec, f"{path.name}[{i}]")
            if spec["name"] in layers:
                raise SpecError(f"{path.name}: duplicate layer {spec['name']!r}")
            layers[spec["name"]] = _layer(spec)
            sources[spec["name"]] = spec["source"]
            hosts.add(spec["view"]["url"].split("/")[2].split(":")[0].lower())
    return layers, sources, hosts


# --- Categorical colors for zone-type state layers (kept here, not in the
# researched specs, so re-verifying a spec file never drops a style). ---
_EVAC = (  # hurricane / storm-surge evacuation zones: A (first to leave) -> F
    (("A", "1"), "#b2182b", "Zone A / 1 (evacuate first)", "Zona A / 1 (evacuar primero)"),
    (("B", "2"), "#e6553e", "Zone B / 2", "Zona B / 2"),
    (("C", "3"), "#f4a259", "Zone C / 3", "Zona C / 3"),
    (("D", "4"), "#f6d55c", "Zone D / 4", "Zona D / 4"),
    (("E", "5"), "#9fd3c7", "Zone E / 5", "Zona E / 5"),
    (("F", "6"), "#5aa9e6", "Zone F / 6", "Zona F / 6"),
    (("G", "7", "H", "I", "J"), "#3d5a98", "Later zones", "Zonas posteriores"),
)
_DANGER = (
    (("LOW", "Low", "1"), "#2b9348", "Low", "Bajo"),
    (("MODERATE", "Moderate", "2"), "#e9c46a", "Moderate", "Moderado"),
    (("HIGH", "High", "3"), "#f4a261", "High", "Alto"),
    (("VERY HIGH", "Very High", "4"), "#e76f51", "Very high", "Muy alto"),
    (("EXTREME", "Extreme", "5"), "#9d0208", "Extreme", "Extremo"),
)
STYLES: dict[str, Classes] = {
    "fl-evacuation-zones": Classes("kind", _EVAC, prefix=True),
    "sc-evacuation-zones": Classes("name", _EVAC, prefix=True),
    "va-evacuation-zones": Classes("name", _EVAC, prefix=True),
    "ma-hurricane-evacuation-zones": Classes("kind", _EVAC, prefix=True),
    "ny-nyc-hurricane-evacuation-zones": Classes("kind", _EVAC, prefix=True),
    "tx-houston-evac-zones": Classes(
        "kind",
        (
            (
                ("Zip-Zone Coastal",),
                "#7b0d1e",
                "Coastal (evacuate first)",
                "Costera (evacuar primero)",
            ),
            (("Zip-Zone A",), "#b2182b", "Zip-Zone A", "Zona A"),
            (("Zip-Zone B",), "#f4a259", "Zip-Zone B", "Zona B"),
            (("Zip-Zone C",), "#f6d55c", "Zip-Zone C", "Zona C"),
        ),
    ),
    "wa-fire-danger-burn-bans": Classes("kind", _DANGER),
    "wi-fire-danger": Classes("status", _DANGER),
    "or-fire-restrictions": Classes("status", _DANGER),
    "ok-burn-bans": Classes(
        "status",
        ((("County Burn Ban",), "#c1121f", "Burn ban", "Prohibición de quemas"),),
    ),
    "fl-burn-bans": Classes(
        "status",
        (
            (("Yard Debris",), "#f4a261", "Yard-debris ban", "Prohibido quemar desechos de jardín"),
            (("Burn Ban", "Countywide Burn Ban"), "#c1121f", "Burn ban", "Prohibición de quemas"),
        ),
    ),
    "ut-fire-restrictions": Classes(
        "kind",
        (
            (("Stage 1",), "#f4a261", "Stage 1 restrictions", "Restricciones etapa 1"),
            (("Stage 2",), "#e76f51", "Stage 2 restrictions", "Restricciones etapa 2"),
            (("Closure",), "#9d0208", "Closure", "Cierre"),
        ),
        other="#adb5bd",
    ),
}


def _styled(layers: dict[str, Layer]) -> dict[str, Layer]:
    return {n: replace(lay, classes=STYLES[n]) if n in STYLES else lay for n, lay in layers.items()}


LAYERS, SOURCES, HOSTS = load() if SPEC_DIR.is_dir() else ({}, {}, set())
LAYERS = _styled(LAYERS)
