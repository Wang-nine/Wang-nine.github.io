import { createHash } from "node:crypto";
import MarkdownIt from "markdown-it";

const NAMED_ENTITIES = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: "\u00a0",
};
const BACKSLASH_ESCAPE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;

export function createMarkdown() {
	return new MarkdownIt({ html: true, linkify: false, typographer: false });
}

export function sha256(value) {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

export function splitFrontmatter(source) {
	const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(source);
	if (!match) return { frontmatter: "", body: source, bodyStart: 0 };
	return {
		frontmatter: source.slice(0, match[0].length),
		body: source.slice(match[0].length),
		bodyStart: match[0].length,
	};
}

export function lineOf(source, offset) {
	let line = 1;
	for (let index = 0; index < offset; index++)
		if (source.charCodeAt(index) === 10) line++;
	return line;
}

export function decodeEntities(value) {
	return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body) => {
		if (body.startsWith("#")) {
			const code =
				body[1].toLowerCase() === "x"
					? Number.parseInt(body.slice(2), 16)
					: Number(body.slice(1));
			return Number.isInteger(code) && code > 0 && code <= 0x10ffff
				? String.fromCodePoint(code)
				: entity;
		}
		return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
	});
}

function unescapeMarkdown(value) {
	return value.replace(BACKSLASH_ESCAPE, "$1");
}

export function isRemoteUrl(value) {
	return /^(?:https?:)?\/\//i.test(value);
}

