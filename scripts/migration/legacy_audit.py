"""Independent loss audit of rendered Markdown against parsed source DOM."""

from __future__ import annotations

from difflib import SequenceMatcher

from bs4 import BeautifulSoup, Tag
from legacy_blocks import table_plain_text
from legacy_html import (
    SourceDocument,
    content_links,
    extract_expected_fences,
    table_rows,
)
from legacy_model import (
    AssetIssue,
    AuditRecord,
    CodeBlock,
    Counts,
    LegacyRecoveryError,
    normalize_newlines,
    normalize_prose,
    normalize_ws,
)
from markdown_it import MarkdownIt


def _markdown() -> MarkdownIt:
    return MarkdownIt("commonmark").enable("table").enable("strikethrough")


REMOVED_OBJECTS = ("img", "audio", "video", "iframe", "object", "embed", "script", "style", "noscript", "svg")


def audit_post(
    document: SourceDocument,
    markdown: str,
    found_images: int,
    issues: list[AssetIssue],
    warnings: list[str],
    localized_assets: int,
) -> tuple[AuditRecord, Counts]:
    """Compare prose, code, tables, links, and images; return loss details."""
    # Audit the loaded DOM directly: reserializing it normalizes attribute order,
    # which would desync an inert media example from the exact bytes rendered.
    source = document.article
    source_fences = extract_expected_fences(source)
    source_blocks = [block for block in source_fences if not block.teaching_literal]
    source_tables = [table for table in source.find_all("table") if not _inside_code(table)]
    source_prose = _source_prose(source)
    source_links = content_links(source)
    source_cells = sum(len(row) for table in source_tables for row in table_rows(table))

    body_markdown = _body_markdown(markdown)
    rendered_html = _markdown().render(body_markdown)
    rendered = BeautifulSoup(rendered_html, "html.parser")
    prose_soup = BeautifulSoup(rendered_html, "html.parser")
    rendered_prose = _rendered_prose(prose_soup)
    rendered_fences = _rendered_fences(body_markdown)
    rendered_tables = rendered.find_all("table")
    rendered_links = rendered.find_all("a", href=True)
    rendered_images = rendered.find_all("img")

    missing = _missing_prose(source_prose, rendered_prose)
    code_mismatches = _code_mismatches(source_fences, rendered_fences)
    table_mismatches = _table_mismatches(source_tables, rendered_tables)
    link_mismatch = len(source_links) != len(rendered_links)
    image_mismatch = found_images != len(rendered_images)
    status = "pass" if not (missing or code_mismatches or table_mismatches or link_mismatch or image_mismatch) else "loss"
    record = AuditRecord(
        id=document.meta.post_id,
        status=status,
        proseLoss=len(missing),
        codeBlocks=len(source_blocks),
        codeMismatches=code_mismatches,
        tables=len(source_tables),
        tableMismatches=table_mismatches,
        sourceLinks=len(source_links),
        renderedLinks=len(rendered_links),
        sourceImages=found_images,
        renderedImages=len(rendered_images),
        missingSample=missing[:200],
        blocked=[f"{issue.url} ({issue.reason})" for issue in issues],
    )
    counts = Counts(
        sourceBytes=len(document.raw),
        markdownBytes=len(markdown.encode("utf-8")),
        sourceProseChars=len(source_prose),
        renderedProseChars=len(rendered_prose),
        codeBlocks=len(source_blocks),
        codeLines=sum(block.line_count for block in source_blocks),
        tables=len(source_tables),
        tableCells=source_cells,
        links=len(source_links),
        images=found_images,
        localizedAssets=localized_assets,
        unresolvedAssets=len(issues),
        warnings=len(warnings),
    )
    return record, counts


def _body_markdown(markdown: str) -> str:
    """Strip YAML frontmatter so metadata cannot mask a body loss."""
    if not markdown.startswith("---\n"):
        return markdown
    end = markdown.find("\n---\n", 4)
    return markdown[end + 5 :] if end >= 0 else markdown


def _inside_code(table: Tag) -> bool:
    return table.find_parent(class_="highlight") is not None


def _source_prose(article: Tag) -> str:
    clone = BeautifulSoup(str(article), "html.parser").select_one("#article-container")
    if not isinstance(clone, Tag):
        raise LegacyRecoveryError("audit", "cloned prose source missing")
    for node in clone.select("figure.highlight, div.highlight"):
        node.decompose()
    for node in clone.find_all("table"):
        node.decompose()
    for name in REMOVED_OBJECTS:
        for node in clone.find_all(name):
            node.decompose()
    return normalize_prose(clone.get_text(" "))


def _rendered_prose(rendered: BeautifulSoup) -> str:
    for name in ("pre", "table", *REMOVED_OBJECTS):
        for node in rendered.find_all(name):
            node.decompose()
    return normalize_prose(rendered.get_text(" "))


def _missing_prose(source: str, rendered: str) -> str:
    if source == rendered:
        return ""
    matcher = SequenceMatcher(None, source, rendered, autojunk=False)
    return "".join(source[start:end] for tag, start, end, _, _ in matcher.get_opcodes() if tag in {"delete", "replace"})


def _rendered_fences(markdown: str) -> list[str]:
    tokens = _markdown().parse(markdown)
    fences: list[str] = []
    _walk_fences(tokens, fences)
    return [normalize_newlines(fence).rstrip("\n") for fence in fences]


def _walk_fences(tokens: list[object], out: list[str]) -> None:
    for token in tokens:
        kind = getattr(token, "type", "")
        content = getattr(token, "content", "")
        if kind == "fence" and isinstance(content, str):
            out.append(content)
        children = getattr(token, "children", None)
        if isinstance(children, list):
            _walk_fences(children, out)


def _code_mismatches(source: list[CodeBlock], rendered: list[str]) -> int:
    mismatches = abs(len(source) - len(rendered))
    for block_a, block_b in zip(source, rendered):
        if normalize_newlines(block_a.text).rstrip("\n") != normalize_newlines(block_b).rstrip("\n"):
            mismatches += 1
    return mismatches


def _table_mismatches(source: list[Tag], rendered: list[Tag]) -> int:
    mismatches = abs(len(source) - len(rendered))
    for table_a, table_b in zip(source, rendered):
        rows_a = _padded_rows(table_plain_text(table_a))
        rows_b = _padded_rows(table_plain_text(table_b))
        if rows_a != rows_b:
            mismatches += 1
    return mismatches


def _padded_rows(rows: list[list[str]]) -> list[list[str]]:
    """Pad short logical rows; Markdown always renders the table width."""
    width = max((len(row) for row in rows), default=0)
    return [[normalize_ws(cell) for cell in row] + [""] * (width - len(row)) for row in rows]
