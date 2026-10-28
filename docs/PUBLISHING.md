# 发布指南

本指南面向本机目录 `E:/Blog`，说明如何写作、检查、构建和发布。仓库只自动部署 GitHub Pages 镜像；生产站 <https://blog.wangnine.com> 仍由 VPS 手动发布。

## 1. 发布目标与前提

| 目标 | 地址 | 触发方式 | 说明 |
| --- | --- | --- | --- |
| GitHub Pages 镜像 | <https://wang-nine.github.io> | push `master` 或 `workflow_dispatch` | 根路径，不需要 CNAME |
| 生产站（VPS） | <https://blog.wangnine.com> | VPS 手动发布 | DNS、SSL、NPM 均不变 |

- Pages 工作流把 `SITE_URL` 设为 `https://wang-nine.github.io`。
- `astro.config.mjs` 读取 `process.env.SITE_URL`；未设置时自动回退到 `https://blog.wangnine.com/`。因此本地直接构建默认使用生产 origin，Pages 构建使用镜像 origin，canonical、RSS 与 sitemap 会跟随该值。
- 构建产物审计的命令行参数 `--site-url` 必须与构建时的 origin 一致。CI 使用 `$SITE_URL`；本地审计镜像产物时也要用同一个值。
- 不要先按默认生产 origin 构建，再用 Pages 域名审计。构建和审计应连续执行：

```powershell
$env:SITE_URL='https://wang-nine.github.io'
corepack pnpm build
corepack pnpm validate:publishing
node scripts/audit-built-site.mjs --site-url $env:SITE_URL
```

- 不要在 `public/` 添加 `CNAME`，也不要把 `blog.wangnine.com` 绑定到 Pages；它继续指向现有 VPS。

## 2. 本地环境

要求 Node.js 22 和 pnpm 9.14.4（`packageManager` 已固定）。`preinstall` 只允许 pnpm，不要用 npm 或 yarn 安装。

```powershell
cd E:\Blog
corepack enable
corepack prepare pnpm@9.14.4 --activate
corepack pnpm install
```

