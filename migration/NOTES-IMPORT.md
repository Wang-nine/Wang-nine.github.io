# Notes 导入记录

本次从私人学习仓库导入 3 篇公开知识笔记到 Fuwari。3 篇是 75 篇迁移基线中的 notes 部分，不是笔记数量上限。导入不包含学习档案、练习答案或课堂记录。

## Allowlist（允许导入的源文件）

只读取并导出了以下 3 个文件：

1. `notes/02-math-numpy/01-prediction-and-loss.md`
2. `notes/02-math-numpy/02-bias-and-loss.md`
3. `notes/02-math-numpy/03-stationary-points.md`

明确排除：

- `notes/README.md`：索引含有指向 `learning-state/` 与 `exercises/` 的私人路径。
- `learning-state/` 下的 profile、overview、questions、reviews、sessions。
- `exercises/` 下的全部学生代码与练习产物。
- `curriculum/`、`AGENTS.md`、教师档案、任何课堂对话或提交历史。
- 源仓库中的其它笔记和未列出的文件。

源仓库文件未被修改，本次也没有从源仓库复制整目录。

## 输出文件

| 输出 | Slug | 标题 |
| --- | --- | --- |
| `src/content/posts/llm-learning/math-numpy/01-prediction-and-loss.md` | `llm-math-numpy-01` | 01 前向预测与 MSE：从 batch 输入到标量损失 |
| `src/content/posts/llm-learning/math-numpy/02-bias-and-loss.md` | `llm-math-numpy-02` | 02 bias 与损失：局部变化率与导数入门 |
| `src/content/posts/llm-learning/math-numpy/03-stationary-points.md` | `llm-math-numpy-03` | 03 驻点与局部极值：导数为零说明什么 |

每篇均使用 Fuwari frontmatter：`published`、`description`、`image: ''`、`tags`、`category: "LLM 学习"`、`draft: false`、`lang: zh_CN`、`slug`。标签以 `LLM`、`NumPy`、`数学基础` 为基础，分别补充 `MSE`、`bias` 与 `导数`、`导数` 与 `驻点`。

## 正文处理

- 三篇原文的首个 H1 均被删除，避免与 frontmatter 标题形成双重标题。frontmatter 标题与原文 H1 文本一致。
- 标题以下的章节、说明文字、公式块、表格、代码块与教师归因全部保留。
- 删除的仅是文末私人产物段：练习代码链接与 `learning-state/sessions/` 课堂记录链接。
- 02、03 原文的上一篇相对链接改为规范站内路径 `/posts/llm-math-numpy-01/`、`/posts/llm-math-numpy-02/`。
- 原文中的 M2.1、M2.4、M2.5 等课程内部编号保留，因为它们限定知识范围，不构成掌握声明。
- 原文中的“不是掌握记录，也不是练习答案”“以上展开由教师给出”等教师归因与边界说明保留。

## 日期策略

原文没有可验证的首次发布时间，课堂日期也不等同于公开发布日期。三篇统一使用导入日期 `2026-10-26` 作为 `published`，不写 `updated`，不声称原始课堂时间。每篇文末附注：

> 本文于2026-10-26整理公开，日期为导入日期。

## 隐私与秘密检查

- 已检查三篇正文与 frontmatter：未发现凭证、token、密码、API key、邮箱地址、私有绝对路径、`learning-state` 或 `exercises` 引用。
- 未导入 `notes/README.md` 的私人路径，也未导入任何学生实现。
- 代码块仅为讲解 shape、差商与索引的示例，不是练习解答。
- 未写入用户代码、课堂总结、个人档案或会话记录。

## 链接状态

- 私人链接：已清除，0 个残留。
- 站内交叉链接：使用任务指定的规范路径 `/posts/llm-math-numpy-01/`、`/posts/llm-math-numpy-02/`。
- 外部来源：NumPy 官方文档链接保留。
- 路由：Astro 5 的 collection 使用 `entry.slug`，frontmatter `slug: "llm-math-numpy-0N"` 会生成 `/posts/llm-math-numpy-0N/`。上述规范交叉链接直接生效，不需要额外的路由映射或 schema 改动。

## 后续新增与校验

- 这 3 篇是迁移基线中的 notes 部分，不是永久上限。以后新增普通文章或笔记直接放在 `src/content/posts/`，不需要修改 `migration/legacy-posts.json`；发布校验按 72 条 legacy 与至少 3 篇 notes 的基线检查，并接受新增内容。
- 新增或重写同系列笔记时，必须保留有效且唯一的 frontmatter `slug`（本系列为 `llm-math-numpy-01` 至 `llm-math-numpy-03`）。slug 为空、重复或与 legacy id 冲突会造成分类或路由异常。
- 发布校验与媒体修复工具已合入；媒体修复报告状态为 `applied`，细节见 `migration/media-repair-report.md`。具体行为以实际脚本和测试为准。媒体修复完成不等同于最终浏览器全量 QA 或发布完成。

## 操作边界

仅写入上述 3 篇文章与本记录。未修改源学习仓库，未提交或推送 git，未改动依赖、配置或界面，未触碰 `migration/` 中其它 agent 的文件。
