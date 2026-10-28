#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const DEFAULT_MANIFEST_PATH = "migration/legacy-posts.json";
export const DEFAULT_OUTPUT_DIR = "dist";
export const DEFAULT_EXPECTED_COUNT = 72;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: reject raw control characters in manifest paths
const UNSAFE_PATH_CHARS = /[\u0000-\u001F\u007F\u2028\u2029\\"'<>]/u;
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export class LegacyAliasError extends Error {
	constructor(code, message, options = {}) {
		super(message, options.cause ? { cause: options.cause } : undefined);
		this.name = "LegacyAliasError";
		this.code = code;
	}
}

function fail(code, message, options) {
	throw new LegacyAliasError(code, message, options);
}

function requireText(value, field, index) {
	if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
		fail("INVALID_MANIFEST", `${field} must be a non-empty trimmed string`, { entry: index });
	}
	return value;
}

function validateId(value, index) {
	const id = requireText(value, "id", index);
	if (!SAFE_ID.test(id) || id.includes("..")) fail("INVALID_ID", `id ${JSON.stringify(id)} is not a safe alias filename`, { entry: index });
	return id;
}

function validateSlug(value, index) {
	const slug = requireText(value, "slug", index);
	if (UNSAFE_PATH_CHARS.test(slug) || /[?#/]/.test(slug) || slug.includes("..") || slug === ".") {
		fail("INVALID_SLUG", `slug ${JSON.stringify(slug)} is not a safe URL segment`, { entry: index });
	}
	return slug;
}

function validateCanonicalPath(value, id, slug, index) {
	const raw = requireText(value, "canonicalPath", index);
	const unsafe = !raw.startsWith("/") || raw.startsWith("//") || !raw.endsWith("/") || raw.slice(1).includes("//") || UNSAFE_PATH_CHARS.test(raw);
	if (unsafe) fail("UNSAFE_CANONICAL", `canonicalPath ${JSON.stringify(raw)} must be an internal /posts/<segment>/ path`, { entry: index });
	let parsed;
	try {
		parsed = new URL(raw, "https://internal.invalid");
	} catch (cause) {
		fail("UNSAFE_CANONICAL", `canonicalPath ${JSON.stringify(raw)} is not a URL path`, { cause, entry: index });
	}
	const segments = parsed.pathname.split("/").filter(Boolean);
	const external = parsed.origin !== "https://internal.invalid" || parsed.search || parsed.hash || segments.length !== 2 || segments[0] !== "posts";
	if (external) fail("UNSAFE_CANONICAL", `canonicalPath ${JSON.stringify(raw)} must stay under /posts/`, { entry: index });
	let segment;
	try {
		segment = decodeURIComponent(segments[1]);
	} catch (cause) {
		fail("UNSAFE_CANONICAL", `canonicalPath ${JSON.stringify(raw)} has invalid percent-encoding`, { cause, entry: index });
	}
	if (segment !== id && segment !== slug) fail("CANONICAL_MISMATCH", `canonicalPath segment ${JSON.stringify(segment)} must match id or slug`, { entry: index });
	return parsed.pathname;
}

function validateLegacyUrl(value, id, index) {
	const raw = requireText(value, "legacyUrl", index);
	if (raw.startsWith("//")) fail("INVALID_LEGACY_URL", `legacyUrl ${JSON.stringify(raw)} must not be protocol-relative`, { entry: index });
	let parsed;
	try {
		parsed = new URL(raw, "https://legacy.invalid");
	} catch (cause) {
		fail("INVALID_LEGACY_URL", `legacyUrl ${JSON.stringify(raw)} is not a URL`, { cause, entry: index });
	}
	const expectedPath = `/posts/${id}.html`;
	if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== expectedPath) {
		fail("LEGACY_PATH_MISMATCH", `legacyUrl path must be ${expectedPath}`, { entry: index });
	}
	return { legacyUrl: raw.startsWith("/") ? raw : parsed.href, legacyPath: parsed.pathname };
}

export function parseLegacyManifest(text, { expectedCount = DEFAULT_EXPECTED_COUNT } = {}) {
	if (typeof text !== "string") fail("INVALID_MANIFEST", "manifest must be text");
	let data;
	try {
		data = JSON.parse(text);
	} catch (cause) {
		fail("INVALID_JSON", "manifest is not valid JSON", { cause });
	}
	if (!Array.isArray(data)) fail("INVALID_MANIFEST", "manifest must be a top-level array");
	if (data.length !== expectedCount) fail("COUNT_MISMATCH", `expected ${expectedCount} manifest entries, found ${data.length}`);
	const seenIds = new Set();
	const seenSlugs = new Set();
	const seenCanonical = new Set();
	return data.map((raw, index) => {
		if (raw === null || typeof raw !== "object" || Array.isArray(raw)) fail("INVALID_MANIFEST", `entry ${index} must be an object`, { entry: index });
		const id = validateId(raw.id, index);
		const slug = validateSlug(raw.slug, index);
		if (seenIds.has(id)) fail("DUPLICATE_ID", `duplicate id ${JSON.stringify(id)}`, { entry: index });
		if (seenSlugs.has(slug)) fail("DUPLICATE_SLUG", `duplicate slug ${JSON.stringify(slug)}`, { entry: index });
		seenIds.add(id);
		seenSlugs.add(slug);
		const canonicalPath = validateCanonicalPath(raw.canonicalPath, id, slug, index);
		if (seenCanonical.has(canonicalPath)) fail("DUPLICATE_CANONICAL", `duplicate canonicalPath ${JSON.stringify(canonicalPath)}`, { entry: index });
		seenCanonical.add(canonicalPath);
		const legacy = validateLegacyUrl(raw.legacyUrl, id, index);
		const entry = { id, slug, canonicalPath, ...legacy };
		if (typeof raw.sha256 === "string") entry.sha256 = raw.sha256.toLowerCase();
		if (typeof raw.hash === "string") entry.hash = raw.hash.toLowerCase();
		return entry;
	});
}

