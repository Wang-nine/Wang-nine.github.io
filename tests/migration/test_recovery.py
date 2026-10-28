from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

import pytest

from conftest import make_page
from convert_legacy import RecoveryResult, recover
from legacy_frontmatter import first_description
from legacy_html import load_source
from legacy_model import CATEGORIES, SourceMeta, category_for


@pytest.fixture(scope="session")
def full_run(tmp_path_factory: pytest.TempPathFactory, real_source: Path) -> tuple[RecoveryResult, Path]:
    out = tmp_path_factory.mktemp("full-recovery")
    result = recover(real_source, out, fetch_assets=False, expected=72)
    return result, out


def test_all_72_posts_convert_and_audit(full_run: tuple[RecoveryResult, Path]) -> None:
    result, _ = full_run
    assert len(result.entries) == 72
    assert len(result.records) == 72
    assert result.losses == []
    assert all(record["status"] == "pass" for record in result.records)
    assert all(record["proseLoss"] == 0 for record in result.records)


def test_manifest_required_fields_and_categories(full_run: tuple[RecoveryResult, Path]) -> None:
    result, out = full_run
    manifest = json.loads((out / "migration" / "legacy-posts.json").read_text(encoding="utf-8"))
    assert len(manifest) == 72
    assert {entry["category"] for entry in manifest} <= set(CATEGORIES)
    required = {
        "id", "sourcePath", "sourceSha256", "title", "published", "updated", "slug",
        "legacyUrl", "canonicalPath", "category", "tags", "markdownPath", "counts",
        "unresolvedAssets", "warnings",
    }
    for entry in manifest:
        assert required <= set(entry)
        assert entry["slug"] == entry["id"]
        assert entry["sourcePath"] == f"posts/{entry['id']}.html"
        assert entry["legacyUrl"] == f"/posts/{entry['id']}.html"
        assert entry["canonicalPath"] == f"/posts/{entry['id']}/"
        assert entry["markdownPath"] == f"src/content/posts/legacy/{entry['id']}.md"
        assert len(entry["sourceSha256"]) == 64
        assert (out / entry["markdownPath"]).is_file()
        for count in ("codeBlocks", "tables", "links", "images", "localizedAssets", "unresolvedAssets"):
            assert count in entry["counts"]


def test_category_distribution_matches_source_taxonomy(full_run: tuple[RecoveryResult, Path]) -> None:
    result, _ = full_run
    counts = {name: 0 for name in CATEGORIES}
    for entry in result.entries:
        counts[entry["category"]] += 1
    assert counts == {
        "Java": 4,
        "后端开发": 26,
        "前端开发": 8,
        "数据库": 26,
        "工具与工程": 6,
        "随笔": 2,
    }


def test_frontmatter_preserves_url_dates_tags_and_description(full_run: tuple[RecoveryResult, Path]) -> None:
    result, out = full_run
    entry = next(item for item in result.entries if item["id"] == "10501")
    markdown = (out / entry["markdownPath"]).read_text(encoding="utf-8")
    assert 'slug: "10501"' in markdown
    assert 'canonical: "/posts/10501/"' in markdown
    assert use_text(markdown, "published") == "2023-06-03T16:00:00.000Z"
    assert use_text(markdown, "updated") == "2023-12-07T04:57:11.087Z"
    assert entry["tags"] == ["HTML-CSS"]
    assert entry["originalCategories"] == ["HTML+CSS"]
    assert entry["category"] == "前端开发"


def test_empty_sources_are_kept_as_posts(full_run: tuple[RecoveryResult, Path]) -> None:
    result, out = full_run
    entries = {entry["id"]: entry for entry in result.entries}
    for post_id in ("10003", "10103", "10800"):
        assert post_id in entries
        markdown = (out / entries[post_id]["markdownPath"]).read_text(encoding="utf-8")
        assert markdown.split("---", 2)[2].strip() == ""
        assert entries[post_id]["counts"]["sourceProseChars"] == 0
    assert entries["5"]["title"] == "无题"


