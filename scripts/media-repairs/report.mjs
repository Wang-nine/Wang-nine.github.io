import { isOldSourceUrl } from "./packets.mjs";

function shortHash(value) {
	return typeof value === "string" && value.length === 64
		? value.slice(0, 12)
		: "—";
}

function cell(value) {
	return String(value ?? "")
		.replace(/\|/g, "\\|")
		.replace(/\r?\n/g, " ");
}

export function buildReport(input) {
	const { state, packets, plan, mode, status, errors, warnings } = input;
	const applied = status === "applied";
	const ready = status === "ready" || applied;
	const blockers = [...errors];
	if (packets) {
		for (const file of packets.files ?? [])
			if (file.required && !file.exists)
				blockers.push({
					code: "missing-packet-file",
					message: `missing packet file: ${file.file}`,
					detail: { group: file.group },
				});
		for (const url of packets.missingUrls ?? [])
			blockers.push({
				code: "missing-mapping",
				message: `no mapping for ${url}`,
				detail: { url },
			});
		for (const url of packets.extraUrls ?? [])
			blockers.push({
				code: "extra-mapping",
				message: `mapping is not in the active repair set: ${url}`,
				detail: { url },
			});
	}
	const unmappedOldHost = (packets?.missingUrls ?? [])
		.filter((url) => isOldSourceUrl(url))
		.map((url) => {
			const occurrences = state.images.filter((image) => image.url === url);
			return {
				url,
				occurrences: occurrences.map((image) => ({
					postId: image.postId,
					postPath: image.postPath,
					line: image.line,
				})),
			};
		});
	const postReports = state.posts.map((post) => {
		const planned = plan?.posts.find((item) => item.postId === post.id);
		return {
			postId: post.id,
			postPath: post.markdownPath,
			baselineSourceSha256: post.baselineSourceSha256,
			baselineBodySha256: post.baselineBodySha256,
			baselineBytes: post.baselineBytes,
			repairedSourceSha256:
				planned?.repairedSourceSha256 ?? post.baselineSourceSha256,
			repairedBodySha256:
				planned?.repairedBodySha256 ?? post.baselineBodySha256,
			repairedBytes: planned?.repairedBytes ?? post.baselineBytes,
			occurrenceCount: planned?.occurrenceCount ?? 0,
			urls: planned?.urls ?? [],
			protectedOccurrences: post.protectedOccurrences,
		};
	});
	const report = {
		schemaVersion: 1,
		tool: "scripts/apply-media-repairs.mjs",
		command:
			mode === "apply"
				? "node scripts/apply-media-repairs.mjs --apply"
				: "node scripts/apply-media-repairs.mjs --check",
		status,
		ready,
		applied,
		counts: {
			legacyMarkdownFiles: state.counts.legacyMarkdownFiles,
			manifestPosts: state.counts.manifestPosts,
			auditPass: state.counts.auditPass,
			auditTotal: state.counts.auditTotal,
			manifestUnique: state.counts.manifestUnique,
			manifestOccurrences: state.counts.manifestOccurrences,
			activeRemoteOccurrences: state.counts.activeRemoteOccurrences,
			activeRemoteUnique: state.counts.activeRemoteUnique,
			supplementalOldHostUnique: state.counts.supplementalOldHostUnique,
			supplementalOldHostOccurrences:
				state.counts.supplementalOldHostOccurrences,
			preservedExternalOccurrences: state.counts.preservedExternalOccurrences,
			protectedOldHostOccurrences: state.counts.protectedOldHostOccurrences,
			requiredMappings:
				packets?.counts.requiredUnique ??
				state.counts.manifestUnique + state.counts.supplementalOldHostUnique,
			mappedUnique: packets?.counts.mappedUnique ?? 0,
			missingMappings: packets?.missingUrls.length ?? 0,
			replacedOccurrences: applied ? (plan?.totalOccurrences ?? 0) : 0,
			plannedOccurrences: !applied && plan?.ok ? plan.totalOccurrences : 0,
			replacedPosts: applied ? (plan?.posts.length ?? 0) : 0,
		},
		provenance: {
			legacyManifestPath: "migration/legacy-posts.json",
			legacyManifestSha256: state.manifestSha256,
			legacyAuditPath: "migration/legacy-audit.json",
			legacyAuditSha256: state.auditSha256,
			note: "legacy-posts.json and legacy-audit.json are immutable pre-repair baseline evidence. The original 72/72 audit describes the original conversion, not the post-repair state. Original image URLs remain in the manifest.",
		},
		packets: packets
			? {
					directory: "migration/media-repairs",
					groups: packets.groups,
					files: packets.files.map((file) => ({
						group: file.group,
						file: file.file,
						required: file.required,
						exists: file.exists,
						valid: file.valid,
						count: file.count,
						error: file.error,
					})),
					counts: packets.counts,
					missingFiles: packets.missingFiles,
					missingUrls: packets.missingUrls,
					missingManifestUrls: packets.missingUrls.filter((url) =>
						state.manifestUrls.has(url),
					),
					missingSupplementalUrls: packets.missingUrls.filter(
						(url) => !state.manifestUrls.has(url),
					),
					extraUrls: packets.extraUrls,
					duplicateUrls: packets.duplicateUrls,
					errors: packets.errors,
					warnings: packets.warnings,
				}
			: null,
		scan: {
			activeRemoteUnique: state.counts.activeRemoteUnique,
			activeRemoteOccurrences: state.counts.activeRemoteOccurrences,
			supplementalOldHost: state.supplementalOldHost.map((image) => ({
				url: image.url,
				postId: image.postId,
				postPath: image.postPath,
				line: image.line,
			})),
			preservedExternal: state.preservedExternal.map((image) => ({
				url: image.url,
				postId: image.postId,
				postPath: image.postPath,
				line: image.line,
			})),
			protectedOldHost: state.protectedOldHost,
		},
		blockers,
		warnings: [...new Set([...(state.warnings ?? []), ...(warnings ?? [])])],
		verification: {
			manifestParity: !(state.errors ?? []).some((error) =>
				["manifest-parity", "manifest-total", "image-span"].includes(
					error.code,
				),
			),
			packetCoverage: Boolean(packets?.ready),
			uniqueMappings: !(packets?.duplicateUrls.length ?? 0),
			assetsValidated: !(packets?.errors ?? []).some(
				(error) => error.code === "asset",
			),
			replacementsSafe: !(packets?.errors ?? []).some((error) =>
				[
					"external-url",
					"unsafe-markup",
					"forbidden-placeholder",
					"replacement-image-path",
					"unlisted-asset",
					"unused-asset",
					"diagram-without-image",
				].includes(error.code),
			),
			codeProtected: !(plan?.errors ?? []).some(
				(error) =>
					error.code === "code-changed" || error.code === "inline-code-changed",
			),
			frontmatterUnchanged: !(plan?.errors ?? []).some(
				(error) => error.code === "frontmatter-changed",
			),
			noOldHostImagesAfterPlan: !(plan?.errors ?? []).some(
				(error) =>
					error.code === "old-host-remains" ||
					error.code === "old-image-remains",
			),
		},
		restore: {
			method: "reverse-patch",
			note: "Each occurrence stores the exact original image markup plus source and repaired spans. To restore a post, replace [repairedStart, repairedEnd) with originalMarkdown tail-to-head, then verify sourceMarkdownSha256. Baseline bodies are reproducible from the converter and are not duplicated here.",
			fields: [
				"postId",
				"sourceStart",
				"sourceEnd",
				"repairedStart",
				"repairedEnd",
				"originalMarkdown",
				"replacementMarkdown",
				"sourceMarkdownSha256",
				"repairedMarkdownSha256",
			],
		},
		commands: {
			check: "node scripts/apply-media-repairs.mjs --check",
			apply: "node scripts/apply-media-repairs.mjs --apply",
			test: "node --test tests/media-repairs.test.mjs",
		},
		posts: postReports,
		occurrences: plan?.occurrences ?? [],
		unmappedOldHost,
	};
	return report;
}

