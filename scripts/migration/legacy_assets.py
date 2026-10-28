"""Resolve and, when reachable, localize body images only."""

from __future__ import annotations

import hashlib
import mimetypes
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

from bs4 import Tag

from legacy_model import (
    LEGACY_ORIGIN,
    AssetIssue,
    AssetResolution,
    display_url,
)

THEME_PREFIXES = ("/img/", "/gallery/", "/css/", "/js/", "/images/avatar", "/images/banner", "/images/background")
MAX_BYTES = 8 * 1024 * 1024
TIMEOUT_SECONDS = 8


class AssetResolver:
    """Per-run cache of image resolutions and bounded downloads."""

    def __init__(self, backup_root: Path, assets_root: Path, fetch: bool) -> None:
        self.backup_root = backup_root
        self.assets_root = assets_root
        self.fetch = fetch
        self.cache: dict[str, AssetResolution] = {}

    def prefetch(self, urls: list[str]) -> None:
        pending = list(dict.fromkeys(url for url in urls if url not in self.cache))
        if not pending:
            return
        with ThreadPoolExecutor(max_workers=8) as pool:
            for resolution in pool.map(self._resolve, pending):
                self.cache[resolution.source_url] = resolution

    def resolve(self, url: str) -> AssetResolution:
        cached = self.cache.get(url)
        if cached is not None:
            return cached
        resolution = self._resolve(url)
        self.cache[url] = resolution
        return resolution

    def _resolve(self, url: str) -> AssetResolution:
        if _is_theme_asset(url):
            return AssetResolution(source_url=url, display_url=url, reason="theme asset excluded")
        local = self._from_backup(url)
        if local is not None:
            return local
        if not url.startswith(LEGACY_ORIGIN):
            return AssetResolution(source_url=url, display_url=url, reason="external host preserved, not fetched")
        if not self.fetch:
            return AssetResolution(source_url=url, display_url=url, reason="fetch disabled; original URL kept")
        return self._download(url)

    def _from_backup(self, url: str) -> AssetResolution | None:
        path = unquote(urlparse(url).path).lstrip("/")
        if not path or ".." in Path(path).parts:
            return None
        candidate = self.backup_root / path
        if not candidate.is_file() or candidate.stat().st_size == 0:
            return None
        try:
            local = self._store(candidate.read_bytes(), path)
        except OSError as exc:
            return AssetResolution(source_url=url, display_url=url, reason=f"backup copy failed: {exc}")
        return AssetResolution(source_url=url, display_url=local, local_path=local)

    def _download(self, url: str) -> AssetResolution:
        request = Request(url, headers={"User-Agent": "legacy-recovery/1.0"})
        try:
            with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                content_type = (response.headers.get("content-type") or "").split(";")[0].strip()
                payload = response.read(MAX_BYTES + 1)
        except HTTPError as exc:
            return AssetResolution(source_url=url, display_url=url, reason=f"HTTP {exc.code}")
        except (URLError, HTTPException, TimeoutError, OSError, ValueError) as exc:
            return AssetResolution(source_url=url, display_url=url, reason=f"unavailable: {exc}")
        if len(payload) > MAX_BYTES:
            return AssetResolution(source_url=url, display_url=url, reason=f"larger than {MAX_BYTES} bytes")
        if not _looks_like_image(payload, content_type):
            return AssetResolution(source_url=url, display_url=url, reason=f"non-image content-type: {content_type or 'unknown'}")
        try:
            local = self._store(payload, urlparse(url).path)
        except OSError as exc:
            return AssetResolution(source_url=url, display_url=url, reason=f"asset write failed: {exc}")
        return AssetResolution(source_url=url, display_url=local, local_path=local)

    def _store(self, payload: bytes, url_path: str) -> str:
        name = Path(unquote(url_path)).name or "asset"
        name = re.sub(r"[^A-Za-z0-9._-]+", "_", name)
        digest = hashlib.sha256(payload).hexdigest()[:10]
        folder = self.assets_root / "images"
        folder.mkdir(parents=True, exist_ok=True)
        suffix = Path(name).suffix or mimetypes.guess_extension("image/png") or ".bin"
        stem = Path(name).stem or "asset"
        destination = folder / f"{stem}-{digest}{suffix}"
        if not destination.exists():
            destination.write_bytes(payload)
        return f"/legacy-assets/images/{destination.name}"

    def image_url(self, image: Tag, base_url: str) -> str | None:
        for attr in ("data-original", "data-src", "data-lazy-src", "src"):
            value = (image.get(attr) or "").strip()
            if value and "loading.gif" not in value:
                return display_url(base_url, value)
        return None


def _is_theme_asset(url: str) -> bool:
    path = unquote(urlparse(url).path)
    return any(path.startswith(prefix) for prefix in THEME_PREFIXES)


def _looks_like_image(payload: bytes, content_type: str) -> bool:
    if content_type.startswith("image/"):
        return True
    signatures = (b"\x89PNG", b"\xff\xd8\xff", b"GIF8", b"RIFF", b"<svg", b"BM")
    return any(payload.startswith(signature) for signature in signatures)


def collect_body_images(article: Tag, base_url: str, resolver: AssetResolver) -> list[tuple[Tag, AssetResolution]]:
    """Resolve every meaningful <img> inside the article body."""
    found: list[tuple[Tag, AssetResolution]] = []
    for image in article.find_all("img"):
        url = resolver.image_url(image, base_url)
        if url is None:
            continue
        found.append((image, resolver.resolve(url)))
    return found


def apply_image_resolutions(found: list[tuple[Tag, AssetResolution]]) -> None:
    """Point the DOM at the localized file or the explicitly kept original URL."""
    for image, resolution in found:
        image["src"] = resolution.display_url
        for attr in ("data-original", "data-src", "data-lazy-src"):
            if image.has_attr(attr):
                del image[attr]


def issues_for(found: list[tuple[Tag, AssetResolution]]) -> list[AssetIssue]:
    """Return only genuinely unresolved localizable image references."""
    issues: list[AssetIssue] = []
    for _, resolution in found:
        if resolution.local_path is None and resolution.reason.startswith(
            ("HTTP", "unavailable", "non-image", "larger", "asset write", "backup copy", "fetch disabled")
        ):
            issues.append(AssetIssue(url=resolution.source_url, reason=resolution.reason))
    return issues
