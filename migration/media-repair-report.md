# Media Repair Report

Status: **APPLIED**

Command: `node scripts/apply-media-repairs.mjs --apply`

## Counts

| Metric | Value |
| --- | ---: |
| legacyMarkdownFiles | 72 |
| manifestPosts | 72 |
| auditPass | 72 |
| auditTotal | 72 |
| manifestUnique | 149 |
| manifestOccurrences | 152 |
| activeRemoteOccurrences | 153 |
| activeRemoteUnique | 150 |
| supplementalOldHostUnique | 1 |
| supplementalOldHostOccurrences | 1 |
| preservedExternalOccurrences | 0 |
| protectedOldHostOccurrences | 1 |
| requiredMappings | 150 |
| mappedUnique | 150 |
| missingMappings | 0 |
| replacedOccurrences | 153 |
| plannedOccurrences | 0 |
| replacedPosts | 39 |

## Blocker Summary

- None.

## Packet Files

| Group | Required | Exists | Valid | Mappings | Error |
| --- | --- | --- | --- | ---: | --- |
| java-ssm | yes | yes | yes | 34 |  |
| mysql | yes | yes | yes | 35 |  |
| redis | yes | yes | yes | 34 |  |
| springcloud-tools | yes | yes | yes | 46 |  |
| supplemental | no | yes | yes | 1 |  |

## Coverage

- Required unique mappings: 150
- Mapped unique: 150
- Missing mappings: 0
- Extra mappings: 0
- Duplicate mapping URLs: 0

## Scan

- Legacy markdown: 72
- Active remote images: 153 occurrence(s), 150 unique
- Manifest unresolved: 152 occurrence(s), 149 unique
- Supplemental old-source images outside the manifest: 1 occurrence(s), 1 unique
- Protected old-source references outside image tokens: 1
- Preserved non-old-source external images: 0

### Protected old-source references

- 10608 line 354 (code): `https://wang-nine.cn//images/SpringCloud08-06%E9%95%9C%E5%83%8F%E7%9A%84%E7%BB%93%E6%9E%84.png`

## Posts

| Post | Baseline SHA | Repaired SHA | Occurrences | Protected refs |
| --- | --- | --- | ---: | ---: |
| 10001 | 87943384c023 | 7423b7617357 | 3 | 0 |
| 10101 | 72d4222dc94a | b02e662afb4c | 9 | 0 |
| 10301 | b82a11d0a765 | b6f8e85fdeaa | 5 | 0 |
| 10302 | 2dcac4324b0a | f580cd733f96 | 8 | 0 |
| 10303 | f495e85f6f53 | fe62dac186f0 | 4 | 0 |
| 10305 | 4acf8677f465 | a76f0c6af70b | 2 | 0 |
| 10306 | 5fe0c39a3b83 | 21bdec7e6220 | 1 | 0 |
| 10309 | b1baaace1f83 | 9e2ee444b6ae | 2 | 0 |
| 10312 | a11f66a6b622 | 45a5b2e0ac68 | 2 | 0 |
| 10403 | a950ec44c1b0 | d97ee08dca4e | 2 | 0 |
| 10404 | 84816877e7fd | 6bba920b4a3a | 2 | 0 |
| 10408 | 070844c8c41b | b99de4e6cf75 | 9 | 0 |
| 10409 | 66ff5894a71f | 3ebe273a21eb | 2 | 0 |
| 10410 | f2dadc8c0666 | 09f881c4564b | 6 | 0 |
| 10411 | 4c91973fffd2 | d936ebb4f841 | 2 | 0 |
| 10412 | bfaea19dfc2c | 941189718892 | 2 | 0 |
| 10413 | 075c900dd3eb | e3455258cbbc | 10 | 0 |
| 10414 | ad07be81fb9a | 39a9e5821357 | 1 | 0 |
| 10415 | 15d8b6f326fc | be6776c51f97 | 2 | 0 |
| 10502 | 7927b0109129 | c730ae10565c | 1 | 0 |
| 10503 | 90ed2931d7f4 | 5bd73faeb35d | 1 | 0 |
| 10601 | 32075ffff0d5 | 8858e9980f7d | 2 | 0 |
| 10603 | bf6e2efb3895 | a5b1bbd927fd | 1 | 0 |
| 10604 | 4d5a3dca800d | 834d0830acf4 | 1 | 0 |
| 10605 | 5b3b0553aa60 | a948f4def387 | 6 | 0 |
| 10606 | 61f5dbb24073 | 0ee07bb3df2a | 2 | 0 |
| 10607 | 443c4fb113d8 | fdb872ad0dd7 | 4 | 0 |
| 10608 | c32d9e85386b | a918fc88b7e1 | 8 | 1 |
| 10609 | 9515ab3a9066 | ca58d9556579 | 2 | 0 |
| 10700 | f9ba0b582e48 | ebad15133b1b | 4 | 0 |
| 10705 | 99d3451b7f49 | d834e9353be6 | 4 | 0 |
| 10706 | a275457cfe79 | 8bc9cc307f5c | 5 | 0 |
| 10707 | 374210688f9d | 3a8b55cca3fa | 5 | 0 |
| 10708 | c6045dc52d4d | 3dc8b4fff62d | 13 | 0 |
| 10709 | fc103f1ad6e1 | e93bf7a41698 | 3 | 0 |
| 20002 | 802c2386bfe1 | eb43601ee893 | 13 | 0 |
| 20004 | 2acf4a698479 | f453430415d7 | 1 | 0 |
| 20006 | 7949afaf110c | 8c879484f380 | 2 | 0 |
| 999999999 | 6e8554e0932c | c9fe933cfa21 | 1 | 0 |

## Verification

- manifestParity: pass
- packetCoverage: pass
- uniqueMappings: pass
- assetsValidated: pass
- replacementsSafe: pass
- codeProtected: pass
- frontmatterUnchanged: pass
- noOldHostImagesAfterPlan: pass

## Provenance and Restore

- Manifest: `migration/legacy-posts.json` sha256 `f671e131960b5fc7ae4686760bc38ae522fc7fce0112fd3c4f33f9817242fd55`
- Audit: `migration/legacy-audit.json` sha256 `0e16f06cb4bc666170706d90e2b31623bdf21774fa021a9c5dbff9ac5a5bd189`
- legacy-posts.json and legacy-audit.json are immutable pre-repair baseline evidence. The original 72/72 audit describes the original conversion, not the post-repair state. Original image URLs remain in the manifest.
- Each occurrence stores the exact original image markup plus source and repaired spans. To restore a post, replace [repairedStart, repairedEnd) with originalMarkdown tail-to-head, then verify sourceMarkdownSha256. Baseline bodies are reproducible from the converter and are not duplicated here.

## Commands

```text
node scripts/apply-media-repairs.mjs --check
node scripts/apply-media-repairs.mjs --apply
node --test tests/media-repairs.test.mjs
```

