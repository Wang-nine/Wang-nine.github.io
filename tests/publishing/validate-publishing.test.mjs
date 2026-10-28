import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildLegacyAliases } from "../../scripts/build-legacy-aliases.mjs";
import { validatePublishing } from "../../scripts/validate-publishing.mjs";

function entry(id) {
	return {
		id: String(id),
		slug: String(id),
		legacyUrl: `https://wang-nine.cn/posts/${id}.html`,
		canonicalPath: `/posts/${id}/`,
	};
}

function legacyPost(id, extra = "") {
	return `---\ntitle: "Post ${id}"\npublished: 2023-01-01\nslug: "${id}"\nsourcePath: "legacy/${id}.html"\ndraft: false\n---\n\nSee [self](/posts/${id}/).\n${extra}`;
}

function legacyFiles(count = 72) {
	const files = {};
	for (let id = 1; id <= count; id += 1) files[`src/content/posts/${id}.md`] = legacyPost(id);
	return files;
}

function authoredPost(slug) {
	return `---\ntitle: "Authored ${slug}"\npublished: 2026-10-27\ndescription: "A future public post"\ncategory: "随笔"\nslug: "${slug}"\n---\n\nBody for ${slug}.\n`;
}

function noteFiles() {
	return {
		"src/content/posts/llm-learning/math-numpy/01.md":
			'---\ntitle: "Note 1"\npublished: 2026-10-26\ncategory: "LLM 学习"\nslug: "llm-math-numpy-01"\n---\n\nSee [legacy](/posts/1/).\n',
		"src/content/posts/notes-import/02.md":
			'---\ntitle: "Note 2"\npublished: 2026-10-26\ncategory: "LLM 学习"\nsourcePath: "notes/02-math-numpy/02.md"\nslug: "llm-math-numpy-02"\n---\n\nBody.\n',
		"src/content/posts/misc/03.md":
			'---\ntitle: "Note 3"\npublished: 2026-10-26\ncategory: "LLM 学习"\nslug: "llm-math-numpy-03"\n---\n\nBody.\n',
	};
}

async function writeFiles(root, files) {
	for (const [relativePath, content] of Object.entries(files)) {
		const filePath = path.join(root, relativePath);
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, content);
	}
}

