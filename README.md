# Wang-nine 的个人博客

本仓库是个人博客的 Astro 源码，主题基于 [Fuwari](https://github.com/saicaca/fuwari)。生产站为 <https://blog.wangnine.com>，GitHub Pages 镜像是 <https://wang-nine.github.io>。

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `src/content/posts/` | Markdown 文章与文章内图片，按主题分目录 |
| `src/config.ts` | 站点标题、导航、社交链接等站点配置 |
| `astro.config.mjs` | Astro 构建配置；`site` 读取 `SITE_URL` 环境变量，未设置时自动回退到 `https://blog.wangnine.com/` |
| `scripts/new-post.js` | `new-post` 命令使用的文章模板 |
| `scripts/build-legacy-aliases.mjs` | 构建后按 `migration/legacy-posts.json` 生成旧链接跳转页 |
| `public/` | 原样复制到构建产物的静态资源 |
| `docs/PUBLISHING.md` | 写作、测试、构建与发布流程 |
| `.github/workflows/deploy.yml` | push `master` 后测试、构建、验证并部署 GitHub Pages |

## 本地使用

```sh
corepack enable
corepack prepare pnpm@9.14.4 --activate
corepack pnpm install
corepack pnpm new-post <filename>
corepack pnpm dev
corepack pnpm build
corepack pnpm preview
```

直接运行 `corepack pnpm build` 时没有设置 `SITE_URL`，会按生产 origin 构建。要构建 GitHub Pages 镜像，先设置环境变量再构建。

检查与测试：

```sh
corepack pnpm test            # Node 测试：发布校验、旧链接跳转、构建站点审计、媒体修复
corepack pnpm test:migration  # Python 迁移测试；uv 自动使用 Python 3.13，无需全局安装依赖
```

构建 GitHub Pages 镜像并审计：

```powershell
$env:SITE_URL='https://wang-nine.github.io'
corepack pnpm build
corepack pnpm validate:publishing
node scripts/audit-built-site.mjs --site-url $env:SITE_URL
```

构建与审计必须使用同一个 `SITE_URL`。不要先按默认生产 origin 构建，再用 Pages 域名审计。

完整流程（frontmatter、图片、测试、发布、旧链接迁移）见 [docs/PUBLISHING.md](docs/PUBLISHING.md)。

## 发布与备份

- **GitHub Pages 镜像**：<https://wang-nine.github.io>。工作流在 push `master` 或手动触发时设置 `SITE_URL=https://wang-nine.github.io`，checkout 使用 `fetch-depth: 0`，从旧站提交导出 `posts/` 到 `$RUNNER_TEMP/legacy-blog` 并设置 `LEGACY_POSTS_DIR`，依次执行 Node 与 Python 测试、Astro 检查、构建、发布校验和构建产物审计，通过后才上传 `dist`。
- **生产站**：<https://blog.wangnine.com>，仍由 VPS 手动发布；仓库没有 VPS 自动部署流程，也不包含 SSH key 或其它发布凭据。DNS 与 SSL 不变。
- **旧站备份**：`legacy-hexo-20261026` 分支保存迁移前的 Hexo 生成站点（HTML 产物），不是 Markdown 源文件；迁移后的 Markdown 位于 `src/content/posts/legacy/`。
- **旧链接迁移**：`scripts/build-legacy-aliases.mjs` 已接入 `corepack pnpm build`，按 `migration/legacy-posts.json` 的 72 个条目生成 `/posts/<ID>.html` 兼容跳转；`validate:publishing` 与 `scripts/audit-built-site.mjs` 都会检查这些跳转。
- **文章基线**：迁移基线是 75 篇，即 72 篇旧站文章加 3 篇导入笔记。75 是基线，不是永久上限；正常新增文章直接放在 `src/content/posts/`，不需要修改 `migration/legacy-posts.json`。发布校验按 72 条 legacy 与至少 3 篇 notes 检查，并接受新增的普通文章；校验以 `package.json` 和 `tests/` 中的实际脚本为准。
- **媒体修复**：已应用。`migration/media-repair-report.md` 与 `.json` 的 `status` 为 `applied`，共替换 153 处引用，涉及 39 篇文章；生成 51 个本地 SVG，正文出现 53 处本地引用。统计基线保持 149 个不同 HTTPS URL / 152 次引用，补入 1 个仅 HTTP 的 URL 后为 150 个不同 URL / 153 次引用。历史图示按正文重绘为 SVG 或改写为文字说明；原图未找到，原始地址与依据保留在 `migration/legacy-posts.json` 和 `migration/legacy-audit.json`。报告记录 72 篇 legacy 的基线哈希，回归测试会严格校验；以后若有意修改 legacy 文章，需要新的报告，不能改测试或计数绕过。检查入口仍为 `node scripts/apply-media-repairs.mjs --check`。

## 许可与内容权利

- 主题代码（含 Fuwari 上游）按仓库根目录 [LICENSE](LICENSE) 的 MIT 许可使用，版权归原作者。
- `src/content/posts/` 中 Wang-nine 的原创文章与图片版权归 Wang-nine 本人所有，**不**适用 MIT 许可；转载、引用、导入资料和第三方图片以原作者/权利人及原始许可为准，不因仓库 MIT 或任何主题默认许可重新授权。历史图示按正文重绘或改写为说明，不代表原始图片文件已恢复。
