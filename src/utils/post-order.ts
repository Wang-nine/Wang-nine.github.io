type PublishedPost = {
	slug: string;
	data: { published: Date | string | number };
};

// Sort all posts by publication date, with deterministic descending slug ties.
export function sortPosts<T extends PublishedPost>(posts: readonly T[]): T[] {
	const timestamp = (post: T): number => {
		const published = post.data.published;
		return published instanceof Date
			? published.getTime()
			: new Date(published).getTime();
	};
	return [...posts].sort(
		(a, b) =>
			timestamp(b) - timestamp(a) ||
			(a.slug < b.slug ? 1 : a.slug > b.slug ? -1 : 0),
	);
}
