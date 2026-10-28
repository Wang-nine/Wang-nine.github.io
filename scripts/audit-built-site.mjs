#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { LegacyAliasError, parseLegacyManifest } from "./build-legacy-aliases.mjs";
import {
	authoredPost,
	categoryValues,
	decodeEntities,
	extractUrlAttributes,
	isDraft,
	legacyEntry,
	MARKDOWN,
	originOf,
	parseFrontmatter,
	resolveReference,
	tagAttributes,
	urlPath,
	walkFiles,
	xmlValue,
} from "./site-audit-utils.mjs";

export { decodeEntities, extractUrlAttributes };

export const DEFAULT_DIST = "dist";
export const DEFAULT_MANIFEST = "migration/legacy-posts.json";
export const DEFAULT_CONTENT_DIR = "src/content/posts";
export const EXPECTED_LEGACY = 72;
export const EXPECTED_NOTES = 3;
export const BASELINE_ARTICLES = EXPECTED_LEGACY + EXPECTED_NOTES;
// Backwards-compatible name for the required baseline; additional authored posts may exceed it.
export const EXPECTED_ARTICLES = BASELINE_ARTICLES;
export const NOTE_SLUGS = Object.freeze(["llm-math-numpy-01", "llm-math-numpy-02", "llm-math-numpy-03"]);
export const NOTE_CATEGORY = "LLM 学习";
export const LEGACY_CATEGORIES = new Set(["Java", "后端开发", "前端开发", "数据库", "工具与工程", "随笔"]);

