# Wang-nine branding: preserve the selected Fuwari theme

## 1. Atmosphere & Identity
Reuse saicaca/fuwari commit `6d39b0dec41282e7852e23e032998a5789abee28` as the component and layout baseline. This is a branding/configuration update, not a redesign. Identity: Wang-nine的小站; subtitle: 技术笔记与学习记录; author: Wang-nine; locale: zh_CN. The audience is readers browsing technical notes and the author revisiting learning records, not prospective customers. Content includes recovered 2023 blog archives and separately imported LLM notes; publication or import is not evidence of independent mastery. Preserve each article's original source and attribution; do not claim all content is original.

Brand direction: use the user-selected static Bilibili video cover featuring 上杉绘梨衣 from `BV1XFspeBEuw` as the banner, and Wang-nine's public GitHub avatar as the profile image. Both are third-party/source-provided raster assets, not newly authored illustrations. Keep the existing cream-cat SVG favicon unchanged. No new hero copy or landing-page sections; do not claim the banner is a 4K original or that the avatar artwork was created by this site.

## 2. Color
Keep upstream `src/styles/variables.styl`, theme hue 250 and the existing visitor color picker. All interface colors continue to use upstream semantic tokens; no CSS overrides. The following legacy illustration-only palette belongs to the retained SVG assets (only the favicon remains configured), not to the new raster assets or interface surfaces:

| Illustration token | Value | Role |
| --- | --- | --- |
| night | `#243953` | Upper sky and favicon background |
| dusk | `#516e99` | Mid-sky |
| sky | `#90b6cf` | Lower sky and avatar background |
| haze | `#d1e5e4` | Horizon and avatar background |
| cloud | `#ecf3eb` | Cloud ribbons and snow |
| moon | `#fff1cf` | Moon and sparse stars |
| far | `#91b8bd` | Distant mountains |
| ridge | `#648f9f` | Middle mountains |
| pine | `#366775` | Near mountains and scarf shadow |
| near | `#244b5c` | Foreground silhouettes |
| cream | `#f7efdf` | Cat fur |
| ear | `#e7c5ba` | Inner ears and cheeks |
| ink | `#263d55` | Cat facial details |
| teal | `#7eafb5` | Scarf and mountain highlights |

Keep the existing SVG favicon below 30 KB uncompressed, without scripts or external resources. Serve the new banner and avatar as local static WebP files; do not add runtime CDN fetches, filters, animation, retouching or watermark removal.

## 3. Typography
Keep upstream Tailwind typography, Roboto body stack and JetBrains Mono code stack. No font substitutions or scale changes.

## 4. Spacing & Layout
Keep upstream layouts, spacing, responsive breakpoints and document scrolling. Configure the existing centered object-cover banner with `/brand/erii-wallpaper.webp` (1906 × 1192), avatar with `/brand/github-avatar.webp` (256 × 256), and the unchanged theme-independent `/brand/favicon.svg` (64 × 64, `sizes: any`). Preserve each downloaded image's full composition and native dimensions when encoding; no upscaling, distortion or guessed focal-point crop. Mobile/desktop character visibility and any source text/watermark require fresh visual inspection by the parent workflow; suitability is not yet verified because this worker cannot view images. If the cover contains large UI/text, report that and request an original still rather than calling it a clean wallpaper or silently retouching it. Keep current long-title wrapping behavior; do not alter header geometry.

Markdown table containment exception: `.custom-md table` uses `display: block`, `max-width: 100%` and `overflow-x: auto` so each wide table owns its horizontal scrolling within the existing card. Preserve all cell content, natural word wrapping, upstream typography, borders and spacing; do not apply blanket `word-break: break-all`, hide overflow content or change the card's clipping. At 390 and 1440 CSS pixels, every column must remain reachable without horizontal document scrolling.

## 5. Components
Reuse all existing Astro/Svelte components and their existing states without modification, including Navbar, Profile, PostCard, Footer, Search, LightDarkSwitch and display settings. No new primitives, showcase, features, dependencies or refactors.

## 6. Motion & Interaction
Keep upstream transitions, Swup navigation, search, theme settings and interactions. No animation changes.

## 7. Depth & Surface
Keep upstream `card-base`, button classes, surface tokens and radii, including `--radius-large`. No surface declaration changes; the sole layout exception is the Markdown table containment rule in Section 4. Build-only exception: markdown.css explicitly imports the unchanged main.css so Tailwind @apply does not depend on incidental module processing order.

## 8. Accessibility Constraints & Accepted Debt
Do not remove existing labels, keyboard behaviors or responsive behavior. Configuration changes must not suppress type diagnostics. Banner and avatar are decorative identity material, not essential instructions or color-only status; retain the upstream image component's accessible names and dark overlay. The unchanged SVG favicon retains its title/description metadata. Enable the upstream banner credit with a link to the Bilibili source. No new motion or dependencies.

Full visual/accessibility/Lighthouse QA is not claimed by this branding task: the parent workflow owns fresh desktop/mobile, light/dark screenshots, banner crops, long-title readability and avatar/favicon inspection. Existing upstream diagnostic findings are reported rather than fixed in unrelated components. Browser verification remains pending until that evidence exists, not silently passed.

## 9. Sources & Asset Provenance
Theme: [saicaca/Fuwari](https://github.com/saicaca/fuwari), MIT; preserve its LICENSE and existing footer credit. Site repository: [Wang-nine/Wang-nine.github.io](https://github.com/Wang-nine/Wang-nine.github.io). The existing cat favicon is the site's previously hand-authored SVG; the former SVG banner/avatar remain unconfigured legacy assets. Third-party images below are not relicensed by the repository's MIT license or article license.

Acquired on **2026-10-28**, via public read-only HTTPS downloads; originals were saved to local temporary storage before conversion with the existing Sharp dependency, WebP quality 92, effort 6. No resize, extraction, upscaling or retouching was applied. Output files contain raster pixels, not scripts or external-resource references.

| Configured asset | Source and attribution | Actual source → local output | Output bytes |
| --- | --- | --- | --- |
| `public/brand/erii-wallpaper.webp` | [Bilibili BV1XFspeBEuw](https://www.bilibili.com/video/BV1XFspeBEuw/), uploader **热门壁纸推荐**, title **世界很温柔《龙族》上杉绘梨衣_4K动态壁纸分享**; [public cover JPEG](https://i0.hdslb.com/bfs/archive/e770e201a0005306a34c5f94618e8c00840064df.jpg) | JPEG 1906 × 1192 → WebP 1906 × 1192 | 262478 |
| `public/brand/github-avatar.webp` | [Wang-nine on GitHub](https://github.com/Wang-nine); [public avatar](https://avatars.githubusercontent.com/u/118722534?v=4&s=256) | JPEG 256 × 256 → WebP 256 × 256 | 9578 |

The video description points to a purported 3840 × 2160 original via [Quark](https://pan.quark.cn/s/b582b9e83e65) and mentions Wallpaper Engine; no original download was obtained. This implementation uses the video cover, not that original, and does not describe its resolution as 4K. The source metadata includes **“未经作者授权禁止转载”**. The uploader is a source credit, not verified authorship or a grant of permission. Rights/redistribution permission for the cover and underlying artwork remain unverified; the user's asset selection is not evidence of the rights holder's authorization. The GitHub account association likewise does not establish authorship or a reusable license for the avatar artwork. Preserve attribution and applicable source terms; do not claim permission, public-domain status or MIT/CC licensing for either image.
