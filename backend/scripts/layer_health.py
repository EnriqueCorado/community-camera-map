"""Weekly health report for the state layers: which ones stopped working or
went stale, the way a site owner checks for broken links. Report only: it
never changes, hides or removes a layer.

    cd backend && uv run python scripts/layer_health.py --out ../health [--limit 50]
        [--previous last-week/layer-health.json]

For every spec in app/layers/data/state_layers/*.json it reads the layer's
description (`<url>?f=json`) and runs the map's own sample query (the spec's
verified bbox, where, fields and page size, f=geojson), then sorts it:

- broken: HTTP or ArcGIS error, not GeoJSON, no CORS for the site, or a field
  in view.fields is gone from the layer;
- empty: the query works but finds nothing where the verifier found features
  (not for live feeds like closures or fires, which go quiet);
- stale: the layer says its data was last edited over ~3 years ago, for layers
  whose data should change (not boundaries, zoning, districts, parks...);
- ok.

Writes OUT/layer-health.json (every layer: name, state, url, status, detail)
and OUT/layer-health.md (the issue body: what needs attention, by status and
state). With --previous (last run's JSON), a broken or empty layer needs
attention only when it also failed last time, so one bad night at a county
server doesn't open an issue; stale layers need attention right away.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import json
import re
from pathlib import Path

import httpx

DATA = Path(__file__).resolve().parent.parent / "app" / "layers" / "data"
ORIGIN = "https://enriquecorado.github.io"
UA = "community-camera-map/layer-health (+https://github.com/EnriqueCorado/community-camera-map)"
STALE_AFTER = dt.timedelta(days=3 * 365)
STATUSES = ("broken", "empty", "stale", "ok")
MAX_BODY = 60_000  # GitHub issue bodies stop at 65,536 characters

# Data that doesn't go out of date: lines on a map that stay put for years.
STATIC_CATEGORIES = {"boundary", "landuse", "park", "perimeter"}
_STATIC = re.compile(
    r"zon(e|es|ing)\b|boundar|district|ward|precinct|flood|evacuation|histor|monument|marker",
    re.I,
)
# Data that should change: live feeds, services people go to, projects, closures.
TIMELY_GROUPS = {"live", "help", "growth", "housing", "weather"}
_TIMELY = re.compile(
    r"\b(live|active|today|current|closures?|advisor(y|ies)|outages?|incidents?|conditions"
    r"|construction|projects?|this year|last \d+ days|samples?)\b",
    re.I,
)


def stale_able(spec: dict) -> bool:
    """Should this layer's data have been edited in the last ~3 years?"""
    words = f"{spec.get('name', '')} {spec.get('title', '')}"
    if spec.get("category") in STATIC_CATEGORIES or _STATIC.search(words):
        return False
    return (
        spec.get("group") in TIMELY_GROUPS
        or spec.get("category") == "roadops"
        or bool(_TIMELY.search(spec.get("title", "")))
    )


def comes_and_goes(spec: dict) -> bool:
    """Live feeds (closures, fires, outages...) are often empty on a quiet day."""
    return (
        spec.get("group") == "live"
        or spec.get("category") == "roadops"
        or bool(_TIMELY.search(spec.get("title", "")))
    )


def last_edit(meta: dict) -> dt.datetime | None:
    """When the layer's data was last edited, if it says (epoch ms)."""
    info = meta.get("editingInfo")
    if not isinstance(info, dict):
        return None
    ms = info.get("dataLastEditDate") or info.get("lastEditDate")
    # 4e12 ms is the year 2096: anything past it (or NaN) is a server's junk.
    if not isinstance(ms, int | float) or not 0 < ms < 4e12:
        return None
    return dt.datetime.fromtimestamp(ms / 1000, dt.UTC)


def parse(status_code: int, text: str) -> dict | str:
    """A response's JSON object, or why there isn't one."""
    if status_code >= 400:
        return f"HTTP {status_code}"
    try:
        body = json.loads(text)
    except ValueError:
        return "not JSON"
    if not isinstance(body, dict):
        return "not a JSON object"
    if "error" in body:
        err = body["error"]
        msg = (err.get("message") or err.get("code")) if isinstance(err, dict) else err
        return f"ArcGIS error: {msg}"
    return body


