"""Nationwide layer packs. Each module here defines `LAYERS: dict[str, Layer]`
(self-describing: title_es, group, metric where needed) and is picked up
automatically, so adding a pack never touches the main registry."""

from __future__ import annotations

import importlib
import pkgutil
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..service import Layer


def register(into: dict[str, Layer]) -> None:
    """Merge every pack's layers into the registry (alphabetical by module;
    a pack may not silently replace an existing layer)."""
    for mod in sorted(m.name for m in pkgutil.iter_modules(__path__)):
        pack = importlib.import_module(f"{__name__}.{mod}")
        for name, layer in getattr(pack, "LAYERS", {}).items():
            if name in into:
                raise ValueError(f"layer {name!r} from pack {mod!r} already exists")
            into[name] = layer
