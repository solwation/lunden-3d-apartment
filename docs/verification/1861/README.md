# #1861 — integration-ready adoption

Original-only adoption of [orchestra v0.8.0](https://github.com/solwation/dirigenten-och-orkestern/tree/6ee6dd23ed85e5a91641d1939d553e4f789027d4), on base
`19841eecf027e764d55e71e051db975f835d67ed`. Public adoption remains a separate,
low-priority [#251](https://github.com/solwation/kvarteret-lunden/issues/251).

## Checks

1. **Import/provenance:** actual `git subtree pull --prefix=.orchestra/shared orchestra-upstream 6ee6dd23ed85e5a91641d1939d553e4f789027d4 --squash`.
   Merge `b93a23774cef2a3f8ad39458ac1fbf2b7b18a880` retains base and squash
   `cd59500c2f0d9bee6bb5fcc7aeab266a07d1d514` as parents. The squash retains
   `git-subtree-dir` and exact `git-subtree-split` trailers. Shared tree
   `9919a836f18935462d08ff837f1cf8f8964538da` equals the entire reviewed release tree,
   including its icon move. Snapshot `cmp` equals the canonical Issueflow bytes at
   [`0e712c346c7689dd3e00db04fbe00d86090d5908`](https://github.com/solwation/github-dashboard/blob/0e712c346c7689dd3e00db04fbe00d86090d5908/public/ISSUEFLOW.md).
2. **Host consistency:** diff/contradiction review and 170 relative Markdown link-path
   checks across the six adapted host entry/docs files and imported Markdown passed;
   new handoff anchors resolve. Removed instructions discarding integration ownership
   or returning a finished handoff to backlog. Preserved original-first ordering,
   all-public-low, ancestor ceilings, 300-second polling, one-hour idle watch,
   two-worker/helper cap, privacy, direct main/no PR, intake, public-transfer and
   visual-result image-before-closure gates. No host link uses the removed shared icon path.
3. **Lifecycle walkthrough (documentation review):** active implementation has
   `in-progress`; complete checked handoff switches exclusively to `integration-ready`,
   records owner/checkout/revision/evidence/next action and frees its slot. Review or
   integration resumes with `in-progress` under the retained owner; acceptance and
   publication precede closure and removal of all work/own owner labels. Correction
   names an active fixer or returns to backlog, never leaves rejected work ready.
   Pause/user question/reopen clears work labels and claim; a genuine waiting handoff
   retains ownership on session stop. A waiting child preserves its parent's summary
   `in-progress` without consuming a slot and cannot be skipped at parent closure.
   Missing metadata/heartbeat triggers evidence-based recovery, not duplicate dispatch
   or automatic takeover. Helpers cannot mark the whole issue ready while work remains.
   Reconcile the separately ordered integration queue before dispatch/drain/idle;
   integrable owned work resumes, independent workers may use other free slots.

## Scope and timing

Docs/instructions only: no runtime, gameplay, changelog, application bootstrap,
browser, screenshots or performance claims. The visual-result hooks do not trigger.
No issue-label migration, queue watch, push or closure ran in this worker; the conductor
owns review, publication and final issue transitions. Existing finished handoffs must
be reconciled from evidence; paused issues are not bulk-marked ready.

2026-11-04 UTC: source/migration review preceded the 12:32:51 subtree import;
host reconciliation and provenance checks completed 12:34; link/lifecycle checks and
this bounded handoff completed about 12:35. No extra verification matrix was needed.

Conductor review retained a thin slash adapter with a link to host handoffs (per shared INSTALL), and made integration-queue reconciliation explicit in loop step1. Both existing link targets and the affected instruction flow were inspected; these prose corrections require no runtime rerun.
