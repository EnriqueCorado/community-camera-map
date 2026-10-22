"""Re-verify researched state-layer specs live before they ship.

    uv run python scripts/verify_state_specs.py IN.json OUT.json

For every spec: passes the loader's validation, the layer is read-only for
anonymous users, the service sends CORS for the site's origin, a bbox query
(the spec's verified bbox, else the state's center)
returns GeoJSON, and every allowlisted field exists on the layer. Accepted
specs are written to OUT (e.g. app/layers/data/state_layers/<region>.json);
rejects are listed with the reason. Then run scripts/sync_state_specs.py.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.layers.service import LAYERS  # noqa: E402  (registers the packs)

# isort: split
from app.layers.national import states  # noqa: E402

ORIGIN = "https://enriquecorado.github.io"
UA = "community-camera-map spec verifier (github.com/EnriqueCorado/community-camera-map)"


def _probe_bbox(spec: dict) -> list[float]:
    box = (spec.get("verified") or {}).get("bbox")
    if isinstance(box, list) and len(box) == 4:
        return box
    w, s, e, n = states.STATES[spec["state"]]["bbox"]
    cx, cy = (w + e) / 2, (s + n) / 2
    return [cx - 0.1, cy - 0.1, cx + 0.1, cy + 0.1]


_EDITS = {"create", "update", "delete", "editing"}


def editable(meta: dict) -> bool:
    """True when the layer offers edits to whoever asked (us: anonymous).
    Vandals could plant text that the map would then show as official."""
    caps = {c.strip().lower() for c in str(meta.get("capabilities", "")).split(",")}
    return bool(caps & _EDITS)


def feature_service_urls(url: str) -> list[str]:
    """The editable endpoints behind a layer URL: a MapServer serves the same
    data as its FeatureServer twin, so an edit there shows here too."""
    root, _, layer = url.rpartition("/")
    base = root.rsplit("/", 1)[0]
    return [f"{base}/FeatureServer", f"{base}/FeatureServer/{layer}"]


async def edit_exposure(client: httpx.AsyncClient, url: str, meta: dict) -> str | None:
    """Why the data behind `url` is anonymously editable, else None."""
    if editable(meta):
        return f"anonymously editable ({meta.get('capabilities')})"
    for u in feature_service_urls(url):
        try:
            m = (await client.get(u, params={"f": "json"})).json()
        except (httpx.HTTPError, ValueError):
            continue  # no FeatureServer twin (plain MapServer): nothing to edit
        if isinstance(m, dict) and "error" not in m and editable(m):
            return f"anonymously editable via {u.rsplit('/rest/services/', 1)[-1]}"
    return None


async def check(client: httpx.AsyncClient, spec: dict) -> str | None:
    """None if the spec is good, else why not."""
    try:
        states._check(spec, spec.get("name", "?"))
    except states.SpecError as exc:
        return f"invalid: {exc}"
    if spec["name"] in LAYERS and spec["name"] not in _REVERIFYING:
        return "name already used by an existing layer"
    v = spec["view"]
    try:
        meta = (await client.get(v["url"], params={"f": "json"})).json()
    except (httpx.HTTPError, ValueError) as exc:
        return f"metadata: {type(exc).__name__}"
    if "error" in meta:
        return f"metadata error: {str(meta['error'])[:80]}"
    if why := await edit_exposure(client, v["url"], meta):
        return f"{why}; use a separate read-only copy"
    have = {f["name"] for f in meta.get("fields") or []}
    missing = [f for f in v["fields"] if f not in have]
    if missing:
        return f"fields not on the layer: {missing}"
    params = {
        "where": v.get("where", "1=1"),
        "geometry": ",".join(map(str, _probe_bbox(spec))),
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "outSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": ",".join(v["fields"]),
        # big Esri services time out (~55 s) on tiny pages; the map asks for
        # spec.max_features (2000) and so do we
        "resultRecordCount": str(v.get("max_features", 2000)),
        "f": "geojson",
    }
    try:
        r = await client.get(f"{v['url']}/query", params=params, headers={"Origin": ORIGIN})
        body = r.json()
    except (httpx.HTTPError, ValueError) as exc:
        return f"query: {type(exc).__name__}"
    acao = r.headers.get("access-control-allow-origin", "")
    if acao not in ("*", ORIGIN):
        return f"no CORS for {ORIGIN} (got {acao!r})"
    if body.get("type") != "FeatureCollection" or "error" in body:
        return f"query did not return GeoJSON: {str(body.get('error', body))[:80]}"
    spec.setdefault("verified", {})["features_in_probe"] = len(body.get("features") or [])
    return None


# Layers already shipped from the output file being rewritten (a re-run).
_REVERIFYING: set[str] = set()


def _prefixed(spec: dict) -> dict:
    """City-scoped specs ("nyc-…") get their state prefix ("ny-nyc-…")."""
    st = str(spec.get("state", "")).lower()
    name = str(spec.get("name", ""))
    if st and not name.startswith(f"{st}-"):
        spec = {**spec, "name": f"{st}-{name}"}
    return spec


async def main(src: Path, dst: Path) -> None:
    specs = [_prefixed(s) for s in json.loads(src.read_text())]
    if dst.is_file():
        _REVERIFYING.update(s["name"] for s in json.loads(dst.read_text()))
    sem = asyncio.Semaphore(6)
    async with httpx.AsyncClient(
        timeout=60, headers={"User-Agent": UA}, follow_redirects=True
    ) as c:

        async def one(spec: dict) -> tuple[dict, str | None]:
            async with sem:
                return spec, await check(c, spec)

        results = await asyncio.gather(*(one(s) for s in specs))
    good = [s for s, why in results if why is None]
    seen: set[str] = set()
    good = [s for s in good if not (s["name"] in seen or seen.add(s["name"]))]
    for s, why in results:
        if why:
            print(f"REJECT {s.get('name', '?')}: {why}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(good, indent=1, ensure_ascii=False) + "\n")
    print(f"accepted {len(good)}/{len(specs)} -> {dst}")


if __name__ == "__main__":
    asyncio.run(main(Path(sys.argv[1]), Path(sys.argv[2])))
