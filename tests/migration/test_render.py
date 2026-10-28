from __future__ import annotations

from pathlib import Path

from conftest import make_page
from legacy_assets import (
    AssetResolver,
    apply_image_resolutions,
    collect_body_images,
    issues_for,
)
from legacy_audit import audit_post
from legacy_blocks import render_body
from legacy_html import load_source
from legacy_model import RenderContext

FIXTURES = Path(__file__).parent / "fixtures"


def _load(path: Path):
    return load_source(path)


def test_code_gutter_numbers_are_removed_and_lines_exact(tmp_path: Path) -> None:
    source = make_page(
        '<figure class="highlight java"><table><tr><td class="gutter">'
        '<pre><span class="line">1</span><br><span class="line">2</span><br>'
        '<span class="line">3</span></pre></td><td class="code"><pre>'
        '<span class="line">class Demo {</span><br><span class="line">  int x = 1;</span><br>'
        '<span class="line">}</span><br></pre></td></tr></table></figure>'
    )
    page = tmp_path / "gutter.html"
    page.write_text(source, encoding="utf-8")
    document = _load(page)
    ctx = RenderContext(post_id="gutter")
    markdown = render_body(document.article, ctx)

    assert ctx.code_blocks[0].text == "class Demo {\n  int x = 1;\n}"
    assert ctx.code_blocks[0].language == "java"
    assert "```java" in markdown
    assert markdown.count("\n") >= 3
    assert "\n1\n" not in markdown
    record, _ = audit_post(document, markdown, 0, [], [], 0)
    assert record["status"] == "pass"


def test_real_complex_post_code_tables_and_lists_survive() -> None:
    document = _load(FIXTURES / "10501.html")
    ctx = RenderContext(post_id="10501")
    markdown = render_body(document.article, ctx)
    record, counts = audit_post(document, markdown, 0, [], [], 0)

    assert record["status"] == "pass"
    assert counts["codeBlocks"] == 8
    assert counts["tables"] == 13
    assert "```html" in markdown
    assert "| 下划线 |" in markdown
    assert "  - 双标签:成对出现的标签" in markdown
    assert "<span class=\"line\">" not in markdown
    assert "<audio" in markdown


def test_literal_unclosed_script_is_text_not_a_swallowing_tag() -> None:
    document = _load(FIXTURES / "10801.html")
    ctx = RenderContext(post_id="10801")
    markdown = render_body(document.article, ctx)
    record, _ = audit_post(document, markdown, 0, [], [], 0)

    assert record["status"] == "pass"
    assert "### 外部 JavaScript" in markdown
    assert "\\<script\\>" in markdown
    assert "放在HTML文件的" in markdown


def test_executable_script_and_javascript_link_are_stripped(tmp_path: Path) -> None:
    source = make_page(
        '<script>alert("exec")</script><p onclick="evil()">safe '
        '<a href="javascript:alert(1)">link</a></p>'
    )
    page = tmp_path / "script.html"
    page.write_text(source, encoding="utf-8")
    document = _load(page)
    ctx = RenderContext(post_id="script")
    markdown = render_body(document.article, ctx)

    assert "alert(\"exec\")" not in markdown
    assert "javascript:" not in markdown
    assert "onclick" not in markdown
    assert "safe" in markdown and "[link]" not in markdown


def test_spanning_table_falls_back_to_safe_html_and_is_reported() -> None:
    document = _load(FIXTURES / "10501.html")
    table = document.article.select_one("div.table-container table")
    assert table is not None
    table["data-test"] = "x"
    cell = table.find("th")
    assert cell is not None
    cell["colspan"] = "2"
    cell["onclick"] = "evil()"
    ctx = RenderContext(post_id="span")
    markdown = render_body(document.article, ctx)

    assert "<table" in markdown
    assert "onclick" not in markdown
    assert any("unconvertible table" in warning for warning in ctx.warnings)


def test_lazy_images_use_original_and_internal_links_rewrite(tmp_path: Path) -> None:
    source = make_page(
        '<p><img src="/img/loading.gif" data-original="/images/demo.png" alt="demo">'
        '<a href="/posts/10501.html#frag">old</a></p>'
    )
    page = tmp_path / "assets.html"
    page.write_text(source, encoding="utf-8")
    document = _load(page)
    resolver = AssetResolver(tmp_path, tmp_path / "public" / "legacy-assets", fetch=False)
    found = collect_body_images(document.article, "https://wang-nine.cn/posts/assets.html", resolver)
    apply_image_resolutions(found)
    ctx = RenderContext(post_id="assets")
    markdown = render_body(document.article, ctx)

    assert "loading.gif" not in markdown
    assert "/images/demo.png" in markdown
    assert "](/posts/10501/#frag)" in markdown
    assert issues_for(found)


def test_audit_detects_dropped_table_row() -> None:
    document = _load(FIXTURES / "10501.html")
    body = render_body(document.article, RenderContext(post_id="10501"))
    broken = "\n".join(line for line in body.splitlines() if "下划线" not in line)
    record, _ = audit_post(document, broken, 0, [], [], 0)
    assert record["tableMismatches"] > 0
    assert record["status"] == "loss"


def test_audit_detects_mangled_code_line() -> None:
    document = _load(FIXTURES / "10504.html")
    body = render_body(document.article, RenderContext(post_id="10504"))
    broken = body.replace("box-sizing", "box_sizing", 1)
    record, _ = audit_post(document, broken, 0, [], [], 0)
    assert record["codeMismatches"] > 0
    assert record["status"] == "loss"


def test_audit_detects_dropped_prose() -> None:
    document = _load(FIXTURES / "10501.html")
    body = render_body(document.article, RenderContext(post_id="10501"))
    broken = body.replace("HTML超文本标记语言―—HyperText Markup Language。", "", 1)
    record, _ = audit_post(document, broken, 0, [], [], 0)
    assert record["proseLoss"] > 0
    assert record["status"] == "loss"


def test_audit_detects_altered_or_deleted_inert_media_literal() -> None:
    document = _load(FIXTURES / "10501.html")
    body = render_body(document.article, RenderContext(post_id="10501"))
    literal = '<audio src="音频的url" contrils loop></audio>'
    fenced = f"```html\n{literal}\n```"

    assert fenced in body
    lines = body.splitlines()
    assert lines[lines.index(literal) - 1] == "```html"

    altered = body.replace(literal, literal.replace("contrils", "controls"))
    altered_record, _ = audit_post(document, altered, 0, [], [], 0)
    assert altered_record["codeMismatches"] == 1
    assert altered_record["status"] == "loss"

    deleted_record, _ = audit_post(document, body.replace(fenced, "", 1), 0, [], [], 0)
    assert deleted_record["codeMismatches"] > 0
    assert deleted_record["status"] == "loss"


def test_audit_does_not_mutate_rendered_objects_before_counting() -> None:
    document = _load(FIXTURES / "10001.html")
    resolver = AssetResolver(FIXTURES, Path("C:/Users/admin/AppData/Local/Temp/unused-assets"), fetch=False)
    found = collect_body_images(document.article, "https://wang-nine.cn/posts/10001.html", resolver)
    apply_image_resolutions(found)
    body = render_body(document.article, RenderContext(post_id="10001"))
    record, counts = audit_post(document, body, len(found), issues_for(found), [], 0)
    assert record["sourceImages"] == record["renderedImages"] == 3
    assert counts["images"] == 3