def test_unresolved_assets_are_exact_and_urls_kept(full_run: tuple[RecoveryResult, Path]) -> None:
    result, out = full_run
    urls = {issue["url"] for entry in result.entries for issue in entry["unresolvedAssets"]}
    assert len(urls) > 100
    assert all(
        urlparse(url).hostname == "wang-nine.cn"
        and urlparse(url).path.lstrip("/").startswith("images/")
        for url in urls
    )
    markdown = (out / "src/content/posts/legacy/10001.md").read_text(encoding="utf-8")
    assert "https://wang-nine.cn/images/" in markdown
    assert "loading.gif" not in markdown
    assert "/legacy-assets/" not in markdown


def test_report_states_pass_and_blocked_assets(full_run: tuple[RecoveryResult, Path]) -> None:
    result, out = full_run
    report = (out / "migration" / "RECOVERY-REPORT.md").read_text(encoding="utf-8")
    assert f"{len(result.records)}/{len(result.records)} pass" in report
    assert "Blocked" in report
    urls = {issue["url"] for entry in result.entries for issue in entry["unresolvedAssets"]}
    assert f"{len(urls)} unique body image URLs" in report


def test_manifest_does_not_contain_raw_source_html(full_run: tuple[RecoveryResult, Path]) -> None:
    _, out = full_run
    text = (out / "migration" / "legacy-posts.json").read_text(encoding="utf-8")
    assert "<!DOCTYPE" not in text
    assert "<article" not in text


def test_source_sha_matches_immutable_input(full_run: tuple[RecoveryResult, Path], real_source: Path) -> None:
    result, _ = full_run
    entry = next(item for item in result.entries if item["id"] == "10501")
    digest = hashlib.sha256((real_source / "10501.html").read_bytes()).hexdigest()
    assert entry["sourceSha256"] == digest


def test_category_mapping_is_exhaustive_and_single_valued() -> None:
    assert category_for(("MySQL",)) == "数据库"
    assert category_for(("SSM",)) == "后端开发"
    assert category_for(("HTML+CSS",)) == "前端开发"
    assert category_for(("JavaSE",)) == "Java"
    assert category_for(("博客搭建",)) == "工具与工程"
    assert category_for(("分析",)) == "随笔"
    assert category_for(()) == "随笔"


def test_description_comes_from_first_body_paragraph(full_run: tuple[RecoveryResult, Path]) -> None:
    result, _ = full_run
    entry = next(item for item in result.entries if item["id"] == "10504")
    assert entry["description"] == "第九天笔记"


def test_title_fallback_uses_real_h1_then_explicit_untitled(tmp_path: Path) -> None:
    with_h1 = make_page("<h1>真实标题</h1>", title="")
    no_title = make_page("<p>正文</p>", title="")
    path_a = tmp_path / "fallback.html"
    path_b = tmp_path / "untitled.html"
    path_a.write_text(with_h1, encoding="utf-8")
    path_b.write_text(no_title, encoding="utf-8")
    doc_a = load_source(path_a)
    doc_b = load_source(path_b)
    assert doc_a.meta.title == "真实标题"
    assert doc_a.meta.title_fallback is True
    assert doc_b.meta.title == "无题"
    assert doc_b.meta.title_fallback is True


def test_description_skips_toc_and_never_uses_meta(full_run: tuple[RecoveryResult, Path], real_source: Path) -> None:
    result, _ = full_run
    entry = next(item for item in result.entries if item["id"] == "1")
    assert entry["description"] != "" and "toc" not in entry["description"].lower()
    source = load_source(real_source / "10501.html")
    assert first_description(source.article) == "第一天笔记"


def use_text(markdown: str, key: str) -> str:
    for line in markdown.splitlines():
        if line.startswith(f"{key}: "):
            return line.split(": ", 1)[1].strip()
    raise AssertionError(f"missing {key}")


def test_source_meta_is_typed() -> None:
    meta = SourceMeta("1", "t", "2023-01-01T00:00:00.000Z", "2023-01-02T00:00:00.000Z", ("A",), ("B",))
    assert meta.post_id == "1" and meta.source_tags == ("B",)
