# #2226 – shorter freezer news

Scope: table-driven topic projection and verified metadata backfill; the raw history, `markNew`, fetch retry policy, 200-original-row offline cache and publication stamping are preserved. Existing legacy summaries retain singleton behavior; new topic singletons and unknown groups retain original text. Summary references are the sorted union of positive issue ids, and repeated projection is stable.

Backfill: the 2026-11-06 through 2026-11-20 window was reviewed; 149 verifiable original entries across 10 topics received metadata. `backfill.json` records the exact source commit/subject for each entry. References were recovered by matching the original text in a small changelog-changing commit with an explicit issue reference, skipping bulk reformat/integration commits. No old id/date/text/t or existing group was changed. Unverified entries remain ordinary rows. The only new history row announces this feature (provisional id 1725, integration owner renumbers).

Checks on detached checkout based on `962aa3f7`:

- `node tools/changelogtest.cjs`: 21 pure-function/real-loader checks, including multiple topics/all refs, singleton/unknown, prototype keys, newest publication metadata, first/repeat/any-member New, exact raw cache, three retries, non-regressing seen id and idempotence.
- Exact comparison against HEAD: all 1723 original rows/fields retained, exactly one new row, unique descending ids. Each of the 149 references was checked against the source commit's original text and explicit issue reference (`history-check.txt`). The canonical `changelog_stamp.id_times()` was compared before/after the actual metadata commit: all 1723 original publication times are exactly unchanged.
- Combined browser command below: **23/23 native DOM/canvas checks and 34/34 actual-app checks passed**, followed by inspected A/B captures using `tools/notetest.html` in the actual application. The interaction fixture uses the existing lazy test mode; DOM/paper pixels are the production consumers. Its synthetic-history fixture now resets its own starting seen id, avoiding a false expectation that monotonic storage should fall from the actual history's id to 251. One initial run exposed that fixture assumption; the same bounded check was rerun after correcting it. Image inspection then caught the first-visit name dialog obscuring the note, so the same app capture was repeated after clicking the actual “Hoppa över” control. No additional scenario/browser matrix was introduced.

```sh
PLAYWRIGHT_MODULE=/home/devcontainers/.npm/_npx/e41f203b7505f1fb/node_modules/playwright \
NOTE_APP_CHECK=1 BROWSERTEST_TIMEOUT=9m tools/browsertest.sh \
node tools/freezersummarytest.cjs http://localhost:8436 docs/verification/2226
```

The before/after pictures show the actual readable freezer note for the same complete November 18 window: **58 original rows become 39 displayed rows** (33% fewer). Before strips only the newly backfilled group/issues fields; after uses the verified metadata and production projection. Both use the same New flags, production note DOM, actual `note.refresh` and native aspect. `after-paper.png` is the actual updated 300×420 note texture. These are text/paper presentation checks, not scene lighting, physical-phone performance or release/deployment verification. The 200-original-row offline cap naturally may contain fewer display rows after grouping than the full online history; the cache policy remains unchanged.

Evidence: `pure-loader-test.txt`, `result.json`, `notetest.txt`, `app-result.json`, `source-freeze.json`, `before-note.png`, `after-note.png`, `after-paper.png`, `freezer-summary.png`. All four saved images were inspected at their native aspect: A/B text and every shown reference are legible, the name dialog is absent, and the actual canvas/legacy paper remain intact. Final pass counts: 21 pure/loader, 23 native DOM/canvas, 34 actual-app checks. Final capture completed 2026-11-20 15:13 UTC. The capture-only retries addressed the name modal and a native iframe pointer viewport limitation; the final helper invokes the real skip control the same way as the existing interaction fixture.

Downstream: **not applicable**. The conductor inspected the public repository and confirmed it has no `src/data` changelog/note consumer, so #2226 needs no public port or issue. Original personal/gameplay history and issue references stay in this repository.

Integration preserved all 1728 current main rows and added only the summary announcement (final id 1730). The eight newer original rows from parallel deliveries were linked to their exact introducing commit/issue in `integration-backfill.json`; only those references and the known avatars/birds topics were added. All pre-existing id/date/text/t and existing groups are preserved.

Published source `635603f5bfde6d9babf02f98a759c6e1e2e506cd`; pinned inspected evidence: https://github.com/solwation/lunden-3d-apartment/issues/2226#issuecomment-7043193122. Its Pages run was superseded by a parallel push; successful Pages run44761986999 at `77866529a74d1ff7aaa2f709b5c9d1eed4b15b6b` was verified to contain this source as an ancestor before closure. No Worker source/config changed. Before image removed only after its pinned publication.
