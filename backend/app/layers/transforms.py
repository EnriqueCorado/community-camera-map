"""Normalizers that turn non-GeoJSON upstreams into GeoJSON FeatureCollections.

Kept as pure functions (payload dict -> GeoJSON dict) so they're unit-testable
without network access.
"""

from __future__ import annotations


def _fc(features: list[dict]) -> dict:
    return {"type": "FeatureCollection", "features": features}


def _pt(lon: float, lat: float, props: dict) -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
        "properties": props,
    }


def _num(v: object) -> float | None:
    try:
        return float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _records(payload: object) -> list:
    """Safely pull the `data` array from a possibly-malformed upstream payload."""
    return payload.get("data", []) if isinstance(payload, dict) else []


def caltrans_cms(payload: object) -> dict:
    """Changeable message signs -> points with the current message text."""
    feats = []
    for rec in _records(payload):
        cms = rec.get("cms", {})
        loc = cms.get("location", {})
        lat, lon = _num(loc.get("latitude")), _num(loc.get("longitude"))
        if lat is None or lon is None:
            continue
        msg = cms.get("message", {})
        lines = [
            (msg.get("phase1", {}) or {}).get(k, "")
            for k in ("phase1Line1", "phase1Line2", "phase1Line3")
        ]
        text = " ".join(x for x in lines if x).strip() or (msg.get("display") or "Blank")
        feats.append(
            _pt(lon, lat, {"name": loc.get("locationName", ""), "message": text})
        )
    return _fc(feats)


def caltrans_lcs(payload: object) -> dict:
    """Lane closures -> line segments from begin->end coordinates."""
    feats = []
    for rec in _records(payload):
        lcs = rec.get("lcs", {})
        loc = lcs.get("location", {})
        begin, end = loc.get("begin", {}), loc.get("end", {})
        blon, blat = _num(begin.get("beginLongitude")), _num(begin.get("beginLatitude"))
        elon, elat = _num(end.get("endLongitude")), _num(end.get("endLatitude"))
        if blon is None or blat is None:
            continue
        coords = [[round(blon, 5), round(blat, 5)]]
        if elon is not None and elat is not None:
            coords.append([round(elon, 5), round(elat, 5)])
        geom = (
            {"type": "LineString", "coordinates": coords}
            if len(coords) == 2
            else {"type": "Point", "coordinates": coords[0]}
        )
        closure = lcs.get("closure", {})
        feats.append(
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "route": begin.get("beginRoute", ""),
                    "type": closure.get("typeOfClosure", closure.get("closureType", "")),
                },
            }
        )
    return _fc(feats)


def usgs_nwis(payload: object) -> dict:
    """USGS NWIS instantaneous-values JSON -> one point per site with latest
    streamflow (cfs) and gage height (ft)."""
    if not isinstance(payload, dict):
        return _fc([])
    sites: dict[str, dict] = {}
    for ts in (payload.get("value") or {}).get("timeSeries", []):
        info = ts.get("sourceInfo", {})
        code = (info.get("siteCode") or [{}])[0].get("value")
        geo = info.get("geoLocation", {}).get("geogLocation", {})
        lat, lon = _num(geo.get("latitude")), _num(geo.get("longitude"))
        if not code or lat is None or lon is None:
            continue
        var = (ts.get("variable", {}).get("variableCode") or [{}])[0].get("value")
        no_data = _num(ts.get("variable", {}).get("noDataValue"))
        values = (ts.get("values") or [{}])[0].get("value", [])
        latest = _num(values[-1].get("value")) if values else None
        if latest is not None and no_data is not None and latest == no_data:
            latest = None  # gauge offline / missing reading sentinel (e.g. -999999)
        site = sites.setdefault(code, {"name": info.get("siteName", ""), "lon": lon, "lat": lat})
        if var == "00060":
            site["streamflow_cfs"] = latest
        elif var == "00065":
            site["gage_height_ft"] = latest
    feats = [
        _pt(s["lon"], s["lat"], {k: v for k, v in s.items() if k not in ("lon", "lat")})
        for s in sites.values()
    ]
    return _fc(feats)


def nid_dams(payload: object) -> dict:
    """USACE National Inventory of Dams query JSON -> points."""
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = payload.get("results") or payload.get("data") or []
    else:
        rows = []
    feats = []
    for d in rows:
        lat, lon = _num(d.get("latitude")), _num(d.get("longitude"))
        if lat is None or lon is None:
            continue
        feats.append(
            _pt(
                lon,
                lat,
                {
                    "name": d.get("name", ""),
                    "hazard": d.get("hazardPotential") or d.get("publicHazardId", ""),
                    "height_ft": d.get("nidHeight"),
                },
            )
        )
    return _fc(feats)
