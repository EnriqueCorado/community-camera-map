"""The state-spec verifier's offline checks."""

from __future__ import annotations

from app.layers.service import LAYERS  # noqa: F401  (first: registers the packs)

# isort: split
from scripts.verify_state_specs import editable, feature_service_urls


def test_anonymously_editable_layers_are_rejected():
    assert editable({"capabilities": "Create,Delete,Query,Update,Editing,Extract,Sync"})
    assert editable({"capabilities": "Query, Update"})
    assert not editable({"capabilities": "Query"})
    assert not editable({"capabilities": "Map,Query,Data"})
    assert not editable({})


def test_map_servers_are_checked_through_their_feature_service():
    assert feature_service_urls("https://x.gov/arcgis/rest/services/A/B/MapServer/3") == [
        "https://x.gov/arcgis/rest/services/A/B/FeatureServer",
        "https://x.gov/arcgis/rest/services/A/B/FeatureServer/3",
    ]
    assert feature_service_urls("https://x.gov/arcgis/rest/services/C/FeatureServer/0")[0].endswith(
        "/C/FeatureServer"
    )