def classify(
    spec: dict, meta: dict | str, sample: dict | str, *, now: dt.datetime, acao: str = "*"
) -> tuple[str, str]:
    """(status, detail) from the layer description and the sample query, each a
    parsed JSON object or the reason it couldn't be read; `acao` is the query's
    Access-Control-Allow-Origin header."""
    v = spec["view"]
    if isinstance(meta, str):
        return "broken", f"layer description: {meta}"
    fields = meta.get("fields")
    have = (
        {f.get("name") for f in fields if isinstance(f, dict)}
        if isinstance(fields, list)
        else set()
    )
    if missing := [f for f in v["fields"] if f not in have]:
        return "broken", f"fields gone from the layer: {', '.join(missing)}"
    if isinstance(sample, str):
        return "broken", f"sample query: {sample}"
    if sample.get("type") != "FeatureCollection":
        return "broken", "sample query did not return GeoJSON"
    if acao not in ("*", ORIGIN):
        return "broken", f"no CORS for {ORIGIN}"
    features = sample.get("features") or []
    probed = (spec.get("verified") or {}).get("features_in_probe") or 0
    if not features and probed > 0 and not comes_and_goes(spec):
        return "empty", f"no features in the sample area (the verifier saw {probed})"
    edited = last_edit(meta)
    if edited and stale_able(spec) and now - edited > STALE_AFTER:
        return "stale", f"data last edited {edited:%Y-%m-%d}"
    return "ok", ""


def needs_attention(row: dict, previous: dict[str, str] | None) -> bool:
    """Stale: yes. Broken or empty: only if last run (when there is one) also
    found it broken or empty, so a one-off outage waits a week."""
    if row["status"] == "ok":
        return False
    if row["status"] == "stale" or previous is None:
        return True
    return previous.get(row["name"]) in ("broken", "empty")


def _clean(text: str, limit: int = 140) -> str:
    """Server-supplied text, safe inside a Markdown code span."""
    text = re.sub(r"\s+", " ", text.replace("`", "'")).strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def summary(
    rows: list[dict], *, checked: str, compared: bool = True, max_chars: int = MAX_BODY
) -> str:
    """The Markdown report: counts, then every layer needing attention, by
    status and state, then the first-time failures (names only). `compared`:
    was there an earlier report to confirm failures against?"""
    counts = {s: sum(r["status"] == s for r in rows) for s in STATUSES}
    todo = [r for r in rows if r["attention"]]
    waiting = [r for r in rows if r["status"] in ("broken", "empty") and not r["attention"]]
    why = (
        "stale, or broken/empty two runs in a row"
        if compared
        else "no earlier report to compare with, so every failure is listed"
    )
    lines = [
        f"Checked {len(rows):,} state layers on {checked}: "
        + ", ".join(f"{counts[s]:,} {s}" for s in STATUSES)
        + ".",
        "",
        f"**{len(todo):,} need attention** ({why}).",
        "This report changes nothing: every layer stays on the map until its spec is edited.",
    ]
    for status in STATUSES[:3]:
        group = [r for r in todo if r["status"] == status]
        if not group:
            continue
        lines += ["", f"## {status.capitalize()} ({len(group)})"]
        for st in sorted({r["state"] for r in group}):
            here = sorted((r for r in group if r["state"] == st), key=lambda r: r["name"])
            lines += ["", f"### {st} ({len(here)})"]
            lines += [
                f"- `{r['name']}` {r['title']}: `{_clean(r['detail'])}` ([layer]({r['url']}))"
                for r in here
            ]
    if waiting:
        names = ", ".join(f"`{r['name']}`" for r in sorted(waiting, key=lambda r: r["name"]))
        lines += [
            "",
            f"<details><summary>{len(waiting)} failed for the first time"
            " (listed above if they fail again next run)</summary>",
            "",
            names,
            "</details>",
        ]
    out, used = [], 0
    for line in lines:
        if used + len(line) + 1 > max_chars - 100:
            out.append("\n…(cut for length: the full list is in the layer-health.json artifact)")
            if any(o.startswith("<details>") for o in out):
                out.append("</details>")
            break
        out.append(line)
        used += len(line) + 1
    return "\n".join(out) + "\n"


def load_specs() -> list[dict]:
    return [
        spec
        for path in sorted((DATA / "state_layers").glob("*.json"))
        for spec in json.loads(path.read_text())
    ]


def _probe_bbox(spec: dict, states: dict) -> list[float]:
    box = (spec.get("verified") or {}).get("bbox")
    if isinstance(box, list) and len(box) == 4:
        return box
    w, s, e, n = states[spec["state"]]["bbox"]
    cx, cy = (w + e) / 2, (s + n) / 2
    return [cx - 0.1, cy - 0.1, cx + 0.1, cy + 0.1]


