import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import expressiveCode from "astro-expressive-code";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import remarkLatexFences from "../../src/plugins/remark-latex-fences.mjs";

// Resolve Astro's own Markdown processor via its declared dependency, not a
// pnpm storage path or an undeclared top-level import.
const astroRequire = createRequire(import.meta.resolve("astro/package.json"));
const { createMarkdownProcessor } = await import(
	pathToFileURL(astroRequire.resolve("@astrojs/markdown-remark")).href
);

test("only latex code nodes change; value, metadata, position and other nodes survive", () => {
	const target = {
		type: "code", lang: "latex", meta: "title=equation", value: "\\frac{a}{b}",
		position: { start: { line: 1, column: 1 }, end: { line: 3, column: 4 } },
		data: { custom: "preserved" },
	};
	const others = ["js", "javascript", "mermaid", "text", "unknown", "LaTeX", "LATEX", null, "math"]
		.map((lang) => ({ type: "code", lang, value: "```latex\nx^2\n```" }));
	others.push({ type: "inlineCode", value: "```latex" }, { type: "math", value: "x" }, { type: "inlineMath", value: "y" });
	const original = structuredClone(others);
	const tree = { type: "root", children: [target, ...others] };
	const position = target.position;
	remarkLatexFences()(tree);
	assert.equal(target.type, "math");
	assert.equal(target.value, "\\frac{a}{b}");
	assert.equal(target.meta, "title=equation");
	assert.equal(target.position, position);
	assert.equal(target.data.custom, "preserved");
	assert.equal(target.data.hName, "div");
	assert.deepEqual(target.data.hProperties.className, ["math-display"]);
	assert.deepEqual(target.data.hChildren, [{ type: "text", value: target.value }]);
	assert.deepEqual(others, original);
	const once = structuredClone(tree);
	remarkLatexFences()(tree);
	assert.deepEqual(tree, once);
});

test("visits latex nodes inside blockquotes and lists", () => {
	const target = { type: "code", lang: "latex", value: "x^2" };
	const tree = { type: "root", children: [{ type: "blockquote", children: [{ type: "list", children: [{ type: "listItem", children: [target] }] }] }] };
	remarkLatexFences()(tree);
	assert.equal(target.type, "math");
});

async function processor(rehypePlugins = [rehypeKatex]) {
	return createMarkdownProcessor({
		syntaxHighlight: false,
		remarkPlugins: [remarkMath, remarkLatexFences],
		rehypePlugins,
	});
}

const fixture = [
	"```latex", "\\frac{a}{b}", "```", "",
	"Inline $x^2$.", "", "$$", "y^2", "$$", "",
	"> ```latex", "> z^2", "> ```", "",
	"- Nested:", "", "  ```latex", "  w^2", "  ```", "",
	"```javascript", "const value = '$x$';", "```", "",
	"```mermaid", "graph TD; A-->B", "```", "",
	"```text", "literal $x$", "```", "",
	"```unknown", "not math", "```", "",
	"````text", "```latex", "literal_example", "```", "````",
].join("\n");

function assertMath(html) {
	assert.equal((html.match(/class="katex-display"/g) ?? []).length, 4);
	assert.equal((html.match(/class="katex"/g) ?? []).length, 5);
	assert.match(html, /<math[^>]*display="block"/);
	assert.match(html, /<mfrac>/);
	assert.doesNotMatch(html, /language-latex|katex-error/);
}

test("Astro Markdown + remark-math + rehype-katex renders real math and preserves literal fences", async () => {
	const renderer = await processor();
	const { code } = await renderer.render(fixture);
	assertMath(code);
	for (const lang of ["javascript", "mermaid", "text", "unknown"]) {
		assert.match(code, new RegExp(`<code class="language-${lang}">`));
	}
	assert.match(code, /```latex\nliteral_example\n```/);
	assert.match(code, /const value = '\$x\$';/);
});

test("real Expressive Code integration cannot swallow converted math in either plugin order", async () => {
	let markdown;
	await expressiveCode({ themes: ["github-dark"] }).hooks["astro:config:setup"]({
		command: "build",
		config: { root: new URL("../../", import.meta.url), integrations: [], markdown: { remarkPlugins: [], rehypePlugins: [] } },
		updateConfig: (update) => { markdown = update.markdown; },
		logger: { warn() {}, info() {}, debug() {}, error() {} },
		addWatchFile() {},
	});
	assert.ok(markdown.rehypePlugins.length);
	// Astro appends integration rehype plugins after the configured Katex plugin.
	const renderer = await processor([rehypeKatex, ...markdown.rehypePlugins]);
	const { code } = await renderer.render(fixture);
	assertMath(code);
	assert.match(code, /class="expressive-code"/);
	assert.match(code, /literal_example/);
	// Converted fences also survive if a highlighter is moved before Katex.
	const highlighterFirst = await processor([...markdown.rehypePlugins, rehypeKatex]);
	const reversed = await highlighterFirst.render("```latex\n\\frac{a}{b}\n```\n\n```js\nconst n = 1;\n```");
	assert.match(reversed.code, /class="katex-display"/);
	assert.match(reversed.code, /<mfrac>/);
	assert.match(reversed.code, /class="expressive-code"/);
});

test("malformed latex remains visible as a KaTeX error rather than silently disappearing", async () => {
	const renderer = await processor();
	const { code } = await renderer.render("```latex\n\\frac{\n```");
	assert.match(code, /class="katex-error"/);
	assert.match(code, /title="ParseError:/);
	assert.match(code, /\\frac\{/);
});
