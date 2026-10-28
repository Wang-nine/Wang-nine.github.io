import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import {
	buildAliasHtml,
	buildLegacyAliases,
	escapeHtml,
	LegacyAliasError,
} from "../../scripts/build-legacy-aliases.mjs";

function entry(id, overrides = {}) {
	return {
		id: String(id),
		slug: String(id),
		legacyUrl: `https://wang-nine.cn/posts/${id}.html`,
		canonicalPath: `/posts/${id}/`,
		...overrides,
	};
}

async function fixture(t, entries, { canonical = true } = {}) {
	const root = await mkdtemp(path.join(tmpdir(), "blog-alias-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const manifestPath = path.join(root, "migration", "legacy-posts.json");
	await mkdir(path.dirname(manifestPath), { recursive: true });
	await writeFile(manifestPath, JSON.stringify(entries));
	const outputDir = path.join(root, "dist");
	if (canonical) {
		for (const item of entries) {
			const indexPath = path.join(outputDir, item.canonicalPath.replace(/^\//, ""), "index.html");
			await mkdir(path.dirname(indexPath), { recursive: true });
			await writeFile(indexPath, "<!doctype html><title>canonical</title>");
		}
	}
	return { root, manifestPath, outputDir };
}

async function expectCode(promise, code) {
	await assert.rejects(promise, (error) => {
		assert.ok(error instanceof LegacyAliasError);
		assert.equal(error.code, code);
		return true;
	});
}

test("writes one exact alias file per manifest entry", async (t) => {
	const { manifestPath, outputDir } = await fixture(t, [entry(1), entry(2)]);
	const result = await buildLegacyAliases({ manifestPath, outputDir, expectedCount: 2 });
	assert.equal(result.count, 2);
	const html = await readFile(path.join(outputDir, "posts", "1.html"), "utf8");
	assert.match(html, /<meta http-equiv="refresh" content="0; url=\/posts\/1\/">/);
	assert.match(html, /<link rel="canonical" href="\/posts\/1\/">/);
	assert.match(html, /<a href="\/posts\/1\/"/);
	assert.match(html, /data-pagefind-ignore/);
	assert.doesNotMatch(html, /<link rel="canonical" href="https?:\/\//);
	assert.equal(result.files[0].filePath, path.join(outputDir, "posts", "1.html"));
});

test("preserves the URL fragment through location.replace", async (t) => {
	const { manifestPath, outputDir } = await fixture(t, [entry(7)]);
	await buildLegacyAliases({ manifestPath, outputDir, expectedCount: 1 });
	const html = await readFile(path.join(outputDir, "posts", "7.html"), "utf8");
	const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
	assert.ok(script);
	const replaced = [];
	vm.runInNewContext(script, { location: { hash: "#details", replace: (value) => replaced.push(value) } });
	assert.deepEqual(replaced, ["/posts/7/#details"]);
	const empty = [];
	vm.runInNewContext(script, { location: { hash: "", replace: (value) => empty.push(value) } });
	assert.deepEqual(empty, ["/posts/7/"]);
});

test("escapes HTML attributes and inline script strings", () => {
	assert.equal(escapeHtml(`<script>&"'`), "&lt;script&gt;&amp;&quot;&#39;");
	const html = buildAliasHtml({ id: "1", canonicalPath: "/posts/a&b/" });
	assert.match(html, /href="\/posts\/a&amp;b\/"/);
	assert.ok(html.includes('location.replace("/posts/a\\u0026b/" + location.hash);'));
});

test("produces aliases for all 72 legacy ids", async (t) => {
	const entries = Array.from({ length: 72 }, (_, index) => entry(index + 1));
	const { manifestPath, outputDir } = await fixture(t, entries);
	const result = await buildLegacyAliases({ manifestPath, outputDir });
	assert.equal(result.count, 72);
	for (const item of result.files) {
		const alias = await readFile(item.filePath, "utf8");
		assert.match(alias, /http-equiv="refresh"/);
	}
});

test("rejects a wrong manifest count", async (t) => {
	const { manifestPath, outputDir } = await fixture(t, [entry(1)], { canonical: false });
	await expectCode(buildLegacyAliases({ manifestPath, outputDir }), "COUNT_MISMATCH");
});

test("rejects duplicate ids", async (t) => {
	const entries = [entry(1), entry(1, { slug: "other" })];
	const { manifestPath, outputDir } = await fixture(t, entries, { canonical: false });
	await expectCode(buildLegacyAliases({ manifestPath, outputDir, expectedCount: 2 }), "DUPLICATE_ID");
});

test("rejects unsafe ids and external canonical URLs", async (t) => {
	const unsafeId = await fixture(t, [entry(1, { id: "../1" })], { canonical: false });
	await expectCode(buildLegacyAliases({ manifestPath: unsafeId.manifestPath, outputDir: unsafeId.outputDir, expectedCount: 1 }), "INVALID_ID");
	const external = await fixture(t, [entry(1, { canonicalPath: "https://evil.example/posts/1/" })], { canonical: false });
	await expectCode(buildLegacyAliases({ manifestPath: external.manifestPath, outputDir: external.outputDir, expectedCount: 1 }), "UNSAFE_CANONICAL");
	const mismatch = await fixture(t, [entry(1, { legacyUrl: "https://wang-nine.cn/posts/2.html" })], { canonical: false });
	await expectCode(buildLegacyAliases({ manifestPath: mismatch.manifestPath, outputDir: mismatch.outputDir, expectedCount: 1 }), "LEGACY_PATH_MISMATCH");
});

test("requires the canonical Astro page before writing aliases", async (t) => {
	const { manifestPath, outputDir } = await fixture(t, [entry(1)], { canonical: false });
	await expectCode(buildLegacyAliases({ manifestPath, outputDir, expectedCount: 1 }), "MISSING_CANONICAL");
});
