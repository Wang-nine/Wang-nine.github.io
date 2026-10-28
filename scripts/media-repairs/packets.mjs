import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
	createMarkdown,
	hostOf,
	isRemoteUrl,
	scanDocument,
	sha256,
} from "./markdown.mjs";

export const PACKET_GROUPS = [
	"java-ssm",
	"mysql",
	"redis",
	"springcloud-tools",
];
export const OPTIONAL_PACKET_GROUPS = ["supplemental"];
export const OLD_HOST = "wang-nine.cn";
export const FORBIDDEN_PHRASES = [
	"缺图",
	"待补",
	"原图失效",
	"图片缺失",
	"图缺失",
	"暂无图片",
	"图片待补",
	"补图",
	"placeholder",
	"missing image",
	"image missing",
	"image unavailable",
	"coming soon",
	"todo",
	"tbd",
];
const MAPPING_KEYS = ["assets", "basis", "kind", "replacementMarkdown", "url"];
const OPTIONAL_MAPPING_KEYS = new Set(["precedingText"]);
const ASSET_EXTENSIONS = new Set([
	".svg",
	".png",
	".jpg",
	".jpeg",
	".webp",
	".gif",
]);

function issue(code, message, detail = {}) {
	return { code, message, detail };
}

export function normalizeAssetPath(value, options) {
	const { root, group, requireRootRelative = false } = options;
	if (typeof value !== "string" || !value.trim())
		throw new Error("asset path must be a non-empty string");
	const raw = value.trim();
	if (raw.includes("\0")) throw new Error("asset path contains a NUL byte");
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//"))
		throw new Error("asset path must be local");
	if (raw.includes("?") || raw.includes("#"))
		throw new Error("asset path must not contain a query or fragment");
	const slash = raw.replace(/\\/g, "/");
	if (requireRootRelative && !slash.startsWith("/"))
		throw new Error(
			"replacement image src must be root-relative (/article-diagrams/<group>/...)",
		);
	let relative;
	if (slash.startsWith("/")) relative = slash.slice(1);
	else if (slash.startsWith("public/"))
		relative = slash.slice("public/".length);
	else relative = slash;
	let decoded;
	try {
		decoded = decodeURIComponent(relative);
	} catch {
		throw new Error("asset path has invalid percent encoding");
	}
	if (decoded.split("/").includes("..") || decoded.startsWith("/"))
		throw new Error("asset path traversal is not allowed");
	const normalized = path.posix.normalize(decoded);
	if (
		normalized === ".." ||
		normalized.startsWith("../") ||
		path.posix.isAbsolute(normalized)
	)
		throw new Error("asset path traversal is not allowed");
	const prefix = `article-diagrams/${group}/`;
	if (!normalized.startsWith(prefix) || normalized.length === prefix.length)
		throw new Error(
			`asset path must be under public/article-diagrams/${group}/`,
		);
	const filePath = path.resolve(root, "public", normalized);
	const groupRoot = path.resolve(root, "public", `article-diagrams/${group}`);
	if (filePath !== groupRoot && !filePath.startsWith(groupRoot + path.sep))
		throw new Error("asset path escapes its group directory");
	return { raw, relative: normalized, publicUrl: `/${normalized}`, filePath };
}

