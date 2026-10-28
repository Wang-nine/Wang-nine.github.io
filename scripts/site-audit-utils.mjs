import { readdir } from "node:fs/promises";
import path from "node:path";

export const MARKDOWN = new Set([".md", ".mdx"]);

const TAG = /<(?!\/|!)([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

export function decodeEntities(value) {
	return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body) => {
		if (body.startsWith("#")) {
			const code = body[1].toLowerCase() === "x" ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
			return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
		}
		return NAMED[body.toLowerCase()] ?? entity;
	});
}

function attributes(tagText) {
	const found = {};
	for (const match of (/^<\s*[^\s/>]+([\s\S]*?)\/?>$/.exec(tagText)?.[1] ?? "").matchAll(ATTR)) found[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
	return found;
}

// Conservative href/src scanner, not a full HTML parser: srcset and CSS url() targets are out of scope.
export function extractUrlAttributes(html) {
	const clean = html.replace(/<!--[\s\S]*?-->/g, "").replace(/(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2>)/gi, "$1$3");
	const found = [];
	for (const match of clean.matchAll(TAG)) {
		const attrs = attributes(match[0]);
		for (const name of ["href", "src"]) if (Object.hasOwn(attrs, name)) found.push({ tag: match[1].toLowerCase(), name, value: attrs[name] });
	}
	return found;
}

export function tagAttributes(html, name, accept) {
	for (const match of html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))) {
		const attrs = attributes(match[0]);
		if (accept(attrs)) return attrs;
	}
}

export function resolveReference(value, base) {
	const raw = value.trim();
	if (!raw || raw.startsWith("#") || raw.startsWith("?")) return null;
	if (raw.startsWith("//")) {
		try { return { external: new URL(`https:${raw}`) }; } catch { return { unsupported: raw }; }
	}
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
		let url;
		try { url = new URL(raw); } catch { return { unsupported: raw }; }
		if (url.protocol === "http:" || url.protocol === "https:") return { external: url };
		if (["data:", "javascript:", "mailto:", "tel:"].includes(url.protocol)) return null;
		return { unsupported: raw };
	}
	try {
		const url = new URL(raw, `https://audit.invalid${base}`);
		return { pathname: decodeURIComponent(url.pathname), search: url.search };
	} catch { return { unsupported: raw }; }
}

export function urlPath(value, base) {
	try { return decodeURIComponent(new URL(value, base).pathname); } catch { return null; }
}

export const originOf = (value) => {
	try { return new URL(value).origin; } catch { return null; }
};

export function xmlValue(value) {
	return decodeEntities(value.replace(/^<!\[CDATA\[|\]\]>$/g, "")).trim();
}

export function categoryValues(html) {
	const values = [];
	for (const ref of extractUrlAttributes(html)) {
		if (ref.name !== "href") continue;
		const target = resolveReference(ref.value, "/");
		if (!target || target.unsupported || target.external || target.pathname !== "/archive/") continue;
		const category = new URLSearchParams(target.search).get("category");
		if (category) values.push(category);
	}
	return values;
}

function unquote(value) {
	const quoted = value.length >= 2 && ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"));
	return quoted ? value.slice(1, -1) : value;
}

export function parseFrontmatter(text) {
	if (!text.startsWith("---")) return { data: {}, body: text };
	const end = text.indexOf("\n---", 3);
	if (end === -1) return { data: {}, body: text };
	const data = {};
	for (const line of text.slice(3, end).split(/\r?\n/)) {
		const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (match) data[match[1]] = unquote(match[2].trim());
	}
	return { data, body: text.slice(end + 4) };
}

function textField(data, field) {
	const value = data[field];
	return typeof value === "string" ? value.trim() : "";
}

export function authoredPost(data) {
	const title = textField(data, "title");
	const category = textField(data, "category");
	const slug = textField(data, "slug");
	if (!title || !category || !slug || category.toLowerCase() === "null") return null;
	return { title, category, slug };
}

export function isDraft(data) {
	return textField(data, "draft").toLowerCase() === "true";
}

export function legacyEntry(relativePath, data, byId, bySlug) {
	const basename = path.basename(relativePath, path.extname(relativePath));
	const candidates = [data.legacyId, data.legacy_id, data.id, data.slug, basename, relativePath.replace(/\.(md|mdx)$/i, "")].filter((value) => typeof value === "string" && value.length > 0);
	for (const candidate of candidates) {
		const entry = byId.get(candidate) ?? bySlug.get(candidate);
		if (entry) return entry;
	}
	return null;
}

export async function walkFiles(root) {
	const entries = await readdir(root, { recursive: true, withFileTypes: true });
	return entries.filter((entry) => entry.isFile() || entry.isSymbolicLink()).map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}
