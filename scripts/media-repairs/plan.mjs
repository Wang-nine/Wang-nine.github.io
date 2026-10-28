import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import {
	findRawOccurrences,
	lineOf,
	scanDocument,
	sha256,
	splitFrontmatter,
} from "./markdown.mjs";
import { isOldSourceUrl } from "./packets.mjs";

function addError(errors, code, message, detail = {}) {
	errors.push({ code, message, detail });
}

function countBy(values) {
	const counts = new Map();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return counts;
}

function isSubsequence(original, after) {
	let index = 0;
	for (const value of after) {
		if (index < original.length && value === original[index]) index++;
	}
	return index === original.length;
}

export function writeFileAtomic(filePath, content) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	writeFileSync(temporary, content, "utf8");
	try {
		renameSync(temporary, filePath);
	} catch (error) {
		rmSync(temporary, { force: true });
		throw error;
	}
}

export function loadAppliedReport(root) {
	const reportPath = path.join(root, "migration", "media-repair-report.json");
	if (!existsSync(reportPath)) return { report: null, path: reportPath };
	try {
		return {
			report: JSON.parse(readFileSync(reportPath, "utf8")),
			path: reportPath,
		};
	} catch (error) {
		return {
			report: null,
			path: reportPath,
			error: `invalid report JSON: ${error.message}`,
		};
	}
}

export function detectApplied(state, report) {
	if (!report || report.status !== "applied") return { applied: false };
	const byPost = new Map(
		(report.posts ?? []).map((post) => [String(post.postId), post]),
	);
	const mismatches = [];
	const reverted = [];
	let matched = 0;
	for (const post of state.posts) {
		const recorded = byPost.get(post.id);
		const current = post.baselineSourceSha256;
		if (!recorded) {
			mismatches.push({
				postId: post.id,
				reason: "post is missing from the applied report",
			});
			continue;
		}
		const expected =
			recorded.repairedSourceSha256 ?? recorded.baselineSourceSha256;
		if (current === expected) matched++;
		else if (current === recorded.baselineSourceSha256) reverted.push(post.id);
		else
			mismatches.push({
				postId: post.id,
				reason: "current hash matches neither baseline nor repaired hash",
			});
	}
	if (mismatches.length) return { applied: false, conflict: true, mismatches };
	if (matched === state.posts.length) {
		const oldHostImages = state.images.filter((image) =>
			isOldSourceUrl(image.url),
		);
		if (oldHostImages.length)
			return {
				applied: false,
				conflict: true,
				mismatches: oldHostImages.map((image) => ({
					postId: image.postId,
					reason: `old-source image remains: ${image.url}`,
				})),
			};
		return { applied: true, matched };
	}
	if (reverted.length === state.posts.length)
		return { applied: false, reverted: true };
	return { applied: false, partial: true, matched, reverted };
}

