"""BeautifulSoup access to immutable legacy HTML pages."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from bs4 import BeautifulSoup, Comment, Tag
from legacy_inline import media_example_markup, media_source_is_placeholder
from legacy_model import (
    CodeBlock,
    LegacyRecoveryError,
    SourceMeta,
    TableData,
    normalize_newlines,
    sha256_bytes,
)

CODE_FIGURE = re.compile(r"(?:^|\s)highlight(?:\s|$)")
UNSAFE_RAW_TAGS = ("script", "style", "iframe", "object", "embed", "link", "meta")


@dataclass(frozen=True, slots=True)
class SourceDocument:
    """A parsed old post plus the bytes it came from."""

    meta: SourceMeta
    article: Tag
    sha256: str
    raw: bytes


def _read_utf8(path: Path) -> str:
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise LegacyRecoveryError(path.stem, f"not UTF-8: {exc}") from exc


def _escape_literal_script(html: str) -> tuple[str, int]:
    """Escape the unclosed literal ``<script>`` mention before parsing.

    The old page contains a prose mention of ``<script>`` without a closing tag.
    A browser/html parser would swallow every following node, so the mention is
    made inert text while real executable scripts are removed later by DOM.
    """
    marker = html.find('id="article-container"')
    if marker < 0:
        return html, 0
    end = html.find("</article>", marker)
    end = len(html) if end < 0 else end
    segment = html[marker:end]
    pieces: list[str] = []
    position = 0
    escaped_count = 0
    for match in re.finditer(r"<script>", segment):
        pieces.append(segment[position : match.start()])
        if "</script>" in segment[match.end() :]:
            pieces.append(match.group(0))
        else:
            pieces.append("&lt;script&gt;")
            escaped_count += 1
        position = match.end()
    pieces.append(segment[position:])
    return html[:marker] + "".join(pieces) + html[end:], escaped_count


def load_source(path: Path) -> SourceDocument:
    """Parse one legacy post with DOM parsing only."""
    html = _read_utf8(path)
    prepared, escaped_count = _escape_literal_script(html)
    soup = BeautifulSoup(prepared, "html.parser")
    article = soup.select_one("#article-container")
    if not isinstance(article, Tag):
        raise LegacyRecoveryError(path.stem, "missing #article-container")
    meta = _parse_meta(soup, article, path.stem)
    if escaped_count:
        article["data-legacy-script-literal"] = "1"
    _clean_article(article)
    return SourceDocument(meta=meta, article=article, sha256=sha256_bytes(path.read_bytes()), raw=path.read_bytes())


def _parse_meta(soup: BeautifulSoup, article: Tag, post_id: str) -> SourceMeta:
    title_node = soup.select_one("h1.post-title")
    title = title_node.get_text(strip=True) if isinstance(title_node, Tag) else ""
    fallback = False
    if not title:
        body_h1 = article.find("h1")
        title = body_h1.get_text(strip=True) if isinstance(body_h1, Tag) else ""
        fallback = bool(title)
    if not title:
        title = "无题"
        fallback = True

    published = _meta_content(soup, "article:published_time") or _time_value(soup, "created")
    updated = _meta_content(soup, "article:modified_time") or _time_value(soup, "updated")
    if not published:
        raise LegacyRecoveryError(post_id, "no published timestamp in HTML")

    categories = tuple(
        text
        for node in soup.select("a.post-meta-categories")
        if (text := node.get_text(strip=True))
    )
    tags = tuple(
        dict.fromkeys(
            content
            for node in soup.select('meta[property="article:tag"]')
            if (content := (node.get("content") or "").strip())
        )
    )
    return SourceMeta(
        post_id=post_id,
        title=title,
        published=published,
        updated=updated or published,
        source_categories=categories,
        source_tags=tags,
        title_fallback=fallback,
    )


def _meta_content(soup: BeautifulSoup, prop: str) -> str:
    node = soup.find("meta", attrs={"property": prop})
    return (node.get("content") or "").strip() if isinstance(node, Tag) else ""


def _time_value(soup: BeautifulSoup, kind: str) -> str:
    node = soup.select_one(f"time.post-meta-date-{kind}")
    return (node.get("datetime") or "").strip() if isinstance(node, Tag) else ""


def _clean_article(article: Tag) -> None:
    for node in article.select("a.headerlink, span#more, style, noscript"):
        node.decompose()
    for node in article.find_all(string=lambda text: isinstance(text, Comment)):
        node.extract()
    for script in article.find_all("script"):
        script.decompose()


def code_block_from_node(node: Tag) -> CodeBlock | None:
    """Extract one highlighted block, using td.code to skip gutter numbers."""
    pre = node.select_one("td.code pre") or node.select_one("pre")
    if not isinstance(pre, Tag):
        return None
    return CodeBlock(language=_language(node), text=_pre_text(pre))


def extract_expected_fences(article: Tag) -> list[CodeBlock]:
    """Every fence the converter must emit, in document order.

    Highlighted blocks preserve exact source text.  A media tag whose ``src`` is
    a teaching literal is expected to become inert HTML code instead of a live
    element, and is tagged so the audit can verify it without inflating the
    original code-block count.
    """
    fences: list[CodeBlock] = []
    for node in article.find_all(["figure", "div", "audio", "video"]):
        if node.name in {"audio", "video"}:
            src = node.get("src")
            if not isinstance(src, str):
                src = " ".join(src) if isinstance(src, list) else ""
            if media_source_is_placeholder(src):
                fences.append(
                    CodeBlock(
                        language="html",
                        text=media_example_markup(node),
                        teaching_literal=True,
                    )
                )
            continue
        if "highlight" not in (node.get("class") or []):
            continue
        block = code_block_from_node(node)
        if block is not None:
            fences.append(block)
    return fences


def extract_code_blocks(article: Tag) -> list[CodeBlock]:
    """Extract only original highlighted blocks, excluding inert media examples."""
    return [block for block in extract_expected_fences(article) if not block.teaching_literal]


def _language(figure: Tag) -> str:
    for name in figure.get("class") or []:
        if name != "highlight" and not name.startswith("language-"):
            return name.removeprefix("language-")
        if name.startswith("language-"):
            return name.removeprefix("language-")
    return "text"


def _pre_text(pre: Tag) -> str:
    lines = pre.find_all("span", class_="line")
    if lines:
        text = "\n".join(line.get_text() for line in lines)
    else:
        text = pre.get_text()
    text = normalize_newlines(text)
    return text.rstrip("\n")


def is_code_table(table: Tag) -> bool:
    """A table used as a highlighter layout is not prose tabular data."""
    return table.find_parent(class_="highlight") is not None


def table_rows(table: Tag) -> tuple[tuple[str, ...], ...]:
    """Return cell text with whitespace collapsed for audit/conversion."""
    rows: list[tuple[str, ...]] = []
    for row in table.find_all("tr"):
        if row.find_parent("table") is not table:
            continue
        cells = row.find_all(["th", "td"], recursive=False)
        if not cells:
            continue
        rows.append(tuple(_safe_cell_text(cell) for cell in cells))
    return tuple(rows)


def _safe_cell_text(cell: Tag) -> str:
    clone = BeautifulSoup(str(cell), "html.parser").find(cell.name)
    if not isinstance(clone, Tag):
        return ""
    for br in clone.find_all("br"):
        br.insert_before(" ")
        br.unwrap()
    return re.sub(r"\s+", " ", clone.get_text("", strip=False)).strip()


def table_is_convertible(table: Tag) -> bool:
    """Markdown tables cannot represent spans, nested tables, or block cells."""
    if table.find("table") is not None:
        return False
    for cell in table.find_all(["th", "td"]):
        if cell.has_attr("colspan") or cell.has_attr("rowspan"):
            return False
        if cell.find(["ul", "ol", "p", "div", "pre", "table"]):
            return False
    return bool(table.find_all("tr"))


def safe_table_html(table: Tag) -> str:
    """Preserve an unconvertible table as inert, attribute-sanitized HTML."""
    clone = BeautifulSoup(str(table), "html.parser")
    for node in clone.find_all(UNSAFE_RAW_TAGS):
        node.decompose()
    for node in clone.find_all(True):
        for attr in list(node.attrs):
            if attr.lower().startswith("on"):
                del node.attrs[attr]
        for attr in ("href", "src", "action"):
            value = node.get(attr)
            if isinstance(value, str) and value.strip().lower().startswith("javascript:"):
                del node.attrs[attr]
    root = clone.find("table")
    return str(root) if isinstance(root, Tag) else ""


def markdown_table_data(table: Tag) -> TableData:
    """Convert a normal table or fall back to safe raw HTML."""
    if not table_is_convertible(table):
        return TableData(rows=(), raw_html=safe_table_html(table))
    return TableData(rows=table_rows(table))


def content_links(article: Tag) -> list[str]:
    """All prose links excluding highlighter heading anchors."""
    links: list[str] = []
    for node in article.find_all("a", href=True):
        if "headerlink" in (node.get("class") or []):
            continue
        href = (node.get("href") or "").strip()
        if href:
            links.append(href)
    return links
