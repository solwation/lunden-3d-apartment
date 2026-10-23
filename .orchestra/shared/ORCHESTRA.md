# Dirigenten och orkestern

A model-independent workflow for delivering scoped, verified changes with a conductor
and optional workers. Read the host project's policy first.
For GitHub issue work, also load the authoritative [Issueflow workflow](ISSUE-WORKFLOW.md)
before creating issues or changing labels/state. This file defines the
shared method; repository names, issue systems, permissions, release rules and timers
belong in the host policy. User instructions and platform restrictions take precedence.
Reading or maintaining these files does not start an unattended queue session.

## Start with a short delivery plan

Before implementation, write at most a few lines in the assignment or issue:

- Outcome and boundary: what must work, and which modules/data can change.
- Critical path: what must happen in order; which independent work can overlap.
- Checks: normally 2–3 checks tied to specific failure risks, plus mandatory gates.
- Ownership and done: worker, checkout, integration owner and release/closure evidence.

Spend minutes, not a planning phase, on an ordinary issue. Read relevant modules and
topic docs; do not inventory the entire application by default. Resolve a material
unknown with one focused investigation, then update the plan. A file count or elapsed
time alone is a signal to reassess, not a reason to manufacture child issues.

## Choose the smallest useful team

For a small cohesive change use one implementer and one conductor review. The conductor
may implement directly when project policy allows; if delegation is unavailable,
perform the roles sequentially and report that limitation. Do not simulate subagents.

Use a second worker when independent investigation, a separate implementation area,
or verification preparation shortens the critical path. State its concrete output and
file ownership. Count helpers and reviewers against the project's total worker cap;
workers must not spawn an unbounded nested team. Parallelize independent reads/API
fetches too, without adding agents just to run shell commands.

One integration owner combines changes and publishes each issue. A helper can work
under that issue without creating a child just for tests, docs or review. It must use
the implementation owner's exact revision before claiming final verification. Keep
closely coupled edits together. Serialise overlapping writes and integration; separate
checkouts, ports and evidence directories avoid interference.

Create child issues only for independently useful deliveries that genuinely reduce
coordination or unblock work. Keep parent acceptance visible; children inherit project
priority constraints. One small issue normally needs one complete delivery. For larger
work publish useful, verified slices, never unfinished code merely to meet a timer.

## Verify the affected behavior

Choose checks from the change's dependency path, inputs and failure modes, not from
historical test inventories. Existing fast suites and project release gates still apply.

| Change | Minimum useful evidence |
| --- | --- |
| Documentation/instructions | Diff, links and consistency with retained requirements |
| Local behavior | Relevant component check and affected real integration/route |
| Shared protocol, persistence, security or renderer | Changed boundaries and representative consumers; broaden for a stated risk |

Use the existing harness when possible. Add a regression check when it catches a
meaningful failure; do not build a framework or test that merely repeats the code.
Diagnose failed scoped checks, fix failures caused by this change, and rerun affected
checks before delivery. Track proven unrelated baseline defects separately; they do
not waive required acceptance. A component render is not evidence for the whole application. Do not claim native
hardware performance from emulation. User acceptance and hard contracts cannot be
waived to save time; report unavailable evidence and keep unmet acceptance open.

Bind results to the revision, relevant inputs, environment and quality mode. Reuse
valid evidence after unrelated rebases; rerun only checks affected by changed code,
inputs, conflicts, a failure or a concrete unresolved risk. Share expensive setup where
safe. Correct a bad evidence camera and repeat that check, not every scene/platform.
A guessed historical performance threshold alone does not justify optimization work.

Stop expanding coverage once the agreed checks pass and acceptance is met. At about
10 minutes of verification, reassess before another costly sweep: identify the missing
proof and use the smallest reliable check. This is a review point, not permission to
skip required verification or conceal failures.

## Review and deliver once

The conductor reads the diff and existing results, checks relevant images if required,
and looks for missed acceptance, integration errors and scope creep. Do not routinely
rerun green checks or add a second review agent. Request one bounded correction for a
concrete defect. Routine wording/preferences are not a new implementation cycle.

Follow host release rules, preserve concurrent work, and never bypass denied actions
through another agent. Inspect changed upstream files after syncing; repeat affected
checks only. Publish result evidence before auto-closing an issue if required. A commit,
a successful deployment and verified behavior are distinct; report exactly what exists.
Remove ownership labels when finished or released; leave incomplete acceptance open.
Unrelated defects become separately scoped issues, not opportunistic fixes.

Record a short result: outcome, revision, checks and limitations, deployment when
applicable, remaining work. Attribution must name the actual tool if required; never
pretend another provider generated the work.

## Keep progress observable

Use host heartbeat/deadline rules. Reassess at roughly 30 minutes without a useful
delivery; diagnose at 45–60 minutes without concrete progress. Inspect hung processes,
resume existing work and preserve evidence rather than restart. Split only if it helps.
Do not let setup, test polish or coordination quietly consume hours.

Record coarse phase times (plan/setup, implementation, verification/review, release
wait) in the existing completion note when available, plus worker count and rerun
reasons. Do not infer implementation duration from issue creation/closure timestamps.
Compare similar tasks and reopen/regression rates before claiming a speed improvement;
collect this information in normal delivery, not a new benchmark project.

For an unattended queue session, also read [coordination](COORDINATION.md) and the
host's queue/timer settings. For a worker assignment use [the compact brief](WORKER.md).
