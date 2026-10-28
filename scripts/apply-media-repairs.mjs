import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMarkdown } from "./media-repairs/markdown.mjs";
import { validatePackets } from "./media-repairs/packets.mjs";
import {
	applyPlan,
	buildPlan,
	detectApplied,
	loadAppliedReport,
	writeFileAtomic,
} from "./media-repairs/plan.mjs";
import { buildReport, renderMarkdown } from "./media-repairs/report.mjs";
import { loadLegacyState } from "./media-repairs/state.mjs";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function uniqueErrors(errors) {
	const seen = new Set();
	const result = [];
	for (const error of errors) {
		const key = `${error.code}\0${error.message}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(error);
	}
	return result;
}

export function parseArgs(argv) {
	let mode = "check";
	let help = false;
	let root = REPO_ROOT;
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--check") mode = "check";
		else if (arg === "--apply") mode = "apply";
		else if (arg === "--help" || arg === "-h") help = true;
		else if (arg === "--root") {
			const value = argv[++index];
			if (!value) throw new Error("--root requires a path");
			root = path.resolve(value);
		} else throw new Error(`unknown argument: ${arg}`);
	}
	return { mode, help, root };
}

function writeReports(root, report) {
	const json = `${JSON.stringify(report, null, 2)}\n`;
	const markdown = renderMarkdown(report);
	writeFileAtomic(
		path.join(root, "migration", "media-repair-report.json"),
		json,
	);
	writeFileAtomic(
		path.join(root, "migration", "media-repair-report.md"),
		markdown,
	);
}

function printSummary(report, reportPaths) {
	console.log(`status: ${report.status}`);
	console.log(
		`manifest: ${report.counts.manifestOccurrences} occurrence(s) / ${report.counts.manifestUnique} unique`,
	);
	console.log(
		`active remote: ${report.counts.activeRemoteOccurrences} occurrence(s) / ${report.counts.activeRemoteUnique} unique`,
	);
	console.log(
		`mapped: ${report.counts.mappedUnique}/${report.counts.requiredMappings}`,
	);
	console.log(
		`supplemental old-source: ${report.counts.supplementalOldHostOccurrences} occurrence(s) / ${report.counts.supplementalOldHostUnique} unique`,
	);
	console.log(
		`protected old-source refs: ${report.counts.protectedOldHostOccurrences}`,
	);
	console.log(`report: ${reportPaths.json}`);
	console.log(`report: ${reportPaths.markdown}`);
	if (report.blockers.length) {
		console.log("blockers:");
		for (const blocker of report.blockers.slice(0, 12))
			console.log(`- ${blocker.code}: ${blocker.message}`);
		if (report.blockers.length > 12)
			console.log(
				`- ... ${report.blockers.length - 12} more in the JSON report`,
			);
	}
}

export function runCli(argv, options = {}) {
	const parsed = parseArgs(argv);
	if (parsed.help) {
		console.log(
			"Usage: node scripts/apply-media-repairs.mjs [--check|--apply]",
		);
		console.log(
			"  --check  validate readiness or verify an applied repair (default)",
		);
		console.log(
			"  --apply  write repairs only when all four packets are complete and valid",
		);
		return { code: 0, status: "help" };
	}
	const root = options.root ?? parsed.root;
	const markdown = options.markdown ?? createMarkdown();
	const reportPaths = {
		json: path.join(root, "migration", "media-repair-report.json"),
		markdown: path.join(root, "migration", "media-repair-report.md"),
	};
	let state;
	try {
		state = loadLegacyState({ root, markdown });
	} catch (error) {
		console.error(`invalid: ${error.message}`);
		return { code: 1, status: "invalid", error: error.message };
	}

	const appliedInfo = loadAppliedReport(root);
	if (appliedInfo.error) {
		console.error(`invalid: ${appliedInfo.error}`);
		return { code: 1, status: "invalid", error: appliedInfo.error };
	}
	if (appliedInfo.report?.status === "applied") {
		const detection = detectApplied(state, appliedInfo.report);
		if (detection.applied) {
			console.log("status: applied");
			console.log(
				`verified repairs for ${detection.matched} post(s); report already records the applied hashes`,
			);
			console.log(`report: ${appliedInfo.path}`);
			return { code: 0, status: "applied", report: appliedInfo.report };
		}
		if (detection.conflict || detection.partial) {
			const detail =
				detection.mismatches
					?.map((item) => `${item.postId}: ${item.reason}`)
					.join("; ") ?? "partially applied state";
			console.error(
				`invalid: applied report does not match current files (${detail})`,
			);
			return { code: 1, status: "invalid", error: detail };
		}
	}

	const packets = validatePackets({
		root,
		manifestUrls: state.manifestUrls,
		supplementalUrls: state.supplementalOldHostUrls,
		markdown,
	});
	const baseErrors = uniqueErrors([...state.errors, ...packets.errors]);
	let plan = null;
	let status;
	if (baseErrors.length) status = "invalid";
	else if (packets.missingFiles.length || packets.missingUrls.length)
		status = "not_ready";
	else {
		plan = buildPlan(state, packets, markdown);
		if (plan.ok) status = "ready";
		else status = "invalid";
	}
	const errors = uniqueErrors([...baseErrors, ...(plan?.errors ?? [])]);
	if (errors.length && status === "ready") status = "invalid";

	if (parsed.mode === "apply" && status === "ready") {
		const report = buildReport({
			state,
			packets,
			plan,
			mode: "apply",
			status: "applied",
			errors: [],
			warnings: state.warnings,
		});
		try {
			applyPlan(plan, { root, writeReports: () => writeReports(root, report) });
		} catch (error) {
			console.error(
				`invalid: apply failed and was rolled back: ${error.message}`,
			);
			return { code: 1, status: "invalid", error: error.message, report };
		}
		printSummary(report, reportPaths);
		return { code: 0, status: "applied", report };
	}

	const report = buildReport({
		state,
		packets,
		plan,
		mode: parsed.mode,
		status,
		errors,
		warnings: state.warnings,
	});
	writeReports(root, report);
	printSummary(report, reportPaths);
	if (status === "invalid") return { code: 1, status, report };
	if (status === "not_ready") {
		console.log(
			"NOTREADY: create all four migration/media-repairs/<group>.json packets, then rerun --check. No markdown was written.",
		);
		return { code: 2, status, report };
	}
	return { code: 0, status, report };
}

const isMain =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = runCli(process.argv.slice(2)).code;