export function buildPlan(state, packets, markdown) {
	const errors = [];
	for (const error of state.errors) errors.push(error);
	if (!packets.ready)
		addError(
			errors,
			"packets-not-ready",
			"media repair packets are not complete and valid",
		);
	const posts = [];
	const occurrences = [];
	let totalOccurrences = 0;

	for (const post of state.posts) {
		const matches = post.images.filter((image) =>
			packets.mappings.has(image.url),
		);
		if (!matches.length) continue;
		const expected = new Map();
		for (const [url, expectedCount] of post.expected)
			if (packets.mappings.has(url)) expected.set(url, expectedCount);
		for (const image of post.images) {
			if (!packets.mappings.has(image.url) || state.manifestUrls.has(image.url))
				continue;
			expected.set(image.url, (expected.get(image.url) ?? 0) + 1);
		}
		const actual = countBy(matches.map((image) => image.url));
		for (const [url, expectedCount] of expected) {
			if ((actual.get(url) ?? 0) !== expectedCount)
				addError(
					errors,
					"plan-parity",
					`${post.id}: expected ${expectedCount} replacement(s) for ${url}, found ${actual.get(url) ?? 0}`,
					{ postId: post.id, url },
				);
		}
		for (const image of matches) {
			if (
				image.start === null ||
				image.end === null ||
				image.urlStart === null ||
				image.markup === null
			)
				addError(
					errors,
					"plan-span",
					`${post.id}: no exact source span for ${image.url}`,
					{ postId: post.id, url: image.url },
				);
		}
		if (errors.length) continue;
		const sorted = [...matches].sort((left, right) => left.start - right.start);
		const edits = [];
		for (const [index, image] of sorted.entries()) {
			const mapping = packets.mappings.get(image.url);
			const precedingText = mapping.precedingText ?? "";
			const sourceStart = image.start - precedingText.length;
			if (
				precedingText &&
				(sourceStart < 0 ||
					post.source.slice(sourceStart, image.start) !== precedingText)
			) {
				addError(
					errors,
					"plan-preceding-text",
					`${post.id}: precedingText does not match the baseline before ${image.url}`,
					{ postId: post.id, url: image.url },
				);
				continue;
			}
			edits.push({
				postId: post.id,
				postPath: post.markdownPath,
				occurrenceIndex: index + 1,
				line: precedingText ? lineOf(post.source, sourceStart) : image.line,
				url: image.url,
				kind: mapping.kind,
				assets: mapping.assets.map((asset) => asset.relative),
				basis: mapping.basis,
				originalMarkdown: post.source.slice(sourceStart, image.end),
				replacementMarkdown: mapping.replacementMarkdown,
				sourceStart,
				sourceEnd: image.end,
			});
		}
		if (edits.length !== sorted.length) continue;
		let delta = 0;
		for (const edit of edits) {
			edit.repairedStart = edit.sourceStart + delta;
			edit.repairedEnd = edit.repairedStart + edit.replacementMarkdown.length;
			delta +=
				edit.replacementMarkdown.length - (edit.sourceEnd - edit.sourceStart);
		}
		let repaired = post.source;
		for (const edit of [...edits].sort(
			(left, right) => right.sourceStart - left.sourceStart,
		))
			repaired =
				repaired.slice(0, edit.sourceStart) +
				edit.replacementMarkdown +
				repaired.slice(edit.sourceEnd);
		let reversed = repaired;
		for (const edit of [...edits].reverse())
			reversed =
				reversed.slice(0, edit.repairedStart) +
				edit.originalMarkdown +
				reversed.slice(edit.repairedEnd);
		if (reversed !== post.source)
			addError(
				errors,
				"reverse-patch",
				`${post.id}: stored reverse patch does not restore the baseline exactly`,
			);
		if (repaired === post.source)
			addError(
				errors,
				"plan-noop",
				`${post.id}: replacements produced no change`,
			);
		if (
			splitFrontmatter(repaired).frontmatter !==
			splitFrontmatter(post.source).frontmatter
		)
			addError(
				errors,
				"frontmatter-changed",
				`${post.id}: frontmatter changed`,
			);
		const reparsed = scanDocument(repaired, { markdown });
		const remaining = reparsed.images.filter((image) =>
			packets.mappings.has(image.url),
		);
		if (remaining.length)
			addError(
				errors,
				"old-image-remains",
				`${post.id}: ${remaining.length} mapped image(s) remain after replacement`,
				{ postId: post.id, urls: remaining.map((image) => image.url) },
			);
		const oldHostRemaining = reparsed.images.filter((image) =>
			isOldSourceUrl(image.url),
		);
		if (oldHostRemaining.length)
			addError(
				errors,
				"old-host-remains",
				`${post.id}: ${oldHostRemaining.length} old-source image(s) remain after replacement`,
				{ postId: post.id, urls: oldHostRemaining.map((image) => image.url) },
			);
		const beforeCode = post.codeBlocks.map((block) => block.text);
		const afterCode = reparsed.codeBlocks.map((block) => block.text);
		if (!isSubsequence(beforeCode, afterCode))
			addError(
				errors,
				"code-changed",
				`${post.id}: fenced/indented code blocks changed outside edits`,
			);
		if (!isSubsequence(post.inlineCodeTexts, reparsed.inlineCodeTexts))
			addError(
				errors,
				"inline-code-changed",
				`${post.id}: inline code changed outside edits`,
			);
		const protectedCounts = countBy(
			post.protectedOccurrences.map((occurrence) => occurrence.url),
		);
		for (const [url, expectedCount] of protectedCounts) {
			const afterCount = findRawOccurrences(repaired, [url]).length;
			if (afterCount !== expectedCount)
				addError(
					errors,
					"protected-changed",
					`${post.id}: ${url} should remain ${expectedCount} time(s) outside images, found ${afterCount}`,
				);
		}
		const repairedSha = sha256(repaired);
		const repairedBodySha = sha256(splitFrontmatter(repaired).body);
		for (const edit of edits) {
			occurrences.push({
				postId: post.id,
				postPath: post.markdownPath,
				occurrenceIndex: edit.occurrenceIndex,
				line: edit.line,
				url: edit.url,
				kind: edit.kind,
				assets: edit.assets,
				basis: edit.basis,
				originalMarkdown: edit.originalMarkdown,
				replacementMarkdown: edit.replacementMarkdown,
				sourceStart: edit.sourceStart,
				sourceEnd: edit.sourceEnd,
				repairedStart: edit.repairedStart,
				repairedEnd: edit.repairedEnd,
				sourceMarkdownSha256: post.baselineSourceSha256,
				repairedMarkdownSha256: repairedSha,
				sourceBodySha256: post.baselineBodySha256,
				repairedBodySha256: repairedBodySha,
			});
		}
		totalOccurrences += edits.length;
		posts.push({
			postId: post.id,
			postPath: post.markdownPath,
			baselineSourceSha256: post.baselineSourceSha256,
			baselineBodySha256: post.baselineBodySha256,
			repairedSourceSha256: repairedSha,
			repairedBodySha256: repairedBodySha,
			baselineBytes: post.baselineBytes,
			repairedBytes: Buffer.byteLength(repaired, "utf8"),
			occurrenceCount: edits.length,
			urls: [...new Set(edits.map((edit) => edit.url))].sort(),
			protectedOccurrences: post.protectedOccurrences,
			contentBefore: post.source,
			contentAfter: repaired,
		});
	}

	occurrences.sort(
		(left, right) =>
			left.postId.localeCompare(right.postId, undefined, { numeric: true }) ||
			left.sourceStart - right.sourceStart,
	);
	return {
		ok: errors.length === 0,
		errors,
		posts,
		occurrences,
		totalOccurrences,
	};
}

export function applyPlan(plan, options = {}) {
	if (!plan.ok) throw new Error("cannot apply an invalid plan");
	const root = options.root ?? process.cwd();
	const written = [];
	try {
		for (const post of plan.posts) {
			const filePath = path.resolve(root, post.postPath);
			const current = readFileSync(filePath, "utf8");
			const currentSha = sha256(current);
			if (currentSha === post.repairedSourceSha256) continue;
			if (currentSha !== post.baselineSourceSha256)
				throw new Error(
					`${post.postPath}: current file matches neither baseline nor repaired hash`,
				);
			writeFileAtomic(filePath, post.contentAfter);
			written.push({ filePath, contentBefore: current });
		}
		if (options.writeReports) options.writeReports();
		return {
			applied: written.length > 0,
			written: written.length,
			alreadyApplied: written.length === 0,
		};
	} catch (error) {
		for (const item of written.reverse())
			writeFileAtomic(item.filePath, item.contentBefore);
		throw error;
	}
}
