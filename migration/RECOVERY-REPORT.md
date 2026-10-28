# Legacy Blog Recovery Report

## Outcome

- Source: `C:/Users/admin/AppData/Local/Temp/opencode/legacy-blog-20261026/posts` (72 immutable HTML files expected, 72 recovered).
- Markdown: `src/content/posts/legacy/*.md` (72 files).
- Manifest: `migration/legacy-posts.json` (72 entries).
- Audit: **72/72 pass**, 0 with unexplained loss.
- Code: 408 blocks / 6345 lines compared exactly.
- Tables: 110 tables / 1623 cells compared.
- Links: 64 source links, 64 rendered links.
- Body images: 153 references (149 unique URLs); localized 0; unresolved 152 references.
- Empty source bodies kept as posts: 10003, 10103, 10800.

## Categories

| Category | Posts |
|---|---|
| Java | 4 |
| 后端开发 | 26 |
| 前端开发 | 8 |
| 数据库 | 26 |
| 工具与工程 | 6 |
| 随笔 | 2 |

## Assets

- No theme gallery/cover assets were copied. Only body `<img>` references were considered.
- **Blocked:** 149 unique body image URLs could not be localized. The old origin `wang-nine.cn` failed DNS resolution during the bounded fetch pass, and the backup contains no `images/` payloads. Original URLs remain in the Markdown.
- Unresolved classes: {'unavailable': 152}.
- Exact unresolved URLs and reasons are in each manifest entry's `unresolvedAssets`.
- No claim is made that these images render; they are explicitly unresolved.

## Audit method

- Article bodies were extracted with BeautifulSoup from `#article-container`; no regex body extraction.
- Prose: source DOM text (code/tables/embeds excluded) is compared character-for-character after whitespace/punctuation folding against Markdown rendered by markdown-it.
- Code: each source code block text (gutter cells excluded) is compared exactly to the parsed fence content after newline normalization.
- Tables: every source table cell count and normalized cell text is compared to the rendered table.
- Links/images: counts are compared after article-link rewriting and image resolution.
- A post only passes when all five checks pass; a count alone is not accepted as proof.

## Warnings

- 2 body image(s) unresolved; original URLs kept: 12
- 1 body image(s) unresolved; original URLs kept: 9
- 4 body image(s) unresolved; original URLs kept: 4
- 5 body image(s) unresolved; original URLs kept: 3
- 3 body image(s) unresolved; original URLs kept: 2
- 9 body image(s) unresolved; original URLs kept: 2
- 8 body image(s) unresolved; original URLs kept: 2
- 6 body image(s) unresolved; original URLs kept: 2
- 13 body image(s) unresolved; original URLs kept: 2
- 10 body image(s) unresolved; original URLs kept: 1
- media placeholder preserved as inert HTML code: 1
- unconvertible table preserved as sanitized raw HTML: 1
- literal unclosed <script> in prose escaped to text: 1
- no legacy category; mapped to 随笔: 1
- Title fallback used: none.
- Unconvertible tables preserved as sanitized raw HTML: 1.
- Post `5` genuinely has the source title `无题`; it is preserved, not invented.

## Per-post audit

