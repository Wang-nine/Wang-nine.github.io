import assert from "node:assert/strict";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runCli } from "../scripts/apply-media-repairs.mjs";
import {
	sha256,
	splitFrontmatter,
} from "../scripts/media-repairs/markdown.mjs";
import { PACKET_GROUPS } from "../scripts/media-repairs/packets.mjs";

const GROUP = "java-ssm";
const URL_A = "https://wang-nine.cn/images/A.png";
const URL_HTTP_BPLUS =
	"http://wang-nine.cn/images/MySQL03-01-02B+%E6%A0%91.png";
const SVG =
	'<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><title>diagram</title><rect width="16" height="16" fill="#eef"/></svg>\n';

async function put(root, relative, content) {
	const target = path.join(root, relative);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, content);
}

function mapping(url, options = {}) {
	const group = options.group ?? GROUP;
	const file = options.file ?? "diagram.svg";
	return {
		group,
		url,
		kind: options.kind ?? "diagram",
		replacementMarkdown:
			options.replacementMarkdown ??
			`![reconstructed diagram](/article-diagrams/${group}/${file})`,
		assets: options.assets ?? [`public/article-diagrams/${group}/${file}`],
		basis:
			options.basis ?? "Reconstructed from the surrounding article context.",
		...(options.precedingText ? { precedingText: options.precedingText } : {}),
	};
}

function packetEntry(entry) {
	const copy = { ...entry };
	delete copy.group;
	return copy;
}

async function writeAssets(root, mappings, options = {}) {
	const missing = new Set(options.missingAssets ?? []);
	const contents = options.assetContents ?? {};
	for (const entry of mappings) {
		for (const asset of entry.assets ?? []) {
			let relative;
			if (asset.startsWith("public/")) relative = asset;
			else if (asset.startsWith("/")) relative = `public/${asset.slice(1)}`;
			else relative = `public/${asset}`;
			if (missing.has(asset) || relative.split("/").includes("..")) continue;
			await put(root, relative, contents[asset] ?? SVG);
		}
	}
}

