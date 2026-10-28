"""Inline DOM to Markdown rendering with URL rewriting and safe HTML."""

from __future__ import annotations

import re
from typing import Final
from urllib.parse import urljoin, urlsplit

from bs4 import NavigableString, Tag

from legacy_model import LEGACY_ORIGIN, RenderContext

POST_LINK: Final = re.compile(r"^(?:https?://wang-nine\.cn)?/posts/([A-Za-z0-9_-]+)\.html(#[^?]*)?(?:\?.*)?$")
MARKDOWN_SPECIAL: Final = re.compile(r"([\\`*_{}\[\]<>|])")
SAFE_EMBED_ATTRS: Final = ("src", "controls", "loop", "preload", "poster", "width", "height", "title", "type")
MEDIA_EXTENSIONS: Final = frozenset(
    {".mp3", ".ogg", ".wav", ".flac", ".aac", ".m4a", ".mp4", ".webm", ".ogv", ".mov", ".m4v"}
)
MEDIA_EMBED_SCHEMES: Final = frozenset({"http", "https", "data", "blob"})


def escape_text(text: str) -> str:
    """Escape prose so Markdown renders the original characters, not syntax."""
    collapsed = re.sub(r"\s+", " ", text)
    return MARKDOWN_SPECIAL.sub(r"\\\1", collapsed)


def escape_code_span(text: str) -> str:
    """Create an inline code span that survives embedded backticks."""
    normalized = text.replace("\n", " ")
    longest = max((len(run) for run in re.findall(r"`+", normalized)), default=0)
    fence = "`" * (longest + 1)
    padded = f" {normalized} " if normalized.startswith("`") or normalized.endswith("`") else normalized
    return f"{fence}{padded}{fence}"


def rewrite_href(href: str, ctx: RenderContext) -> str:
    """Rewrite article URLs; keep unroutable legacy URLs explicit."""
    raw = href.strip()
    if not raw or raw.startswith("#"):
        return raw
    if raw.lower().startswith("javascript:"):
        ctx.warnings.append(f"removed javascript: link {raw[:80]}")
        return ""
    post = POST_LINK.match(raw)
    if post:
        fragment = post.group(2) or ""
        ctx.link_rewrites += 1
        return f"/posts/{post.group(1)}/{fragment}"
    if raw.startswith(("/archives", "https://wang-nine.cn/archives")):
        ctx.link_rewrites += 1
        return "/archive/" if raw.rstrip("/").endswith("archives") else raw
    if raw.startswith(("/categories/", "/tags/", "https://wang-nine.cn/categories/", "https://wang-nine.cn/tags/")):
        ctx.warnings.append(f"legacy taxonomy link kept: {raw}")
        return raw
    if raw.startswith("/"):
        return urljoin(LEGACY_ORIGIN, raw)
    return raw


def url_for_markdown(url: str) -> str:
    """Angle-wrap URLs that contain characters Markdown destinations misread."""
    if any(char in url for char in " ()<>{}"):
        return f"<{url}>"
    return url


def media_source_is_placeholder(src: str) -> bool:
    """True when a media src is an unresolvable teaching literal, not a target.

    Legacy lessons use values such as ``音频的url`` to show the tag shape.  A
    browser would request that literal as a local path, so it must not remain a
    live media element.  Real URLs (including HTTPS, relative paths, and media
    filenames with a known extension) stay embeddable.
    """
    value = src.strip()
    if not value:
        return True
    if value.startswith("//") or "\\" in value:
        return False
    parsed = urlsplit(value)
    scheme = parsed.scheme.lower()
    if scheme:
        return scheme not in MEDIA_EMBED_SCHEMES
    path = parsed.path
    if value.startswith(("/", "./", "../")) or "/" in path:
        return False
    name = path.rsplit("/", 1)[-1]
    suffix = f".{name.rsplit('.', 1)[1].lower()}" if "." in name else ""
    return suffix not in MEDIA_EXTENSIONS


def media_example_markup(node: Tag) -> str:
    """Rebuild a source media tag for display without normalizing its text."""
    name = node.name.lower()
    attributes: list[str] = []
    for key, value in node.attrs.items():
        raw = " ".join(value) if isinstance(value, list) else str(value)
        attributes.append(key if raw == "" else f'{key}="{raw}"')
    suffix = f" {' '.join(attributes)}" if attributes else ""
    return f"<{name}{suffix}></{name}>"


def safe_embed_html(node: Tag, ctx: RenderContext) -> str:
    """Keep real audio/video embeds or turn placeholder examples into code."""
    name = node.name.lower()
    if name not in {"audio", "video"}:
        return ""
    src = node.get("src")
    if not isinstance(src, str):
        src = " ".join(src) if isinstance(src, list) else ""
    if media_source_is_placeholder(src):
        ctx.warnings.append(f"media placeholder preserved as inert HTML code: <{name}>")
        return f"```html\n{media_example_markup(node)}\n```"
    attrs = []
    for key, value in node.attrs.items():
        lowered = key.lower()
        if lowered in SAFE_EMBED_ATTRS and isinstance(value, str):
            attrs.append(f'{lowered}="{value.replace(chr(34), "&quot;")}"')
    return f"<{name} {' '.join(attrs)}></{name}>".replace(" >", ">")


def render_inline(node: Tag | NavigableString, ctx: RenderContext) -> str:
    """Render one inline subtree to Markdown."""
    if isinstance(node, NavigableString):
        return escape_text(str(node))
    name = node.name.lower()
    if name == "br":
        return "  \n" + _children(node, ctx)
    if name in {"strong", "b"}:
        return _wrap(node, ctx, "**")
    if name in {"em", "i"}:
        return _wrap(node, ctx, "*")
    if name in {"del", "s", "strike"}:
        return _wrap(node, ctx, "~~")
    if name == "code":
        return escape_code_span(node.get_text())
    if name == "a":
        return _link(node, ctx)
    if name == "img":
        return _image(node)
    if name in {"audio", "video"}:
        return safe_embed_html(node, ctx)
    if name in {"iframe", "object", "embed"}:
        ctx.warnings.append(f"removed executable/embedded <{name}>")
        return ""
    if name in {"sup", "sub", "u"}:
        return f"<{name}>{_children(node, ctx)}</{name}>"
    if name in {"script", "style", "noscript"}:
        return ""
    return _children(node, ctx)


def _wrap(node: Tag, ctx: RenderContext, marker: str) -> str:
    content = _children(node, ctx).strip()
    return f"{marker}{content}{marker}" if content else ""


def _children(node: Tag, ctx: RenderContext) -> str:
    return "".join(render_inline(child, ctx) for child in node.children)


def _link(node: Tag, ctx: RenderContext) -> str:
    href = rewrite_href(node.get("href") or "", ctx)
    text = _children(node, ctx).strip()
    if not href:
        return text
    return f"[{text or escape_text(href)}]({url_for_markdown(href)})"


def _image(node: Tag) -> str:
    src = (node.get("src") or "").strip()
    if not src:
        return ""
    alt = (node.get("alt") or "").strip()
    alt = alt.replace("\\", "\\\\").replace("[", "\\[").replace("]", "\\]")
    return f"![{alt}]({url_for_markdown(src)})"


def plain_text(node: Tag) -> str:
    """Collapse a node to text for titles, captions, and audit fingerprints."""
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()
