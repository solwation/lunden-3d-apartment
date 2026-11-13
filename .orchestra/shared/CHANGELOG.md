# Changelog

## Unreleased

## 0.14.1 — 2026-11-13

- Bring README.md up to date with the core: six phase gates, chat intake, bounded
  pass versus queue session, the project review on an empty queue, the
  `workingtree/` worktree root and its `.gitignore` step, PR delivery, and the
  `scripts/` and `issueflow/` directories (#70).
- Bring the GitHub Pages site up to date: six delivery gates, chat intake and the
  project review, the `workingtree/` root, the v0.14.0 pin with the `.gitignore` step
  and the full file list (#71).
- The release checklist now requires updating README.md and the GitHub Pages site
  (`docs/index.html`) to the released core in every release, and
  `scripts/check-release.sh` also checks the Pages site's version pin (#72).

## 0.14.0 — 2026-11-13

- When a bounded pass or queue session starts with nothing startable, run one
  bounded, read-only project review first. Its concrete findings become triaged
  issues that the same run then delivers. Once per run, deduplicated against
  existing issues, capped at 5 findings by default; hosts can focus or disable it
  (#69).

- Default the worktree root to a git-ignored `workingtree/` directory inside the
  project checkout instead of sibling directories beside the project; document the
  `.gitignore` entry, the `git clean -x` pitfall and that platform-created checkouts
  keep their own location (#68).

## 0.13.1 — 2026-11-12

- Clarify that agent-created or added work issues start/resume the orchestra under
  the host's documented intake run mode, including after an idle watch; reuse the
  active conductor, respect explicit deferral and do not interpret "create an issue"
  alone as a request to stop after registration (#67).

## 0.13.0 — 2026-11-12

- Add guidelines for continuous capacity evaluation and dynamic worker scaling
  in `ORCHESTRA.md`, `COORDINATION.md`, and `PROJECT.example.md`: treat host
  capacity as an upper bound rather than a static quota, scale down on rate
  limits (HTTP 429), resource pressure, or integration backlogs, prioritize
  integrating waiting handoffs before dispatching new workers, and scale up
  cautiously towards host ceiling when the integration pipeline is clear (#66).

## 0.12.1 — 2026-11-12

- Clarify image rules and dashboard compatibility for private repositories in
  `PROJECT.example.md`: revision-pinned blob or raw URLs are the correct format
  but require the reader's dashboard token to have `Contents: Read-only` permission
  (a *View on GitHub* placeholder indicates missing permissions rather than an
  incorrect link format), and note that public hosting alternatives apply only
  when host policy permits publication (#65).

## 0.12.0 — 2026-11-11

- Recommend an optional multi-perspective expert panel review hook when work is
  complete (identifying expert roles, independent analysis, discussion/synthesis,
  and formulating findings as new backlog issues) in `PROJECT.example.md`,
  `COORDINATION.md`, and `ORCHESTRA.md` (#64).

## 0.11.4 — 2026-11-11

- Clarify image embedding compatibility for `github-dashboard` (HTTPS only, Markdown
  syntax instead of HTML `<img>` tags, standalone paragraph for responsive block
  styling) in `PROJECT.example.md` and `ORCHESTRA.md` (#63).

## 0.11.3 — 2026-11-11

- Recommend practical patterns for hosting and embedding images in completion
  comments (dedicated asset branches, release assets, GitHub Pages, or upload
  scripts) in `PROJECT.example.md` and `ORCHESTRA.md` to prevent git subtree bloat
  while keeping visual evidence directly visible (#62).

## 0.11.2 — 2026-11-10

- Prefer directly visible images (attached or embedded via fully-qualified URLs)
  in completion comments for visual acceptance, allowing immediate confirmation
  in GitHub and project dashboards (#61).

- Explicitly require the conductor to resume active orchestration in the same
  turn after answering user questions, providing status, or executing operational
  actions mid-run, rather than pausing or ending the session (#60).

- Add GitHub Pages landing site in `docs/index.html` with responsive presentation,
  architecture diagrams, value comparisons, and quickstart guides; streamline
  `README.md` to be concise and link directly to the website (#59).

## 0.11.1 — 2026-11-08

- `scripts/prune-worktrees.sh` no longer reports the current directory as a checkout
  when a root holds none: an empty candidate list stays empty, and no path runs
  `git -C ""`, `du ""` or `rm -rf ""`. Add `scripts/test_prune_worktrees.py`, run by
  CI, covering an empty root and the claim, fresh and integrated classes (#58).

## 0.11.0 — 2026-11-08

- Keep a worker's fresh checkout from being pruned before its first commit: whoever
  creates a writing checkout writes an `orchestra-claim` marker (issue and session) in
  its git directory, and `scripts/prune-worktrees.sh` classifies a marked checkout as
  active unless its issue is shown closed, and a checkout without commits of its own as
  active while its HEAD changed within `--min-age` (default 120 minutes). Both work
  without a GitHub remote or `gh` (#57, from field report solwation/lunden-3d-apartment#1890).

## 0.10.0 — 2026-11-08

- Remove worker checkouts once their work is proven on main: the integration owner
  at follow-up, and the session review and startup across the host's whole worktree
  root. Add `scripts/prune-worktrees.sh` (dry run by default, archives unproven work,
  never removes a checkout whose issue is open) and a host setting for the worktree
  root and archive (#54).

- Start from current main: fast-forward a clean integration checkout to the remote
  main branch before reading or planning, treat a dirty or diverged one as leftover
  work, compare leftovers only against remote main and confirm a `git cherry` `+`
  with a content comparison before resuming it as unique (#55, from
  solwation-on-twitch).

- Turn messages that arrive during a run into issues before the current task
  continues, update the existing issue for a clarification, and separate operational
  actions (reload, restart, status check, snapshot) from changes: they need no issue
  of their own, but a bug report they relieve still gets one; the hand-back maps
  messages to issues (#56, from solwation-on-twitch).

## 0.9.0 — 2026-11-06

- Keep verification checkouts and relevant inputs stable during a run; invalidate
  and repeat only checks affected by an overlapping edit (#49, from field report #48).

- Feed material review findings back into briefs, topic instructions or checks before
  more assignments with the same risk start; notify affected active owners and let
  independent work continue throughout the run (#50, from field report #48).

- Make worker test setup explicit: verify the assigned server serves the right
  checkout before server-backed checks, and take the shared verification turn and
  any host-required lock before expensive runs (#52, from field report #48).

- Offer an optional host context map from labels, paths or topics to document
  sections; briefs name all matching entries without replacing required core
  reading or adding a new brief block (#51, from field report #48).

- Give the user a ready-to-paste field report and submission link when the runtime
  cannot publish upstream; state that it remains unpublished and respect denied
  access (#53, from field report #48).

## 0.8.2 — 2026-11-05

- Shorten repeated handoff, ownership, worker and follow-up instructions with links
  to their authoritative sections. Distinguish session reading from phase reading;
  preserve existing gates, anchors and fresh queue checks (#47).

- Fix Markdown link checking for nested code fences, closing fences with info text
  and heading anchors that collide with generated suffixes. Add focused standard
  library regression tests to CI (#46).

## 0.8.1 — 2026-11-05

- Clarify chat intake: a request for changes creates or reuses issues and starts or
  resumes the orchestra to resolve them, including before its first run or after an
  idle watch ends. Respect explicit deferral, reuse an active conductor, and preserve
  scope, ownership, timer and publication rules; align host policy and entry guidance
  (#45).

## 0.8.0 — 2026-11-04

- Add the integration-ready handoff and integration queue: finished work retains its
  integration owner and evidence without active time or a worker slot. Align core,
  worker briefs, parent/PR handling, examples and maintainer policy with the canonical
  Issueflow guide; refresh its exact snapshot/provenance to `0e712c3` and document
  adoption from earlier releases (#43).

- Move the project icon to root `icon.svg` so dashboards can discover it; README
  uses the same file (#44).

## 0.7.1 — 2026-11-02

- Clarify screenshot requirements in completion comments: ORCHESTRA.md and AI.md now
  explicitly name UI/UX, styling and 2D/3D graphics/rendering under *Follow-up*, requiring
  screenshots or comparisons in the issue's completion comment (or an explicit statement
  when capture/upload is unsupported); PROJECT.example.md illustrates the lifecycle for
  both UI and graphics/3D scenes (#42).

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
