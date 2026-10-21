"""Ship the state-pack metadata the browser needs: state names + bboxes (for
"no data here" notes and the "This state" section) and the exact hosts the
state specs may query (the view-host allowlist). Run after editing
app/layers/data/state_layers/*.json; tests fail if these copies drift."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.layers.service import LAYERS  # noqa: E402, F401  (registers the packs)

# isort: split
from app.layers.national import states  # noqa: E402

FRONTEND = Path(__file__).resolve().parents[2] / "frontend" / "src"


def outputs() -> dict[Path, str]:
    return {
        FRONTEND / "state-bboxes.json": json.dumps(states.STATES, separators=(",", ":")) + "\n",
        FRONTEND / "state-hosts.json": json.dumps(sorted(states.HOSTS), indent=0) + "\n",
    }


if __name__ == "__main__":
    for path, text in outputs().items():
        path.write_text(text)
        print(f"wrote {path.name}")
    print(f"{len(states.LAYERS)} state layers, {len(states.HOSTS)} hosts")