def sample_query(spec: dict, bbox: list[float]) -> dict[str, str]:
    """The query the map sends for this layer at its first zoom
    (frontend/src/view-logic.ts arcgisQueryUrl). Same page size too: big Esri
    services time out or fail on small pages."""
    v = spec["view"]
    params = {
        "where": v.get("where", "1=1"),
        "geometry": ",".join(map(str, bbox)),
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": ",".join(v["fields"]),
        "returnGeometry": "true",
        "outSR": "4326",
        "geometryPrecision": "5",
        "resultRecordCount": str(v.get("max_features", 2000)),
        "f": "geojson",
    }
    if v["geometry"] in ("polygon", "line"):  # simplified to the zoom, as the map does
        params["maxAllowableOffset"] = f"{180 / (512 * 2 ** v.get('min_zoom', 4)):.3g}"
    return params


async def _get(client: httpx.AsyncClient, url: str, params: dict) -> tuple[dict | str, str]:
    """(parsed body or why not, Access-Control-Allow-Origin); one retry on a
    network error, 429, 5xx or an ArcGIS error (often a busy server's 500
    inside an HTTP 200)."""
    why, acao = "", ""
    for attempt in range(2):
        if attempt:
            await asyncio.sleep(5)
        try:
            r = await client.get(url, params=params, headers={"Origin": ORIGIN})
        except httpx.HTTPError as exc:
            why = f"no answer ({type(exc).__name__})"
            continue
        if r.status_code == 429 or r.status_code >= 500:
            why = f"HTTP {r.status_code}"
            continue
        why, acao = parse(r.status_code, r.text), r.headers.get("access-control-allow-origin", "")
        if not (isinstance(why, str) and why.startswith("ArcGIS error")):
            break
    return why, acao


async def probe(client: httpx.AsyncClient, spec: dict, states: dict, now: dt.datetime) -> dict:
    v = spec["view"]
    meta, _ = await _get(client, v["url"], {"f": "json"})
    query = sample_query(spec, _probe_bbox(spec, states))
    sample, acao = await _get(client, f"{v['url']}/query", query)
    status, detail = classify(spec, meta, sample, now=now, acao=acao)
    return {**_row(spec), "status": status, "detail": detail}


def _row(spec: dict) -> dict:
    return {
        "name": spec["name"],
        "state": spec["state"],
        "title": spec["title"],
        "url": spec["view"]["url"],
    }


async def main(out: Path, limit: int | None, previous_path: Path | None) -> None:
    specs = load_specs()[:limit]
    states = json.loads((DATA / "state_bboxes.json").read_text())
    previous = None
    if previous_path and previous_path.is_file():
        last = json.loads(previous_path.read_text())
        previous = {r["name"]: r["status"] for r in last.get("layers", [])}
    now = dt.datetime.now(dt.UTC)
    sem = asyncio.Semaphore(8)
    async with httpx.AsyncClient(
        timeout=45, headers={"User-Agent": UA}, follow_redirects=True
    ) as client:

        async def one(spec: dict) -> dict:
            async with sem:
                try:
                    return await probe(client, spec, states, now)
                except Exception as exc:  # one odd server must not sink the report
                    why = f"unreadable response ({type(exc).__name__})"
                    return {**_row(spec), "status": "broken", "detail": why}

        rows = await asyncio.gather(*(one(s) for s in specs))
    for row in rows:
        row["attention"] = needs_attention(row, previous)
    counts = {s: sum(r["status"] == s for r in rows) for s in STATUSES}
    attention = sum(r["attention"] for r in rows)
    out.mkdir(parents=True, exist_ok=True)
    report = {
        "checked_at": now.isoformat(timespec="seconds"),
        "counts": counts,
        "attention": attention,
        "compared_with_previous": previous is not None,
        "layers": rows,
    }
    (out / "layer-health.json").write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")
    md = summary(rows, checked=f"{now:%Y-%m-%d}", compared=previous is not None)
    (out / "layer-health.md").write_text(md)
    print(", ".join(f"{n} {s}" for s, n in counts.items()), f"-> {attention} need attention")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", type=Path, required=True, help="directory for the JSON + Markdown")
    ap.add_argument("--limit", type=int, help="check only the first N specs (quick runs)")
    ap.add_argument("--previous", type=Path, help="last run's layer-health.json")
    args = ap.parse_args()
    asyncio.run(main(args.out, args.limit, args.previous))
