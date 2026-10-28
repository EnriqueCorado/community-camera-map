"""Consulates pack: the hand-kept list (data/consulates.json) and its layer."""

from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

from app.layers.service import LAYERS  # first: loads every pack

# isort: split
from app.layers.national import consulates as cs
from scripts.bake import SOURCES

ROOT = Path(__file__).resolve().parents[2]
DOC = json.loads(cs.CONSULATES.read_text())
PACK_TS = (ROOT / "frontend/src/services-pack.ts").read_text()
EMAIL = re.compile(r"[\w.+'-]+@[\w-]+\.[\w.-]+")
# Government domains only: .gob.xx / .gov.xx / .gouv.xx / .go.kr / .gov.
GOV_HOST = re.compile(r"^([a-z0-9-]+\.)*([a-z0-9-]+\.)?(gob|gov|gouv|go)\.[a-z]{2}$|\.gov$")
# Government domains outside that pattern, checked by hand: Cuba's foreign
# ministry (MINREX).
GOV_EXCEPTIONS = {"cubaminrex.cu"}
ALLOWED = {"n", "cc", "t", "pl", "a", "c", "s", "p", "web", "ap", "dl", "hl", "x"}


def _row(**kw):
    return {
        "country": "MX",
        "kind": "consulate-general",
        "place": "Sacramento",
        "address": "2093 Arena Blvd",
        "city": "Sacramento",
        "state": "CA",
        "phone": "916-329-3500",
        "source": "https://consulmex.sre.gob.mx/sacramento/",
        "lat": 38.64,
        "lon": -121.52,
        **kw,
    }


def test_rows_need_an_official_source_known_kind_and_coordinates(monkeypatch):
    monkeypatch.setitem(cs.OFFICIAL_HOSTS, "MX", ("consulmex.sre.gob.mx", "citas.sre.gob.mx"))
    doc = {
        "countries": {
            "MX": {
                "en": "Mexico",
                "appointments": "https://citas.sre.gob.mx/",
                "help_line": {"phone": "1-520-623-7874"},
            }
        },
        "offices": [
            _row(web="https://consulmex.sre.gob.mx/sacramento/"),
            _row(place="Aggregator", source="https://www.embassypages.com/mexico"),
            _row(place="Bad kind", kind="honorary"),
            _row(place="No point", lat=None, lon=None),
            _row(place="Unknown country", country="ZZ"),
            _row(place="Off-host link", web="https://consulmex.example.com/x", located="zip"),
        ],
    }
    a, b = cs.consulates(doc)["features"]
    assert a["properties"] == {
        "n": "Consulate General of Mexico in Sacramento",
        "cc": "MX",
        "t": "consulate-general",
        "pl": "Sacramento",
        "a": "2093 Arena Blvd",
        "c": "Sacramento",
        "s": "CA",
        "p": "(916) 329-3500",
        "web": "https://consulmex.sre.gob.mx/sacramento/",
        "ap": "https://citas.sre.gob.mx/",
        "hl": "(520) 623-7874",
    }  # the source page stays in the data file: it is never linked
    assert "web" not in b["properties"] and b["properties"]["x"] == 1  # ZIP-area point
    # a State Department page is an acceptable source too
    assert cs.consulates(
        {**doc, "offices": [_row(source="https://travel.state.gov/content/x.html")]}
    )["features"]
    # http, credentials and look-alike hosts never pass
    for bad in (
        "http://consulmex.sre.gob.mx/x",
        "https://user:pw@consulmex.sre.gob.mx/x",
        "https://consulmex.sre.gob.mx.evil.example/x",
    ):
        assert cs.official(bad, "MX") == ""
    embassy = cs.consulates(
        {**doc, "offices": [_row(kind="consular-section", place="Washington")]}
    )["features"][0]
    assert embassy["properties"]["n"] == "Embassy of Mexico: consular section"


