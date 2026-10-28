import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildAliasHtml } from "../scripts/build-legacy-aliases.mjs";
import { NOTE_SLUGS, auditBuiltSite, decodeEntities, extractUrlAttributes } from "../scripts/audit-built-site.mjs";

const SITE = "https://example.test";
const CATEGORY = "后端开发";
const notePaths = NOTE_SLUGS.map((slug) => `/posts/${slug}/`);

function entry(id) {
	return { id: String(id), slug: `legacy-${id}`, canonicalPath: `/posts/${id}/`, legacyUrl: `/posts/${id}.html`, category: CATEGORY };
}

async function put(root, relative, content) {
	const target = path.join(root, relative);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, content);
}

function page(title, category, extra = "") {
	return `<!doctype html><html><head><link rel="stylesheet" href="/_astro/app.css"><script src="/_astro/app.js"></script></head><body><div data-pagefind-body><h1 data-pagefind-meta="title">${title}</h1><a href="/archive/?category=${encodeURIComponent(category)}">category</a><img src="/brand/banner.svg" alt="">${extra}</div></body></html>`;
}

function shell(content) {
	return `<!doctype html><html><head><link rel="stylesheet" href="/_astro/app.css"></head><body><main>${content}<a href="https://example.com/file.pdf">file</a><a href="//example.com/x">proto</a><a href="mailto:a@b.c">mail</a><a href="#top">top</a><a href="?page=2">query</a><a href="/archive/?tag=LLM&amp;from=home">tag</a><a href="/about/?from=home#top">about</a></main></body></html>`;
}

function rss(links) {
	return `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${links.map((link) => `<item><title>x</title><link>${SITE}${link}</link></item>`).join("")}</channel></rss>`;
}

function sitemap(links) {
	return `<?xml version="1.0"?><urlset>${links.map((link) => `<url><loc>${SITE}${link}</loc></url>`).join("")}</urlset>`;
}

