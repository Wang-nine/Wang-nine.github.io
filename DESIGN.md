# Wang-nine branding: preserve the selected Fuwari theme

## 1. Atmosphere & Identity
Reuse saicaca/fuwari commit `6d39b0dec41282e7852e23e032998a5789abee28` as the component and layout baseline. This is a branding/configuration update, not a redesign. Identity: Wang-nine的小站; subtitle: 技术笔记与学习记录; author: Wang-nine; locale: zh_CN. The audience is readers browsing technical notes and the author revisiting learning records, not prospective customers. Content includes recovered 2023 blog archives and separately imported LLM notes; publication or import is not evidence of independent mastery. Preserve each article's original source and attribution; do not claim all content is original.

Brand direction: preserve the user-selected 上杉绘梨衣 / Tokyo Tower sunset artwork, using the clean animated wallpaper distributed by MotionBGS with its existing static WebP fallback instead of the previously used Bilibili `BV1XFspeBEuw` video cover with an embedded 4K label. Keep Wang-nine's public GitHub avatar unchanged. These are third-party/source-provided assets, not newly authored illustrations. Keep the existing cream-cat SVG favicon unchanged. No new hero copy or landing-page sections; do not claim the banner is an original or native-4K artwork or that the avatar artwork was created by this site.

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

Keep the existing SVG favicon below 30 KB uncompressed, without scripts or external resources. Serve banner video, static poster and avatar locally; no runtime CDN fetches, filters, synthetic animation, retouching or watermark removal. The sole new motion is the source-provided banner video explicitly requested by the user.

## 3. Typography
Keep upstream Tailwind typography, Roboto body stack and JetBrains Mono code stack. No font substitutions or scale changes.

## 4. Spacing & Layout
Keep upstream layouts, spacing, responsive breakpoints and document scrolling. Configure the existing object-cover banner with `/brand/erii-wallpaper.webp` (3840 × 2160) and the user-accepted `center` position, avatar with `/brand/github-avatar.webp` (256 × 256), and the unchanged theme-independent `/brand/favicon.svg` (64 × 64, `sizes: any`). Preserve each downloaded image's full composition and supplied dimensions when encoding; no upscaling, distortion or destructive focal-point crop. Actual image inspection confirms the same character, head duck and Tokyo Tower scene, with different bird positions from the former animated-wallpaper cover; no white frame, 4K label or watermark was observed. The character detail is somewhat soft at 1:1, so supplied dimensions do not establish native artwork resolution. Chrome browser checks at measured 390 × 844 and 1440 × 900 viewports, on the homepage and `/posts/llm-math-numpy-07/` in light/dark, confirmed full image coverage, no source badge or white bars, readable navigation and no horizontal document overflow. The accepted center crop shows the face on the desktop homepage, but the navigation obscures the duck and the face on desktop inner pages. Mobile horizontal cropping excludes most of the left-side character and the duck; the supported position setting does not provide horizontal focal-point control. Do not claim complete character visibility on mobile. An exploratory browser-only top-position probe improved desktop face/duck visibility but is not shipped; source configuration is restored to the built, tested and user-accepted center setting. Keep current long-title wrapping behavior; do not alter header geometry.

Markdown table containment exception: `.custom-md table` uses `display: block`, `max-width: 100%` and `overflow-x: auto` so each wide table owns its horizontal scrolling within the existing card. Preserve all cell content, natural word wrapping, upstream typography, borders and spacing; do not apply blanket `word-break: break-all`, hide overflow content or change the card's clipping. At 390 and 1440 CSS pixels, every column must remain reachable without horizontal document scrolling.

## 5. Components
Reuse all existing Astro/Svelte components and their existing states without modification, including Navbar, Profile, PostCard, Footer, Search, LightDarkSwitch and display settings. Banner-only exception: `BannerMedia.astro` layers a local video over the existing ImageWrapper poster and preserves the original banner ID, geometry, object-position and reveal classes. A small native pause/resume button occupies the left of the existing credit row; the source credit remains at right. No new dependencies or general refactors.

## 6. Motion & Interaction
Keep upstream transitions, Swup navigation, search, theme settings and interactions. User-requested banner exception: local MP4, muted autoplay, loop and playsinline, decorative/aria-hidden with no audio stream. Reveal only after `playing`; rejected autoplay or decoding/network errors leave the clean static image visible. A keyboard-operable “暂停背景 / 播放背景” button lets visitors pause motion. Pause when the page is hidden and resume on return unless the visitor paused it. Reduced-motion, Save-Data and viewport widths below 768 CSS pixels remain static: the video has no src until these checks pass, so those initial modes do not download the MP4. Preference/viewport changes stop playback and clear the src. JavaScript disabled also remains static. Mobile uses static artwork deliberately to avoid a 5.2 MiB decorative video download; no GIF is used.

## 7. Depth & Surface
Keep upstream `card-base`, button classes, surface tokens and radii, including `--radius-large`. No surface declaration changes; the sole layout exception is the Markdown table containment rule in Section 4. Build-only exception: markdown.css explicitly imports the unchanged main.css so Tailwind @apply does not depend on incidental module processing order.

## 8. Accessibility Constraints & Accepted Debt
Do not remove existing labels, keyboard behaviors or responsive behavior. Configuration changes must not suppress type diagnostics. Banner and avatar are decorative identity material, not essential instructions or color-only status; retain the upstream image component's accessible names and dark overlay. The unchanged SVG favicon retains its title/description metadata. Enable the upstream banner credit with a link to the MotionBGS wallpaper distribution page. The video is decorative and hidden from assistive technology; the visible pause/resume button has text, a focus-visible outline and native keyboard activation. No new dependencies.