def test_committed_list_is_sourced_complete_and_private():
    countries, offices = DOC["countries"], DOC["offices"]
    assert set(countries) == set(cs.ROSTER_SLUGS)
    for cc, info in countries.items():
        assert info["en"] and info["es"], cc
        assert info["roster"].endswith(f"/{cs.ROSTER_SLUGS[cc]}.html"), cc
    for o in offices:
        where = f"{o['country']} {o['place']}"
        assert o["kind"] in cs.KINDS, where
        assert cs.sourced(o["source"], o["country"]), where
        assert not o.get("web") or cs.official(o["web"], o["country"]), where
        assert isinstance(o["lat"], float) and isinstance(o["lon"], float), where
        assert re.fullmatch(r"[A-Z]{2}", o["state"]) and o["address"] and o["city"], where
        assert not o.get("phone") or re.fullmatch(r"\(\d{3}\) \d{3}-\d{4}", o["phone"]), where
    by = {}
    for o in offices:
        by[o["country"]] = by.get(o["country"], 0) + 1
    assert by.get("MX", 0) >= 45  # Mexico runs ~50 consulates in the U.S.
    # every country has offices here, except the known gaps (each explained in
    # its status note and the layer description): Afghanistan has none in the
    # U.S., Venezuela's aren't confirmed open, Nicaragua's addresses couldn't
    # be read from an official page
    assert set(countries) - set(by) == {"AF", "NI", "VE"}
    for cc in countries:
        assert by.get(cc) or countries[cc].get("status_en"), f"{cc}: no offices and no status"
    text = cs.CONSULATES.read_text()
    assert not EMAIL.search(text), "an email address"
    assert not re.search(r"\bhonorary\b", json.dumps(offices), re.I)
    assert len(cs.consulates(DOC)["features"]) == len(offices)  # nothing silently dropped


def test_committed_list_was_checked_within_a_year():
    """The yearly re-check reminder (like the Help tools' facts): rebuild the
    file from each government's pages with scripts/build_consulates.py. CI
    doesn't run pytest, so this fires on local test runs only."""
    dates = {o["retrieved"] for o in DOC["offices"]} | {
        c["retrieved"] for c in DOC["countries"].values()
    }
    for d in dates:
        day = dt.date.fromisoformat(d)
        assert day <= dt.date.today() and (dt.date.today() - day).days < 366, d


def test_official_hosts_are_government_domains_and_match_the_frontend():
    for cc, hosts in cs.OFFICIAL_HOSTS.items():
        assert cc in cs.ROSTER_SLUGS, cc
        domains = cs.GOV_DOMAINS[cc]
        for d in domains:
            assert GOV_HOST.search(d) or d in GOV_EXCEPTIONS, f"{cc}: {d}"
        for h in hosts:
            assert any(h == d or h.endswith("." + d) for d in domains), f"{cc}: {h}"
    for cc, hosts in cs.SOURCE_ONLY_HOSTS.items():
        assert not set(hosts) & set(cs.OFFICIAL_HOSTS.get(cc, ())), cc
        assert all(h not in PACK_TS for h in hosts), f"{cc}: a source-only host is linkable"
    block = re.search(r"export const CONSULATE_HOSTS[^=]*= \{(.*?)\n\};", PACK_TS, re.S)
    assert block, "CONSULATE_HOSTS not found in services-pack.ts"
    ts = {
        cc: tuple(re.findall(r'"([^"]+)"', hosts))
        for cc, hosts in re.findall(r"\b([A-Z]{2}): \[([^\]]*)\]", block[1])
    }
    assert ts == cs.OFFICIAL_HOSTS
    block = re.search(r"export const CONSULATE_ROSTER[^=]*= \{(.*?)\n\};", PACK_TS, re.S)
    assert block, "CONSULATE_ROSTER not found in services-pack.ts"
    assert dict(re.findall(r'\b([A-Z]{2}): "([^"]+)"', block[1])) == cs.ROSTER_SLUGS
    # every appointment / directory link the data holds is on an allowlisted host
    # (office links are checked row by row above)
    for cc, info in DOC["countries"].items():
        for k in ("appointments", "directory"):
            if info.get(k):
                assert cs.official(info[k], cc) or cs._host(info[k]) in cs.STATE_DEPT_HOSTS, cc


def test_layer_is_registered_bilingual_hand_kept_and_attributed():
    layer = cs.LAYERS["consulates"]
    assert LAYERS["consulates"] is layer
    assert layer.title_es and layer.title_es != layer.title
    assert layer.description_es and layer.description_es != layer.description
    assert layer.group == "help" and layer.category == "service" and layer.coverage == "usa"
    assert SOURCES["consulates"] == cs.SOURCES["consulates"]
    assert cs.WEEKLY == ()  # changes only by commit: no weekly CI cache entry


def test_committed_baked_file_matches_the_list_and_holds_only_allowed_fields():
    path = ROOT / "frontend/public/data/layers/consulates.geojson"
    fc = json.loads(path.read_text())
    assert fc == json.loads(
        json.dumps(cs.consulates(DOC))
    ), "re-bake: refresh_live --only consulates"
    keys = {k for f in fc["features"] for k in f["properties"]}
    assert keys <= ALLOWED, keys - ALLOWED
    assert not EMAIL.search(path.read_text())