export function hostOf(value) {
	try {
		const parsed = new URL(/^\/\//.test(value) ? `https:${value}` : value);
		return parsed.hostname.toLowerCase();
	} catch {
		return null;
	}
}

export function scanInlineImages(content) {
	const images = [];
	let index = 0;
	while (index < content.length) {
		if (content[index] === "\\") {
			index += 2;
			continue;
		}
		if (content[index] === "`") {
			const run = countRun(content, index, "`");
			const close = findClosingRun(content, index + run, run);
			index = close === -1 ? index + run : close + run;
			continue;
		}
		if (content[index] === "!" && content[index + 1] === "[") {
			const parsed = parseImage(content, index);
			if (parsed) {
				images.push(parsed);
				index = parsed.end;
				continue;
			}
		}
		index++;
	}
	return images;
}

function countRun(value, start, char) {
	let end = start;
	while (value[end] === char) end++;
	return end - start;
}

function findClosingRun(value, start, length) {
	let index = start;
	while (index < value.length) {
		if (value[index] === "`") {
			const run = countRun(value, index, "`");
			if (run === length) return index;
			index += run;
			continue;
		}
		index++;
	}
	return -1;
}

function parseImage(content, start) {
	const altStart = start + 2;
	let depth = 1;
	let index = altStart;
	while (index < content.length) {
		if (content[index] === "\\") {
			index += 2;
			continue;
		}
		if (content[index] === "[") depth++;
		else if (content[index] === "]") {
			depth--;
			if (depth === 0) break;
		}
		index++;
	}
	if (index >= content.length || content[index + 1] !== "(") return null;
	const alt = content.slice(altStart, index);
	index += 2;
	while (index < content.length && /\s/.test(content[index])) index++;
	if (index >= content.length) return null;

	let destination;
	if (content[index] === "<") {
		const close = findUnescaped(content, ">", index + 1);
		if (close === -1) return null;
		destination = {
			raw: content.slice(index + 1, close),
			start: index + 1,
			end: close,
		};
		index = close + 1;
	} else {
		const destStart = index;
		let parens = 0;
		while (index < content.length) {
			const char = content[index];
			if (char === "\\") {
				index += 2;
				continue;
			}
			if (/\s/.test(char)) break;
			if (char === "(") parens++;
			if (char === ")") {
				if (parens === 0) break;
				parens--;
			}
			index++;
		}
		destination = {
			raw: content.slice(destStart, index),
			start: destStart,
			end: index,
		};
	}

	while (index < content.length && /\s/.test(content[index])) index++;
	if (index < content.length && ['"', "'", "("].includes(content[index])) {
		const opener = content[index];
		const closer = opener === "(" ? ")" : opener;
		const close = findUnescaped(content, closer, index + 1);
		if (close === -1) return null;
		index = close + 1;
		while (index < content.length && /\s/.test(content[index])) index++;
	}
	if (content[index] !== ")") return null;

	return {
		start,
		end: index + 1,
		alt,
		url: unescapeMarkdown(decodeEntities(destination.raw)),
		destinationStart: destination.start,
		destinationEnd: destination.end,
		markup: content.slice(start, index + 1),
	};
}

function findUnescaped(value, char, start) {
	let index = start;
	while (index < value.length) {
		if (value[index] === "\\") {
			index += 2;
			continue;
		}
		if (value[index] === char) return index;
		index++;
	}
	return -1;
}

function lineStarts(value) {
	const starts = [0];
	for (let index = 0; index < value.length; index++)
		if (value.charCodeAt(index) === 10) starts.push(index + 1);
	return starts;
}

function locateContent(source, content, regionStart, regionEnd) {
	let found = -1;
	let index = source.indexOf(content, regionStart);
	while (index !== -1 && index + content.length <= regionEnd) {
		if (found !== -1) return null;
		found = index;
		index = source.indexOf(content, index + 1);
	}
	return found;
}

export function scanDocument(source, options = {}) {
	const markdown = options.markdown ?? createMarkdown();
	const { body, bodyStart } = splitFrontmatter(source);
	const starts = lineStarts(body);
	const tokens = markdown.parse(body, {});
	const images = [];
	const codeBlocks = [];
	const inlineCodeTexts = [];
	const linkTargets = [];
	const issues = [];

	for (const token of tokens) {
		if (token.type === "fence" || token.type === "code_block") {
			const start = bodyStart + starts[token.map[0]];
			const end =
				token.map[1] < starts.length
					? bodyStart + starts[token.map[1]]
					: bodyStart + body.length;
			codeBlocks.push({
				start,
				end,
				text: token.content,
				line: token.map[0] + 1,
			});
		}
	}

	for (const token of tokens) {
		if (token.type !== "inline" || !token.children) continue;
		const hasMap = Array.isArray(token.map);
		const regionStart = hasMap ? bodyStart + starts[token.map[0]] : bodyStart;
		const regionEnd =
			hasMap && token.map[1] < starts.length
				? bodyStart + starts[token.map[1]]
				: bodyStart + body.length;
		const contentStart = locateContent(
			source,
			token.content,
			regionStart,
			regionEnd,
		);
		if (
			contentStart === null &&
			token.children.some((child) => child.type === "image")
		) {
			issues.push(
				`inline content is not uniquely locatable near ${hasMap ? `line ${token.map[0] + 1}` : "an inline token without a map"}`,
			);
		}
		const spans = contentStart === null ? [] : scanInlineImages(token.content);
		const used = new Set();
		for (const child of token.children) {
			if (child.type === "code_inline") inlineCodeTexts.push(child.content);
			if (child.type === "link_open")
				linkTargets.push(child.attrGet("href") ?? "");
			if (child.type !== "image") continue;
			const url = child.attrGet("src") ?? "";
			let span = null;
			if (contentStart !== null) {
				const spanIndex = spans.findIndex(
					(candidate, candidateIndex) =>
						!used.has(candidateIndex) && candidate.url === url,
				);
				if (spanIndex !== -1) {
					used.add(spanIndex);
					span = spans[spanIndex];
				}
			}
			images.push({
				url,
				alt: child.content,
				title: child.attrGet("title") ?? "",
				line: span
					? lineOf(source, contentStart + span.start)
					: hasMap
						? token.map[0] + 1
						: 0,
				start: span ? contentStart + span.start : null,
				end: span ? contentStart + span.end : null,
				urlStart: span ? contentStart + span.destinationStart : null,
				urlEnd: span ? contentStart + span.destinationEnd : null,
				markup: span?.markup ?? null,
			});
		}
	}

	return {
		bodyStart,
		body,
		images,
		codeBlocks,
		inlineCodeTexts,
		linkTargets,
		issues,
	};
}

export function findRawOccurrences(source, urls) {
	const found = [];
	for (const url of urls) {
		if (!url) continue;
		let index = 0;
		while (index <= source.length - url.length) {
			index = source.indexOf(url, index);
			if (index === -1) break;
			found.push({
				url,
				start: index,
				end: index + url.length,
				line: lineOf(source, index),
			});
			index += 1;
		}
	}
	return found.sort(
		(left, right) =>
			left.start - right.start || left.url.localeCompare(right.url),
	);
}
