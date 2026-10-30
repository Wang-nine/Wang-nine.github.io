import type {
	ExpressiveCodeConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	SiteConfig,
} from "./types/config";
import { LinkPreset } from "./types/config";

export const siteConfig: SiteConfig = {
	title: "Wang-nine的小站",
	subtitle: "技术笔记与学习记录",
	lang: "zh_CN",
	themeColor: {
		hue: 250,
		fixed: false,
	},
	banner: {
		enable: true,
		src: "/brand/erii-wallpaper.webp", // 以 / 开头的资源路径对应 public 目录。
		video: "/brand/erii-wallpaper.mp4",
		position: "center",
		credit: {
			enable: true,
			text: "壁纸来源 · MotionBGS",
			url: "https://motionbgs.com/uesugi-erii-sunrise-above-the-city",
		},
	},
	toc: {
		enable: true,
		depth: 2,
	},
	favicon: [
		{ src: "/brand/favicon.svg", sizes: "any" },
	],
};

export const navBarConfig: NavBarConfig = {
	links: [
		LinkPreset.Home,
		LinkPreset.Archive,
		LinkPreset.About,
		{
			name: "GitHub",
			url: "https://github.com/Wang-nine",
			external: true,
		},
	],
};

export const profileConfig: ProfileConfig = {
	avatar: "/brand/github-avatar.webp",
	name: "Wang-nine",
	bio: "记录 Java 后端与 LLM 学习，也整理前端、数据库和工具笔记。",
	links: [
		{
			name: "GitHub",
			icon: "fa6-brands:github",
			url: "https://github.com/Wang-nine",
		},
	],
};

export const licenseConfig: LicenseConfig = {
	// 关闭统一许可卡片；各篇文章的权利归属与许可均以原始来源为准。
	enable: false,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const expressiveCodeConfig: ExpressiveCodeConfig = {
	theme: "github-dark",
};
