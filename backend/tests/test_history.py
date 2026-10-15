"""History snapshots: pruning keeps the window and never lists missing days."""

from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from snapshot_history import HISTORY_LAYERS, KEEP_DAYS, prune  # noqa: E402


def test_prune_drops_old_and_bad_days(tmp_path):
    today = dt.date(2026, 10, 15)
    old = (today - dt.timedelta(days=KEEP_DAYS + 1)).isoformat()
    edge = (today - dt.timedelta(days=KEEP_DAYS)).isoformat()
    for d in (old, edge, "2026-10-15"):
        (tmp_path / d).mkdir()
    out = prune({"days": {old: ["quakes"], edge: ["quakes"], "2026-10-15": ["quakes"], "junk": []}}, today, tmp_path)
    assert list(out["days"]) == [edge, "2026-10-15"]
    assert not (tmp_path / old).exists() and (tmp_path / edge).exists()


def test_flights_are_never_archived():
    assert "flights" not in HISTORY_LAYERS