迁移测试通过 [uv](https://docs.astral.sh/uv/) 管理 Python 3.13 和固定版本依赖；只需安装 uv，不需要全局 `pip install`，也不需要手动创建 virtualenv。

## 3. 新建文章

```powershell
corepack pnpm new-post llm-learning/example-post
```

生成 `src/content/posts/llm-learning/example-post.md`。编辑 frontmatter：

```yaml
---
title: "示例文章"
published: 2026-10-26
description: "一句话摘要"
image: "./cover.png"
tags: ["LLM"]
category: "LLM 学习"
draft: true
lang: zh_CN
---
```

- `draft: true` 表示草稿；确认发布后再改为 `false`。
- 封面和正文图片放在文章同目录，使用相对路径：`image: "./cover.png"`，正文写 `![说明](./cover.png)`。
- 没有封面时保留 `image: ""`，不要编造资源路径。
- 文件名建议使用英文、数字和连字符。
- 导入笔记必须保留有效且唯一的 `slug`。本仓库 3 篇笔记的 `slug` 为 `llm-math-numpy-01` 至 `llm-math-numpy-03`，不要留空、重复或删除；slug 同时决定路由与 notes 分类。

## 4. 本地检查与预览

```powershell
corepack pnpm test
corepack pnpm test:migration
corepack pnpm check
corepack pnpm dev             # http://localhost:4321
$env:SITE_URL='https://wang-nine.github.io'
corepack pnpm build           # 生成 dist/、旧链接跳转与 Pagefind 索引
corepack pnpm validate:publishing
node scripts/audit-built-site.mjs --site-url $env:SITE_URL
corepack pnpm preview
```

只跑单个套件或直接检查媒体修复时：

```powershell
node --test tests/media-repairs.test.mjs
node --test tests/publishing/*.test.mjs tests/site-audit.test.mjs
node scripts/apply-media-repairs.mjs --check
```

Node 与 Python 测试当前通过；数量随套件变化，不在文档里写死。

- `test` 运行 `tests/publishing/*.test.mjs`、`tests/site-audit.test.mjs` 与 `tests/media-repairs.test.mjs`，覆盖发布校验、旧链接跳转、构建站点审计和媒体修复。Node 22 的 `node --test` 支持 glob 参数，Windows 与 CI 都可以直接运行。测试数量会随内容和工具增加，不在文档里写死；以 `package.json` 和 `tests/` 为准。
- `test:migration` 对应 `uv run --python 3.13 --with beautifulsoup4==4.13.4 --with markdownify==1.1.0 --with markdown-it-py==4.0.0 --with typer==0.16.0 --with pytest==8.4.2 python -m pytest tests/migration`。目前测试文件为 `test_render.py`、`test_source_location.py` 和 `test_recovery.py`。测试数量会随迁移和媒体修复工作增加，不在文档里写死；以 `package.json` 和 `tests/` 为准。
- 依赖真实旧站源文件的正文测试需要 `LEGACY_POSTS_DIR`。本机默认读取不可变备份 `C:/Users/admin/AppData/Local/Temp/opencode/legacy-blog-20261026/posts`；备份不在时，把 `LEGACY_POSTS_DIR` 指向包含 72 个 HTML 的 `posts` 目录。CI 一定会设置该变量，目录不存在会直接失败，不会静默跳过这些测试。
- `validate:publishing` 校验 72 条 legacy manifest、至少 3 篇 notes、内容分类、私有路径和密钥材料；`dist/` 已存在时还会检查 72 个旧链接跳转。新增的普通文章不要求修改 `legacy-posts.json`。
- `audit-built-site.mjs` 必须在上面的 `build` 之后运行。它检查 72 个跳转、75 个基线 canonical 页面、构建中实际存在的额外合法文章、RSS、sitemap、分页、静态资源与 origin；`--site-url` 必须和构建时一致，传错域名会导致 origin 校验失败。
- 不要在未运行 `build` 和审计的情况下声称发布检查已通过。

## 5. 提交并部署 GitHub Pages

```powershell
git status
git diff
git add src/content/posts/llm-learning/example-post.md
git commit -m "post: add example post"
git push origin master
```

- push 到 `master` 会触发 `.github/workflows/deploy.yml`；也可以在 Actions 页面手动运行 `workflow_dispatch`。
- 首次使用前，在 GitHub 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
- 工作流行为：checkout（`fetch-depth: 0`）→ configure Pages → Node 22 → corepack 启用 pnpm 9.14.4 → `install --frozen-lockfile` → setup uv（`astral-sh/setup-uv@v6`）→ `test` → Migration tests（从旧站提交 `46a1300b8bdf8beb24a85c8dace88ad8a06e7ff6` 导出 `posts/` 到 `$RUNNER_TEMP/legacy-blog`，并设置 `LEGACY_POSTS_DIR=$RUNNER_TEMP/legacy-blog/posts`）→ `check` → `build` → `validate:publishing` → `node scripts/audit-built-site.mjs --site-url "$SITE_URL"` → 上传 `dist` → deploy。权限为 `contents: read`、`pages: write`、`id-token: write`；使用 `github-pages` environment 和 `pages` 并发组。
- 工作流不需要 secrets。不要提交 SSH key、PAT 或其他 token。
- 仓库公开，push 即发布镜像；生产 VPS 仍是独立的手动流程。

## 6. 生产站（VPS）手动发布

`blog.wangnine.com` 目前仍由 VPS 手动发布。仓库中没有自动部署 VPS 的 workflow，也没有可用的 VPS SSH key、PAT 或其它发布凭据；页面部署成功只代表 GitHub Pages 镜像，不代表生产 VPS 已更新。

后续如要自动化，需先完成一次性配置：

1. 在 VPS 创建仅用于发布的低权限用户和受限目录。
2. 生成专用 SSH key，把公钥放到 VPS，私钥只存 GitHub Environment secret。
3. 固定 host key，避免关闭 host key 校验。
4. 明确发布目录、服务 reload 命令和回滚方式。
5. 用 `workflow_dispatch` 手动触发并验证后，才考虑 push 自动触发。

在这些完成前，保持生产站手动发布；不要改动 NPM、SSL 或 DNS。

## 7. 旧 Hexo 链接与迁移边界

- 旧链接形如 `/posts/<ID>.html`。`scripts/build-legacy-aliases.mjs` 已接入 `pnpm build`，按 `migration/legacy-posts.json` 的 72 个条目生成兼容跳转；构建后的 `validate:publishing` 与 `audit-built-site.mjs` 都会检查这些文件。
- 迁移基线是 75 篇，即 72 篇旧站文章加 3 篇导入笔记。75 是基线，不是永久上限；正常新增文章直接放在 `src/content/posts/`，不需要修改 `migration/legacy-posts.json`。`validate:publishing` 以 72 条 legacy 和至少 3 篇 notes 为基线，`audit-built-site.mjs` 会把构建中实际存在的额外合法文章纳入检查。发布校验以实际合入的脚本和测试为准。
- 3 篇笔记的 frontmatter `slug` 必须保持 `llm-math-numpy-01` 至 `llm-math-numpy-03`，唯一且非空；Astro 5 collection 使用 `entry.slug`，因此 `/posts/llm-math-numpy-0N/` 直接生效，不需要额外路由映射。不要删除或改写这些 slug。
- 媒体修复已应用。`migration/media-repair-report.json` 和 `.md` 的 `status` 为 `applied`：共替换 153 处引用，涉及 39 篇文章；生成 51 个本地 SVG，正文出现 53 处本地引用。统计基线是 149 个不同 HTTPS URL / 152 次引用；补入 1 个仅 HTTP 的 URL 后为 150 个不同 URL / 153 次引用。历史图示按正文重绘为 SVG 或改写为文字说明；原图未找到，原始地址与依据保留在 `migration/legacy-posts.json` 和 `migration/legacy-audit.json`，不表示原始图片已恢复。`scripts/apply-media-repairs.mjs` 保留 `--check` / `--apply` 入口。报告状态 `applied` 只说明媒体替换和静态校验完成，不代表已完成最终浏览器全量 QA 或已发布。
- 回归测试按报告中的 72 篇 legacy 基线哈希严格校验；以后若有意义地修改 legacy 文章，需要重新生成报告。仓库没有自动重生成流程，不要改测试或计数来绕过。
- `src/content/posts/` 中 Wang-nine 的原创文章与图片版权归 Wang-nine 本人所有，不适用 MIT 许可；转载、引用、导入资料和第三方图片以原作者/权利人及原始许可为准，不因仓库 MIT 或任何主题默认许可重新授权。历史图示为重绘或文字说明，不是原始图片文件，原始图片没有被恢复。
- 迁移前站点保存在 `legacy-hexo-20261026` 分支；它是 Hexo 生成的 HTML 站点，不是 Markdown 源文件。迁移后的 Markdown 在 `src/content/posts/legacy/`。

## 8. 不要顺带修改

- `package.json` 的 `test` 与 `test:migration` 已接入，不要移除或改成只跑部分测试。
- `scripts/validate-publishing.mjs` 与 `scripts/audit-built-site.mjs` 的 72 条 legacy / 至少 3 篇 notes 基线是迁移验收的一部分，不要降低；新增合法文章属于正常内容，不要为了容纳新文章去修改 `legacy-posts.json` 或放宽 legacy 数量。
- 媒体修复以 `migration/media-repairs/` 的 packet 与最终报告为准；报告当前为 `applied`。回归测试会按 72 篇 legacy 的基线哈希严格校验，修改 legacy 文章后必须重新生成报告；不要改测试或计数绕过。
- `src/content/posts/`：文章内容由作者维护；除迁移任务外不要在发布流程中改写。
- 主题与设计文件：保持现有 Fuwari 结构，不做与发布无关的 UI 改动。
- NPM 配置、SSL 证书、DNS、VPS 服务配置：不在本发布指南范围内。