async function repoFixture(t, files = {}, assetHashes = null) {
	const root = await mkdtemp(path.join(tmpdir(), "blog-validate-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const entries = Array.from({ length: 72 }, (_, index) => entry(index + 1));
	await writeFiles(root, { "migration/legacy-posts.json": JSON.stringify(entries), ...files });
	if (assetHashes) await writeFiles(root, { "migration/asset-hashes.json": JSON.stringify(assetHashes) });
	return { root, entries };
}

test("accepts 72 legacy posts, 3 notes, clean public paths, and matching asset hashes", async (t) => {
	const icon = Buffer.from("favicon-bytes");
	const hash = createHash("sha256").update(icon).digest("hex");
	const { root } = await repoFixture(
		t,
		{
			...legacyFiles(),
			...noteFiles(),
			"public/favicon/favicon.png": icon,
			"public/robots.txt": "User-agent: *",
		},
		[{ path: "public/favicon/favicon.png", sha256: hash }],
	);
	const report = await validatePublishing({ repoRoot: root, expectedCount: 72, expectedNotes: 3 });
	assert.equal(report.ok, true, JSON.stringify(report.errors));
	assert.deepEqual(report.counts, {
		manifestEntries: 72,
		uniqueManifestIds: 72,
		markdownFiles: 75,
		legacyPosts: 72,
		notes: 3,
		posts: 0,
		unknown: 0,
	});
	assert.equal(report.classifications.length, 75);
	assert.ok(report.classifications.every((item) => item.type !== "unknown"));
	assert.equal(report.checks.assetHashes.checked, 1);
});

test("checks generated aliases when dist is present", async (t) => {
	const { root } = await repoFixture(t, { ...legacyFiles(), ...noteFiles() });
	await buildLegacyAliases({
		manifestPath: path.join(root, "migration", "legacy-posts.json"),
		outputDir: path.join(root, "dist"),
		verifyCanonical: false,
	});
	const report = await validatePublishing({ repoRoot: root, expectedCount: 72, expectedNotes: 3 });
	assert.equal(report.ok, true, JSON.stringify(report.errors));
	assert.equal(report.checks.aliases.scanned, true);
	assert.equal(report.checks.aliases.aliases, 72);
});

test("flags a manifest entry without a Markdown post", async (t) => {
	const { root } = await repoFixture(t, { ...legacyFiles(71), ...noteFiles() });
	const report = await validatePublishing({ repoRoot: root });
	assert.equal(report.ok, false);
	assert.ok(report.errors.some((error) => error.code === "LEGACY_COUNT_MISMATCH"));
	assert.ok(report.errors.some((error) => error.code === "MISSING_POST" && error.id === "72"));
});

test("flags private names in public paths", async (t) => {
	const { root } = await repoFixture(t, {
		...legacyFiles(),
		...noteFiles(),
		"public/learning-state/profile.md": "private",
	});
	const report = await validatePublishing({ repoRoot: root });
	assert.ok(
		report.errors.some(
			(error) => error.code === "FORBIDDEN_PUBLIC_PATH" && error.path === "public/learning-state/profile.md",
		),
	);
});

test("flags crosslinks to private source paths", async (t) => {
	const posts = legacyFiles();
	posts["src/content/posts/1.md"] = legacyPost(1, "\n[leak](../../learning-state/sessions/01.md)\n");
	const { root } = await repoFixture(t, { ...posts, ...noteFiles() });
	const report = await validatePublishing({ repoRoot: root });
	assert.ok(report.errors.some((error) => error.code === "PRIVATE_CROSSLINK" && error.path === "1.md"));
});

test("flags private key material in post content", async (t) => {
	const posts = legacyFiles();
	posts["src/content/posts/1.md"] = legacyPost(1, "\n-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n");
	const { root } = await repoFixture(t, { ...posts, ...noteFiles() });
	const report = await validatePublishing({ repoRoot: root });
	assert.ok(report.errors.some((error) => error.code === "PRIVATE_KEY_MATERIAL" && error.path === "1.md"));
});

test("flags asset hash mismatches when a hash manifest exists", async (t) => {
	const { root } = await repoFixture(
		t,
		{ ...legacyFiles(), ...noteFiles(), "public/icon.png": "icon" },
		[{ path: "public/icon.png", sha256: "0".repeat(64) }],
	);
	const report = await validatePublishing({ repoRoot: root });
	assert.ok(report.errors.some((error) => error.code === "ASSET_HASH_MISMATCH"));
});

test("classifies an invalid manifest as a boundary failure", async (t) => {
	const entries = Array.from({ length: 72 }, (_, index) => entry(index + 1));
	entries[71] = entry(1);
	const { root } = await repoFixture(t, {
		...legacyFiles(),
		...noteFiles(),
		"migration/legacy-posts.json": JSON.stringify(entries),
	});
	const report = await validatePublishing({ repoRoot: root });
	assert.ok(report.errors.some((error) => error.code === "MANIFEST_INVALID" && error.manifestCode === "DUPLICATE_ID"));
});

test("accepts new published posts, extra notes, and drafts beyond the migration baseline", async (t) => {
	const { root } = await repoFixture(t, {
		...legacyFiles(),
		...noteFiles(),
		"src/content/posts/new/hello-world.md": authoredPost("hello-world"),
		"src/content/posts/llm-learning/math-numpy/04.md":
			'---\ntitle: "Note 4"\npublished: 2026-10-27\ncategory: "LLM 学习"\nslug: "llm-math-numpy-04"\n---\n\nBody.\n',
		"src/content/posts/new/draft.md": '---\ntitle: "Future draft"\ndraft: true\n---\n\nBody.\n',
	});
	const report = await validatePublishing({ repoRoot: root });
	assert.equal(report.ok, true, JSON.stringify(report.errors));
	assert.deepEqual(report.counts, {
		manifestEntries: 72,
		uniqueManifestIds: 72,
		markdownFiles: 78,
		legacyPosts: 72,
		notes: 4,
		posts: 1,
		unknown: 0,
	});
	assert.equal(report.classifications.filter((item) => item.type === "draft").length, 1);
});

test("rejects a new post without a published date", async (t) => {
	const { root } = await repoFixture(t, {
		...legacyFiles(),
		...noteFiles(),
		"src/content/posts/new/undated.md": '---\ntitle: "Undated"\ncategory: "随笔"\nslug: "undated"\n---\n\nBody.\n',
	});
	const report = await validatePublishing({ repoRoot: root });
	assert.equal(report.ok, false);
	assert.ok(report.errors.some((error) => error.code === "UNCLASSIFIED_POST"));
});

test("requires the three baseline note slugs", async (t) => {
	const notes = noteFiles();
	notes["src/content/posts/misc/03.md"] = notes["src/content/posts/misc/03.md"].replace('slug: "llm-math-numpy-03"', 'slug: "llm-math-numpy-99"');
	const { root } = await repoFixture(t, { ...legacyFiles(), ...notes });
	const report = await validatePublishing({ repoRoot: root });
	assert.equal(report.ok, false);
	assert.ok(report.errors.some((error) => error.code === "NOTE_SLUG_MISSING" && error.slug === "llm-math-numpy-03"));
});

test("requires the baseline notes to keep the LLM category", async (t) => {
	const notes = noteFiles();
	notes["src/content/posts/llm-learning/math-numpy/01.md"] = notes["src/content/posts/llm-learning/math-numpy/01.md"].replace('category: "LLM 学习"', 'category: "Java"');
	const { root } = await repoFixture(t, { ...legacyFiles(), ...notes });
	const report = await validatePublishing({ repoRoot: root });
	assert.equal(report.ok, false);
	assert.ok(report.errors.some((error) => error.code === "NOTE_CATEGORY_MISMATCH" && error.slug === "llm-math-numpy-01"));
});