const ASSET = /\.(?:css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|mp4|webm|pdf)$/i;
const ASSET_PREFIX = /^\/(?:_astro|brand|legacy-assets)\//;
const FORBIDDEN = /(^|\/)(?:learning-state|exercises|credentials|secrets|migration|tests|node_modules|\.git|src|\.npmrc|\.netrc|id_rsa|id_ed25519|id_ecdsa|id_dsa)(?:\/|$)|(^|\/)\.env(?:\.|$)|\.(?:md|mdx|astro|tsx?|jsx|py|env|pem|key|p12|pfx|jks|keystore|kdbx|map|svelte|vue)$/i;
const PRIVATE = /(^|\/)(?:learning-state|exercises|credentials|secrets|migration|tests)(?:\/|$)|(^|\/)\.env(?:\.|$)/i;
const ARTICLE = /"@type"\s*:\s*"BlogPosting"|data-pagefind-body\b|data-pagefind-meta\s*=\s*["']title["']/i;
const issue = (code, message, extra = {}) => ({ code, message, ...extra });
const keyOf = (file, root) => `/${path.relative(root, file).split(path.sep).join("/")}`;

const field = (data, name) => (typeof data[name] === "string" ? data[name].trim() : "");
const validPublished = (data) => {
	const value = field(data, "published");
	return value.length > 0 && !Number.isNaN(Date.parse(value));
};
const slugFor = (relativePath, data) => field(data, "slug") || relativePath.replace(/\.(md|mdx)$/i, "");

function noteSource(relativePath, data) {
	const basename = path.basename(relativePath, path.extname(relativePath));
	const sourcePath = (field(data, "sourcePath") || field(data, "source_path")).replace(/\\/g, "/");
	const slug = field(data, "slug");
	const isNote = sourcePath.startsWith("notes/") || relativePath.startsWith("llm-learning/") || /^llm-math-numpy-/.test(slug) || /^llm-math-numpy-/.test(basename);
	if (!isNote || !field(data, "title") || !validPublished(data)) return null;
	return { slug: slugFor(relativePath, data) };
}

function publishedPost(relativePath, data) {
	const post = authoredPost({ ...data, slug: slugFor(relativePath, data) });
	return post && validPublished(data) ? post : null;
}

async function sourceCanonicals({ contentDir, byId, bySlug, errors }) {
	let files;
	try {
		files = await walkFiles(contentDir);
	} catch (error) {
		if (error?.code === "ENOENT") return { scanned: false, canonicals: new Set(), categories: new Map() };
		errors.push(issue("CONTENT_READ", `cannot scan ${contentDir}`, { cause: error }));
		return { scanned: false, canonicals: new Set(), categories: new Map() };
	}
	const canonicals = new Set();
	const categories = new Map();
	for (const file of files.filter((item) => MARKDOWN.has(path.extname(item).toLowerCase()))) {
		const relativePath = path.relative(contentDir, file).split(path.sep).join("/");
		let text;
		try {
			text = await readFile(file, "utf8");
		} catch (error) {
			errors.push(issue("CONTENT_READ", `cannot read ${relativePath}`, { cause: error }));
			continue;
		}
		const { data } = parseFrontmatter(text);
		const entry = legacyEntry(relativePath, data, byId, bySlug);
		if (entry) {
			canonicals.add(entry.canonicalPath);
			continue;
		}
		if (isDraft(data)) continue;
		const note = noteSource(relativePath, data);
		const post = note ?? publishedPost(relativePath, data);
		if (!post) {
			errors.push(issue("SOURCE_POST_INVALID", `${relativePath} needs a non-empty title and published date, plus category and slug for an authored post`, { path: relativePath }));
			continue;
		}
		const canonical = `/posts/${post.slug}/`;
		canonicals.add(canonical);
		const category = field(data, "category");
		if (category && category.toLowerCase() !== "null") categories.set(canonical, category);
	}
	return { scanned: true, canonicals, categories };
}

export async function auditBuiltSite({
	distDir = DEFAULT_DIST,
	manifestPath = DEFAULT_MANIFEST,
	contentDir,
	siteUrl = process.env.SITE_URL,
} = {}) {
	const resolvedDist = path.resolve(distDir);
	const resolvedManifest = path.resolve(manifestPath);
	const manifestDir = path.dirname(resolvedManifest);
	const repoRoot = path.basename(manifestDir) === "migration" ? path.dirname(manifestDir) : manifestDir;
	const resolvedContent = contentDir ? path.resolve(contentDir) : path.join(repoRoot, DEFAULT_CONTENT_DIR);
	const checks = { distDir: resolvedDist, manifestPath: resolvedManifest, contentDir: resolvedContent, siteUrl: siteUrl || null };
	const empty = { manifest: 0, notes: 0, canonical: 0, aliases: 0, articles: 0, rss: 0, sitemap: 0, pagination: 0 };
	const [distInfo, manifestInfo] = await Promise.all([stat(resolvedDist).catch(() => null), stat(resolvedManifest).catch(() => null)]);
	if (!distInfo?.isDirectory() || !manifestInfo?.isFile()) {
		const missing = [];
		if (!distInfo?.isDirectory()) missing.push(issue("DIST_MISSING", `build output is not ready: ${resolvedDist}`));
		if (!manifestInfo?.isFile()) missing.push(issue("MANIFEST_MISSING", `legacy manifest is not ready: ${resolvedManifest}`));
		return { ok: false, ready: false, errors: missing, warnings: [], counts: empty, checks };
	}

	const errors = [], warnings = [];
	const warn = (warning) => warnings.push(warning);
	const origin = siteUrl ? originOf(siteUrl) : null;
	if (siteUrl && !origin) errors.push(issue("INVALID_SITE_URL", `SITE_URL is not an absolute URL: ${siteUrl}`));
	let entries, rawById;
	try {
		const text = await readFile(resolvedManifest, "utf8");
		entries = parseLegacyManifest(text, { expectedCount: EXPECTED_LEGACY });
		rawById = new Map(JSON.parse(text).map((entry) => [entry?.id, entry]));
	} catch (error) {
		const code = error instanceof LegacyAliasError ? error.code : "UNEXPECTED";
		return { ok: false, ready: true, errors: [issue("MANIFEST_INVALID", `${code}: ${error.message}`)], warnings, counts: empty, checks };
	}

	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
	const source = await sourceCanonicals({ contentDir: resolvedContent, byId, bySlug, errors });
	let files;
	try {
		files = await walkFiles(resolvedDist);
	} catch (error) {
		errors.push(issue("DIST_READ", `cannot scan ${resolvedDist}`, { cause: error }));
		return { ok: false, ready: true, errors, warnings, counts: empty, checks };
	}
	const fileSet = new Set(files.map((file) => keyOf(file, resolvedDist)));
	for (const key of fileSet) if (FORBIDDEN.test(key)) errors.push(issue("FORBIDDEN_FILE", `forbidden path in dist: ${key}`, { path: key }));

	const html = new Map();
	for (const file of files) {
		const key = keyOf(file, resolvedDist);
		if (!key.endsWith(".html")) continue;
		try { html.set(key, await readFile(file, "utf8")); } catch (error) { errors.push(issue("READ_FAILED", `cannot read ${key}`, { cause: error })); }
	}

	const baseline = [...new Set([...entries.map((entry) => entry.canonicalPath), ...NOTE_SLUGS.map((slug) => `/posts/${slug}/`)])];
	if (baseline.length !== BASELINE_ARTICLES) errors.push(issue("CANONICAL_BASELINE", `expected ${BASELINE_ARTICLES} baseline canonical paths, found ${baseline.length}`));
	const expected = new Set([...baseline, ...source.canonicals]);
	const expectedCategory = new Map();
	for (const [canonical, category] of source.categories) expectedCategory.set(`${canonical}index.html`, category);
	for (const entry of entries) {
		const category = String(rawById.get(entry.id)?.category ?? "").trim();
		if (!LEGACY_CATEGORIES.has(category)) errors.push(issue("INVALID_CATEGORY", `manifest entry ${entry.id} has category ${JSON.stringify(category)}`, { id: entry.id }));
		expectedCategory.set(`${entry.canonicalPath}index.html`, category);
	}
	for (const slug of NOTE_SLUGS) expectedCategory.set(`/posts/${slug}/index.html`, NOTE_CATEGORY);
	const articles = [...html].filter(([key, body]) => key.startsWith("/posts/") && key.endsWith("/index.html") && ARTICLE.test(body)).map(([key]) => key);
	for (const key of articles) {
		const canonical = key.slice(0, -"index.html".length);
		if (expected.has(canonical)) continue;
		if (source.scanned) {
			errors.push(issue("UNEXPECTED_ARTICLE", `article page is not present in the published content source: ${key}`, { path: key }));
			continue;
		}
		if (categoryValues(html.get(key)).length > 0) expected.add(canonical);
		else errors.push(issue("UNEXPECTED_ARTICLE", `article page has no category metadata: ${key}`, { path: key }));
	}
	if (articles.length < baseline.length) errors.push(issue("ARTICLE_COUNT", `expected at least ${baseline.length} canonical article pages, found ${articles.length}`));
	const expectedFiles = new Set([...expected].map((urlPathValue) => `${urlPathValue}index.html`));
	for (const key of expectedFiles) {
		const body = html.get(key);
		if (body === undefined) { errors.push(issue("CANONICAL_MISSING", `canonical page is missing: ${key}`, { path: key })); continue; }
		if (!ARTICLE.test(body)) errors.push(issue("CANONICAL_NOT_ARTICLE", `canonical page is not an article: ${key}`, { path: key }));
		const categories = categoryValues(body);
		if (categories.length === 0) errors.push(issue("CATEGORY_LINK_MISSING", `canonical page has no category link: ${key}`, { path: key }));
		const wanted = expectedCategory.get(key);
		if (wanted && !categories.includes(wanted)) errors.push(issue("CATEGORY_MISMATCH", `category ${JSON.stringify(wanted)} is not linked from ${key}`, { path: key }));
	}

	const aliasKeys = [...fileSet].filter((key) => /^\/posts\/[^/]+\.html$/.test(key));
	if (aliasKeys.length !== entries.length) errors.push(issue("ALIAS_COUNT", `expected ${entries.length} legacy aliases, found ${aliasKeys.length}`));
	for (const entry of entries) {
		const key = `/posts/${entry.id}.html`;
		const body = html.get(key);
		if (body === undefined) { errors.push(issue("ALIAS_MISSING", `legacy alias is missing: ${key}`, { id: entry.id })); continue; }
		const canonical = tagAttributes(body, "link", (attrs) => attrs.rel?.toLowerCase() === "canonical")?.href;
		if (canonical !== entry.canonicalPath) errors.push(issue("ALIAS_CANONICAL", `alias ${key} points to ${JSON.stringify(canonical)} instead of ${entry.canonicalPath}`, { id: entry.id }));
		const refresh = tagAttributes(body, "meta", (attrs) => attrs["http-equiv"]?.toLowerCase() === "refresh")?.content ?? "";
		if (!refresh.includes(`url=${entry.canonicalPath}`)) errors.push(issue("ALIAS_REFRESH", `alias ${key} does not redirect to ${entry.canonicalPath}`, { id: entry.id }));
		const script = body.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? "";
		const unescaped = script.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
		if (!/location\.replace\([\s\S]*\+\s*location\.hash\s*\)/.test(script) || !unescaped.includes(entry.canonicalPath)) {
			errors.push(issue("ALIAS_HASH", `alias ${key} does not preserve the URL hash for ${entry.canonicalPath}`, { id: entry.id }));
		}
	}

	for (const [key, body] of html) {
		const base = key.slice(0, key.lastIndexOf("/") + 1);
		if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(body)) errors.push(issue("PRIVATE_KEY", `private key material in ${key}`, { path: key }));
		for (const ref of extractUrlAttributes(body)) {
			const target = resolveReference(ref.value, base);
			if (!target) continue;
			if (target.unsupported) { warn(issue("UNSUPPORTED_URL", `unsupported URL scheme in ${key}: ${ref.value}`, { path: key })); continue; }
			const pathname = target.external ? urlPath(target.external.href, target.external.href) : target.pathname;
			if (PRIVATE.test(pathname)) errors.push(issue("PRIVATE_LINK", `private path linked from ${key}: ${ref.value}`, { path: key }));
			if (target.external) {
				if (ref.name === "src" || target.external.hostname === "wang-nine.cn") warn(issue("EXTERNAL_UNRESOLVED", `external reference kept in ${key}: ${ref.value}`, { path: key }));
				continue;
			}
			const candidate = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
			if (fileSet.has(candidate) || (!path.posix.extname(pathname) && fileSet.has(`${pathname}/index.html`))) continue;
			const asset = ASSET.test(pathname) || ASSET_PREFIX.test(pathname);
			errors.push(issue(asset ? "MISSING_ASSET" : "MISSING_LOCAL_TARGET", `missing ${asset ? "asset" : "local target"} from ${key}: ${ref.value}`, { path: key }));
		}
	}

	let rssCount = 0;
	if (fileSet.has("/rss.xml")) {
		const rss = await readFile(path.join(resolvedDist, "rss.xml"), "utf8");
		const links = [...rss.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((item) => xmlValue(/<link\b[^>]*>([\s\S]*?)<\/link>/i.exec(item[1])?.[1] ?? "")).filter(Boolean);
		rssCount = links.length;
		const paths = new Set();
		for (const link of links) {
			const pathname = urlPath(link, siteUrl || "https://audit.invalid");
			if (pathname) paths.add(pathname);
			if (origin && originOf(link) !== origin) errors.push(issue("RSS_ORIGIN", `RSS link is outside SITE_URL: ${link}`));
		}
		if (rssCount !== expected.size) errors.push(issue("RSS_ITEMS", `expected ${expected.size} RSS items, found ${rssCount}`));
		for (const urlPathValue of expectedFiles) {
			const canonical = urlPathValue.replace(/index\.html$/, "");
			if (!paths.has(canonical)) errors.push(issue("RSS_CANONICAL", `RSS is missing ${canonical}`));
		}
		for (const pathname of paths) if (!expected.has(pathname)) errors.push(issue("RSS_UNEXPECTED", `RSS contains a non-canonical article: ${pathname}`, { path: pathname }));
	} else errors.push(issue("RSS_MISSING", "dist/rss.xml is missing"));

	const sitemapFiles = [...fileSet].filter((key) => /^\/sitemap[^/]*\.xml$/.test(key));
	let sitemapCount = 0;
	if (sitemapFiles.length === 0) errors.push(issue("SITEMAP_MISSING", "dist/sitemap*.xml is missing"));
	else {
		const locs = new Set();
		for (const key of sitemapFiles) {
			const xml = await readFile(path.join(resolvedDist, key.slice(1)), "utf8");
			for (const match of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
				const loc = xmlValue(match[1]);
				const pathname = urlPath(loc, siteUrl || "https://audit.invalid");
				if (!pathname || pathname.endsWith(".xml")) continue;
				locs.add(pathname);
				if (origin && originOf(loc) !== origin) errors.push(issue("SITEMAP_ORIGIN", `sitemap loc is outside SITE_URL: ${loc}`));
				if (pathname.startsWith("/posts/") && !expected.has(pathname)) errors.push(issue("SITEMAP_UNEXPECTED", `sitemap contains an unknown article route: ${pathname}`, { path: pathname }));
				const candidate = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
				if (!fileSet.has(candidate) && !fileSet.has(`${pathname}/index.html`)) errors.push(issue("SITEMAP_TARGET", `sitemap loc has no rendered target: ${pathname}`, { path: pathname }));
			}
		}
		for (const urlPathValue of expectedFiles) if (locs.has(urlPathValue.replace(/index\.html$/, ""))) sitemapCount += 1; else errors.push(issue("SITEMAP_CANONICAL", `sitemap is missing ${urlPathValue.replace(/index\.html$/, "")}`));
	}

	const numbered = [...html.keys()].map((key) => /^\/(\d+)\/index\.html$/.exec(key)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
	const lastPage = numbered.at(-1) ?? 1;
	for (let page = 2; page <= lastPage; page += 1) if (!html.has(`/${page}/index.html`)) errors.push(issue("PAGINATION_GAP", `pagination page ${page} is missing`));
	const paginationKeys = ["/index.html", ...Array.from({ length: Math.max(0, lastPage - 1) }, (_, index) => `/${index + 2}/index.html`)];
	const paginated = new Set();
	for (const key of paginationKeys) {
		const body = html.get(key);
		if (body === undefined) { errors.push(issue("PAGINATION_MISSING", `pagination page is missing: ${key}`, { path: key })); continue; }
		const onPage = new Set();
		for (const ref of extractUrlAttributes(body)) {
			if (ref.name !== "href") continue;
			const target = resolveReference(ref.value, "/");
			const pathname = target?.pathname;
			if (pathname && expectedFiles.has(`${pathname}index.html`)) onPage.add(pathname);
		}
		for (const pathname of onPage) {
			if (paginated.has(pathname)) errors.push(issue("PAGINATION_DUPLICATE", `post appears on more than one pagination page: ${pathname}`));
			paginated.add(pathname);
		}
	}
	if (paginated.size !== expected.size) errors.push(issue("PAGINATION_COUNT", `pagination covers ${paginated.size} of ${expected.size} canonical posts`));

	const counts = { manifest: entries.length, notes: NOTE_SLUGS.length, canonical: expected.size, aliases: entries.length, articles: articles.length, rss: rssCount, sitemap: sitemapCount, pagination: paginationKeys.length };
	return { ok: errors.length === 0, ready: true, errors, warnings, counts, checks };
}

const CLI_OPTIONS = {
	dist: { type: "string", default: DEFAULT_DIST },
	manifest: { type: "string", default: DEFAULT_MANIFEST },
	"content-dir": { type: "string", default: "" },
	"site-url": { type: "string", default: process.env.SITE_URL ?? "" },
	json: { type: "boolean", default: false },
	help: { type: "boolean", short: "h", default: false },
};

function printHelp() {
	console.log(`Usage: node scripts/audit-built-site.mjs [options]
  --dist <dir>         Build output directory (default: ${DEFAULT_DIST})
  --manifest <path>    Legacy manifest (default: ${DEFAULT_MANIFEST})
  --content-dir <dir>  Authored post sources (default: ${DEFAULT_CONTENT_DIR} next to the manifest)
  --site-url <url>     Expected Pages origin (default: SITE_URL)
  --json               Print a machine-readable report
  -h, --help           Show this help`);
}

async function main() {
	const { values } = parseArgs({ args: process.argv.slice(2), options: CLI_OPTIONS, allowPositionals: false });
	if (values.help) return printHelp();
	const report = await auditBuiltSite({
		distDir: values.dist,
		manifestPath: values.manifest,
		contentDir: values["content-dir"] || undefined,
		siteUrl: values["site-url"],
	});
	if (values.json) console.log(JSON.stringify(report, null, 2));
	else {
		console.log(report.ready ? (report.ok ? "Built site audit passed." : "Built site audit failed.") : "Built site audit not ready.");
		console.log(`canonical=${report.counts.canonical} aliases=${report.counts.aliases} articles=${report.counts.articles} rss=${report.counts.rss} sitemap=${report.counts.sitemap} pagination=${report.counts.pagination} warnings=${report.warnings.length}`);
		for (const error of report.errors) console.error(`- [${error.code}] ${error.message}`);
	}
	if (!report.ok) process.exitCode = 1;
}

const cliUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === cliUrl) main().catch((error) => { console.error(`[UNEXPECTED] ${error.message}`); process.exitCode = 1; });
