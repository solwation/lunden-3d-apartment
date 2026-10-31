# Repository AI policy

This is the host policy for maintaining `solwation/dirigenten-och-orkestern` itself.
Consumers use their own host policy. Respond to the maintainer in Swedish; retain
the established language of the files being edited.

## Follow the orchestra

Read this file first, then the core files the
[read map](ORCHESTRA.md#read-map) names for the run, and apply the orchestra to this
repository's own maintenance.

The agent receiving the request acts as conductor and integration owner. It may
implement directly and review its own diff for small cohesive changes. Use an
optional worker only when independent work justifies the handoff, with a maximum
of two agents including the conductor. Use [WORKER.md](WORKER.md) for assignments.
Respect platform limits on delegation and model selection; disclose unavailable
controls once rather than pretending they were used.

An ordinary maintainer request starts a single scoped task. Overriding the core's
empty-scope default, `/orkester`, with or without a scope, starts a queue session over
this repository's open issues under [COORDINATION.md](COORDINATION.md#poll-idle-and-stop);
a given scope still bounds the work. Run a single
[bounded pass](COORDINATION.md#run-a-bounded-pass) only when one is explicitly requested.

| Queue setting | Value |
| --- | --- |
| Queue poll | Every 300 seconds during active work and idle; also before every new selection |
| Idle watch | 60 minutes after the latest issue this session resolved (first idle entry if none) |
| Intake hooks | None |

Questions only the maintainer can answer go to the affected issue with the
`user question` label ([ask through the issue](COORDINATION.md#ask-through-the-issue)).

## Consume the orchestra from this checkout

This repository is its own consumer. The root files of the current checkout are the
installed core; there is no `.orchestra/shared` subtree, release pin or separate
project policy, and this file takes the role of `.orchestra/project.md`. Upstream
update discovery does not apply: the conductor already runs the newest revision.
`/orkester` is the thin adapter in
[.claude/commands/orkester.md](.claude/commands/orkester.md). A change to the core
governs the session that makes it from the point it is read again, and any later
session; record which revision a delivery followed when that matters. Consumers
importing this repository by subtree receive the adapter under
`.orchestra/shared/.claude/`, where hosts do not load it.

## Host settings

Each row answers a line of [PROJECT.example.md](PROJECT.example.md); "core default"
means the shared rules apply unchanged.

| Setting | Value |
| --- | --- |
| Repository and coordination | `solwation/dirigenten-och-orkestern` only; its open issues are the queue, there is no separate status issue. Cross-project boundaries: none; the core stays free of project details |
| Excluded and session labels | Issues labelled `user question` are skipped until answered; no other exclusions. Session ID `<host>-<model>-<YYYYMMDD>[<suffix>]` (project short name omitted: one repository), label prefix `orkester: ` |
| Claims, races, expiry, handover | Core default: the `orkester:` label claims an issue, never take over a visibly active one |
| Capacity | At most two agents including the conductor; the conductor's own implementation counts as a slot and is allowed for small cohesive changes. No expensive shared verification (no browser/e2e/device runs) |
| Isolation | No servers or ports. In Claude Code, give a worker its own checkout with the Agent tool's `isolation: "worktree"` |
| Runtime/model selection | Claude Code's Agent tool chooses a model per worker (`sonnet`, `opus`, `haiku`, `fable` aliases). Reasoning effort follows the agent definition and is not set per call unless the maintainer asks. Choose per the resource rules in [ORCHESTRA.md](ORCHESTRA.md) and disclose when a control is unavailable; no price assumptions |
| Heartbeat, stale work | Core default |
| Delivery mode | Direct to `main` (see *Commit and push requested changes*); PR mode does not apply |
| Wait mechanism | Interactive Claude Code blocks a foreground `sleep`: wait with a background timer (Bash `run_in_background` running `sleep 300`, which re-invokes the conductor when it exits) or the Monitor tool with an until-loop; a finishing worker or a maintainer message also wakes the conductor. `claude -p '/orkester'` and one-shot cloud runs cannot wait: they run a bounded pass and say that no poll or idle watch ran |
| Session review on drain | Core default |
| Workspace/server setup | None; Markdown only |
| Required checks | `python3 scripts/check-links.py` and the maintainer checks below |
| Installed version, upstream discovery | Not applicable: the root files are the installed core and the conductor already runs the newest revision (see above) |
| Shell pitfall | `gh issue view` without `--json` may fail here with "GraphQL: Projects (classic) is being deprecated ... (repository.issue.projectCards)". Use `gh api repos/solwation/dirigenten-och-orkestern/issues/N` and `.../issues/N/comments` instead |
| Attribution and licenses | Commit trailers and PR notes name the tool and model that did the work; never another provider. The repository license is [LICENSE.md](LICENSE.md); the Issueflow snapshot keeps its own [license](issueflow/LICENSE.md) |
| Auto-close pitfall | A commit message with "Fixes #N" closes the issue on push, before the required completion comment. Write "(#N)" in commit messages and close manually after the comment |

## Project phase hooks

The core phase gates apply as written; only project-specific activities are listed.
Both hooks are required and owned by the conductor.

| Hook | Phase and trigger/timing | Procedure and completion evidence |
| --- | --- | --- |
| Check instructions | `verification`: documentation changes, before review | Check diff and consistency; run `python3 scripts/check-links.py` for relative links and anchors; walk through changed workflow scenarios and record results in the issue completion note |
| Publish main | `delivery`: every completed requested change | Follow the publishing rules below; confirm the delivered commit is on remote main |

No screenshot hook is configured; no other hooks or timers are enabled implicitly.

## Track actual work in GitHub

Use the current authoritative Issueflow guide as resolved by ISSUE-WORKFLOW.md;
record its revision in the issue or delivery note once per session.

Labels, priority and work status follow that guide. Project specifics: every issue
names its integration owner in the plan, and closes only after its change has reached
`origin/main`.

## Adapt follow-up to the change

The core [follow-up](ORCHESTRA.md#follow-up) applies. For instructions the evidence is
a link to the published text plus the recorded consistency checks; a rendering change
with visual acceptance adds capture and inspection to its plan.

## Commit and push requested changes

The maintainer has authorized agents to commit and push completed requested changes
directly to `main` in this repository. Treat implementation, verification, commit
and push as one delivery; do not stop with local-only edits or ask again for routine
publishing approval. A later explicit instruction can change this scope.

Fetch before integration and preserve concurrent work. If upstream has advanced,
integrate it with merge ancestry intact (for example,
`git rebase --rebase-merges origin/main` for unpublished local commits), inspect the
combined changes and repeat affected checks. Push normally; never force-push or
bypass branch protection. If direct push is blocked, preserve the work and report
the actual blocker.

For documentation changes, check the diff, relative links (`python3 scripts/check-links.py`,
also run by CI) and consistency with the
shared rules. Exercise distribution changes in a disposable repository as required
by [CONTRIBUTING.md](CONTRIBUTING.md#maintainer-checks). Release only when a fresh complete fetch shows no open issues in this
repository (or when the maintainer requests one), bundling everything under
*Unreleased* in CHANGELOG, following the
[release checklist](CONTRIBUTING.md#release-checklist); choose patch/minor under the
[versioning rules](CONTRIBUTING.md#improve-it-across-projects), while a major
release needs an answered issue question. Close an issue whose only remaining
criterion is inclusion in a release once its change is on `main` under *Unreleased*.
Never move or delete existing tags.

Verify that the delivered commit is on remote `main`. Report the outcome, GitHub
links, revision, checks and any unmet acceptance accurately.
