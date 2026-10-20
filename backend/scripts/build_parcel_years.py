"""Bake "when was this building built?" lookups for the renter tool.

California's rent cap (Civil Code §1947.12) doesn't cover housing whose
certificate of occupancy is less than 15 years old. The county assessor
publishes a year built for each parcel; this script reduces that roll to

    street name -> house number -> [[dir, suffix, city, min_year, max_year, use], ...]

sharded by the street name's first two letters, so the browser looks an
address up in a small static file and never sends it anywhere. Only the
situs address, year range and a coarse use class are kept: no owner, mailing
address, parcel number or exemption data (those are read by nothing here —
the query doesn't even request them).

    cd backend && uv run python scripts/build_parcel_years.py

Source: Stanislaus County Assessor parcels (GIS data supplied by Stanislaus
County; see the county's disclaimer, linked from the site).
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import httpx

SERVICE = (
    "https://gis.stancounty.com/datastore/rest/services/Hosted/"
    "Public_Assessor_Parcels/FeatureServer/0/query"
)
FIELDS = "situs_number,situs_street,situs_suffix,situs_dir,situs_city,yearbuilt,lu_code,neighborhoodcode"
PAGE = 1000
OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "parcels"

YEAR = re.compile(r"\b(18\d\d|19\d\d|20\d\d)\b")
# "Newman CA 95360", "MODESTO CA 95350-13", "PATTERSON 95363" -> the city name.
CITY = re.compile(r"\s+(CA\b.*|\d{5}.*)$")

# Assessor use codes -> the classes the rent tool asks about.
USE = {
    "101": "sfr", "111": "sfr", "121": "sfr", "161": "sfr",
    "131": "condo",
    "141": "mobile",
    "201": "duplex",
    "221": "multi", "231": "multi", "241": "multi", "261": "multi", "960": "multi",
}


def use_class(lu_code: object, neighborhood: object) -> str:
    code = str(lu_code or "").strip()
    if code in USE:
        return USE[code]
    # Most apartment parcels have no use code; their appraisal neighborhood
    # starts with "M" (multi-family).
    return "multi" if str(neighborhood or "").strip().upper().startswith("M") else ""


def years(raw: object) -> tuple[int, int] | None:
    """'1971, 1979' -> (1971, 1979). Ignores junk like '977' or '2508'."""
    this_year = dt.date.today().year
    found = [int(y) for y in YEAR.findall(str(raw or "")) if int(y) <= this_year + 1]
    return (min(found), max(found)) if found else None


def norm(s: object) -> str:
    return re.sub(r"\s+", " ", str(s or "").strip().upper())


def shard_key(street: str) -> str:
    """First two letters/digits of the street name (the browser computes the same)."""
    return (re.sub(r"[^A-Z0-9]", "", street) + "__")[:2]


def reduce(attrs: dict) -> tuple[str, str, list] | None:
    number = norm(attrs.get("situs_number"))
    street = norm(attrs.get("situs_street"))
    span = years(attrs.get("yearbuilt"))
    if not number or not street or not span or not re.fullmatch(r"\d+[A-Z]?", number):
        return None
    city = CITY.sub("", norm(attrs.get("situs_city")))
    row = [
        norm(attrs.get("situs_dir")),
        norm(attrs.get("situs_suffix")),
        city,
        span[0],
        span[1],
        use_class(attrs.get("lu_code"), attrs.get("neighborhoodcode")),
    ]
    return street, number, row


async def fetch_page(client: httpx.AsyncClient, params: dict[str, str]) -> dict:
    for attempt in range(4):
        try:
            r = await client.get(SERVICE, params=params)
            r.raise_for_status()
            body = r.json()
            if "error" in body:
                raise RuntimeError(body["error"])
            return body
        except Exception:  # noqa: BLE001 - retry, then give up loudly
            if attempt == 3:
                raise
            await asyncio.sleep(2 * (attempt + 1))
    raise AssertionError("unreachable")


async def fetch_all(client: httpx.AsyncClient) -> list[dict]:
    out: list[dict] = []
    offset = 0
    while True:
        params = {
            "where": "1=1",
            "outFields": FIELDS,
            "returnGeometry": "false",
            "orderByFields": "objectid_12_13",
            "resultOffset": str(offset),
            "resultRecordCount": str(PAGE),
            "f": "json",
        }
        body = await fetch_page(client, params)
        feats = body.get("features", [])
        out.extend(f.get("attributes", {}) for f in feats)
        if offset % (PAGE * 25) == 0:
            print(f"  {len(out):,} parcels", flush=True)
        if len(feats) < PAGE and not body.get("exceededTransferLimit"):
            break
        offset += PAGE
    return out


def build(records: list[dict]) -> dict[str, dict[str, dict[str, list]]]:
    shards: dict[str, dict[str, dict[str, list]]] = defaultdict(lambda: defaultdict(dict))
    for attrs in records:
        got = reduce(attrs)
        if not got:
            continue
        street, number, row = got
        rows = shards[shard_key(street)][street].setdefault(number, [])
        if row not in rows:  # condos repeat the same address per unit
            rows.append(row)
    return shards


async def main() -> int:
    async with httpx.AsyncClient(
        timeout=60.0, headers={"User-Agent": "stanislaus-cam-map/parcel-years"}
    ) as client:
        records = await fetch_all(client)
    if len(records) < 100_000:  # the county has ~169k parcels; refuse a partial roll
        print(f"only {len(records):,} parcels came back; keeping the existing files")
        return 1
    shards = build(records)
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    total = 0
    for key, streets in sorted(shards.items()):
        (OUT / f"{key}.json").write_text(json.dumps(streets, separators=(",", ":"), sort_keys=True))
        total += sum(len(n) for n in streets.values())
    meta = {
        "as_of": dt.date.today().isoformat(),
        "addresses": total,
        "source": "Stanislaus County Assessor parcels (gis.stancounty.com)",
        "credit": "GIS data supplied by Stanislaus County",
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1))
    print(f"wrote {total:,} addresses in {len(shards)} shards to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
