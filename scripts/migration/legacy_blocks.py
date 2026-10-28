"""Block DOM to Markdown rendering: code, tables, lists, prose."""

from __future__ import annotations

import re

from bs4 import NavigableString, Tag

from legacy_html import (
    code_block_from_node,
    is_code_table,
    safe_table_html,
    table_is_convertible,
    table_rows,
)
from legacy_inline import escape_text, render_inline, safe_embed_html
from legacy_model import CodeBlock, RenderContext, TableData

HEADINGS = {f"h{level}": level for level in range(1, 7)}
INLINE_TAGS = {
    "a", "b", "big", "br", "code", "del", "em", "font", "i", "img", "ins",
    "s", "small", "span", "strike", "strong", "sub", "sup", "u", "audio", "video",
}
BLOCK_TAGS = {
    "p", "div", "section", "article", "figure", "table", "ul", "ol", "blockquote",
    "pre", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "dl", "details",
}


def render_body(article: Tag, ctx: RenderContext) -> str:
    """Render an already-cleaned article body to a Markdown fragment."""
    if article.get("data-legacy-script-literal"):
        ctx.warnings.append("literal unclosed <script> in prose escaped to text")
    blocks = _blocks(article, ctx)
    text = "\n\n".join(block for block in blocks if block.strip())
    return text.strip() + ("\n" if text.strip() else "")


def _blocks(container: Tag, ctx: RenderContext) -> list[str]:
    blocks: list[str] = []
    inline_buffer: list[str] = []

    def flush() -> None:
        if inline_buffer:
            paragraph = _paragraph("".join(inline_buffer))
            if paragraph:
                blocks.append(paragraph)
            inline_buffer.clear()

    for child in container.children:
        if isinstance(child, NavigableString):
            text = str(child)
            if text.strip():
                inline_buffer.append(escape_text(text))
            continue
        name = child.name.lower()
        if name in INLINE_TAGS:
            inline_buffer.append(render_inline(child, ctx))
            continue
        flush()
        blocks.extend(_block(child, ctx))
    flush()
    return blocks


def _block(node: Tag, ctx: RenderContext) -> list[str]:
    name = node.name.lower()
    classes = node.get("class") or []
    if name in HEADINGS:
        content = _inline_content(node, ctx)
        return [f"{'#' * HEADINGS[name]} {content}"] if content else []
    if name == "p":
        content = _inline_content(node, ctx)
        paragraph = _paragraph(content)
        return [paragraph] if paragraph else []
    if name in {"figure", "div"} and "highlight" in classes:
        return [_code_block(node, ctx)]
    if name == "pre":
        return [_code_block(node, ctx)]
    if name == "table":
        return [] if is_code_table(node) else [_table(node, ctx)]
    if name in {"ul", "ol"}:
        return [_list(node, ctx)]
    if name == "blockquote":
        inner = "\n\n".join(_blocks(node, ctx))
        return ["\n".join(f"> {line}" if line else ">" for line in inner.splitlines())] if inner else []
    if name == "hr":
        return ["---"]
    if name in {"audio", "video"}:
        markup = safe_embed_html(node, ctx)
        return [markup] if markup else []
    if name in {"iframe", "object", "embed", "script", "style"}:
        ctx.warnings.append(f"removed executable/embedded <{name}>")
        return []
    if name == "br":
        return []
    if name == "img":
        markup = render_inline(node, ctx)
        return [markup] if markup else []
    if name in {"div", "section", "article", "figure", "dl", "details"}:
        if not node.find(BLOCK_TAGS):
            content = _inline_content(node, ctx)
            paragraph = _paragraph(content)
            return [paragraph] if paragraph else []
        return _blocks(node, ctx)
    if not node.find(BLOCK_TAGS):
        content = _inline_content(node, ctx)
        paragraph = _paragraph(content)
        return [paragraph] if paragraph else []
    return _blocks(node, ctx)