export function renderMarkdown(report) {
	const lines = [];
	lines.push("# Media Repair Report", "");
	lines.push(
		`Status: **${report.status.replaceAll("_", " ").toUpperCase()}**`,
		"",
	);
	lines.push(`Command: \`${report.command}\``, "");
	lines.push("## Counts", "");
	lines.push("| Metric | Value |", "| --- | ---: |");
	for (const [key, value] of Object.entries(report.counts))
		lines.push(`| ${cell(key)} | ${cell(value)} |`);
	lines.push("", "## Blocker Summary", "");
	if (report.blockers.length)
		for (const blocker of report.blockers.slice(0, 40))
			lines.push(`- \`${blocker.code}\`: ${blocker.message}`);
	else lines.push("- None.");
	if (report.blockers.length > 40)
		lines.push(`- ... ${report.blockers.length - 40} more in the JSON report.`);
	lines.push("", "## Packet Files", "");
	lines.push(
		"| Group | Required | Exists | Valid | Mappings | Error |",
		"| --- | --- | --- | --- | ---: | --- |",
	);
	for (const file of report.packets?.files ?? [])
		lines.push(
			`| ${cell(file.group)} | ${file.required ? "yes" : "no"} | ${file.exists ? "yes" : "no"} | ${file.valid ? "yes" : "no"} | ${file.count} | ${cell(file.error)} |`,
		);
	if (!report.packets)
		lines.push("| — | yes | no | no | 0 | packets not loaded |");
	lines.push("", "## Coverage", "");
	if (report.packets) {
		lines.push(
			`- Required unique mappings: ${report.packets.counts.requiredUnique}`,
		);
		lines.push(`- Mapped unique: ${report.packets.counts.mappedUnique}`);
		lines.push(`- Missing mappings: ${report.packets.missingUrls.length}`);
		lines.push(`- Extra mappings: ${report.packets.extraUrls.length}`);
		lines.push(
			`- Duplicate mapping URLs: ${report.packets.duplicateUrls.length}`,
		);
		if (report.packets.missingUrls.length) {
			lines.push("", "First missing mappings:", "");
			for (const url of report.packets.missingUrls.slice(0, 20))
				lines.push(`- \`${url}\``);
			if (report.packets.missingUrls.length > 20)
				lines.push(
					`- ... ${report.packets.missingUrls.length - 20} more in the JSON report.`,
				);
		}
	} else lines.push("- Packets were not loaded.");
	lines.push("", "## Scan", "");
	lines.push(`- Legacy markdown: ${report.counts.legacyMarkdownFiles}`);
	lines.push(
		`- Active remote images: ${report.counts.activeRemoteOccurrences} occurrence(s), ${report.counts.activeRemoteUnique} unique`,
	);
	lines.push(
		`- Manifest unresolved: ${report.counts.manifestOccurrences} occurrence(s), ${report.counts.manifestUnique} unique`,
	);
	lines.push(
		`- Supplemental old-source images outside the manifest: ${report.counts.supplementalOldHostOccurrences} occurrence(s), ${report.counts.supplementalOldHostUnique} unique`,
	);
	lines.push(
		`- Protected old-source references outside image tokens: ${report.counts.protectedOldHostOccurrences}`,
	);
	lines.push(
		`- Preserved non-old-source external images: ${report.counts.preservedExternalOccurrences}`,
	);
	if (report.unmappedOldHost.length) {
		lines.push("", "### Unmapped old-source images", "");
		for (const item of report.unmappedOldHost)
			for (const occurrence of item.occurrences)
				lines.push(
					`- \`${item.url}\` at ${occurrence.postPath}:${occurrence.line}`,
				);
	}
	if (report.scan.protectedOldHost.length) {
		lines.push("", "### Protected old-source references", "");
		for (const item of report.scan.protectedOldHost.slice(0, 20))
			lines.push(
				`- ${item.postId} line ${item.line} (${item.kind}): \`${item.url}\``,
			);
		if (report.scan.protectedOldHost.length > 20)
			lines.push(
				`- ... ${report.scan.protectedOldHost.length - 20} more in the JSON report.`,
			);
	}
	lines.push("", "## Posts", "");
	lines.push(
		"| Post | Baseline SHA | Repaired SHA | Occurrences | Protected refs |",
		"| --- | --- | --- | ---: | ---: |",
	);
	const withActivity = report.posts.filter(
		(post) => post.occurrenceCount || post.protectedOccurrences.length,
	);
	for (const post of withActivity)
		lines.push(
			`| ${cell(post.postId)} | ${shortHash(post.baselineSourceSha256)} | ${shortHash(post.repairedSourceSha256)} | ${post.occurrenceCount} | ${post.protectedOccurrences.length} |`,
		);
	if (!withActivity.length) lines.push("| — | — | — | 0 | 0 |");
	lines.push("", "## Verification", "");
	for (const [key, value] of Object.entries(report.verification))
		lines.push(`- ${key}: ${value ? "pass" : "fail"}`);
	lines.push("", "## Provenance and Restore", "");
	lines.push(
		`- Manifest: \`${report.provenance.legacyManifestPath}\` sha256 \`${report.provenance.legacyManifestSha256}\``,
	);
	lines.push(
		`- Audit: \`${report.provenance.legacyAuditPath}\` sha256 \`${report.provenance.legacyAuditSha256}\``,
	);
	lines.push(`- ${report.provenance.note}`);
	lines.push(`- ${report.restore.note}`);
	lines.push("", "## Commands", "");
	lines.push(
		"```text",
		report.commands.check,
		report.commands.apply,
		report.commands.test,
		"```",
		"",
	);
	return `${lines.join("\n")}\n`;
}