async function fixture(t, options = {}) {
	const root = await mkdtemp(path.join(tmpdir(), "media-repairs-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const posts = options.posts ?? [
		{
			id: "1",
			body: `Before.\n\n![a](${URL_A})\n\nAfter.\n`,
			unresolved: [{ url: URL_A }],
		},
	];
	const manifest = [];
	for (const post of posts) {
		const unresolved = post.unresolved ?? [{ url: URL_A }];
		const markdownPath = `src/content/posts/legacy/${post.id}.md`;
		manifest.push({
			id: post.id,
			markdownPath,
			unresolvedAssets: unresolved,
			counts: { images: unresolved.length },
		});
		await put(root, markdownPath, key(post.id, post.body));
	}
	await put(
		root,
		"migration/legacy-posts.json",
		JSON.stringify(manifest, null, 2),
	);
	await put(
		root,
		"migration/legacy-audit.json",
		JSON.stringify(
			manifest.map((entry) => ({ id: entry.id, status: "pass" })),
			null,
			2,
		),
	);
	const mappings = options.mappings ?? [
		mapping(URL_A, { file: "diagram-a.svg" }),
	];
	if (!options.skipPackets) {
		for (const group of PACKET_GROUPS) {
			const entries = mappings
				.filter((entry) => (entry.group ?? GROUP) === group)
				.map(packetEntry);
			await put(
				root,
				`migration/media-repairs/${group}.json`,
				JSON.stringify(entries, null, 2),
			);
		}
	}
	if (options.assets !== false) await writeAssets(root, mappings, options);
	return { root, manifest, mappings };
}

function key(id, body) {
	return `---\ntitle: "Post ${id}"\nslug: "${id}"\n---\n${body}`;
}

function run(root, arg = "--check") {
	return runCli([arg], { root });
}

async function postText(root, id) {
	return readFile(
		path.join(root, "src", "content", "posts", "legacy", `${id}.md`),
		"utf8",
	);
}

test("check reports NOTREADY when the four worker packets are absent", async (t) => {
	const { root } = await fixture(t, { skipPackets: true });
	const before = await postText(root, "1");
	const result = run(root);
	assert.equal(result.code, 2);
	assert.equal(result.status, "not_ready");
	assert.equal(result.report.counts.mappedUnique, 0);
	assert.equal(result.report.packets.missingFiles.length, 4);
	assert.equal(await postText(root, "1"), before);
	const report = JSON.parse(
		await readFile(
			path.join(root, "migration", "media-repair-report.json"),
			"utf8",
		),
	);
	assert.equal(report.status, "not_ready");
	assert.match(
		await readFile(
			path.join(root, "migration", "media-repair-report.md"),
			"utf8",
		),
		/NOT READY/,
	);
});

test("apply replaces only active image tokens, preserves code/prose, and is idempotent", async (t) => {
	const body = [
		"Intro paragraph stays.",
		"",
		`![one](${URL_A} "title")`,
		"",
		`Inline code: \`![inline](${URL_A})\` stays.`,
		"",
		"```text",
		`![fence](${URL_A})`,
		URL_A,
		"```",
		"",
		`![two](<${URL_A}>)`,
		"",
		"Local ![brand](/brand/banner.svg) and external ![kept](https://example.com/keep.png) stay.",
		"",
		"Tail paragraph stays.",
		"",
	].join("\n");
	const { root } = await fixture(t, {
		posts: [
			{ id: "1", body, unresolved: [{ url: URL_A }, { url: URL_A }] },
			{
				id: "2",
				body: `Second post.\n\n![three](${URL_A})\n`,
				unresolved: [{ url: URL_A }],
			},
		],
		mappings: [mapping(URL_A, { file: "diagram-a.svg" })],
	});
	const before1 = await postText(root, "1");
	const before2 = await postText(root, "2");
	const check = run(root);
	assert.equal(check.code, 0, JSON.stringify(check.report?.blockers));
	assert.equal(check.status, "ready");
	assert.equal(check.report.counts.manifestOccurrences, 3);
	assert.equal(check.report.counts.plannedOccurrences, 3);
	const applied = run(root, "--apply");
	assert.equal(applied.code, 0, JSON.stringify(applied.report?.blockers));
	assert.equal(applied.status, "applied");
	const after1 = await postText(root, "1");
	const after2 = await postText(root, "2");
	assert.equal(
		(after1.match(/\/article-diagrams\/java-ssm\/diagram-a\.svg/g) ?? [])
			.length,
		2,
	);
	assert.equal(
		(after2.match(/\/article-diagrams\/java-ssm\/diagram-a\.svg/g) ?? [])
			.length,
		1,
	);
	assert.equal(after1.split(URL_A).length - 1, 3);
	assert.equal(after2.includes(URL_A), false);
	assert.ok(after1.includes(`\`![inline](${URL_A})\` stays.`));
	assert.ok(
		after1.includes(`\`\`\`text\n![fence](${URL_A})\n${URL_A}\n\`\`\``),
	);
	assert.ok(after1.includes("Intro paragraph stays."));
	assert.ok(after1.includes("Tail paragraph stays."));
	assert.ok(after1.includes("![brand](/brand/banner.svg)"));
	assert.ok(after1.includes("![kept](https://example.com/keep.png)"));
	assert.equal(
		splitFrontmatter(after1).frontmatter,
		splitFrontmatter(before1).frontmatter,
	);
	assert.equal(applied.report.occurrences.length, 3);
	assert.equal(applied.report.counts.replacedOccurrences, 3);
	assert.equal(applied.report.counts.replacedPosts, 2);
	for (const occurrence of applied.report.occurrences) {
		assert.equal(occurrence.url, URL_A);
		assert.equal(occurrence.kind, "diagram");
		assert.ok(occurrence.originalMarkdown.includes(URL_A));
		assert.ok(!occurrence.replacementMarkdown.includes("缺图"));
		assert.ok(!occurrence.replacementMarkdown.includes("待补"));
		assert.equal(
			occurrence.sourceMarkdownSha256,
			sha256(occurrence.postId === "1" ? before1 : before2),
		);
	}
	const occurrences1 = applied.report.occurrences
		.filter((item) => item.postId === "1")
		.sort((left, right) => right.repairedStart - left.repairedStart);
	let restored = after1;
	for (const occurrence of occurrences1)
		restored =
			restored.slice(0, occurrence.repairedStart) +
			occurrence.originalMarkdown +
			restored.slice(occurrence.repairedEnd);
	assert.equal(restored, before1);
	assert.equal(sha256(restored), sha256(before1));
	const again = run(root, "--apply");
	assert.equal(again.code, 0);
	assert.equal(again.status, "applied");
	assert.equal(await postText(root, "1"), after1);
	assert.equal((await run(root)).status, "applied");
});

test("fails when manifest occurrence counts do not match active image tokens", async (t) => {
	const { root } = await fixture(t, {
		posts: [
			{
				id: "1",
				body: `![a](${URL_A})\n`,
				unresolved: [{ url: URL_A }, { url: URL_A }],
			},
		],
	});
	const before = await postText(root, "1");
	const check = run(root);
	assert.equal(check.code, 1);
	assert.equal(check.status, "invalid");
	assert.ok(
		check.report.blockers.some((blocker) => blocker.code === "manifest-parity"),
	);
	assert.equal(run(root, "--apply").code, 1);
	assert.equal(await postText(root, "1"), before);
});

test("detects an unmarked old-source HTTP image and refuses to leave it unmapped", async (t) => {
	const body = `![manifest](${URL_A})\n\n![unmarked](${URL_HTTP_BPLUS})\n`;
	const { root } = await fixture(t, {
		posts: [{ id: "1", body, unresolved: [{ url: URL_A }] }],
		mappings: [mapping(URL_A, { file: "a.svg" })],
	});
	const before = await postText(root, "1");
	const check = run(root);
	assert.equal(check.code, 2);
	assert.equal(check.status, "not_ready");
	assert.equal(check.report.unmappedOldHost.length, 1);
	assert.equal(check.report.unmappedOldHost[0].url, URL_HTTP_BPLUS);
	assert.equal(check.report.counts.supplementalOldHostUnique, 1);
	assert.equal(run(root, "--apply").code, 2);
	assert.equal(await postText(root, "1"), before);
	const supplemental = mapping(URL_HTTP_BPLUS, {
		group: "mysql",
		file: "bplus.svg",
	});
	await put(
		root,
		"migration/media-repairs/mysql.json",
		JSON.stringify([packetEntry(supplemental)], null, 2),
	);
	await writeAssets(root, [supplemental]);
	const ready = run(root);
	assert.equal(ready.code, 0, JSON.stringify(ready.report?.blockers));
	assert.equal(ready.status, "ready");
	assert.equal(ready.report.counts.plannedOccurrences, 2);
	const applied = run(root, "--apply");
	assert.equal(applied.code, 0);
	const after = await postText(root, "1");
	assert.equal(after.includes(URL_HTTP_BPLUS), false);
	assert.equal(applied.report.counts.supplementalOldHostOccurrences, 1);
	assert.equal(applied.report.counts.replacedOccurrences, 2);
});

test("rewrites exact preceding prose when replacing an image", async (t) => {
	const body = `Lead line.\n\n![a](${URL_A})\n\nAfter line.\n`;
	const { root } = await fixture(t, {
		posts: [{ id: "1", body, unresolved: [{ url: URL_A }] }],
		mappings: [
			mapping(URL_A, {
				file: "diagram-a.svg",
				kind: "text",
				assets: [],
				precedingText: "Lead line.\n\n",
				replacementMarkdown: "New lead.\n\nReplacement text.",
			}),
		],
	});
	const before = await postText(root, "1");
	const applied = run(root, "--apply");
	assert.equal(applied.code, 0, JSON.stringify(applied.report?.blockers));
	const after = await postText(root, "1");
	assert.ok(after.includes("New lead.\n\nReplacement text.\n\nAfter line."));
	assert.ok(!after.includes("Lead line."));
	const occurrence = applied.report.occurrences[0];
	assert.equal(occurrence.originalMarkdown, `Lead line.\n\n![a](${URL_A})`);
	assert.equal(
		occurrence.replacementMarkdown,
		"New lead.\n\nReplacement text.",
	);
	const restored =
		after.slice(0, occurrence.repairedStart) +
		occurrence.originalMarkdown +
		after.slice(occurrence.repairedEnd);
	assert.equal(restored, before);
});

test("handles angle-bracket, encoded, and titled image URLs without touching code", async (t) => {
	const url = "https://wang-nine.cn/images/angle%28one%29.png";
	const body = [
		"Before.",
		"",
		`![angle](<${url}> "a title")`,
		"",
		"```md",
		`![code](<${url}>)`,
		"```",
		"",
		"After.",
	].join("\n");
	const { root } = await fixture(t, {
		posts: [{ id: "1", body, unresolved: [{ url }] }],
		mappings: [mapping(url, { file: "angle.svg" })],
	});
	const before = await postText(root, "1");
	const applied = run(root, "--apply");
	assert.equal(applied.code, 0, JSON.stringify(applied.report?.blockers));
	const after = await postText(root, "1");
	assert.equal(after.split(url).length - 1, 1);
	assert.ok(after.includes(`\`\`\`md\n![code](<${url}>)\n\`\`\``));
	assert.ok(after.includes("After."));
	const occurrence = applied.report.occurrences[0];
	assert.ok(occurrence.originalMarkdown.startsWith("![angle](<"));
	assert.ok(occurrence.originalMarkdown.includes('"a title"'));
	assert.equal(sha256(before), occurrence.sourceMarkdownSha256);
});

test("applied check succeeds after packets are removed", async (t) => {
	const { root } = await fixture(t, {
		mappings: [mapping(URL_A, { file: "diagram-a.svg" })],
	});
	assert.equal(run(root, "--apply").code, 0);
	const after = await postText(root, "1");
	await rm(path.join(root, "migration", "media-repairs"), {
		recursive: true,
		force: true,
	});
	const check = run(root);
	assert.equal(check.code, 0);
	assert.equal(check.status, "applied");
	assert.equal(await postText(root, "1"), after);
});

test("rejects unsafe or incomplete packet variants before writing markdown", async (t) => {
	const cases = [
		{
			name: "missing asset",
			setup: async ({ root }) =>
				unlink(
					path.join(root, "public", "article-diagrams", GROUP, "diagram-a.svg"),
				),
			code: "asset",
		},
		{
			name: "asset traversal",
			mappings: [
				mapping(URL_A, {
					file: "diagram-a.svg",
					assets: [`public/article-diagrams/${GROUP}/../../evil.svg`],
				}),
			],
			code: "asset",
		},
		{
			name: "duplicate mapping URL",
			mappings: [
				mapping(URL_A, { file: "a.svg" }),
				mapping(URL_A, { group: "mysql", file: "a.svg" }),
			],
			code: "duplicate-url",
		},
		{
			name: "wrong URL",
			mappings: [
				mapping("https://wang-nine.cn/images/NOPE.png", {
					file: "diagram-a.svg",
				}),
			],
			code: "unexpected-url",
		},
		{
			name: "stale precedingText",
			mappings: [
				mapping(URL_A, {
					file: "diagram-a.svg",
					precedingText: "Wrong lead\n\n",
				}),
			],
			code: "plan-preceding-text",
		},
		{
			name: "external replacement URL",
			mappings: [
				mapping(URL_A, {
					file: "diagram-a.svg",
					replacementMarkdown: "![x](https://evil.test/x.svg)",
				}),
			],
			code: "external-url",
		},
		{
			name: "forbidden placeholder wording",
			mappings: [
				mapping(URL_A, {
					file: "diagram-a.svg",
					kind: "text",
					assets: [],
					replacementMarkdown: "图片待补",
				}),
			],
			code: "forbidden-placeholder",
		},
		{
			name: "SVG with script",
			mappings: [mapping(URL_A, { file: "diagram-a.svg" })],
			assetContents: {
				[`public/article-diagrams/${GROUP}/diagram-a.svg`]:
					'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
			},
			code: "asset",
		},
	];
	for (const item of cases)
		await t.test(item.name, async (t) => {
			const { root } = await fixture(t, {
				mappings: item.mappings,
				assetContents: item.assetContents,
			});
			const before = await postText(root, "1");
			if (item.setup) await item.setup({ root });
			const check = run(root);
			assert.equal(check.code, 1);
			assert.equal(check.status, "invalid");
			assert.ok(
				check.report.blockers.some((blocker) => blocker.code === item.code),
				JSON.stringify(check.report.blockers),
			);
			const applied = run(root, "--apply");
			assert.equal(applied.code, 1);
			assert.equal(await postText(root, "1"), before);
		});
});