def _inline_content(node: Tag, ctx: RenderContext) -> str:
    return "".join(
        escape_text(str(child)) if isinstance(child, NavigableString) else render_inline(child, ctx)
        for child in node.children
    ).strip()


def _paragraph(content: str) -> str:
    text = content.strip()
    if not text:
        return ""
    if re.match(r"^(?:[-+*]|\d+[.)])\s", text):
        return "\\" + text
    if text.startswith("#"):
        return "\\" + text
    return text


def _code_block(node: Tag, ctx: RenderContext) -> str:
    block = code_block_from_node(node) if node.name in {"figure", "div"} else None
    if block is None:
        pre = node if node.name == "pre" else node.find("pre")
        if not isinstance(pre, Tag):
            return ""
        block = CodeBlock(language=_pre_language(pre), text=pre.get_text().rstrip("\n"))
    ctx.code_blocks.append(block)
    fence = "`" * max(3, _longest_backticks(block.text) + 1)
    info = block.language.strip()
    return f"{fence}{info}\n{block.text}\n{fence}"


def _pre_language(pre: Tag) -> str:
    for name in pre.get("class") or []:
        if name.startswith("language-"):
            return name.removeprefix("language-")
    return "text"


def _longest_backticks(text: str) -> int:
    return max((len(run) for run in re.findall(r"`+", text)), default=0)


def _table(table: Tag, ctx: RenderContext) -> str:
    if not table_is_convertible(table):
        raw = safe_table_html(table)
        ctx.tables.append(TableData(rows=(), raw_html=raw))
        ctx.warnings.append("unconvertible table preserved as sanitized raw HTML")
        return raw
    source_rows = table_rows(table)
    cells: list[list[str]] = []
    for row in table.find_all("tr"):
        if row.find_parent("table") is not table:
            continue
        values = [
            _cell(render_inline(cell, ctx))
            for cell in row.find_all(["th", "td"], recursive=False)
        ]
        if values:
            cells.append(values)
    if not cells:
        return ""
    width = max(len(row) for row in cells)
    padded = [row + [""] * (width - len(row)) for row in cells]
    lines = ["| " + " | ".join(padded[0]) + " |", "| " + " | ".join("---" for _ in range(width)) + " |"]
    lines.extend("| " + " | ".join(row) + " |" for row in padded[1:])
    ctx.tables.append(TableData(rows=source_rows))
    return "\n".join(lines)


def _cell(value: str) -> str:
    return value.replace("\n", "<br>").strip() or " "


def _list(node: Tag, ctx: RenderContext) -> str:
    ordered = node.name.lower() == "ol"
    lines: list[str] = []
    for index, item in enumerate(node.find_all("li", recursive=False), start=1):
        marker = f"{index}. " if ordered else "- "
        parts = _list_item_parts(item, ctx)
        if not parts:
            continue
        first, *rest = parts
        first_lines = first.splitlines() or [""]
        lines.append(marker + first_lines[0])
        lines.extend("  " + line for line in first_lines[1:])
        for part in rest:
            lines.extend("  " + line if line else "" for line in part.splitlines())
    return "\n".join(lines)


def _list_item_parts(item: Tag, ctx: RenderContext) -> list[str]:
    parts: list[str] = []
    buffer: list[str] = []

    def flush() -> None:
        if buffer:
            parts.append("".join(buffer).strip())
            buffer.clear()

    for child in item.children:
        if isinstance(child, NavigableString):
            if str(child).strip():
                buffer.append(escape_text(str(child)))
            continue
        name = child.name.lower()
        if name in {"ul", "ol"}:
            flush()
            parts.append(_list(child, ctx))
        elif name in {"p", "div", "figure", "table", "pre", "blockquote"}:
            flush()
            parts.extend(part for part in _block(child, ctx) if part.strip())
        elif name == "br":
            buffer.append("\n")
        else:
            buffer.append(render_inline(child, ctx))
    flush()
    return parts


def table_plain_text(table: Tag) -> list[list[str]]:
    """Audit helper: table cells as normalized plain text."""
    return [list(row) for row in table_rows(table)]
