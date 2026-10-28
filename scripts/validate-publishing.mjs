#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { NOTE_CATEGORY, NOTE_SLUGS } from "./audit-built-site.mjs";
import { DEFAULT_EXPECTED_COUNT, DEFAULT_MANIFEST_PATH, escapeHtml, LegacyAliasError, parseLegacyManifest } from "./build-legacy-aliases.mjs";
import { authoredPost, isDraft, legacyEntry, MARKDOWN, parseFrontmatter, walkFiles } from "./site-audit-utils.mjs";

export const DEFAULT_EXPECTED_NOTES = 3;
const FORBIDDEN_SEGMENTS = new Set(["learning-state", "exercises", "credentials", "secrets", ".env", ".env.local", ".env.production", ".env.development", "id_rsa", "id_ed25519", "id_ecdsa", "id_dsa", ".npmrc", ".netrc"]);
const FORBIDDEN_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".kdbx"]);
const PRIVATE_LINK = /(?:^|[/\\])(learning-state|exercises|credentials)(?:[/\\]|$)|(?:^|[/\\])\.env(?:\.|$)|(?:^|[/\\])(id_rsa|id_ed25519|id_ecdsa|id_dsa)(?:$|[?#])/i;
const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/;
const SHA256 = /^[a-f0-9]{64}$/i;
const ASSET_MANIFESTS = ["migration/asset-hashes.json", "migration/asset-manifest.json", "migration/hashes.json"];
const issue = (code, message, details = {}) => ({ code, message, ...details });

async function exists(target) {
	try { await access(target); return true; } catch { return false; }
}

function safeDecode(value) {
	try { return decodeURIComponent(value); } catch { return value; }
}

function linkTargets(body) {
	const targets = new Set();
	for (const match of body.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?/g)) targets.add(match[1]);
	for (const match of body.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) targets.add(match[1]);
	return targets;
}

function digest(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}

function field(data, name) {
	return typeof data[name] === "string" ? data[name].trim() : "";
}

function validPublished(data) {
	const value = field(data, "published");
	return value.length > 0 && !Number.isNaN(Date.parse(value));
}

function slugFor(relativePath, data) {
	return field(data, "slug") || relativePath.replace(/\.(md|mdx)$/i, "");
}

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

function classify(relativePath, data, byId, bySlug) {
	const entry = legacyEntry(relativePath, data, byId, bySlug);
	if (entry) return { type: "legacy", entry };
	if (isDraft(data)) return { type: "draft" };
	const note = noteSource(relativePath, data);
	if (note) return { type: "note", slug: note.slug };
	return publishedPost(relativePath, data) ? { type: "post" } : { type: "unknown" };
}

function forbiddenReason(relativePath) {
	const segment = relativePath.toLowerCase().split("/").find((part) => FORBIDDEN_SEGMENTS.has(part) || part.startsWith(".env.") || /^(learning-state|exercises|credentials|id_rsa|id_ed25519|id_ecdsa|id_dsa)(\.|$)/.test(part));
	if (segment) return `segment:${segment}`;
	const extension = path.extname(relativePath).toLowerCase();
	return FORBIDDEN_EXTENSIONS.has(extension) ? `extension:${extension}` : "";
}

async function scanForbidden(root, label, errors) {
	if (!(await exists(root))) return { scanned: false, files: 0 };
	let files;
	try { files = await walkFiles(root); } catch (cause) { errors.push(issue("PATH_READ", `cannot scan ${label}`, { cause })); return { scanned: false, files: 0 }; }
	for (const file of files) {
		const relativePath = path.relative(root, file).split(path.sep).join("/");
		const reason = forbiddenReason(relativePath);
		if (reason) errors.push(issue("FORBIDDEN_PUBLIC_PATH", `${label}/${relativePath} is forbidden (${reason})`, { path: `${label}/${relativePath}`, reason }));
	}
	return { scanned: true, files: files.length };
}

function hashRecords(data) {
	const records = Array.isArray(data) ? data : (data?.files ?? data);
	if (Array.isArray(records)) return records.map((item) => ({ path: item?.path, sha256: item?.sha256 ?? item?.hash }));
	if (records && typeof records === "object") return Object.entries(records).map(([filePath, value]) => ({ path: filePath, sha256: typeof value === "string" ? value : (value?.sha256 ?? value?.hash) }));
	return null;
}

async function verifyHashes(root, errors) {
	for (const relativeManifest of ASSET_MANIFESTS) {
		const manifestPath = path.join(root, relativeManifest);
		if (!(await exists(manifestPath))) continue;
		let data;
		try { data = JSON.parse(await readFile(manifestPath, "utf8")); } catch (cause) { errors.push(issue("ASSET_MANIFEST_INVALID", `${relativeManifest} is not valid JSON`, { cause })); return { available: true, checked: 0 }; }
		const records = hashRecords(data);
		if (!records) { errors.push(issue("ASSET_MANIFEST_INVALID", `${relativeManifest} has no hash records`)); return { available: true, checked: 0 }; }
		let checked = 0;
		for (const record of records) {
			if (typeof record.path !== "string" || typeof record.sha256 !== "string" || !SHA256.test(record.sha256)) { errors.push(issue("ASSET_MANIFEST_INVALID", `${relativeManifest} has an invalid record`)); continue; }
			const target = path.resolve(root, record.path);
			const relativeTarget = path.relative(root, target);
			if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) { errors.push(issue("UNSAFE_HASH_PATH", `${relativeManifest} points outside the repo: ${record.path}`)); continue; }
			if (!(await exists(target))) { errors.push(issue("ASSET_MISSING", `${record.path} is missing`)); continue; }
			let buffer;
			try { buffer = await readFile(target); } catch (cause) { errors.push(issue("ASSET_READ", `${record.path} cannot be read`, { cause })); continue; }
			if (digest(buffer) !== record.sha256.toLowerCase()) { errors.push(issue("ASSET_HASH_MISMATCH", `${record.path} hash does not match ${relativeManifest}`)); continue; }
			checked += 1;
		}
		return { available: true, checked, manifestPath: relativeManifest, records: records.length };
	}
	return { available: false, checked: 0 };
}

