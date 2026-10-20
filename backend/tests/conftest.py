"""Shared test setup: tests never see a developer's real keys."""

from __future__ import annotations

import os

import pytest

from app.core.config import Settings


@pytest.fixture(autouse=True)
def _no_real_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ignore backend/.env and any CAM_* environment variables, so tests behave
    the same on every machine and a failing assertion can't print a real key."""
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    for name in [n for n in os.environ if n.startswith("CAM_")]:
        monkeypatch.delenv(name)
