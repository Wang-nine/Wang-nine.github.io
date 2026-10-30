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

test("orders all seven shuffled course notes by lesson, not publication date", () => {
	const input = [lesson(7, 20), lesson(6, 19), lesson(4, 18), lesson(5, 17), lesson(1, 16), lesson(2, 15), lesson(3, 14)];
	assert.deepEqual(slugs(sortPosts(input)), Array.from({ length: 7 }, (_, i) => lesson(i + 1).slug));
});

test("anchors the contiguous course at its newest member and keeps ordinary chronology", () => {
	const input = [post("old", 1), lesson(3, 15), post("between", 12), lesson(1, 3), post("newer", 20), lesson(2, 7), post("middle", 10)];
	assert.deepEqual(slugs(sortPosts(input)), ["newer", lesson(1).slug, lesson(2).slug, lesson(3).slug, "between", "middle", "old"]);
});

test("equal-date groups and ordinary posts have input-independent tie breaks", () => {
	const input = [post("zebra", 10), lesson(2, 10), post("alpha", 10), lesson(1, 5)];
	const expected = [lesson(1).slug, lesson(2).slug, "alpha", "zebra"];
	for (const permutation of [input, [...input].reverse(), [input[2], input[0], input[3], input[1]]]) {
		assert.deepEqual(slugs(sortPosts(permutation)), expected);
	}
});

test("only exact positive two-digit course slugs are grouped", () => {
	const lookalikes = ["llm-math-numpy-00", "llm-math-numpy-1", "llm-math-numpy-001", "llm-math-numpy-01-extra", "other-llm-math-numpy-01", "LLM-math-numpy-01", "llm-math-numpy"];
	const input = lookalikes.map((slug, index) => post(slug, 20 - index));
	input.push(lesson(2, 4), lesson(1, 2));
	assert.deepEqual(slugs(sortPosts([...input].reverse())), [...lookalikes, lesson(1).slug, lesson(2).slug]);
});

test("supports missing lessons, a single course member, and empty input", () => {
	assert.deepEqual(slugs(sortPosts([lesson(12, 3), lesson(9, 20), lesson(2, 1)])), [lesson(2).slug, lesson(9).slug, lesson(12).slug]);
	assert.deepEqual(slugs(sortPosts([lesson(7, 4), post("ordinary", 8)])), ["ordinary", lesson(7).slug]);
	assert.deepEqual(sortPosts([]), []);
});

test("does not mutate input, post objects, or publication dates", () => {
	const input = [lesson(2, 20), post("ordinary", 10), lesson(1, 1)];
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
	assert.deepEqual(result, [input[2], input[0], input[1]]);
	input.forEach((entry, index) => {
		assert.equal(entry, original[index]);
		assert.equal(entry.data.published, dates[index]);
		assert.equal(entry.data.published.getTime(), timestamps[index]);
	});
	result.forEach((entry) => assert.ok(input.includes(entry)));
});