Full visual/accessibility/Lighthouse QA is not claimed by this branding task. The banner-only Chrome screenshot checks described above cover the initial homepage/new-note viewport in light/dark, navigation legibility and image coverage/cropping; they do not constitute keyboard, contrast, scroll-state, avatar/favicon or full-site accessibility testing. Existing upstream diagnostic findings are reported rather than fixed in unrelated components.

Dynamic-banner verification on 2026-10-30 additionally used Chrome/CDP at 1440 × 900 and 390 × 844: playback time advanced and looped; keyboard pause/resume, background-tab pause/foreground resume, and Swup navigation retained working controls. Initial reduced-motion/mobile modes made no MP4 requests; a blocked video request left the static poster visible. Seven note pages rendered all 36 formulas without KaTeX errors or document overflow, with long formulas scrollable inside their containers. Archive ordering follows publication date descending, with descending slug ties. These targeted checks do not establish full-site accessibility compliance.

User visual acceptance: the parent reported the user's explicit preview response **“没问题”** on 2026-10-30. This is separate user approval, not evidence of an additional automated or pixel inspection. At visual-lane close, the preview returned HTTP 200 and served `object-position: center`; source configuration matches that accepted, built and screenshot-tested state. No additional design iteration is included after user acceptance.

## 9. Sources & Asset Provenance
Theme: [saicaca/Fuwari](https://github.com/saicaca/fuwari), MIT; preserve its LICENSE and existing footer credit. Site repository: [Wang-nine/Wang-nine.github.io](https://github.com/Wang-nine/Wang-nine.github.io). The existing cat favicon is the site's previously hand-authored SVG; the former SVG banner/avatar remain unconfigured legacy assets. Third-party images below are not relicensed by the repository's MIT license or article license.

Banner replaced on **2026-10-30**; avatar acquired on **2026-10-28**, via public read-only HTTPS downloads. Source downloads were saved to local temporary storage before conversion with the existing Sharp dependency, WebP quality 92, effort 6. No resize, extraction, upscaling or retouching was applied to the configured assets. Output files contain raster pixels, not scripts or external-resource references.

| Configured asset | Source and attribution | Actual source → local output | Output bytes |
| --- | --- | --- | --- |
| `public/brand/erii-wallpaper.webp` | [MotionBGS: Uesugi Erii Sunrise Above The City](https://motionbgs.com/uesugi-erii-sunrise-above-the-city), third-party wallpaper distribution; [static JPEG](https://motionbgs.com/media/8782/uesugi-erii-sunrise-above-the-city.3840x2160.jpg) (544140 bytes) | JPEG 3840 × 2160 → WebP 3840 × 2160 | 419550 |
| `public/brand/erii-wallpaper.mp4` | Same MotionBGS page; [1080p MP4](https://motionbgs.com/media/8782/uesugi-erii-sunrise-above-the-city.1920x1080.mp4) (7686013 bytes), downloaded to approved temporary storage on 2026-10-30 | H.264 1920 × 1080, 30 fps, 311 frames, 10.367 s → H.264 High level 4.1 / yuv420p at the same dimensions, frame rate and duration; no audio; faststart | 5436303 |
| `public/brand/github-avatar.webp` | [Wang-nine on GitHub](https://github.com/Wang-nine); [public avatar](https://avatars.githubusercontent.com/u/118722534?v=4&s=256) | JPEG 256 × 256 → WebP 256 × 256 | 9578 |

Video processing: no system ffmpeg was found; a standalone ffmpeg 7.1 executable was obtained in a temporary tool environment, without modifying project dependencies. Encoding uses `libx264 -preset slow -crf 21 -refs 4 -level:v 4.1 -pix_fmt yuv420p -an -movflags +faststart -map_metadata -1`. No resizing, upscaling, trimming, added motion or watermark removal. The 5.18 MiB output is approximately 29% smaller than the source and below the 8 MiB target and 32 MiB per-file deployment limit. Source and output multi-frame contact sheets show the same character/duck/Tokyo Tower artwork, changing birds, hair and clothing; no baked badge, border or caption was observed. First and final decoded frames are visually close; retain the distributor's full loop rather than promising a mathematically seamless loop. Browser verification is recorded separately after the parent build.

The former 1906 × 1192 Bilibili cover was rejected because its pixels include a large 4K badge; it is no longer configured. MotionBGS distributes a clean static image and animated video of the same scene, not a verified original artwork; actual decoded 3840 × 2160 static dimensions do not prove native-4K detail or original authorship. Foreground birds have deliberate motion blur, and character detail is softer than the pixel count alone suggests. No badge removal, white-border trimming, retouching or generated replacement was performed. The work can be traced to the official **龙族卡塞尔之门** account's [《动态壁纸第六弹 - 世界很温柔》](https://www.bilibili.com/video/BV1ziWneGEpx/), published 2024-08-20, with a 1920 × 1080 video and an [officially shared material link](https://pan.baidu.com/s/14LGKv7qRdRV05xMyvTcIwQ?pwd=h08a) (code `h08a`); this provenance does not establish that the MotionBGS JPEG is an official native-4K file. [Wallpaper Engine Workshop item 3314492008](https://steamcommunity.com/sharedfiles/filedetails/?id=3314492008) describes 4K repair rather than native-4K artwork. The official material archive was not downloaded for this replacement. The former Bilibili cover source metadata includes **“未经作者授权禁止转载”**; changing distributors does not resolve the underlying artwork's rights. MotionBGS is credited as the actual download source, not a verified artist or permission grant. The individual artist and blog redistribution permission remain unverified; official publication and the user's asset selection are not evidence of permission to republish here. The GitHub account association likewise does not establish authorship or a reusable license for the avatar artwork. Preserve attribution and applicable source terms; do not claim permission, public-domain status or MIT/CC licensing for either image.
