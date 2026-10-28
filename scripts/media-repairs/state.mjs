import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
	createMarkdown,
	findRawOccurrences,
	hostOf,
	isRemoteUrl,
	scanDocument,
	sha256,
	splitFrontmatter,
} from "./markdown.mjs";
import { isOldSourceUrl } from "./packets.mjs";

const LEGACY_DIR = path.join("src", "content", "posts", "legacy");
const RAW_URL = /(?:https?:)?\/\/[^\s"'<>()[\]{}`]+/gi;

function addError(errors, code, message, detail = {}) {
	errors.push({ code, message, detail });
}

function postId(value) {
	return String(value);
}

function countBy(values) {
	const counts = new Map();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return counts;
}

function ensureWithin(root, target, label) {
	const relative = path.relative(root, target);
	if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
		throw new Error(`${label} escapes the repository root: ${target}`);
	return relative;
}

function contextFor(source, occurrence) {
	const lines = source.split(/\r?\n/);
	const line = lines[occurrence.line - 1] ?? "";
	return line.trim().slice(0, 240);
}

function oldHostUrlsIn(source) {
	const urls = new Set();
	for (const match of source.matchAll(RAW_URL))
		if (isOldSourceUrl(match[0])) urls.add(match[0]);
	return urls;
}

export function loadLegacyState(options = {}) {
	const root = options.root ?? process.cwd();
	const markdown = options.markdown ?? createMarkdown();
	const manifestPath = path.join(root, "migration", "legacy-posts.json");
	const auditPath = path.join(root, "migration", "legacy-audit.json");
	const errors = [];
	const warnings = [];
	if (!existsSync(manifestPath))
		throw new Error(`missing migration manifest: ${manifestPath}`);
	const manifestText = readFileSync(manifestPath, "utf8");
	let manifest;
	try {
		manifest = JSON.parse(manifestText);
	} catch (error) {
		throw new Error(`invalid migration manifest: ${error.message}`);
	}
	if (!Array.isArray(manifest))
		throw new Error("migration manifest must be an array");

	let audit = null;
	if (existsSync(auditPath)) {
		try {
			audit = JSON.parse(readFileSync(auditPath, "utf8"));
		} catch (error) {
			warnings.push(`legacy audit is not readable as JSON: ${error.message}`);
		}
	} else
		warnings.push(
			"legacy audit is missing; pre-repair audit evidence is unavailable",
		);

	const posts = [];
	const manifestUrls = new Set();
	const manifestByPost = new Map();
	const allImages = [];
	const allCodeBlocks = [];
	const allInlineCodeTexts = [];
	const allLinkTargets = [];
	let manifestOccurrences = 0;

	for (const [postIndex, entry] of manifest.entries()) {
		const id = postId(entry.id);
		const markdownPath = entry.markdownPath;
		if (typeof markdownPath !== "string" || !markdownPath) {
			addError(
				errors,
				"manifest-post",
				`manifest entry ${id} has no markdownPath`,
			);
			continue;
		}
		const absolutePath = path.resolve(root, markdownPath);
		let relativePath;
		try {
			relativePath = ensureWithin(root, absolutePath, `markdownPath for ${id}`);
		} catch (error) {
			addError(errors, "manifest-path", error.message);
			continue;
		}
		if (
			!relativePath
				.split(path.sep)
				.join("/")
				.startsWith(`${LEGACY_DIR.split(path.sep).join("/")}/`)
		) {
			addError(
				errors,
				"manifest-path",
				`markdownPath for ${id} is outside ${LEGACY_DIR}`,
			);
			continue;
		}
		if (!existsSync(absolutePath)) {
			addError(
				errors,
				"missing-markdown",
				`missing legacy markdown for ${id}: ${relativePath}`,
			);
			continue;
		}
		const source = readFileSync(absolutePath, "utf8");
		const { body, bodyStart } = splitFrontmatter(source);
		const expected = countBy(
			(entry.unresolvedAssets ?? [])
				.map((asset) => asset?.url)
				.filter((url) => typeof url === "string" && url),
		);
		let scan;
		try {
			scan = scanDocument(source, { markdown });
		} catch (error) {
			addError(errors, "markdown-scan", `${id}: ${error.message}`);
			scan = {
				bodyStart,
				body,
				images: [],
				codeBlocks: [],
				inlineCodeTexts: [],
				linkTargets: [],
				issues: [],
			};
		}
		for (const issue of scan.issues)
			addError(errors, "markdown-scan", `${id}: ${issue}`);
		const actual = countBy(scan.images.map((image) => image.url));
		for (const [url, expectedCount] of expected) {
			const actualCount = actual.get(url) ?? 0;
			if (actualCount !== expectedCount)
				addError(
					errors,
					"manifest-parity",
					`${id}: expected ${expectedCount} active image(s) for ${url}, found ${actualCount}`,
					{ postId: id, url, expectedCount, actualCount },
				);
			if (!manifestByPost.has(id)) manifestByPost.set(id, new Set());
			manifestByPost.get(id).add(url);
			manifestUrls.add(url);
			manifestOccurrences += expectedCount;
		}
		const oldHostUrls = oldHostUrlsIn(source);
		const postImages = scan.images.map((image) => ({
			...image,
			postId: id,
			postPath: relativePath,
			postIndex,
		}));
		for (const image of postImages) {
			if (manifestUrls.has(image.url) && image.start === null)
				addError(
					errors,
					"image-span",
					`${id}: could not locate exact source span for ${image.url}`,
				);
			allImages.push(image);
		}
		const protectedOccurrences = [];
		for (const occurrence of findRawOccurrences(source, [...oldHostUrls])) {
			const containing = postImages.find(
				(image) =>
					image.urlStart !== null &&
					occurrence.start >= image.urlStart &&
					occurrence.end <= image.urlEnd,
			);
			if (containing) continue;
			const inCode = scan.codeBlocks.some(
				(block) =>
					occurrence.start >= block.start && occurrence.end <= block.end,
			);
			protectedOccurrences.push({
				postId: id,
				url: occurrence.url,
				line: occurrence.line,
				kind:
					occurrence.start < bodyStart
						? "frontmatter"
						: inCode
							? "code"
							: "non-image",
				context: contextFor(source, occurrence),
			});
		}
		posts.push({
			id,
			postIndex,
			markdownPath: relativePath,
			absolutePath,
			source,
			body,
			bodyStart,
			expected,
			images: postImages,
			codeBlocks: scan.codeBlocks,
			inlineCodeTexts: scan.inlineCodeTexts,
			linkTargets: scan.linkTargets,
			protectedOccurrences,
			baselineSourceSha256: sha256(source),
			baselineBodySha256: sha256(body),
			baselineBytes: Buffer.byteLength(source, "utf8"),
			bodyBytes: Buffer.byteLength(body, "utf8"),
		});
		allCodeBlocks.push(
			...scan.codeBlocks.map((block) => ({ ...block, postId: id })),
		);
		allInlineCodeTexts.push(...scan.inlineCodeTexts);
		allLinkTargets.push(...scan.linkTargets);
	}

	const markdownDir = path.join(root, LEGACY_DIR);
	if (existsSync(markdownDir)) {
		const files = readdirSync(markdownDir)
			.filter((file) => file.endsWith(".md"))
			.sort();
		const manifested = new Set(
			posts.map((post) => path.basename(post.markdownPath)),
		);
		for (const file of files)
			if (!manifested.has(file))
				addError(
					errors,
					"extra-markdown",
					`legacy markdown is not in the manifest: ${file}`,
				);
		for (const file of manifested)
			if (!files.includes(file))
				addError(
					errors,
					"missing-markdown",
					`manifest markdown is absent: ${file}`,
				);
	}

	const manifestImageCounts = countBy(
		allImages
			.filter((image) => manifestUrls.has(image.url))
			.map((image) => image.url),
	);
	for (const [url, expectedCount] of countBy(
		manifest
			.flatMap((entry) =>
				(entry.unresolvedAssets ?? []).map((asset) => asset?.url),
			)
			.filter((url) => typeof url === "string" && url),
	)) {
		const actualCount = manifestImageCounts.get(url) ?? 0;
		if (actualCount !== expectedCount)
			addError(
				errors,
				"manifest-total",
				`manifest expects ${expectedCount} occurrence(s) of ${url}, found ${actualCount}`,
			);
	}

	const supplementalOldHost = allImages.filter(
		(image) =>
			!manifestUrls.has(image.url) &&
			isRemoteUrl(image.url) &&
			isOldSourceUrl(image.url),
	);
	const supplementalOldHostUrls = new Set(
		supplementalOldHost.map((image) => image.url),
	);
	const preservedExternal = allImages.filter(
		(image) =>
			!manifestUrls.has(image.url) &&
			isRemoteUrl(image.url) &&
			!isOldSourceUrl(image.url),
	);
	const protectedOldHost = posts.flatMap((post) => post.protectedOccurrences);
	const auditPass = Array.isArray(audit)
		? audit.filter((item) => item?.status === "pass").length
		: 0;
	const counts = {
		legacyMarkdownFiles: existsSync(markdownDir)
			? readdirSync(markdownDir).filter((file) => file.endsWith(".md")).length
			: 0,
		manifestPosts: manifest.length,
		auditTotal: Array.isArray(audit) ? audit.length : 0,
		auditPass,
		manifestUnique: manifestUrls.size,
		manifestOccurrences,
		activeRemoteOccurrences: allImages.filter((image) => isRemoteUrl(image.url))
			.length,
		activeRemoteUnique: new Set(
			allImages
				.filter((image) => isRemoteUrl(image.url))
				.map((image) => image.url),
		).size,
		supplementalOldHostUnique: supplementalOldHostUrls.size,
		supplementalOldHostOccurrences: supplementalOldHost.length,
		preservedExternalUnique: new Set(
			preservedExternal.map((image) => image.url),
		).size,
		preservedExternalOccurrences: preservedExternal.length,
		protectedOldHostOccurrences: protectedOldHost.length,
		codeBlocks: allCodeBlocks.length,
	};
	if (
		counts.auditTotal !== counts.manifestPosts ||
		counts.auditPass !== counts.auditTotal
	)
		warnings.push(
			`legacy audit is ${counts.auditPass}/${counts.auditTotal}; manifest has ${counts.manifestPosts} posts`,
		);
	if (counts.legacyMarkdownFiles !== counts.manifestPosts)
		warnings.push(
			`legacy directory has ${counts.legacyMarkdownFiles} markdown files; manifest has ${counts.manifestPosts}`,
		);
	if (preservedExternal.length)
		warnings.push(
			`${preservedExternal.length} active external image(s) are not from the old source and will be preserved`,
		);

	return {
		root,
		manifestPath,
		manifestText,
		manifestSha256: sha256(manifestText),
		auditPath,
		auditText: audit ? readFileSync(auditPath, "utf8") : "",
		auditSha256: audit ? sha256(readFileSync(auditPath, "utf8")) : "",
		audit,
		posts,
		manifestUrls,
		manifestByPost,
		images: allImages,
		supplementalOldHost,
		supplementalOldHostUrls,
		preservedExternal,
		protectedOldHost,
		codeBlocks: allCodeBlocks,
		inlineCodeTexts: allInlineCodeTexts,
		linkTargets: allLinkTargets,
		errors,
		warnings,
		counts,
		hostCounts: countBy(allImages.map((image) => hostOf(image.url) ?? "local")),
	};
}
