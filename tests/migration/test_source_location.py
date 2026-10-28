from __future__ import annotations

from pathlib import Path

import pytest
from conftest import LegacySourceUnavailable, resolve_real_source


def test_configured_source_wins_when_default_also_exists(tmp_path: Path) -> None:
    configured = tmp_path / "configured-posts"
    configured.mkdir()
    default = tmp_path / "default-posts"
    default.mkdir()

    assert resolve_real_source(str(configured), default) == configured


def test_default_source_is_used_when_environment_is_unset(tmp_path: Path) -> None:
    default = tmp_path / "default-posts"
    default.mkdir()

    assert resolve_real_source(None, default) == default


def test_configured_missing_source_raises_when_default_exists(tmp_path: Path) -> None:
    default = tmp_path / "default-posts"
    default.mkdir()

    with pytest.raises(LegacySourceUnavailable) as excinfo:
        resolve_real_source(str(tmp_path / "configured-missing"), default)

    assert excinfo.value.configured is True
    assert excinfo.value.source == tmp_path / "configured-missing"


def test_missing_default_source_raises_as_unconfigured(tmp_path: Path) -> None:
    missing = tmp_path / "default-missing"

    with pytest.raises(LegacySourceUnavailable) as excinfo:
        resolve_real_source(None, missing)

    assert excinfo.value.configured is False
    assert excinfo.value.source == missing


def test_blank_environment_value_is_treated_as_unset(tmp_path: Path) -> None:
    default = tmp_path / "default-posts"
    default.mkdir()

    assert resolve_real_source("", default) == default
