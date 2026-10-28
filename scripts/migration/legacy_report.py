"""Human-readable recovery report generated from audit evidence."""

from __future__ import annotations

from collections import Counter
from pathlib import Path

from legacy_model import CATEGORIES, AuditRecord, ManifestEntry


def build_report(entries: list[ManifestEntry], records: list[AuditRecord], source_dir: Path) -> str:
    """Render a concise report that names every loss or blocked asset class."""
    category_counts = Counter(entry["category"] for entry in entries)
    passes = sum(1 for record in records if record["status"] == "pass")
    losses = [record for record in records if record["status"] != "pass"]
    total_images = sum(entry["counts"]["images"] for entry in entries)
    localized = sum(entry["counts"]["localizedAssets"] for entry in entries)
    unresolved = sum(entry["counts"]["unresolvedAssets"] for entry in entries)
    warnings = _warning_counts(entries)
    empty = [entry["id"] for entry in entries if entry["counts"]["sourceProseChars"] == 0]
    fallbacks = [entry["id"] for entry in entries if any("title fallback" in item for item in entry["warnings"])]
    raw_tables = sum(
        1 for entry in entries for item in entry["warnings"] if "unconvertible table" in item
    )
    issue_urls = {issue["url"] for entry in entries for issue in entry["unresolvedAssets"]}
    issue_reasons = Counter(
        issue["reason"].split(":")[0] for entry in entries for issue in entry["unresolvedAssets"]
    )
    lines = [
        "# Legacy Blog Recovery Report",
        "",
        "## Outcome",
        "",
        f"- Source: `{source_dir.as_posix()}` (72 immutable HTML files expected, {len(entries)} recovered).",
        f"- Markdown: `src/content/posts/legacy/*.md` ({len(entries)} files).",
        f"- Manifest: `migration/legacy-posts.json` ({len(entries)} entries).",
        f"- Audit: **{passes}/{len(records)} pass**, {len(losses)} with unexplained loss.",
        f"- Code: {sum(record['codeBlocks'] for record in records)} blocks / "
        f"{sum(entry['counts']['codeLines'] for entry in entries)} lines compared exactly.",
        f"- Tables: {sum(record['tables'] for record in records)} tables / "
        f"{sum(entry['counts']['tableCells'] for entry in entries)} cells compared.",
        f"- Links: {sum(record['sourceLinks'] for record in records)} source links, "
        f"{sum(record['renderedLinks'] for record in records)} rendered links.",
        f"- Body images: {total_images} references ({len(issue_urls)} unique URLs); "
        f"localized {localized}; unresolved {unresolved} references.",
        f"- Empty source bodies kept as posts: {', '.join(empty) if empty else 'none'}.",
        "",
        "## Categories",
        "",
        "| Category | Posts |",
        "|---|---|",
    ]
    lines.extend(f"| {name} | {category_counts.get(name, 0)} |" for name in CATEGORIES)
    lines.extend(
        [
            "",
            "## Assets",
            "",
            f"- No theme gallery/cover assets were copied. Only body `<img>` references were considered.",
            f"- **Blocked:** {len(issue_urls)} unique body image URLs could not be localized. "
            "The old origin `wang-nine.cn` failed DNS resolution during the bounded fetch pass, "
            "and the backup contains no `images/` payloads. Original URLs remain in the Markdown.",
            f"- Unresolved classes: {dict(issue_reasons) or 'none'}.",
            "- Exact unresolved URLs and reasons are in each manifest entry's `unresolvedAssets`.",
            "- No claim is made that these images render; they are explicitly unresolved.",
            "",
            "## Audit method",
            "",
            "- Article bodies were extracted with BeautifulSoup from `#article-container`; no regex body extraction.",
            "- Prose: source DOM text (code/tables/embeds excluded) is compared character-for-character "
            "after whitespace/punctuation folding against Markdown rendered by markdown-it.",
            "- Code: each source code block text (gutter cells excluded) is compared exactly to the parsed fence content "
            "after newline normalization.",
            "- Tables: every source table cell count and normalized cell text is compared to the rendered table.",
            "- Links/images: counts are compared after article-link rewriting and image resolution.",
            "- A post only passes when all five checks pass; a count alone is not accepted as proof.",
            "",
            "## Warnings",
            "",
        ]
    )
    if warnings:
        lines.extend(f"- {text}: {count}" for text, count in warnings.most_common())
    else:
        lines.append("- none")
    lines.extend(
        [
            f"- Title fallback used: {', '.join(fallbacks) if fallbacks else 'none'}.",
            f"- Unconvertible tables preserved as sanitized raw HTML: {raw_tables}.",
            "- Post `5` genuinely has the source title `无题`; it is preserved, not invented.",
            "",
            "## Per-post audit",
            "",
            "| id | title | category | code | tables | links | images | prose loss | status | notes |",
            "|---|---|---|---:|---:|---:|---:|---:|---|---|",
        ]
    )
    for entry, record in zip(entries, records):
        notes = []
        if record["blocked"]:
            notes.append(f"{len(record['blocked'])} unresolved image(s)")
        if any("unconvertible table" in item for item in entry["warnings"]):
            notes.append("raw table fallback")
        if any("title fallback" in item for item in entry["warnings"]):
            notes.append("title fallback")
        title = entry["title"].replace("|", "\\|")
        lines.append(
            f"| {entry['id']} | {title[:40]} | {entry['category']} | {record['codeBlocks']} | "
            f"{record['tables']} | {record['sourceLinks']}/{record['renderedLinks']} | "
            f"{record['sourceImages']}/{record['renderedImages']} | {record['proseLoss']} | "
            f"{record['status']} | {', '.join(notes) or '—'} |"
        )
    lines.extend(
        [
            "",
            "## Reproduce",
            "",
            "```bash",
            "uv run scripts/migration/convert_legacy.py \\",
            f"  --source {source_dir.as_posix()} \\",
            "  --site . --fetch-assets",
            "uv run --with pytest --with beautifulsoup4==4.13.4 --with markdown-it-py==4.0.0 \\",
            "  --with markdownify==1.1.0 --with typer==0.16.0 pytest tests/migration -q",
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def _warning_counts(entries: list[ManifestEntry]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for entry in entries:
        for warning in entry["warnings"]:
            counts[warning.split(":")[0]] += 1
    return counts