async function readManifest(manifestPath, expectedCount) {
	let text;
	try { text = await readFile(manifestPath, "utf8"); } catch (cause) { return { entries: [], error: issue("MANIFEST_READ", `cannot read ${manifestPath}`, { cause }) }; }
	try { return { entries: parseLegacyManifest(text, { expectedCount }), error: null }; } catch (error) {
		if (error instanceof LegacyAliasError) return { entries: [], error: issue("MANIFEST_INVALID", `${error.code}: ${error.message}`, { manifestCode: error.code }) };
		throw error;
	}
}

async function checkAliases(distDir, entries, errors) {
	if (!(await exists(distDir))) return { scanned: false, aliases: 0 };
	let aliases = 0;
	for (const entry of entries) {
		try {
			const html = await readFile(path.join(distDir, "posts", `${entry.id}.html`), "utf8");
			if (!html.includes(`href="${escapeHtml(entry.canonicalPath)}"`)) errors.push(issue("ALIAS_TARGET_MISMATCH", `alias ${entry.id} does not link to ${entry.canonicalPath}`));
			aliases += 1;
		} catch {
			errors.push(issue("ALIAS_MISSING", `dist/posts/${entry.id}.html is missing`));
		}
	}
	return { scanned: true, aliases };
}

export async function validatePublishing({
	repoRoot = process.cwd(),
	manifestPath = DEFAULT_MANIFEST_PATH,
	contentDir = "src/content/posts",
	publicDir = "public",
	expectedCount = DEFAULT_EXPECTED_COUNT,
	expectedNotes = DEFAULT_EXPECTED_NOTES,
} = {}) {
	const root = path.resolve(repoRoot);
	const resolvedContent = path.resolve(root, contentDir);
	const resolvedManifest = path.resolve(root, manifestPath);
	const manifest = await readManifest(resolvedManifest, expectedCount);
	const errors = manifest.error ? [manifest.error] : [];
	const entries = manifest.entries;
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
	const matched = new Map();
	const noteCategories = new Map();
	const classifications = [];
	let markdown = [];
	try { markdown = (await walkFiles(resolvedContent)).filter((file) => MARKDOWN.has(path.extname(file).toLowerCase())); } catch (cause) { errors.push(issue("CONTENT_READ", `cannot scan ${resolvedContent}`, { cause })); }
	for (const file of markdown) {
		const relativePath = path.relative(resolvedContent, file).split(path.sep).join("/");
		let buffer;
		try { buffer = await readFile(file); } catch (cause) { errors.push(issue("CONTENT_READ", `cannot read ${relativePath}`, { cause })); continue; }
		const text = buffer.toString("utf8");
		const { data, body } = parseFrontmatter(text);
		const classification = classify(relativePath, data, byId, bySlug);
		classifications.push({ path: relativePath, type: classification.type, ...(classification.entry ? { manifestId: classification.entry.id } : {}) });
		if (classification.type === "legacy") {
			if (matched.has(classification.entry.id)) errors.push(issue("DUPLICATE_POST", `manifest id ${classification.entry.id} matched more than once`, { path: relativePath }));
			else matched.set(classification.entry.id, { buffer, entry: classification.entry });
		}
		if (classification.type === "note" && classification.slug) {
			const categories = noteCategories.get(classification.slug) ?? [];
			categories.push(field(data, "category"));
			noteCategories.set(classification.slug, categories);
		}
		for (const target of linkTargets(body)) {
			const decoded = safeDecode(target);
			if (/^https?:\/\//i.test(decoded) || decoded.startsWith("//")) continue;
			if (PRIVATE_LINK.test(decoded)) errors.push(issue("PRIVATE_CROSSLINK", `${relativePath} links to private path ${target}`, { path: relativePath, target }));
		}
		if (PRIVATE_KEY.test(text)) errors.push(issue("PRIVATE_KEY_MATERIAL", `${relativePath} contains private key material`, { path: relativePath }));
	}
	for (const { buffer, entry } of matched.values()) {
		const expectedHash = entry.sha256 ?? entry.hash;
		if (expectedHash && SHA256.test(expectedHash) && digest(buffer) !== expectedHash.toLowerCase()) errors.push(issue("POST_HASH_MISMATCH", `post ${entry.id} hash does not match manifest`, { path: entry.id }));
	}
	const counts = {
		manifestEntries: entries.length,
		uniqueManifestIds: byId.size,
		markdownFiles: markdown.length,
		legacyPosts: classifications.filter((item) => item.type === "legacy").length,
		notes: classifications.filter((item) => item.type === "note").length,
		posts: classifications.filter((item) => item.type === "post").length,
		unknown: classifications.filter((item) => item.type === "unknown").length,
	};
	if (!manifest.error) {
		if (counts.legacyPosts !== expectedCount) errors.push(issue("LEGACY_COUNT_MISMATCH", `expected ${expectedCount} legacy posts, found ${counts.legacyPosts}`));
		if (counts.notes < expectedNotes) errors.push(issue("NOTE_COUNT_MISMATCH", `expected at least ${expectedNotes} notes, found ${counts.notes}`));
		for (const slug of NOTE_SLUGS) {
			const categories = noteCategories.get(slug);
			if (!categories) errors.push(issue("NOTE_SLUG_MISSING", `baseline note ${slug} is missing`, { slug }));
			else if (!categories.includes(NOTE_CATEGORY)) errors.push(issue("NOTE_CATEGORY_MISMATCH", `baseline note ${slug} has category ${JSON.stringify(categories.find((value) => value) ?? "")}, expected ${JSON.stringify(NOTE_CATEGORY)}`, { slug }));
		}
		if (counts.unknown > 0) errors.push(issue("UNCLASSIFIED_POST", `found ${counts.unknown} unclassified Markdown posts`));
		for (const entry of entries) if (!matched.has(entry.id)) errors.push(issue("MISSING_POST", `manifest id ${entry.id} has no Markdown post`, { id: entry.id }));
	}
	const publicPaths = await scanForbidden(path.resolve(root, publicDir), "public", errors);
	const distPaths = await scanForbidden(path.resolve(root, "dist"), "dist", errors);
	const aliases = await checkAliases(path.resolve(root, "dist"), entries, errors);
	const assetHashes = await verifyHashes(root, errors);
	return {
		ok: errors.length === 0,
		errors,
		counts,
		classifications,
		checks: { manifestPath: path.relative(root, resolvedManifest).split(path.sep).join("/"), publicPaths, distPaths, aliases, assetHashes },
	};
}

const CLI_OPTIONS = {
	"repo-root": { type: "string", default: "." },
	manifest: { type: "string", default: DEFAULT_MANIFEST_PATH },
	"content-dir": { type: "string", default: "src/content/posts" },
	"public-dir": { type: "string", default: "public" },
	"expected-count": { type: "string", default: String(DEFAULT_EXPECTED_COUNT) },
	"expected-notes": { type: "string", default: String(DEFAULT_EXPECTED_NOTES) },
	json: { type: "boolean", default: false },
	help: { type: "boolean", short: "h", default: false },
};

function cliOptions(argv) {
	let values;
	try { ({ values } = parseArgs({ args: argv, options: CLI_OPTIONS, allowPositionals: false })); } catch (cause) { throw new LegacyAliasError("INVALID_ARGUMENT", cause.message, { cause }); }
	const expectedCount = Number(values["expected-count"]);
	const expectedNotes = Number(values["expected-notes"]);
	if (!Number.isInteger(expectedCount) || expectedCount < 0 || !Number.isInteger(expectedNotes) || expectedNotes < 0) throw new LegacyAliasError("INVALID_ARGUMENT", "counts must be non-negative integers");
	return { repoRoot: values["repo-root"], manifestPath: values.manifest, contentDir: values["content-dir"], publicDir: values["public-dir"], expectedCount, expectedNotes, json: values.json, help: values.help };
}

function printReport(report, json) {
	if (json) return console.log(JSON.stringify(report, null, 2));
	console.log(report.ok ? "Publishing validation passed." : "Publishing validation failed.");
	console.log(`manifest=${report.counts.manifestEntries} legacy=${report.counts.legacyPosts} notes=${report.counts.notes} unknown=${report.counts.unknown} markdown=${report.counts.markdownFiles}`);
	for (const error of report.errors) console.error(`- [${error.code}] ${error.message}`);
}

async function main() {
	const options = cliOptions(process.argv.slice(2));
	if (options.help) return console.log("Usage: node scripts/validate-publishing.mjs [--repo-root <dir>] [--json]");
	const report = await validatePublishing(options);
	printReport(report, options.json);
	if (!report.ok) process.exitCode = 1;
}

const cliUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === cliUrl) {
	main().catch((error) => {
		console.error(`[${error instanceof LegacyAliasError ? error.code : "UNEXPECTED"}] ${error.message}`);
		process.exitCode = 1;
	});
}
