"""Build or update the hand-kept consulates list (app/layers/data/consulates.json).

    cd backend
    uv run python scripts/build_consulates.py                   # geocode new rows, re-check
    uv run python scripts/build_consulates.py --merge a.json b.json   # replace those countries

A merge file has the same shape as the data file ("countries", "offices",
"excluded"): the rows a person transcribed from each government's own
consulate pages (see app/layers/national/consulates.py for the sourcing
rules). Merging replaces every office and exclusion of the countries the file
lists. Then each row is normalized (phone, ZIP, state), links outside the
country's official government hosts (consulates.OFFICIAL_HOSTS) are dropped,
rows without an official source page are refused, and rows without
coordinates are placed with the U.S. Census batch geocoder (a ZIP-area point,
flagged "located": "zip", when the address itself doesn't match). Rows still
unplaced move to "excluded", never guessed.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

from app.layers import service as _registry  # noqa: F401 - loads every pack first
from app.layers.national import _services_parse as sp
from app.layers.national import consulates as cs
from app.layers.national.services import UA, geocode

COUNTRY_KEYS = (
    "en",
    "es",
    "directory",
    "appointments",
    "roster",
    "status_en",
    "status_es",
    "status_source",
    "help_line",
    "id_note",
    "domains",
    "retrieved",
)
OFFICE_KEYS = ("country", "kind", "place", "address", "city", "state", "zip", "phone", "web")
STATE_DEPT_PAGE = (
    "https://travel.state.gov/content/travel/en/consularnotification/"
    "ConsularNotificationandAccess/{}.html"
)


def _no_email(v: object) -> object:
    if isinstance(v, str):
        return sp.clean(sp.EMAIL.sub("", v))
    if isinstance(v, dict):
        return {k: _no_email(x) for k, x in v.items()}
    return v


def norm_country(cc: str, info: dict) -> dict:
    out = {k: _no_email(info.get(k)) for k in COUNTRY_KEYS if info.get(k) not in (None, "")}
    if "domains" not in out and info.get("hosts_evidence"):
        out["domains"] = _no_email(info["hosts_evidence"])
    for k in ("directory", "appointments"):
        if k in out and not (cs.official(out[k], cc) or cs._host(out[k]) in cs.STATE_DEPT_HOSTS):
            print(f"  {cc}: {k} {out[k]} is not on an official host: dropped")
            out.pop(k)
    return out


def norm_office(r: dict, problems: list[str]) -> dict | str:
    """The row, normalized, or the reason it is refused."""
    cc, kind = sp.clean(r.get("country")).upper(), sp.clean(r.get("kind"))
    where = f"{cc} {r.get('place')}"
    if kind not in cs.KINDS:
        return f"unknown kind {kind!r}"
    src = sp.clean(r.get("source"))
    if not cs.sourced(src, cc):
        return f"source {src!r} is not an official page"
    web = sp.clean(r.get("web"))
    if web and not cs.official(web, cc):
        problems.append(f"{where}: web {web!r} not on an official host (link dropped)")
        web = ""
    out = {
        "country": cc,
        "kind": kind,
        "place": sp.clean(r.get("place")),
        "address": _no_email(r.get("address")) or "",
        "city": sp.clean(r.get("city")),
        "state": sp.clean(r.get("state")).upper(),
        "zip": sp.zip5(sp.clean(r.get("zip"))),
        "phone": sp.phone(r.get("phone")),
        "web": web,
        "source": src,
        "retrieved": sp.clean(r.get("retrieved")),
    }
    if not re.fullmatch(r"[A-Z]{2}", out["state"]) or not all(
        out[k] for k in ("place", "address", "city")
    ):
        return "incomplete address"
    for k in ("lat", "lon", "located"):
        if r.get(k) is not None:
            out[k] = r[k]
    return {k: v for k, v in out.items() if v not in ("", None)}


async def place(rows: list[dict]) -> list[dict]:
    """Coordinates for rows without them; returns the rows left unplaced."""
    todo = [r for r in rows if "lat" not in r]
    if not todo:
        return []
    recs = [
        {"a": r["address"], "c": r["city"], "s": r["state"], "zip": r.get("zip", "")} for r in todo
    ]
    async with httpx.AsyncClient(headers=UA, timeout=120, follow_redirects=True) as client:
        feats = await geocode(client, recs, True)
    missed = []
    for r, f in zip(todo, feats, strict=True):
        if not f:
            missed.append(r)
            continue
        r["lon"], r["lat"] = f["geometry"]["coordinates"]
        r["located"] = "zip" if f["properties"].get("x") == 1 else "address"
    return missed


def note(doc: dict) -> str:
    dates = sorted({o.get("retrieved", "") for o in doc["offices"]} - {""})
    return (
        "Hand-kept list of consulates and embassy consular sections in the U.S. Each "
        "office's street address and main public line come from its own government's "
        "pages (foreign ministry, embassy or consulate site; 'source' is the page read), "
        "cross-checked against the U.S. State Department's per-country consular contact "
        "list ('roster'). Honorary consuls (private individuals) are left out, as are "
        "people's names and emails. Coordinates from the U.S. Census geocoder "
        "('located': 'zip' = the ZIP area, the address itself did not match). "
        f"Retrieved {', '.join(dates) or '?'}. Rebuild with scripts/build_consulates.py."
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--merge", nargs="*", type=Path, default=[])
    ap.add_argument("--out", type=Path, default=cs.CONSULATES)
    args = ap.parse_args()
    doc = json.loads(args.out.read_text()) if args.out.exists() else {}
    doc.setdefault("countries", {})
    doc.setdefault("offices", [])
    doc.setdefault("excluded", [])
    for path in args.merge:
        new = json.loads(path.read_text())
        for r in (*new.get("offices", []), *new.get("excluded", [])):
            r["country"] = sp.clean(r.get("country")).upper()
        new_countries = {cc.upper(): v for cc, v in new.get("countries", {}).items()}
        # every country the file speaks for: its old rows are replaced
        ccs = set(new_countries) | {r["country"] for r in new.get("offices", [])}
        doc["countries"].update(new_countries)
        doc["offices"] = [o for o in doc["offices"] if o.get("country") not in ccs]
        doc["offices"] += new.get("offices", [])
        doc["excluded"] = [e for e in doc["excluded"] if e.get("country") not in ccs]
        doc["excluded"] += [
            {"country": e["country"], "place": e.get("place"), "reason": e.get("reason")}
            for e in new.get("excluded", [])
        ]
    problems: list[str] = []
    countries = {}
    for cc, info in sorted(doc["countries"].items()):
        if cc in cs.ROSTER_SLUGS:
            info = {**info, "roster": STATE_DEPT_PAGE.format(cs.ROSTER_SLUGS[cc])}
        else:
            problems.append(f"{cc}: no State Department roster slug in consulates.ROSTER_SLUGS")
        countries[cc] = norm_country(cc, info)
    offices, refused = [], []

    def refuse(r: dict, reason: str) -> None:
        cc, where = sp.clean(r.get("country")).upper(), sp.clean(r.get("place"))
        refused.append(f"{cc} {where}: {reason}")
        doc["excluded"].append({"country": cc, "place": where, "reason": reason})

    for r in doc["offices"]:
        o = norm_office(r, problems)
        if isinstance(o, str):
            refuse(r, o)
        elif o["country"] not in countries:
            refuse(r, "country missing from 'countries'")
        else:
            offices.append(o)
    for r in asyncio.run(place(offices)):
        offices.remove(r)
        refuse(r, "address not found by the Census geocoder")
    offices.sort(key=lambda o: (o["country"], o["kind"] != "consular-section", o["place"]))
    out = {
        "note": "",
        "countries": countries,
        "offices": offices,
        "excluded": sorted(doc["excluded"], key=lambda e: (e["country"], e["place"] or "")),
    }
    out["note"] = note(out)
    args.out.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    by = {}
    for o in offices:
        by[o["country"]] = by.get(o["country"], 0) + 1
    print(f"{len(offices)} offices: {by}")
    print(f"zip-area points: {sum(o.get('located') == 'zip' for o in offices)}")
    for p in problems + refused:
        print("  ", p)
    # refused rows are kept in "excluded" (never silently lost); a nonzero exit
    # says some need a look before committing
    return 1 if refused else 0


if __name__ == "__main__":
    raise SystemExit(main())
