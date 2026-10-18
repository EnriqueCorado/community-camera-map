import datetime as dt

from app.layers import development as d


def test_parse_coordinates_dms_and_decimal():
    lon, lat = d.parse_coordinates("37°30'27.84\"N 120°43'28.15\"W")
    assert round(lat, 4) == 37.5077 and round(lon, 4) == -120.7245
    assert d.parse_coordinates("37.64, -120.99") == (-120.99, 37.64)
    assert d.parse_coordinates("") is None


def test_housing_proposals_newest_report_wins_and_small_ones_are_grouped():
    rows = [
        {
            "JURIS_NAME": "OAKDALE",
            "YEAR": 2024,
            "JURS_TRACKING_ID": "A1",
            "PROJECT_NAME": "None",
            "TOT_PROPOSED_UNITS": 94,
            "APPLICATION_STATUS": "Pending",
            "LATITUDE": 37.77,
            "LONGITUDE": -120.84,
        },
        # renamed in the next report: still the same project (same tracking id)
        {
            "JURIS_NAME": "OAKDALE",
            "YEAR": 2025,
            "JURS_TRACKING_ID": "A1",
            "PROJECT_NAME": "Lariat",
            "TOT_PROPOSED_UNITS": 94,
            "APPLICATION_STATUS": "Approved",
            "LATITUDE": 37.77,
            "LONGITUDE": -120.84,
            "UNIT_CAT": "SFD",
            "APP_SUBMIT_DT": "2025-12-09T00:00:00",
            "STREET_ADDRESS": "1001 E G St",
        },
        {
            "JURIS_NAME": "MODESTO",
            "YEAR": 2025,
            "PROJECT_NAME": "Garage to ADU",
            "STREET_ADDRESS": "1 Main",
            "UNIT_CAT": "ADU",
            "TOT_PROPOSED_UNITS": 1,
            "LATITUDE": 37.6011,
            "LONGITUDE": -121.0011,
        },
        {
            "JURIS_NAME": "MODESTO",
            "YEAR": 2025,
            "PROJECT_NAME": "ADU",
            "STREET_ADDRESS": "3 Main",
            "UNIT_CAT": "ADU",
            "TOT_PROPOSED_UNITS": 1,
            "LATITUDE": 37.6012,
            "LONGITUDE": -121.0012,
        },
        {
            "JURIS_NAME": "MODESTO",
            "YEAR": 2025,
            "PROJECT_NAME": "Bad geocode",
            "TOT_PROPOSED_UNITS": 9,
            "LATITUDE": 40.7,
            "LONGITUDE": -74.0,
        },
        "junk",
    ]
    feats = d.housing_proposals(rows)["features"]
    assert len(feats) == 2
    lariat = next(f["properties"] for f in feats if f["properties"].get("name") == "Lariat")
    assert (
        lariat["stage"] == "approved"
        and lariat["kind"] == "single-family"
        and lariat["submitted"] == "2025-12-09"
    )
    group = next(f for f in feats if f["properties"].get("grouped"))
    assert group["properties"]["projects"] == 2 and group["properties"]["units"] == 2
    assert "address" not in group["properties"] and "name" not in group["properties"]
    assert "Main" not in str(group) and "Garage" not in str(
        group
    )  # nothing that points at a household


def test_new_homes_one_per_home_furthest_stage_and_grouping():
    base = {"JURIS_NAME": "RIVERBANK", "LATITUDE": 37.7301, "LONGITUDE": -120.9201}
    rows = [
        # the same home in two yearly reports: permitted, then completed
        {
            **base,
            "YEAR": 2024,
            "APN": "062-001",
            "NO_BUILDING_PERMITS": 1,
            "BP_ISSUE_DT1": "2024-03-01",
        },
        {
            **base,
            "YEAR": 2025,
            "APN": "062-001",
            "NO_OTHER_FORMS_OF_READINESS": 1,
            "CO_ISSUE_DT1": "2025-05-12",
        },
        {**base, "YEAR": 2025, "STREET_ADDRESS": "7 Oak", "NO_ENTITLEMENTS": 3},
        {**base, "YEAR": 2025, "STREET_ADDRESS": "9 Oak"},  # nothing happened yet: skipped
        {
            **base,
            "YEAR": 2025,
            "PROJECT_NAME": "Solana",
            "STREET_ADDRESS": "Big Rd",
            "NO_BUILDING_PERMITS": 120,
            "BP_ISSUE_DT1": "2025-12-04",
            "UNIT_CAT": "5+",
        },
    ]
    feats = d.new_homes(rows)["features"]
    big = next(f["properties"] for f in feats if not f["properties"].get("grouped"))
    assert (big["name"], big["stage"], big["units"], big["date"]) == (
        "Solana",
        "permitted",
        120,
        "2025-12-04",
    )
    (cell,) = (f["properties"] for f in feats if f["properties"].get("grouped"))
    assert (cell["completed"], cell["permitted"], cell["approved"]) == (1, 0, 3)
    assert cell["stage"] == "completed" and cell["units"] == 4 and cell["date"] == "2025-05-12"
    assert "Oak" not in str(cell)


CSV = (
    "SCH Number,Lead Agency Name,Document Title,Document Type,Received,Document Description,"
    "Document Portal URL,Project Title,Contact Full Name,Contact Email Address,Contact Phone Number,"
    "Location Coordinates,NOC Development Type,NOC Local Action,Location Total Acres\n"
    "2025010001,City of Oakdale,Draft EIR,EIR,03/01/2026,Homes,https://ceqanet.lci.ca.gov/2025010001/2,"
    "Crane Crossing,Jane Doe,jane@example.com,555-0100,\"37°46'N 120°50'W\",Residential (Units 500),"
    'Tentative Map,"1,200"\n'
    "2025010001,City of Oakdale,NOP,NOP,01/15/2025,Homes,,Crane Crossing,Jane Doe,,,\"37°46'N 120°50'W\",,,\n"
    "2025010002,Caltrans,Repave,NOE,04/01/2026,Road,https://evil.example/x,Repave 99,,,,,,,\n"
    '2019010003,County,Old,NOD,04/01/2019,Old,,Old project,,,,"37.6, -121.0",,,\n'
)


def test_ceqa_projects_latest_doc_no_contacts():
    feats = d.ceqa_projects(CSV, dt.date(2024, 1, 1))["features"]
    assert len(feats) == 1  # no-coordinates and too-old projects are left out
    p = feats[0]["properties"]
    assert (
        p["name"] == "Crane Crossing" and p["stage"] == "review" and p["received"] == "2026-03-01"
    )
    assert p["acres"] == 1200 and p["page"] == "https://ceqanet.lci.ca.gov/2025010001/2"
    assert not any("Jane" in str(v) or "@" in str(v) or "555" in str(v) for v in p.values())


def test_ceqa_rejects_offsite_links():
    csv = CSV.replace("https://ceqanet.lci.ca.gov/2025010001/2", "https://evil.example/doc")
    p = d.ceqa_projects(csv, dt.date(2024, 1, 1))["features"][0]["properties"]
    assert p["page"] == "https://ceqanet.lci.ca.gov/2025010001"
