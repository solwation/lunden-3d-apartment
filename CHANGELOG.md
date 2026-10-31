# Changelog

## Unreleased

## 0.7.0 — 2026-10-31

- Add a *Terms* table to COORDINATION.md defining scoped task, bounded pass, queue
  session, eligible, startable, blocker, claim, active label, slot, integration owner,
  resolved and drain; "reservation" is now "claim" throughout (#38).
- Describe waiting per runtime: the core waits with the host's wait mechanism, and a
  runtime that cannot wait finishes as a bounded pass and says so; PROJECT.example.md
  gains a *Wait mechanism* line, and AI.md names background timers or Monitor for
  interactive Claude Code and a bounded pass for `claude -p` and one-shot runs (#32).
- Add `scripts/check-links.py`, a dependency-free check of relative Markdown links and
  heading anchors, and a GitHub Action running it on push and pull request; the
  maintainer "Check instructions" hook points to it. Maintainer tooling only: no
  requirement for consuming projects (#34).
- Align the maintainer host policy AI.md with PROJECT.example.md: add the missing settings
  (model selection, capacity, claims, heartbeat, review), trim the hooks to project-specific
  ones and document the `gh issue view` and "Fixes #N" pitfalls (#31).
- Add a release checklist to CONTRIBUTING.md and `scripts/check-release.sh`, which checks that
  the pins in README.md and INSTALL.md equal the latest tag, that every tag has a GitHub
  release and that CHANGELOG has a heading for it. Maintainer tooling only (#33).
- Record the Issueflow guide's file change commit instead of the repository's main SHA,
  compare the fetched guide with the bundled snapshot (at most two API calls) and open
  an issue to refresh the snapshot on a difference; snapshot provenance is now the file
  change commit `e22d6dc` (#35).
- Restructure ORCHESTRA.md by phase (`planning` … `follow-up`, matching the hook phase
  names) with a read map and a one-screen gate checklist at the top, and give each rule
  one home that other files link to: unattended questions in COORDINATION.md *Ask
  through the issue*, best-guess closure and isolation in ORCHESTRA.md, label rules in
  the Issueflow guide, resume-first in ORCHESTRA.md. An empty scope is now described
  once as a host setting with a bounded pass as default. The anchor
  `#choose-the-smallest-useful-team` no longer holds the isolation list; link
  `ORCHESTRA.md#isolate-concurrent-agents` instead (#28, #29).
- Document agent entry files (Claude Code, Codex, Gemini CLI, Cursor, GitHub Copilot) in
  INSTALL.md with a copyable entry snippet and a copyable `/orkester` adapter, as a
  Claude Code command and as a plain prompt, so consumers need not write one (#40).
- Split the worker brief in WORKER.md into a session block written once and a short
  assignment block, recommend a shared batch brief for issues that follow one pattern,
  and group the worker rules by isolation, scope, escalation and reporting (#36).
- Make the core rules project-neutral: verification now says "a partial check is not
  evidence for the whole", "claim performance only for the measured environment" and
  "repeat only the faulty check", with the former camera/emulator/phone wording moved to
  a marked *Examples* section in ORCHESTRA.md; all time limits (update-check reuse,
  verification and progress review points, shared verification turns, wait length) are
  collected in *Default time limits* as host-adjustable review points (#30).
- Add a *Field reports* section to CONTRIBUTING.md and an issue template
  `.github/ISSUE_TEMPLATE/field-report.md` (headings from the Historia-globen report):
  the way in is an issue in this repository, asked for by the maintainer. Maintainer
  and contributor tooling only: no requirement for consuming projects (#39).
- Describe PR delivery mode: a delivery-mode line in PROJECT.example.md, and in the
  core the "PR open, not on main" result, issue closure after merge, paused labels,
  a merge rehearsal of open PRs at session review and refreshing branches per merge (#37).
- Remove the stale verification images and README from `docs/verification` (they show a
  README state that no longer exists); the evidence stays in the v0.1.2 history and is
  linked from #6. Verification evidence goes in the issue or the release, not in the
  repository, since `git subtree` copies every file to each consumer (#41).

## 0.6.1 — 2026-10-30

- Adopt rule suggestions from the Historia-globen field report (#26): distinct
  insertion anchors for parallel additions to one file, keep-both resolution of
  append-only log conflicts, stated merge order for dependent PRs, short turns in the
  shared verification queue, chat answers recorded on the issue, and for workers:
  stop processes by PID and before reporting, commit at each milestone, and never send
  personal data to external services (#27).

## 0.6.0 — 2026-10-28

- Resume unfinished work first: at conductor startup/resume of any run, look for
  uncommitted changes, unpushed commits, leftover worktrees/branches and stale claims,
  resume what is not yet on main and discard what another orchestra or session already
  delivered there, then continue with the next issue. Discard only on proof; never
  touch work a visibly active agent owns (#24).

## 0.5.0 — 2026-10-28

- Define the session ID: `[<project>-]<host>-<model>-<YYYYMMDD>[<suffix>]`, so ownership
  labels such as `orkester: booster-olw-win10-opus-5.5-20261028` show which machine and
  model hold an issue. Includes how to read host and model, shortening to GitHub's
  50-character label limit, model changes and workers on other models; existing labels
  stay valid (#23).

## 0.4.1 — 2026-10-27

- Anchor the idle-watch deadline to this session: the latest issue it resolved, or its
  first idle entry. Resolutions by earlier or other sessions no longer make a fresh
  session stop at once after a quiet period (#21).
- Refresh the bundled Issueflow snapshot to `d7c1f56`, which adds the upstream
  *User questions* and optional story-point rules (#22).

## 0.4.0 — 2026-10-26

- Dispatch before intake: intake hooks run while workers are busy and never delay
  startable work; they still run before a drain, review or idle decision (#20).
- Review the session when the queue drains: one bounded review of all work delivered
  since the last review, optionally split into read-only worker parts; findings become
  issues and the loop resumes. Hosts can configure or disable it (#20).

## 0.3.2 — 2026-10-24

- Rewrite the README around the concept: you talk to the conductor (*dirigenten*),
  which runs the orchestra (*orkestern*) of workers; add a before/after table, a
  who-plays-what diagram, a run walkthrough and a project icon (`docs/icon.svg`) (#19).
- Warn that worktrees share one stash: concurrent agents must not use `git stash`,
  after two workers' `stash pop` swapped each other's changes in a Lunden session.

## 0.3.1 — 2026-10-24

- Explain the name in README and ORCHESTRA.md: *dirigenten* is the conductor thread
  that spawns, briefs, monitors, integrates and reviews; *orkestern* is its workers (#18).

## 0.3.0 — 2026-10-24

- Close device-dependent issues after a best-guess fix by default: when only a physical
  device or the user's own experience could verify the result, diagnose, fix, verify
  what is possible and close with an honest note of what remained untested; the user
  reports again if it persists. Device tests are no longer user-only questions. Hosts or
  issues can still make device acceptance an explicit closing gate (#17).

## 0.2.3 — 2026-10-23

- Rewrite README as a short, concrete introduction with benefits, one diagram, a
  quick start and a file map. Move installation, updates, upstream discovery and the
  distribution rationale verbatim to INSTALL.md, and cross-project improvement,
  versioning and maintainer checks to CONTRIBUTING.md; update links into them.
- Require concurrent agents sharing a filesystem to work in separate checkouts: no
  edits or state-changing git commands in another agent's or the integration checkout,
  separate ports, temporary/evidence/build paths, concurrency-safe shared resources,
  and worktree removal only after integration or preservation.
- Offer a one-line prompt in the README quick start that lets the agent install the
  orchestra by following INSTALL.md.

## 0.2.2 — 2026-10-23

- Let a bounded pass release only under the host's release rule; the template shows
  releasing once no open issues remain rather than per issue.

## 0.2.1 — 2026-10-23

- Make a bounded pass unattended: never ask in the chat; post user-only questions on
  the affected issue with options, a recommendation and the `user question` label,
  skip it until answered and continue with other work. Hosts state whether a pass
  may release. The label's general rule is proposed for Issueflow in
  solwation/github-dashboard#285.

## 0.2.0 — 2026-10-23

- Treat a request without a scope as one bounded pass: select and deliver eligible
  issues without asking which to take, batch user-only decisions at the end and stop
  without polling, idle watching or timers.
- Refresh the bundled Issueflow snapshot to `fec18cc` with its parent/sub-issue rules;
  the worker starting the first sub-issue labels the parent, the conductor removes the
  label and closes the parent, and a parent's label takes no capacity slot.
- Run independent issues concurrently up to host capacity in queue sessions and bounded
  passes; keep the smallest-team rules within one issue, make the conductor's own
  implementation a deliberate slot, queue expensive shared verification and isolate
  ports/servers per worktree. Report active workers/capacity and unused slots.

## 0.1.2 — 2026-10-23

- Shorten and wrap README diagram labels, use SVG text for label layout, and show
  project-defined technical procedures as hooks in every delivery phase.
- Add project hooks across planning, implementation, verification, review, delivery
  and follow-up, with triggers, procedures, ownership, evidence and required/optional
  outcomes; include a project template and an illustrative screenshot lifecycle.
- Check official stable releases/tags at conductor startup/resume with a bounded cache;
  always propose relevant bug fixes, keep other upgrades optional and imports reviewed.
- Document exact-revision comparisons, tag-only releases, mixed upgrades, deduplication
  and offline fallback without installing background automation.
- Define task-specific follow-up with an owner, evidence format, destination and
  timing; include visual, behavioral, documentation and deployment examples.
- Require issue completion evidence before closure and keep unavailable required
  acceptance open without implicitly starting monitoring.

## 0.1.1 — 2026-10-23

- Make resource conservation a default across models and runtimes: choose sufficient
  capability/effort explicitly where supported, keep context and delegation bounded.
- Escalate for a diagnosed gap, preserve existing work and return routine work to an
  economical setting without weakening acceptance, authorization or required checks.
- Include the resource decision and reassessment condition in the compact worker brief.

## 0.1.0 — 2026-10-23

- Extract a provider-independent conductor/worker workflow with local project policy.
- Plan the critical path briefly; delegate only work that saves elapsed time.
- Keep small issues in one delivery; split independently useful outcomes rather than
  splitting by file count, test/docs phase or an elapsed-time threshold alone.
- Choose risk-based checks, reuse valid evidence, review once and stop at acceptance.
- Separate queue coordination and worker briefs from the everyday implementation path.
- Distribute reviewed releases as a pinned, squashed Git subtree; keep improvements central.
- Follow github-dashboard’s canonical Issueflow guide for GitHub label/state semantics.