async function fixture(t, { extra = [], content = null } = {}) {
	const root = await mkdtemp(path.join(tmpdir(), "site-audit-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const dist = path.join(root, "dist");
	const manifest = path.join(root, "migration", "legacy-posts.json");
	const entries = Array.from({ length: 72 }, (_, index) => entry(index + 1));
	const canonical = [...entries.map((item) => item.canonicalPath), ...notePaths, ...extra.map((item) => item.path)];
	const categories = new Map(entries.map((item) => [item.canonicalPath, CATEGORY]));
	for (const urlPath of notePaths) categories.set(urlPath, "LLM 学习");
	for (const item of extra) categories.set(item.path, item.category);
	await put(root, "migration/legacy-posts.json", JSON.stringify(entries));
	for (const urlPath of canonical) await put(root, `dist${urlPath}index.html`, page(urlPath, categories.get(urlPath)));
	for (const item of entries) await put(root, `dist/posts/${item.id}.html`, buildAliasHtml(item));
	for (let index = 0; index < canonical.length; index += 8) {
		const pageNumber = index / 8 + 1;
		const links = canonical.slice(index, index + 8).map((urlPath) => `<a href="${urlPath}?from=home#top">${urlPath}</a>`).join("");
		await put(root, pageNumber === 1 ? "dist/index.html" : `dist/${pageNumber}/index.html`, shell(links));
	}
	await put(root, "dist/about/index.html", page("About", CATEGORY));
	await put(root, "dist/archive/index.html", shell(""));
	await put(root, "dist/_astro/app.css", "body{}");
	await put(root, "dist/_astro/app.js", "");
	await put(root, "dist/brand/banner.svg", "<svg/>");
	await put(root, "dist/rss.xml", rss(canonical));
	await put(root, "dist/sitemap-0.xml", sitemap(canonical));
	if (content) for (const [relativePath, body] of Object.entries(content)) await put(root, path.join("src", "content", "posts", relativePath), body);
	return { root, dist, manifest, entries, canonical };
}

test("parses quoted, unquoted, and entity-encoded URL attributes", () => {
	const html = `<!-- <a href="/ignored"> --><a href="/a?x=1&amp;y=2">a</a><img src=/img/a.png><script src='/app.js'></script><a href='&#x2F;b&#47;'>b</a><a href=/c>c</a>`;
	assert.deepEqual(extractUrlAttributes(html).map((item) => item.value), ["/a?x=1&y=2", "/img/a.png", "/app.js", "/b/", "/c"]);
	assert.equal(decodeEntities("&amp;&lt;&gt;&quot;&#39;&#x2F;"), `&<>"'/`);
});

test("passes a complete synthetic build with 72 aliases and 75 canonical articles", async (t) => {
	const { dist, manifest } = await fixture(t);
	const report = await auditBuiltSite({ distDir: dist, manifestPath: manifest, siteUrl: SITE });
	assert.equal(report.ready, true);
	assert.equal(report.ok, true, JSON.stringify(report.errors));
	assert.deepEqual(report.counts, { manifest: 72, notes: 3, canonical: 75, aliases: 72, articles: 75, rss: 75, sitemap: 75, pagination: 10 });
	assert.equal(report.warnings.length, 0);
});

test("passes with 76 canonical articles including an extra LLM note", async (t) => {
	const extra = [{ path: "/posts/llm-math-numpy-04/", category: "LLM 学习" }];
	const { dist, manifest } = await fixture(t, { extra });
	const report = await auditBuiltSite({ distDir: dist, manifestPath: manifest, siteUrl: SITE });
	assert.equal(report.ready, true);
	assert.equal(report.ok, true, JSON.stringify(report.errors));
	assert.deepEqual(report.counts, { manifest: 72, notes: 3, canonical: 76, aliases: 72, articles: 76, rss: 76, sitemap: 76, pagination: 10 });
	assert.equal(report.warnings.length, 0);
});

test("accepts a new published authored post from the content source", async (t) => {
	const extra = [{ path: "/posts/new/hello/", category: "随笔" }];
	const { root, dist, manifest } = await fixture(t, {
		extra,
		content: { "new/hello.md": '---\ntitle: "Hello"\npublished: 2026-10-27\ncategory: "随笔"\n---\n\nBody.\n' },
	});
	const report = await auditBuiltSite({ distDir: dist, manifestPath: manifest, contentDir: path.join(root, "src", "content", "posts"), siteUrl: SITE });
	assert.equal(report.ok, true, JSON.stringify(report.errors));
	assert.equal(report.counts.canonical, 76);
	assert.equal(report.counts.articles, 76);
});

test("fails when a local image or CSS/JS asset is missing", async (t) => {
	const { root, dist, manifest } = await fixture(t);
	await unlink(path.join(root, "dist", "brand", "banner.svg"));
	const report = await auditBuiltSite({ distDir: dist, manifestPath: manifest, siteUrl: SITE });
	assert.equal(report.ok, false);
	assert.ok(report.errors.some((error) => error.code === "MISSING_ASSET" && error.message.includes("banner.svg")), JSON.stringify(report.errors));
});

test("fails when an alias points at the wrong canonical path", async (t) => {
	const { root, dist, manifest, entries } = await fixture(t);
	await put(root, "dist/posts/1.html", buildAliasHtml({ canonicalPath: "/posts/wrong/" }));
	const report = await auditBuiltSite({ distDir: dist, manifestPath: manifest, siteUrl: SITE });
	assert.equal(report.ok, false);
	assert.ok(report.errors.some((error) => error.code === "ALIAS_CANONICAL" && error.id === entries[0].id), JSON.stringify(report.errors));
});

test("fails when an alias does not preserve the URL hash", async (t) => {
	const { root, dist, manifest } = await fixture(t);
	await put(root, "dist/posts/1.html", buildAliasHtml({ canonicalPath: "/posts/1/" }).replace(" + location.hash", ""));
	const report = await auditBuiltSite({ distDir: dist, manifestPath: manifest, siteUrl: SITE });
	assert.equal(report.ok, false);
	assert.ok(report.errors.some((error) => error.code === "ALIAS_HASH"), JSON.stringify(report.errors));
});

test("reports unresolved external legacy media without blocking the audit", async (t) => {
	const { root, dist, manifest, canonical } = await fixture(t);
	const target = path.join(root, "dist", canonical[0].slice(1), "index.html");
	const html = await readFile(target, "utf8");
	await writeFile(target, html.replace("</div></body>", '<img src="https://wang-nine.cn/img/missing.jpg" alt=""></div></body>'));
	const report = await auditBuiltSite({ distDir: dist, manifestPath: manifest, siteUrl: SITE });
	assert.equal(report.ok, true, JSON.stringify(report.errors));
	assert.ok(report.warnings.some((warning) => warning.code === "EXTERNAL_UNRESOLVED" && warning.message.includes("missing.jpg")));
});

test("rejects an unclassifiable source Markdown file", async (t) => {
	const { root, dist, manifest } = await fixture(t, { content: { "bogus.md": '---\ntitle: "Bogus"\n---\n\nBody.\n' } });
	const report = await auditBuiltSite({ distDir: dist, manifestPath: manifest, contentDir: path.join(root, "src", "content", "posts"), siteUrl: SITE });
	assert.equal(report.ok, false);
	assert.ok(report.errors.some((error) => error.code === "SOURCE_POST_INVALID" && error.path === "bogus.md"), JSON.stringify(report.errors));
});

test("rejects a rendered article missing from the published source", async (t) => {
	const extra = [{ path: "/posts/not-in-source/", category: "随笔" }];
	const { root, dist, manifest } = await fixture(t, { extra, content: { "draft.md": "---\ntitle: Draft\ndraft: true\n---\n" } });
	const report = await auditBuiltSite({ distDir: dist, manifestPath: manifest, contentDir: path.join(root, "src", "content", "posts"), siteUrl: SITE });
	assert.equal(report.ok, false);
	assert.ok(report.errors.some((error) => error.code === "UNEXPECTED_ARTICLE" && error.path === "/posts/not-in-source/index.html"), JSON.stringify(report.errors));
});

test("fails when a baseline note article is missing", async (t) => {
	const { root, dist, manifest } = await fixture(t);
	const missing = "/posts/llm-math-numpy-02/";
	await unlink(path.join(root, "dist", missing.slice(1), "index.html"));
	const report = await auditBuiltSite({ distDir: dist, manifestPath: manifest, siteUrl: SITE });
	assert.equal(report.ok, false);
	assert.ok(report.errors.some((error) => error.code === "CANONICAL_MISSING" && error.path === `${missing}index.html`), JSON.stringify(report.errors));
	assert.ok(report.errors.some((error) => error.code === "ARTICLE_COUNT"));
});

test("fails when the sitemap lists an unknown article route", async (t) => {
	const { root, dist, manifest } = await fixture(t);
	const sitemapPath = path.join(root, "dist", "sitemap-0.xml");
	const xml = await readFile(sitemapPath, "utf8");
	await writeFile(sitemapPath, xml.replace("</urlset>", `<url><loc>${SITE}/posts/not-published/</loc></url></urlset>`));
	const report = await auditBuiltSite({ distDir: dist, manifestPath: manifest, siteUrl: SITE });
	assert.equal(report.ok, false);
	assert.ok(report.errors.some((error) => error.code === "SITEMAP_UNEXPECTED" && error.path === "/posts/not-published/"), JSON.stringify(report.errors));
});

test("fails when a new article references a missing local asset", async (t) => {
	const extra = [{ path: "/posts/future-post/", category: "随笔" }];
	const { root, dist, manifest } = await fixture(t, { extra });
	const target = path.join(root, "dist", "posts", "future-post", "index.html");
	const html = await readFile(target, "utf8");
	await writeFile(target, html.replace("</div></body>", '<img src="/images/missing-future.png" alt=""></div></body>'));
	const report = await auditBuiltSite({ distDir: dist, manifestPath: manifest, siteUrl: SITE });
	assert.equal(report.ok, false);
	assert.ok(report.errors.some((error) => error.code === "MISSING_ASSET" && error.message.includes("missing-future.png")), JSON.stringify(report.errors));
});

test("reports not ready without throwing when dist and manifest are absent", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "site-audit-empty-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const report = await auditBuiltSite({ distDir: path.join(root, "dist"), manifestPath: path.join(root, "migration", "legacy-posts.json") });
	assert.equal(report.ready, false);
	assert.equal(report.ok, false);
	assert.deepEqual(report.errors.map((error) => error.code).sort(), ["DIST_MISSING", "MANIFEST_MISSING"]);
});