| id | title | category | code | tables | links | images | prose loss | status | notes |
|---|---|---|---:|---:|---:|---:|---:|---|---|
| 1 | 博客更新文档 | 工具与工程 | 1 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10000 | 博客搭建教程总览 | 工具与工程 | 0 | 0 | 3/3 | 0/0 | 0 | pass | — |
| 10001 | Hexo+Butterfly主题博客搭建01 | 工具与工程 | 4 | 0 | 3/3 | 3/3 | 0 | pass | 3 unresolved image(s) |
| 10002 | Hexo-Butterfly主题博客搭建02 | 工具与工程 | 3 | 0 | 1/1 | 0/0 | 0 | pass | — |
| 10003 | Hexo-Butterfly主题博客搭建03 | 工具与工程 | 0 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10101 | Java中的多线程 | Java | 21 | 14 | 0/0 | 9/9 | 0 | pass | 9 unresolved image(s) |
| 10102 | JavaSE02-Java中的文件与方法递归与IO流 | Java | 1 | 4 | 0/0 | 0/0 | 0 | pass | — |
| 10103 | JavaSE03-Java高级 | Java | 0 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10300 | SSM总览 | 后端开发 | 0 | 0 | 8/8 | 0/0 | 0 | pass | — |
| 10301 | SSM01-Spring中的Bean | 后端开发 | 10 | 0 | 0/0 | 5/5 | 0 | pass | 5 unresolved image(s) |
| 10302 | SSM02-Spring中Bean的实例化与依赖注入 | 后端开发 | 21 | 0 | 0/0 | 8/8 | 0 | pass | 8 unresolved image(s) |
| 10303 | SSM03-Spring的纯注解开发模式 | 后端开发 | 14 | 1 | 0/0 | 4/4 | 0 | pass | 4 unresolved image(s) |
| 10304 | SSM04-Spring整合MyBatis | 后端开发 | 7 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10305 | SSM05-Spring中的AOP概念 | 后端开发 | 5 | 0 | 0/0 | 2/2 | 0 | pass | 2 unresolved image(s) |
| 10306 | SSM06-Spring中的事务 | 后端开发 | 3 | 1 | 0/0 | 1/1 | 0 | pass | 1 unresolved image(s) |
| 10307 | SSM07-SpringMVC的请求与响应 | 后端开发 | 15 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10308 | SSM08-REST风格 | 后端开发 | 2 | 0 | 9/9 | 0/0 | 0 | pass | — |
| 10309 | SSM09-SSM整合 | 后端开发 | 13 | 0 | 1/1 | 2/2 | 0 | pass | 2 unresolved image(s) |
| 10310 | SSM10-SSM整合深入 | 后端开发 | 3 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10312 | SSM12-MybatisPlus | 后端开发 | 17 | 1 | 0/0 | 2/2 | 0 | pass | 2 unresolved image(s) |
| 10400 | MySQL总览 | 数据库 | 0 | 0 | 11/11 | 0/0 | 0 | pass | — |
| 10401 | MySQL01-基础语法 | 数据库 | 27 | 4 | 0/0 | 0/0 | 0 | pass | — |
| 10402 | MySQL02-事务 | 数据库 | 0 | 2 | 0/0 | 0/0 | 0 | pass | — |
| 10403 | MySQL03-存储引擎 | 数据库 | 0 | 1 | 0/0 | 2/2 | 0 | pass | 2 unresolved image(s) |
| 10404 | MySQL04-索引01-结构 | 数据库 | 0 | 5 | 2/2 | 2/2 | 0 | pass | 1 unresolved image(s) |
| 10405 | MySQL4-索引02-性能分析 | 数据库 | 0 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10406 | MySQL04-索引03-使用规则 | 数据库 | 0 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10407 | MySQL05-SQL优化 | 数据库 | 0 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10408 | MySQL06-存储过程 | 数据库 | 39 | 1 | 1/1 | 9/9 | 0 | pass | 9 unresolved image(s) |
| 10409 | MySQL07-存储函数 | 数据库 | 2 | 0 | 0/0 | 2/2 | 0 | pass | 2 unresolved image(s) |
| 10410 | MySQL08-触发器 | 数据库 | 7 | 1 | 0/0 | 6/6 | 0 | pass | 6 unresolved image(s) |
| 10411 | MySQL09-视图 | 数据库 | 4 | 0 | 0/0 | 2/2 | 0 | pass | 2 unresolved image(s) |
| 10412 | MySQL10-锁 | 数据库 | 10 | 3 | 0/0 | 2/2 | 0 | pass | 2 unresolved image(s) |
| 10413 | MySQL11-InnoDB引擎01-架构 | 数据库 | 0 | 0 | 0/0 | 10/10 | 0 | pass | 10 unresolved image(s) |
| 10414 | MySQL11-InnoDB引擎02-事务原理 | 数据库 | 0 | 0 | 0/0 | 1/1 | 0 | pass | 1 unresolved image(s) |
| 10415 | MySQL12-MVCC多版本并发控制 | 数据库 | 1 | 2 | 0/0 | 2/2 | 0 | pass | 2 unresolved image(s) |
| 10500 | HTML5+CSS3总览 | 前端开发 | 0 | 0 | 5/5 | 0/0 | 0 | pass | — |
| 10501 | HTML5+CSS301-HTML | 前端开发 | 8 | 13 | 0/0 | 0/0 | 0 | pass | — |
| 10502 | HTML5+CSS302-CSS | 前端开发 | 40 | 26 | 2/2 | 1/1 | 0 | pass | 1 unresolved image(s), raw table fallback |
| 10503 | HTML5+CSS303-综合页面设计 | 前端开发 | 3 | 0 | 0/0 | 1/1 | 0 | pass | 1 unresolved image(s) |
| 10504 | HTML5+CSS304-前端项目学习 | 前端开发 | 6 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10505 | HTML5+CSS305-移动端Web | 前端开发 | 0 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10600 | SpringCloud00-总览 | 后端开发 | 0 | 0 | 9/9 | 0/0 | 0 | pass | — |
| 10601 | SpringCloud01-微服务简介 | 后端开发 | 0 | 1 | 0/0 | 2/2 | 0 | pass | 2 unresolved image(s) |
| 10602 | SpringCloud02-服务拆分 | 后端开发 | 2 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10603 | SpringCloud03-Eureka | 后端开发 | 6 | 0 | 0/0 | 1/1 | 0 | pass | 1 unresolved image(s) |
| 10604 | SpringCloud04-Ribbon负载均衡 | 后端开发 | 3 | 1 | 0/0 | 1/1 | 0 | pass | 1 unresolved image(s) |
| 10605 | SpringCloud05-Nacos | 后端开发 | 10 | 0 | 0/0 | 6/6 | 0 | pass | 6 unresolved image(s) |
| 10606 | SpringCloud06-Feign | 后端开发 | 13 | 1 | 0/0 | 2/2 | 0 | pass | 2 unresolved image(s) |
| 10607 | SpringCloud07-Gateway | 后端开发 | 4 | 1 | 0/0 | 4/4 | 0 | pass | 4 unresolved image(s) |
| 10608 | SpringCloud08-Docker | 后端开发 | 18 | 1 | 4/4 | 8/8 | 0 | pass | 8 unresolved image(s) |
| 10609 | SpringCloud09-MQ | 后端开发 | 0 | 1 | 0/0 | 2/2 | 0 | pass | 2 unresolved image(s) |
| 10700 | Redis00-基础 | 数据库 | 0 | 0 | 0/0 | 4/4 | 0 | pass | 4 unresolved image(s) |
| 10701 | Redis00-基础 | 数据库 | 10 | 1 | 0/0 | 0/0 | 0 | pass | — |
| 10702 | Redis02-命令 | 数据库 | 1 | 10 | 1/1 | 0/0 | 0 | pass | — |
| 10703 | Redis03-Jedis | 数据库 | 5 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10704 | Redis04-SpringDataRedis | 数据库 | 7 | 1 | 0/0 | 0/0 | 0 | pass | — |
| 10705 | Redis05-短信登陆 | 数据库 | 2 | 0 | 0/0 | 4/4 | 0 | pass | 4 unresolved image(s) |
| 10706 | Redis06-缓存 | 数据库 | 0 | 2 | 0/0 | 5/5 | 0 | pass | 5 unresolved image(s) |
| 10707 | Redis07-秒杀 | 数据库 | 0 | 0 | 0/0 | 5/5 | 0 | pass | 5 unresolved image(s) |
| 10708 | Redis08-分布式锁 | 数据库 | 1 | 1 | 0/0 | 13/13 | 0 | pass | 13 unresolved image(s) |
| 10709 | Redis09-消息队列 | 数据库 | 0 | 0 | 0/0 | 3/3 | 0 | pass | 3 unresolved image(s) |
| 10800 | JavaScript总览 | 前端开发 | 0 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 10801 | JavaScript01-基础 | 前端开发 | 13 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 20002 | VIM基础教程 | 工具与工程 | 1 | 4 | 2/2 | 13/13 | 0 | pass | 13 unresolved image(s) |
| 20004 | Mybatis基础入门 | 后端开发 | 4 | 2 | 0/0 | 1/1 | 0 | pass | 1 unresolved image(s) |
| 20005 | SpringBoot基础原理 | 后端开发 | 0 | 1 | 0/0 | 0/0 | 0 | pass | — |
| 20006 | 项目重构 | 后端开发 | 10 | 0 | 0/0 | 2/2 | 0 | pass | 2 unresolved image(s) |
| 20007 | JUC | Java | 0 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 20230717 | 分析 | 随笔 | 0 | 1 | 0/0 | 0/0 | 0 | pass | — |
| 5 | 无题 | 随笔 | 0 | 0 | 0/0 | 0/0 | 0 | pass | — |
| 999999999 | 后端 | 后端开发 | 11 | 2 | 2/2 | 1/1 | 0 | pass | 1 unresolved image(s) |

## Reproduce

```bash
uv run scripts/migration/convert_legacy.py \
  --source C:/Users/admin/AppData/Local/Temp/opencode/legacy-blog-20261026/posts \
  --site . --fetch-assets
uv run --with pytest --with beautifulsoup4==4.13.4 --with markdown-it-py==4.0.0 \
  --with markdownify==1.1.0 --with typer==0.16.0 pytest tests/migration -q
```
