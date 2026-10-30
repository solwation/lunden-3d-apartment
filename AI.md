# Repository AI policy

This is the host policy for maintaining `solwation/dirigenten-och-orkestern` itself.
Consumers use their own host policy. Respond to the maintainer in Swedish; retain
the established language of the files being edited.

## Follow the orchestra

Read this file, [ORCHESTRA.md](ORCHESTRA.md) and
[ISSUE-WORKFLOW.md](ISSUE-WORKFLOW.md) before making changes. Apply the orchestra
to this repository's own maintenance, including a short delivery plan, deliberate
resource use, scoped verification and one conductor review.

The agent receiving the request acts as conductor and integration owner. It may
implement directly and review its own diff for small cohesive changes. Use an
optional worker only when independent work justifies the handoff, with a maximum
of two agents including the conductor. Use [WORKER.md](WORKER.md) for assignments.
Respect platform limits on delegation and model selection; disclose unavailable
controls once rather than pretending they were used.

An ordinary maintainer request starts a single scoped task. `/orkester`, with or
without a scope, starts a queue session over this repository's open issues under
[COORDINATION.md](COORDINATION.md#poll-idle-and-stop); a given scope still bounds the
work. Run a single [bounded pass](COORDINATION.md#run-a-bounded-pass) without timers
only when one is explicitly requested.

| Queue setting | Value |
| --- | --- |
| Queue poll | Every 300 seconds during active work and idle; also before every new selection |
| Idle watch | 60 minutes after the latest issue this session resolved (first idle entry if none) |
| Intake hooks | None |

The session is unattended: ask nothing in the chat. Post a question only the
maintainer can answer as a comment on the affected issue with options and a
recommendation, add the `user question` label and continue with other work; skip such
issues until answered, and whoever resumes one removes the label.

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

## Project phase hooks

Apply ORCHESTRA.md's hook contract. All hooks below are required when their trigger
applies and owned by the conductor; delegate only explicit scoped activities.

| Hook | Phase and trigger/timing | Procedure and completion evidence |
| --- | --- | --- |
| Plan repository work | `planning`: every change, before implementation | Read the relevant policy/topic docs and create/reuse the issue with labels and a short plan under the GitHub rules below |
| Preserve scope | `implementation`: every change, before verification | Inspect the patch for unrelated edits and preserve concurrent work |
| Check instructions | `verification`: documentation changes, before review | Check diff, relative links and consistency; walk through changed workflow scenarios and record results in the issue completion note |
| Review delivery | `review`: every change, before publishing | Read the combined diff and check acceptance against existing evidence; correct concrete defects |
| Publish main | `delivery`: every completed requested change | Follow the publishing rules below; confirm the delivered commit is on remote main |
| Complete issue | `follow-up`: every tracked change, before closure | Post the completion comment and relevant evidence under the rules below, remove active labels and close only if acceptance is met |

No screenshot hook is configured for ordinary instruction changes. When a task has
visual acceptance, add the relevant capture, inspection and sharing procedure to its
plan as described below. No additional hooks or timers are enabled implicitly.

## Track actual work in GitHub

Use the current authoritative Issueflow guide as resolved by ISSUE-WORKFLOW.md;
record its revision in the issue or delivery note once per session.

- Reuse a matching issue or create one before implementation, with the expected
  result, acceptance criteria, short plan and integration owner.
- Set exactly one canonical priority label: `priority: high`, `priority: medium`
  or `priority: low`. Default to medium and briefly explain the priority.
- Apply `in-progress` only while actively working. Keep ownership separate from
  work status; never remove another active owner's labels.
- Remove all recognized active-work labels when pausing, handing off or finishing.
- Record the delivered revision, checks, limitations and remaining acceptance in
  the issue before closing it. Close only after acceptance and verification pass
  and the requested change has reached `origin/main`.

## Adapt follow-up to the change

Apply ORCHESTRA.md's follow-up rules. Name its owner, evidence format, destination
and timing in the short plan. Always post a completion comment on this repository's
issue before closure, linking the delivered commit and relevant evidence. For a
rendering change, capture and inspect the affected rendered state when visual
acceptance requires it; for instructions, link the published text and record the
consistency checks. Post images or artifact links when useful and supported by the
authorized tools. Disclose missing evidence and keep unmet acceptance open.

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

For documentation changes, check the diff, relative links and consistency with the
shared rules. Exercise distribution changes in a disposable repository as required
by [CONTRIBUTING.md](CONTRIBUTING.md#maintainer-checks). Release only when a fresh complete fetch shows no open issues in this
repository (or when the maintainer requests one), bundling everything under
*Unreleased* in CHANGELOG; choose patch/minor under the
[versioning rules](CONTRIBUTING.md#improve-it-across-projects), while a major
release needs an answered issue question. Close an issue whose only remaining
criterion is inclusion in a release once its change is on `main` under *Unreleased*.
Never move or delete existing tags.

Verify that the delivered commit is on remote `main`. Report the outcome, GitHub
links, revision, checks and any unmet acceptance accurately.
