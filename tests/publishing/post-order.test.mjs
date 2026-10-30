import assert from "node:assert/strict";
import test from "node:test";
import { sortPosts } from "../../src/utils/post-order.ts";

function post(slug, day) {
	return { slug, data: { published: new Date(`2026-10-${String(day).padStart(2, "0")}T00:00:00Z`) } };
}

function lesson(number, day = number) {
	return post(`llm-math-numpy-${String(number).padStart(2, "0")}`, day);
}

function slugs(posts) {
	return posts.map((entry) => entry.slug);
}

test("publication date takes precedence over course lesson numbers", () => {
	const input = [lesson(7, 1), lesson(1, 20), lesson(3, 10)];
	assert.deepEqual(slugs(sortPosts(input)), [lesson(1).slug, lesson(3).slug, lesson(7).slug]);
});

test("equal-date course notes sort deterministically from 07 to 01", () => {
	const input = [7, 6, 4, 5, 1, 2, 3].map((number) => lesson(number, 10));
	const expected = Array.from({ length: 7 }, (_, i) => lesson(7 - i).slug);
	assert.deepEqual(slugs(sortPosts(input)), expected);
	assert.deepEqual(slugs(sortPosts([...input].reverse())), expected);
});

test("ordinary posts and course notes interleave by date without grouping", () => {
	const input = [post("old", 1), lesson(3, 15), post("between", 12), lesson(1, 3), post("newer", 20), lesson(2, 7), post("middle", 10)];
	assert.deepEqual(slugs(sortPosts(input)), ["newer", lesson(3).slug, "between", "middle", lesson(2).slug, lesson(1).slug, "old"]);
});

test("all equal-date slugs use an input-independent descending tie break", () => {
	const input = [post("zebra", 10), lesson(2, 10), post("alpha", 10), lesson(1, 10)];
	const expected = ["zebra", lesson(2).slug, lesson(1).slug, "alpha"];
	for (const permutation of [input, [...input].reverse(), [input[2], input[0], input[3], input[1]]]) {
		assert.deepEqual(slugs(sortPosts(permutation)), expected);
	}
});

test("supports Date, string and numeric publication values, single posts and empty input", () => {
	const input = [post("date", 3), { slug: "string", data: { published: "2026-10-02T00:00:00Z" } }, { slug: "number", data: { published: Date.UTC(2026, 9, 4) } }];
	assert.deepEqual(slugs(sortPosts(input)), ["number", "date", "string"]);
	assert.deepEqual(sortPosts([input[0]]), [input[0]]);
	assert.deepEqual(sortPosts([]), []);
});

test("does not mutate input, post objects, or publication dates", () => {
	const input = [lesson(1, 1), post("ordinary", 10), lesson(2, 20)];
	const original = [...input];
	const dates = input.map((entry) => entry.data.published);
	const timestamps = dates.map((date) => date.getTime());
	for (const entry of input) {
		Object.freeze(entry.data.published);
		Object.freeze(entry.data);
		Object.freeze(entry);
	}
	Object.freeze(input);
	const result = sortPosts(input);
	assert.notEqual(result, input);
	assert.deepEqual(input, original);
	assert.deepEqual(result, [input[2], input[1], input[0]]);
	input.forEach((entry, index) => {
		assert.equal(entry, original[index]);
		assert.equal(entry.data.published, dates[index]);
		assert.equal(entry.data.published.getTime(), timestamps[index]);
	});
	result.forEach((entry) => assert.ok(input.includes(entry)));
});
