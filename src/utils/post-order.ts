type PublishedPost = {
	slug: string;
	data: { published: Date | string | number };
};

function compareKeys(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

// Keep this explicit course together without changing ordinary posts' chronology.
export function sortPosts<T extends PublishedPost>(posts: readonly T[]): T[] {
	const groups: { key: string; timestamp: number; posts: T[] }[] = [];
	const course: { post: T; lesson: number; timestamp: number }[] = [];

	for (const post of posts) {
		const published = post.data.published;
		const timestamp =
			published instanceof Date
				? published.getTime()
				: new Date(published).getTime();
		const match = /^llm-math-numpy-(\d{2})$/.exec(post.slug);
		const lesson = match ? Number(match[1]) : 0;
		if (lesson > 0) {
			course.push({ post, lesson, timestamp });
		} else {
			groups.push({ key: `post:${post.slug}`, timestamp, posts: [post] });
		}
	}

	if (course.length > 0) {
		course.sort((a, b) => a.lesson - b.lesson);
		groups.push({
			key: "course:llm-math-numpy",
			timestamp: Math.max(...course.map((member) => member.timestamp)),
			posts: course.map((member) => member.post),
		});
	}

	groups.sort(
		(a, b) => b.timestamp - a.timestamp || compareKeys(a.key, b.key),
	);
	return groups.flatMap((group) => group.posts);
}