export async function loadLegacyManifest(manifestPath = DEFAULT_MANIFEST_PATH, options = {}) {
	let text;
	try {
		text = await readFile(manifestPath, "utf8");
	} catch (cause) {
		fail("MANIFEST_READ", `cannot read legacy manifest at ${manifestPath}`, { cause });
	}
	return parseLegacyManifest(text, options);
}

export function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

function serializeScriptString(value) {
	return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function buildAliasHtml(entry) {
	const escapedTarget = escapeHtml(entry.canonicalPath);
	const scriptTarget = serializeScriptString(entry.canonicalPath);
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>Redirecting to ${escapedTarget}</title>
<link rel="canonical" href="${escapedTarget}">
<meta http-equiv="refresh" content="0; url=${escapedTarget}">
<script>location.replace(${scriptTarget} + location.hash);</script>
</head><body data-pagefind-ignore><main data-pagefind-ignore>
<p>This page has moved to <a href="${escapedTarget}" data-pagefind-ignore>${escapedTarget}</a>.</p>
</main></body></html>
`;
}

export function legacyAliasPath(entry, outputDir = DEFAULT_OUTPUT_DIR) {
	return path.join(path.resolve(outputDir), "posts", `${entry.id}.html`);
}

function assertInside(baseDir, candidate) {
	const relative = path.relative(path.resolve(baseDir), path.resolve(candidate));
	if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) fail("OUTPUT_TRAVERSAL", `refusing to write outside ${baseDir}: ${candidate}`);
}

async function assertCanonicalPage(entry, outputDir) {
	const indexPath = path.join(outputDir, entry.canonicalPath.replace(/^\//, ""), "index.html");
	assertInside(outputDir, indexPath);
	try {
		await access(indexPath);
	} catch (cause) {
		fail("MISSING_CANONICAL", `canonical page for ${entry.id} not found at ${indexPath}`, { cause, entry: entry.id });
	}
}

export async function buildLegacyAliases({ manifestPath = DEFAULT_MANIFEST_PATH, outputDir = DEFAULT_OUTPUT_DIR, expectedCount = DEFAULT_EXPECTED_COUNT, verifyCanonical = true } = {}) {
	const entries = await loadLegacyManifest(manifestPath, { expectedCount });
	const resolvedOutput = path.resolve(outputDir);
	const planned = entries.map((entry) => {
		const filePath = legacyAliasPath(entry, resolvedOutput);
		assertInside(resolvedOutput, filePath);
		return { entry, filePath };
	});
	if (verifyCanonical) {
		for (const { entry } of planned) await assertCanonicalPage(entry, resolvedOutput);
	}
	for (const { entry, filePath } of planned) {
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, buildAliasHtml(entry), "utf8");
	}
	return {
		count: planned.length,
		manifestPath: path.resolve(manifestPath),
		outputDir: resolvedOutput,
		files: planned.map(({ entry, filePath }) => ({ id: entry.id, filePath, canonicalPath: entry.canonicalPath })),
	};
}

const CLI_OPTIONS = {
	manifest: { type: "string", default: DEFAULT_MANIFEST_PATH },
	output: { type: "string", default: DEFAULT_OUTPUT_DIR },
	"expected-count": { type: "string", default: String(DEFAULT_EXPECTED_COUNT) },
	"no-verify-canonical": { type: "boolean", default: false },
	help: { type: "boolean", short: "h", default: false },
};

function cliOptions(argv) {
	let values;
	try {
		({ values } = parseArgs({ args: argv, options: CLI_OPTIONS, allowPositionals: false }));
	} catch (cause) {
		fail("INVALID_ARGUMENT", cause.message, { cause });
	}
	const expectedCount = Number(values["expected-count"]);
	if (!Number.isInteger(expectedCount) || expectedCount < 0) fail("INVALID_ARGUMENT", "--expected-count must be a non-negative integer");
	return {
		manifestPath: values.manifest,
		outputDir: values.output,
		expectedCount,
		verifyCanonical: !values["no-verify-canonical"],
		help: values.help,
	};
}

function printHelp() {
	console.log(`Usage: node scripts/build-legacy-aliases.mjs [options]
  --manifest <path>      Legacy manifest (default: ${DEFAULT_MANIFEST_PATH})
  --output <dir>         Build output directory (default: ${DEFAULT_OUTPUT_DIR})
  --expected-count <n>   Required manifest entry count (default: ${DEFAULT_EXPECTED_COUNT})
  --no-verify-canonical  Do not require canonical index.html files
  -h, --help             Show this help`);
}

async function main() {
	const options = cliOptions(process.argv.slice(2));
	if (options.help) return printHelp();
	const result = await buildLegacyAliases(options);
	console.log(`Built ${result.count} legacy aliases in ${path.join(result.outputDir, "posts")}`);
}

const cliUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === cliUrl) {
	main().catch((error) => {
		console.error(`[${error instanceof LegacyAliasError ? error.code : "UNEXPECTED"}] ${error.message}`);
		process.exitCode = 1;
	});
}