function validateSvg(text) {
	const errors = [];
	if (/<script\b/i.test(text)) errors.push("SVG must not contain <script>");
	if (/<(?:iframe|object|embed|foreignObject)\b/i.test(text))
		errors.push("SVG must not contain embedded external content");
	if (/\son[a-z]+\s*=/i.test(text))
		errors.push("SVG must not contain event handler attributes");
	if (/javascript:/i.test(text))
		errors.push("SVG must not contain javascript: URLs");
	if (/<!ENTITY/i.test(text)) errors.push("SVG must not declare entities");
	if (/\b(?:href|xlink:href)\s*=\s*["']\s*(?:https?:)?\/\//i.test(text))
		errors.push("SVG must not reference external URLs");
	if (/url\(\s*["']?\s*(?:https?:)?\/\//i.test(text))
		errors.push("SVG must not reference external CSS URLs");
	const stripped = text
		.replace(/^\uFEFF/, "")
		.replace(/<\?xml[\s\S]*?\?>/gi, "")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<!DOCTYPE[\s\S]*?>/gi, "")
		.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
		.trim();
	if (!/^<svg\b/i.test(stripped)) errors.push("SVG must start with <svg>");
	if (!/<\/svg>\s*$/i.test(stripped)) errors.push("SVG must end with </svg>");
	const stack = [];
	const tags = /<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;
	for (const match of stripped.matchAll(tags)) {
		if (match[1]) {
			const open = stack.pop();
			if (open !== match[2])
				errors.push(`SVG has mismatched closing tag </${match[2]}>`);
		} else if (!match[4]) stack.push(match[2]);
	}
	if (stack.length) errors.push(`SVG has unclosed tag <${stack.at(-1)}>`);
	return errors;
}

function validateRaster(filePath, extension) {
	const buffer = readFileSync(filePath);
	const ascii = buffer.subarray(0, 12).toString("latin1");
	if (
		extension === ".png" &&
		!buffer
			.subarray(0, 8)
			.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
	)
		return ["PNG signature is invalid"];
	if (extension === ".jpg" || extension === ".jpeg") {
		if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff)
			return ["JPEG signature is invalid"];
	}
	if (extension === ".gif" && !/^GIF8[79]a/.test(ascii))
		return ["GIF signature is invalid"];
	if (
		extension === ".webp" &&
		!(ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP")
	)
		return ["WEBP signature is invalid"];
	return [];
}

export function validateAsset(asset, options) {
	const normalized = normalizeAssetPath(asset, options);
	if (!existsSync(normalized.filePath))
		throw new Error(`asset does not exist: ${normalized.relative}`);
	const stat = statSync(normalized.filePath);
	if (!stat.isFile())
		throw new Error(`asset is not a file: ${normalized.relative}`);
	if (stat.size === 0)
		throw new Error(`asset is empty: ${normalized.relative}`);
	const extension = path.extname(normalized.filePath).toLowerCase();
	if (!ASSET_EXTENSIONS.has(extension))
		throw new Error(`unsupported asset extension: ${extension}`);
	const assetIssues =
		extension === ".svg"
			? validateSvg(readFileSync(normalized.filePath, "utf8"))
			: validateRaster(normalized.filePath, extension);
	if (assetIssues.length)
		throw new Error(`${normalized.relative}: ${assetIssues.join("; ")}`);
	return {
		...normalized,
		extension,
		bytes: stat.size,
		sha256: sha256(readFileSync(normalized.filePath)),
	};
}

function validateReplacement(mapping, group, root, markdown) {
	const errors = [];
	const text = mapping.replacementMarkdown;
	if (typeof text !== "string" || !text.trim())
		return [
			issue("empty-replacement", "replacementMarkdown must be non-empty"),
		];
	if (/https?:\/\//i.test(text) || /(^|[\s("'=])\/\//.test(text))
		errors.push(
			issue(
				"external-url",
				"replacementMarkdown must not contain external URLs",
			),
		);
	if (
		/<script\b/i.test(text) ||
		/javascript:/i.test(text) ||
		/\son[a-z]+\s*=/i.test(text)
	)
		errors.push(
			issue(
				"unsafe-markup",
				"replacementMarkdown must not contain scripts, javascript: URLs, or event handlers",
			),
		);
	const lower = text.toLowerCase();
	for (const phrase of FORBIDDEN_PHRASES) {
		if (lower.includes(phrase.toLowerCase()))
			errors.push(
				issue(
					"forbidden-placeholder",
					`replacementMarkdown contains forbidden placeholder wording: ${phrase}`,
				),
			);
	}
	const normalizedAssets = new Map();
	for (const asset of mapping.assets ?? []) {
		try {
			const normalized = normalizeAssetPath(asset, { root, group });
			normalizedAssets.set(normalized.relative, normalized);
		} catch {
			// Asset validation reports the concrete error separately.
		}
	}
	const scan = scanDocument(text, { markdown });
	if (scan.issues.length)
		errors.push(
			issue(
				"replacement-parse",
				`replacementMarkdown could not be parsed safely: ${scan.issues.join("; ")}`,
			),
		);
	const referenced = [];
	for (const image of scan.images) {
		if (!image.url.startsWith("/article-diagrams/")) {
			errors.push(
				issue(
					"replacement-image-path",
					`replacement image must use /article-diagrams/${group}/...: ${image.url}`,
				),
			);
			continue;
		}
		try {
			const normalized = normalizeAssetPath(image.url, {
				root,
				group,
				requireRootRelative: true,
			});
			referenced.push(normalized.relative);
			if (!normalizedAssets.has(normalized.relative))
				errors.push(
					issue(
						"unlisted-asset",
						`replacement references an asset not listed in assets: ${normalized.relative}`,
					),
				);
		} catch (error) {
			errors.push(issue("replacement-image-path", error.message));
		}
	}
	for (const asset of normalizedAssets.keys())
		if (!referenced.includes(asset))
			errors.push(
				issue(
					"unused-asset",
					`listed asset is not referenced by replacementMarkdown: ${asset}`,
				),
			);
	if (mapping.kind === "diagram" && referenced.length === 0)
		errors.push(
			issue(
				"diagram-without-image",
				"kind=diagram requires at least one local image in replacementMarkdown",
			),
		);
	return errors;
}

function validateMapping(raw, context) {
	const { root, group, markdown, allowedUrls } = context;
	const errors = [];
	if (!raw || typeof raw !== "object" || Array.isArray(raw))
		return { errors: [issue("mapping-shape", "mapping must be an object")] };
	const keys = Object.keys(raw);
	const allowedKeys = new Set([...MAPPING_KEYS, ...OPTIONAL_MAPPING_KEYS]);
	for (const key of keys)
		if (!allowedKeys.has(key))
			errors.push(issue("mapping-keys", `unexpected mapping key: ${key}`));
	for (const key of MAPPING_KEYS)
		if (!keys.includes(key))
			errors.push(issue("mapping-keys", `missing mapping key: ${key}`));
	if (
		Object.hasOwn(raw, "precedingText") &&
		(typeof raw.precedingText !== "string" || raw.precedingText.length === 0)
	)
		errors.push(
			issue(
				"mapping-preceding-text",
				"precedingText must be a non-empty string when present",
			),
		);
	const url = raw.url;
	if (typeof url !== "string" || !url || url.trim() !== url)
		errors.push(issue("mapping-url", "url must be a non-empty exact string"));
	if (typeof url === "string" && !allowedUrls.has(url))
		errors.push(
			issue(
				"unexpected-url",
				`url is not an active unresolved legacy image: ${url}`,
			),
		);
	if (raw.kind !== "diagram" && raw.kind !== "text")
		errors.push(issue("mapping-kind", "kind must be diagram or text"));
	if (typeof raw.basis !== "string" || !raw.basis.trim())
		errors.push(issue("mapping-basis", "basis must be a non-empty string"));
	if (!Array.isArray(raw.assets))
		errors.push(issue("mapping-assets", "assets must be an array"));
	const assets = Array.isArray(raw.assets) ? raw.assets : [];
	const seenAssets = new Set();
	const validatedAssets = [];
	for (const asset of assets) {
		try {
			const validated = validateAsset(asset, { root, group });
			if (seenAssets.has(validated.relative))
				errors.push(
					issue(
						"duplicate-asset",
						`duplicate asset in mapping: ${validated.relative}`,
					),
				);
			seenAssets.add(validated.relative);
			validatedAssets.push(validated);
		} catch (error) {
			errors.push(issue("asset", error.message, { asset }));
		}
	}
	if (typeof raw.replacementMarkdown === "string")
		errors.push(
			...validateReplacement({ ...raw, assets }, group, root, markdown),
		);
	if (errors.length) return { errors };
	return {
		mapping: {
			url,
			kind: raw.kind,
			replacementMarkdown: raw.replacementMarkdown,
			assets: validatedAssets,
			basis: raw.basis.trim(),
			precedingText: raw.precedingText,
			group,
			file: `${group}.json`,
		},
	};
}

export function validatePackets(options) {
	const {
		root,
		packetDir = path.join(root, "migration", "media-repairs"),
		groups = PACKET_GROUPS,
		optionalGroups = OPTIONAL_PACKET_GROUPS,
		manifestUrls,
		supplementalUrls = new Set(),
		markdown = createMarkdown(),
	} = options;
	const requiredUrls = new Set([...manifestUrls, ...supplementalUrls]);
	const allowedUrls = new Set(requiredUrls);
	const files = [];
	const mappings = new Map();
	const duplicateUrls = [];
	const errors = [];
	const warnings = [];
	const assetOwners = new Map();

	for (const group of [...groups, ...optionalGroups]) {
		const filePath = path.join(packetDir, `${group}.json`);
		const file = {
			group,
			file: `${group}.json`,
			path: filePath,
			required: groups.includes(group),
			exists: existsSync(filePath),
			valid: false,
			count: 0,
			error: "",
		};
		files.push(file);
		if (!file.exists) continue;
		let parsed;
		try {
			parsed = JSON.parse(readFileSync(filePath, "utf8"));
		} catch (error) {
			file.error = `invalid JSON: ${error.message}`;
			errors.push(issue("packet-json", `${group}.json: ${file.error}`));
			continue;
		}
		if (!Array.isArray(parsed)) {
			file.error = "packet must be a JSON array";
			errors.push(issue("packet-shape", `${group}.json: ${file.error}`));
			continue;
		}
		file.valid = true;
		for (const [index, raw] of parsed.entries()) {
			const result = validateMapping(raw, {
				root,
				group,
				markdown,
				allowedUrls,
			});
			if (result.errors?.length) {
				file.valid = false;
				for (const error of result.errors)
					errors.push({
						...error,
						detail: { ...error.detail, group, file: `${group}.json`, index },
					});
				continue;
			}
			const mapping = result.mapping;
			if (mappings.has(mapping.url)) {
				duplicateUrls.push(mapping.url);
				errors.push(
					issue("duplicate-url", `duplicate mapping for ${mapping.url}`, {
						group,
						file: `${group}.json`,
						index,
					}),
				);
				continue;
			}
			for (const asset of mapping.assets) {
				if (assetOwners.has(asset.relative))
					warnings.push(`asset reused by multiple mappings: ${asset.relative}`);
				else assetOwners.set(asset.relative, mapping.url);
			}
			mappings.set(mapping.url, mapping);
			file.count++;
		}
	}

	const missingFiles = files
		.filter((file) => file.required && !file.exists)
		.map((file) => file.file);
	const missingUrls = [...requiredUrls]
		.filter((url) => !mappings.has(url))
		.sort();
	const extraUrls = [...mappings.keys()]
		.filter((url) => !allowedUrls.has(url))
		.sort();
	const mappedManifestUrls = [...manifestUrls].filter((url) =>
		mappings.has(url),
	);
	const mappedSupplementalUrls = [...supplementalUrls].filter((url) =>
		mappings.has(url),
	);
	const ready =
		missingFiles.length === 0 &&
		errors.length === 0 &&
		missingUrls.length === 0 &&
		extraUrls.length === 0;
	return {
		directory: packetDir,
		groups,
		optionalGroups,
		files,
		mappings,
		mappingList: [...mappings.values()].sort((left, right) =>
			left.url.localeCompare(right.url),
		),
		duplicateUrls: [...new Set(duplicateUrls)].sort(),
		missingFiles,
		missingUrls,
		extraUrls,
		errors,
		warnings: [...new Set(warnings)],
		requiredUrls,
		manifestUrls,
		supplementalUrls,
		ready,
		counts: {
			requiredUnique: requiredUrls.size,
			mappedUnique: mappings.size,
			mappedManifestUnique: mappedManifestUrls.length,
			mappedSupplementalUnique: mappedSupplementalUrls.length,
			manifestUnique: manifestUrls.size,
			supplementalUnique: supplementalUrls.size,
		},
	};
}

export function isOldSourceUrl(url) {
	const host = hostOf(url);
	return host === OLD_HOST || Boolean(host?.endsWith(`.${OLD_HOST}`));
}

export function isRemoteImageUrl(url) {
	return isRemoteUrl(url);
}
