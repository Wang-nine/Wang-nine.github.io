from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Final

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "scripts" / "migration"
if str(MIGRATION) not in sys.path:
    sys.path.insert(0, str(MIGRATION))

FIXTURES = Path(__file__).parent / "fixtures"
LEGACY_POSTS_DIR_ENV: Final = "LEGACY_POSTS_DIR"
# Immutable local backup used only when LEGACY_POSTS_DIR is unset. Never write to it.
DEFAULT_REAL_SOURCE: Final = Path(r"C:/Users/admin/AppData/Local/Temp/opencode/legacy-blog-20261026/posts")


class LegacySourceUnavailable(RuntimeError):
    def __init__(self, source: Path, *, configured: bool) -> None:
        if configured:
            message = (
                f"{LEGACY_POSTS_DIR_ENV} is set to {str(source)!r} but that directory "
                "does not exist; refusing to fall back to the local backup"
            )
        else:
            message = f"legacy backup is not present at {source}"
        super().__init__(message)
        self.source = source
        self.configured = configured


def resolve_real_source(configured: str | None, default: Path) -> Path:
    """Return the posts directory, preferring an explicit LEGACY_POSTS_DIR value."""
    if configured:
        source = Path(configured)
        if not source.is_dir():
            raise LegacySourceUnavailable(source, configured=True)
        return source
    if not default.is_dir():
        raise LegacySourceUnavailable(default, configured=False)
    return default


@pytest.fixture(scope="session")
def fixtures_dir() -> Path:
    return FIXTURES


@pytest.fixture(scope="session")
def real_source() -> Path:
    try:
        return resolve_real_source(os.environ.get(LEGACY_POSTS_DIR_ENV), DEFAULT_REAL_SOURCE)
    except LegacySourceUnavailable as exc:
        if exc.configured:
            pytest.fail(str(exc))
        pytest.skip(str(exc))


def make_page(article: str, title: str = "Fixture") -> str:
    return f"""<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><title>{title}</title>
<meta property="article:published_time" content="2023-12-01T12:00:00.000Z">
<meta property="article:modified_time" content="2023-12-02T12:00:00.000Z">
<meta property="article:tag" content="FixtureTag">
</head><body>
<h1 class="post-title">{title}</h1>
<span class="post-meta-categories"><a class="post-meta-categories" href="/categories/JavaSE/">JavaSE</a></span>
<article class="post-content" id="article-container">{article}</article>
</body></html>"""
