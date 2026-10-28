"""Frontmatter, description, and manifest field construction."""

from __future__ import annotations

import json
import re

from bs4 import Tag

from legacy_model import (
    CATEGORIES,
    Counts,
    ManifestEntry,
    SourceMeta,
)

DESCRIPTION_LIMIT = 120


def first_description(article: Tag) -> str:
    """Use the first natural prose paragraph, never the meta description."""
    for paragraph in article.find_all("p"):
        if paragraph.find_parent("table") is not None:
            continue
        text = re.sub(r"\s+", " ", paragraph.get_text(" ", strip=True)).strip()
        if not text or text in {"[toc]", "TOC"}:
            continue
        if len(text) > DESCRIPTION_LIMIT:
            return text[:DESCRIPTION_LIMIT].rstrip() + "…"
        return text
    return ""


def yaml_string(value: str) -> str:
    """Quote a YAML scalar without allowing multiline injection."""
    return json.dumps(value, ensure_ascii=False)


def frontmatter(
    meta: SourceMeta,
    category: str,
    description: str,
    source_sha: str,
    warnings: list[str],
) -> str:
    """Build Astro frontmatter with requested slug/canonical and preserved tags."""
    if category not in CATEGORIES:
        warnings.append(f"category outside taxonomy: {category}")
    lines = [
        "---",
        f"title: {yaml_string(meta.title)}",
        f"published: {meta.published}",
        f"updated: {meta.updated}",
        f"description: {yaml_string(description)}",
        f"category: {yaml_string(category)}",
        "tags: [" + ", ".join(yaml_string(tag) for tag in meta.source_tags) + "]",
        f"slug: {yaml_string(meta.post_id)}",
        f"canonical: {yaml_string(f'/posts/{meta.post_id}/')}",
        f"legacyUrl: {yaml_string(f'/posts/{meta.post_id}.html')}",
        f"sourceSha256: {yaml_string(source_sha)}",
        "originalCategories: [" + ", ".join(yaml_string(item) for item in meta.source_categories) + "]",
        "originalTags: [" + ", ".join(yaml_string(item) for item in meta.source_tags) + "]",
        "---",
        "",
    ]
    return "\n".join(lines)


def build_manifest_entry(
    meta: SourceMeta,
    source_name: str,
    source_sha: str,
    markdown_path: str,
    category: str,
    description: str,
    counts: Counts,
    unresolved: list[dict[str, str]],
    warnings: list[str],
) -> ManifestEntry:
    """Assemble one stable manifest record; raw HTML is never included."""
    return ManifestEntry(
        id=meta.post_id,
        sourcePath=f"posts/{source_name}",
        sourceSha256=source_sha,
        title=meta.title,
        published=meta.published,
        updated=meta.updated,
        slug=meta.post_id,
        legacyUrl=f"/posts/{meta.post_id}.html",
        canonicalPath=f"/posts/{meta.post_id}/",
        category=category,
        tags=list(meta.source_tags),
        originalCategories=list(meta.source_categories),
        originalTags=list(meta.source_tags),
        description=description,
        markdownPath=markdown_path,
        counts=counts,
        unresolvedAssets=unresolved,
        warnings=warnings,
    )
