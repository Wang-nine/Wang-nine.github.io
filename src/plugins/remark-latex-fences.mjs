import { visit } from "unist-util-visit";

/** Render explicit `latex` fences as display math without rewriting Markdown. */
export default function remarkLatexFences() {
	return (tree) => {
		visit(tree, "code", (node) => {
			if (node.lang !== "latex") return;
			node.type = "math";
			delete node.lang;
			// A display-math div bypasses code highlighters regardless of plugin order.
			// rehype-katex consumes this class just like remark-math's math-display.
			node.data = {
				...node.data,
				hName: "div",
				hProperties: { className: ["math-display"] },
				hChildren: [{ type: "text", value: node.value }],
			};
		});
	};
}
