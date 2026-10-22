"""The state-spec verifier's offline checks."""

from __future__ import annotations

from app.layers.service import LAYERS  # noqa: F401  (first: registers the packs)

# isort: split
from scripts.verify_state_specs import editable


def test_anonymously_editable_layers_are_rejected():
    assert editable({"capabilities": "Create,Delete,Query,Update,Editing,Extract,Sync"})
    assert editable({"capabilities": "Query, Update"})
    assert not editable({"capabilities": "Query"})
    assert not editable({"capabilities": "Map,Query,Data"})
    assert not editable({})
