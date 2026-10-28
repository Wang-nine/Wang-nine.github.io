"""Typed values shared by the legacy blog recovery converter."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Final, TypedDict

CATEGORIES: Final = (
    "Java",
    "后端开发",
    "前端开发",
    "数据库",
    "工具与工程",
    "随笔",
)

CATEGORY_MAP: Final[dict[str, str]] = {
    "JavaSE": "Java",
    "JUC": "Java",
    "SSM": "后端开发",
    "SpringCloud": "后端开发",
    "SpringBoot": "后端开发",
    "Mybatis": "后端开发",
    "后端": "后端开发",
    "项目重构": "后端开发",
    "HTML+CSS": "前端开发",
    "JavaScript": "前端开发",
    "MySQL": "数据库",
    "Redis": "数据库",
    "博客搭建": "工具与工程",
    "VIM": "工具与工程",
    "分析": "随笔",
}

LEGACY_ORIGIN: Final = "https://wang-nine.cn"


class LegacyRecoveryError(Exception):
    """A source post could not be parsed without inventing content."""

    def __init__(self, post_id: str, detail: str) -> None:
        self.post_id = post_id
        self.detail = detail
        super().__init__(f"{post_id}: {detail}")


@dataclass(frozen=True, slots=True)
class SourceMeta:
    """Metadata read from the old post header and meta tags."""

    post_id: str
    title: str
    published: str
    updated: str
    source_categories: tuple[str, ...]
    source_tags: tuple[str, ...]
    title_fallback: bool = False


@dataclass(frozen=True, slots=True)
class CodeBlock:
    """A fence the converter must emit, after removing any highlighter gutter.

    ``teaching_literal`` marks an inert media example kept as code.  It is
    audited like a fence but is not counted as an original source code block.
    """

    language: str
    text: str
    teaching_literal: bool = False

    @property
    def line_count(self) -> int:
        return 0 if not self.text else self.text.count("\n") + 1


@dataclass(frozen=True, slots=True)
class TableData:
    """A table either converted to rows or preserved as safe HTML."""

    rows: tuple[tuple[str, ...], ...]
    raw_html: str | None = None


@dataclass(frozen=True, slots=True)
class AssetIssue:
    """An image whose bytes could not be localized."""

    url: str
    reason: str


@dataclass(frozen=True, slots=True)
class AssetResolution:
    """Resolved form of one body image."""

    source_url: str
    display_url: str
    local_path: str | None = None
    reason: str = ""


@dataclass(slots=True)
class RenderContext:
    """Mutable scratch state for one post render; mutation is the purpose."""

    post_id: str
    unresolved_assets: list[AssetIssue] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    code_blocks: list[CodeBlock] = field(default_factory=list)
    tables: list[TableData] = field(default_factory=list)
    link_rewrites: int = 0


class Counts(TypedDict):
    sourceBytes: int
    markdownBytes: int
    sourceProseChars: int
    renderedProseChars: int
    codeBlocks: int
    codeLines: int
    tables: int
    tableCells: int
    links: int
    images: int
    localizedAssets: int
    unresolvedAssets: int
    warnings: int


class AuditRecord(TypedDict):
    id: str
    status: str
    proseLoss: int
    codeBlocks: int
    codeMismatches: int
    tables: int
    tableMismatches: int
    sourceLinks: int
    renderedLinks: int
    sourceImages: int
    renderedImages: int
    missingSample: str
    blocked: list[str]


class ManifestEntry(TypedDict):
    id: str
    sourcePath: str
    sourceSha256: str
    title: str
    published: str
    updated: str
    slug: str
    legacyUrl: str
    canonicalPath: str
    category: str
    tags: list[str]
    originalCategories: list[str]
    originalTags: list[str]
    description: str
    markdownPath: str
    counts: Counts
    unresolvedAssets: list[dict[str, str]]
    warnings: list[str]


def sha256_bytes(payload: bytes) -> str:
    """Return the lowercase SHA-256 hex digest of raw source bytes."""
    return hashlib.sha256(payload).hexdigest()


def normalize_newlines(text: str) -> str:
    """Normalize CRLF/CR to LF without touching line content or spacing."""
    return text.replace("\r\n", "\n").replace("\r", "\n")


def normalize_ws(text: str) -> str:
    """Collapse all whitespace for loss checks that ignore layout."""
    return re.sub(r"\s+", " ", normalize_newlines(text)).strip()


def normalize_prose(text: str) -> str:
    """Keep only alphanumeric/CJK characters for structural prose comparison."""
    folded = unicodedata.normalize("NFKC", text)
    return "".join(char.lower() for char in folded if char.isalnum())


def category_for(source_categories: tuple[str, ...]) -> str:
    """Map legacy category names onto exactly one required taxonomy value."""
    for name in source_categories:
        mapped = CATEGORY_MAP.get(name)
        if mapped is not None:
            return mapped
    return "随笔"


def display_url(base_post_url: str, raw_url: str) -> str:
    """Resolve an old relative image URL against its original post URL."""
    from urllib.parse import quote, urljoin, urlsplit, urlunsplit

    if raw_url.startswith("//"):
        resolved = f"https:{raw_url}"
    elif raw_url.startswith(("http://", "https://")):
        resolved = raw_url
    else:
        resolved = urljoin(base_post_url, raw_url)
    parts = urlsplit(resolved)
    path = quote(parts.path, safe="/%:@+~!$&'()*,;=")
    query = quote(parts.query, safe="=&%?/:@+~!$'()*,;")
    return urlunsplit((parts.scheme, parts.netloc.lower(), path, query, parts.fragment))
