# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "beautifulsoup4==4.13.4",
#   "markdownify==1.1.0",
#   "markdown-it-py==4.0.0",
#   "typer==0.16.0",
# ]
# ///
# ─── How to run ───
# uv run scripts/migration/convert_legacy.py --source <backup>/posts --site .
# Add --no-fetch-assets to skip bounded network access (all image URLs stay remote).
"""Recover the 72 legacy HTML posts into typed Markdown plus an audit trail."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import typer

from legacy_assets import AssetResolver, apply_image_resolutions, collect_body_images, issues_for
from legacy_audit import audit_post
from legacy_blocks import render_body
from legacy_frontmatter import build_manifest_entry, first_description, frontmatter
from legacy_html import SourceDocument, load_source
from legacy_model import (
    AuditRecord,
    LegacyRecoveryError,
    ManifestEntry,
    RenderContext,
    category_for,
)
from legacy_report import build_report

DEFAULT_SOURCE: Final = Path(r"C:/Users/admin/AppData/Local/Temp/opencode/legacy-blog-20261026/posts")
EXPECTED_POSTS: Final = 72


@dataclass(frozen=True, slots=True)
class RecoveryResult:
    """Manifest, audits, and loss count from one recovery run."""

    entries: list[ManifestEntry]
    records: list[AuditRecord]
    losses: list[str]


def recover(
    source_dir: Path,
    site_dir: Path,
    fetch_assets: bool = True,
    expected: int | None = EXPECTED_POSTS,
) -> RecoveryResult:
    """Convert every source post and write Markdown, manifest, audit, and report."""
    paths = sorted(source_dir.glob("*.html"), key=lambda item: item.stem)
    if not paths:
        raise LegacyRecoveryError("all", f"no HTML files under {source_dir}")
    if expected is not None and len(paths) != expected:
        raise LegacyRecoveryError("all", f"expected {expected} posts, found {len(paths)}")

    docs = [(path, load_source(path)) for path in paths]
    resolver = AssetResolver(source_dir.parent, site_dir / "public" / "legacy-assets", fetch_assets)
    _prefetch(docs, resolver)

    entries: list[ManifestEntry] = []
    records: list[AuditRecord] = []
    losses: list[str] = []
    for path, document in docs:
        entry, record = _convert_one(path, document, site_dir, resolver)
        entries.append(entry)
        records.append(record)
        if record["status"] != "pass":
            losses.append(document.meta.post_id)

    migration = site_dir / "migration"
    migration.mkdir(parents=True, exist_ok=True)
    _write_json(migration / "legacy-posts.json", entries)
    _write_json(migration / "legacy-audit.json", records)
    (migration / "RECOVERY-REPORT.md").write_text(
        build_report(entries, records, source_dir), encoding="utf-8", newline="\n"
    )
    return RecoveryResult(entries=entries, records=records, losses=losses)


def _prefetch(docs: list[tuple[Path, SourceDocument]], resolver: AssetResolver) -> None:
    urls: list[str] = []
    for _, document in docs:
        base = f"https://wang-nine.cn/posts/{document.meta.post_id}.html"
        urls.extend(
            url
            for image in document.article.find_all("img")
            if (url := resolver.image_url(image, base)) is not None
        )
    resolver.prefetch(urls)


def _convert_one(
    source_path: Path,
    document: SourceDocument,
    site_dir: Path,
    resolver: AssetResolver,
) -> tuple[ManifestEntry, AuditRecord]:
    meta = document.meta
    base = f"https://wang-nine.cn/posts/{meta.post_id}.html"
    found = collect_body_images(document.article, base, resolver)
    apply_image_resolutions(found)
    issues = issues_for(found)

    description = first_description(document.article)
    category = category_for(meta.source_categories)
    warnings: list[str] = []
    if meta.title_fallback:
        warnings.append("title fallback used from actual h1 or 无题")
    if not meta.source_categories:
        warnings.append("no legacy category; mapped to 随笔")
    if issues:
        warnings.append(f"{len(issues)} body image(s) unresolved; original URLs kept")

    ctx = RenderContext(post_id=meta.post_id)
    body = render_body(document.article, ctx)
    warnings.extend(ctx.warnings)
    markdown = frontmatter(meta, category, description, document.sha256, warnings) + body
    relative = f"src/content/posts/legacy/{meta.post_id}.md"
    markdown_path = site_dir / relative
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.write_text(markdown, encoding="utf-8", newline="\n")

    localized = sum(1 for _, resolution in found if resolution.local_path is not None)
    unresolved_payload = [{"url": issue.url, "reason": issue.reason} for issue in issues]
    record, counts = audit_post(document, markdown, len(found), issues, warnings, localized)
    entry = build_manifest_entry(
        meta=meta,
        source_name=source_path.name,
        source_sha=document.sha256,
        markdown_path=relative,
        category=category,
        description=description,
        counts=counts,
        unresolved=unresolved_payload,
        warnings=warnings,
    )
    return entry, record


def _write_json(path: Path, payload: list[ManifestEntry] | list[AuditRecord]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    temporary.replace(path)


def main(
    source: Path = typer.Option(DEFAULT_SOURCE, "--source", help="Directory of legacy posts/*.html"),
    site: Path = typer.Option(Path("."), "--site", help="Astro blog root"),
    fetch_assets: bool = typer.Option(True, "--fetch-assets/--no-fetch-assets"),
) -> None:
    """Run the recovery and fail loudly if any post has unexplained loss."""
    result = recover(source, site, fetch_assets=fetch_assets)
    typer.echo(f"recovered {len(result.entries)} posts; audit losses: {len(result.losses)}")
    if result.losses:
        raise typer.Exit(code=2)


if __name__ == "__main__":
    typer.run(main)
