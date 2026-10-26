# Dirigenten och orkestern

A model-independent workflow for delivering scoped, verified changes with a conductor
and optional workers. *Dirigenten* (the conductor) is the agent thread the user talks
to, which spawns, briefs, monitors, integrates and reviews; *orkestern* (the orchestra)
is the workers it directs. Read the host project's policy first.
For GitHub issue work, also load the authoritative [Issueflow workflow](ISSUE-WORKFLOW.md)
before creating issues or changing labels/state. This file defines the
shared method; repository names, issue systems, permissions, release rules and timers
belong in the host policy. User instructions and platform restrictions take precedence.
Reading or maintaining these files does not start an unattended queue session.
A request without a scope, such as a bare `/orkester`, asks the conductor to choose
the work: run one unattended [bounded pass](COORDINATION.md#run-a-bounded-pass) that
asks no chat questions and posts user-only questions on the affected issue.

## Check the installed workflow

At conductor startup/resume, follow the host's upstream/version settings and
[update-discovery procedure](INSTALL.md#check-for-upstream-updates). Reuse a successful
check for up to 24 hours by default. Always propose relevant published bug fixes;
other upgrades are optional. Keep the installed workflow pinned until a reviewed
update is authorized; discovery does not enable unattended work or automatic imports.

## Start with a short delivery plan

Before implementation, write at most a few lines in the assignment or issue:

- Outcome and boundary: what must work, and which modules/data can change.
- Critical path: what must happen in order; which independent work can overlap.
- Checks: normally 2–3 checks tied to specific failure risks, plus mandatory gates.
- Ownership and done: worker, checkout, integration owner and release/closure evidence.
- Follow-up: owner, evidence format, destination and timing, chosen for the acceptance.
- Project hooks: applicable phase activities and their required evidence.

Spend minutes, not a planning phase, on an ordinary issue. Read relevant modules and
topic docs; do not inventory the entire application by default. Resolve a material
unknown with one focused investigation, then update the plan. A file count or elapsed
time alone is a signal to reassess, not a reason to manufacture child issues.

## Apply project hooks at each phase

Projects can extend the workflow with activities documented in their host policy or
linked topic documents. These hooks are instructions for the agent, including manual
steps or existing commands; this package installs no hook runner. The shared phase
names and boundaries are:

| Phase | Boundary for project activities |
| --- | --- |
| `planning` | Read relevant context and finalize the short delivery plan before implementation |
| `implementation` | Make the scoped change before handing it to verification |
| `verification` | Collect evidence for the affected behavior before review |
| `review` | Review the combined diff and evidence before authorizing delivery |
| `delivery` | Integrate/publish under host rules and verify the delivered revision |
| `follow-up` | Publish results and required evidence before issue closure or final handoff |

For each hook, the project defines a stable name, phase, trigger and timing (entry,
exit or a specific event within that phase), practical procedure or document link,
owner, expected evidence/destination and whether it is required or optional. List
multiple hooks in execution order within a phase. Use
[PROJECT.example.md](PROJECT.example.md) as the configuration template.

During planning, resolve applicable hooks and put their owners and evidence needs in
the existing plan/worker brief. Read the linked procedure before executing a hook.
At each phase boundary, the conductor checks the relevant hook outcomes before moving
on. A hook with a false trigger is not applicable; record that briefly when it affects
expected evidence. Without configured hooks, follow the core workflow normally.

A failed or unavailable required hook blocks the dependent phase transition or
closure; preserve evidence, report the next action and continue only independent work.
Report skipped or failed optional hooks without treating them as required acceptance.
Record outcomes in existing check/result notes, bound to the revision and environment.
Reuse valid evidence; repeat a hook only when its trigger recurs and evidence is no
longer valid, its procedure explicitly requires repetition, or a relevant failure needs
rechecking. Reassess a failed approach rather than retrying it blindly.

Hooks add project activities without weakening core checks, acceptance or permission
boundaries. They do not grant deployment/messaging permissions or enable unattended
monitoring. Queue intake hooks remain governed by [COORDINATION.md](COORDINATION.md);
reuse their outcomes when valid rather than running the same activity twice.

## Spend resources deliberately

Minimize the total work needed for an accepted result: model effort, context, tool
calls, setup and coordination as well as elapsed time. Apply this on every platform,
even when only one model is available. Quality, authorization, required evidence and
host queue/timer rules remain gates; do not save resources by silently weakening them.

Before assigning work, choose the smallest sufficient capability and effort:

| Task and risk | Starting choice |
| --- | --- |
| Clear implementation following an established pattern, bounded edits or routine checks | Lower-cost capable worker and low/moderate reasoning where selectable |
| Uncertain diagnosis, coupled design, unfamiliar boundaries or high-impact failure | Stronger reasoning for the uncertain part; delegate resolved implementation economically |
| Conductor planning and review | Enough reasoning for dependencies and risk; routine queue/status work does not automatically need maximum effort |

Use actual available capabilities and known cost information; do not assume a provider's
model names imply price or invent savings. The host adapter supplies concrete model
identifiers and supported effort settings. When selection is supported and authorized,
set these explicitly for the assignment rather than blindly inheriting the conductor's
strongest setting. When selection is unavailable or locked, state that limitation once
and conserve effort through scope, context, tools and verification. Never claim a model
was selected unless the tool actually used it. Do not ask the user to choose routine
resource settings unless their input is required.

Keep the decision to a line in the existing plan/brief: capability/effort, why it fits,
and a task-specific stop/reassessment condition. This is not a new reporting phase.
Choose direct work when a handoff would cost more than it saves. A helper must save
expected total work or materially shorten the critical path; idle capacity alone is
not a reason to add one to the same issue or duplicate an investigation. In a queue
session or bounded pass, the next independent issue is a separate delivery, not a
helper; [coordination](COORDINATION.md#select-and-claim) fills capacity with those.

Give workers a compact brief, acceptance, relevant paths and the current findings.
Keep mandatory host rules accessible, but do not copy the entire conversation, queue
or repository into every assignment. Prefer targeted searches, bounded output and
independent batched reads. Reuse valid setup, fetched data and source-bound evidence
within their freshness requirements; do not replay startup on every poll or continue
exploring alternatives once acceptance is met.

Escalate for a concrete capability gap, unresolved ambiguity, high-impact risk or a
failed bounded approach, not merely because a tool/check failed. Inspect the failure:
fix a command/environment issue directly, make a scoped correction for a known defect,
and use stronger reasoning/model only where it addresses the remaining difficulty.
Starting stronger immediately is appropriate for demonstrated risk. If the same
approach fails again without new evidence, stop repeating it and reassess. Preserve
the checkout, patch, evidence and diagnosis for a handoff; do not restart the task
blindly. Record the reason and changed capability/scope in the existing brief/status.
Return routine follow-on work to the economical setting when the uncertainty is resolved.

## Choose the smallest useful team

These team rules apply within one issue. Across independent issues in a queue session
or bounded pass, run separate deliveries concurrently up to the host's capacity.

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
closely coupled edits together. Serialise overlapping writes and integration.

Agents running at the same time share one filesystem, so isolate them:

- Each writing agent, including the conductor when it implements, works in its own
  checkout, such as a `git worktree` on its own branch. Never edit files or run
  state-changing git commands (checkout, switch, stash, reset, clean, rebase, commit)
  in a checkout you do not own; the integration checkout belongs to the integration
  owner. Reading another checkout is fine.
- Worktrees of one repository share its stash, refs and object store. Do not use
  `git stash` while other agents work in sibling worktrees: one agent's `stash pop`
  can restore another's change. Park work in a commit on your own branch or a
  separate worktree instead, and keep branch/tag names unique per worker.
- Give each checkout its own ports, server configuration, temporary/evidence
  directories and build output. Share a cache, database or device only when it is
  safe for concurrent use or taken in turns.
- Only the integration owner brings changes into the integration checkout. Remove a
  worktree only after its work is integrated or preserved.

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
hardware performance from emulation. Hard contracts and explicit user acceptance gates
cannot be waived to save time. Evidence that only a physical device or the user's own
experience can supply is not a closing gate by default; see
[best-guess closure](#close-after-a-best-guess-fix).

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

## Follow up with evidence that fits the change

The conductor owns follow-up unless a named owner is assigned in the short plan.
Choose the smallest useful evidence and an accessible destination under host rules:

| Delivered change | Useful follow-up |
| --- | --- |
| Visible UI or rendered content | Screenshot of the affected state, with revision and environment; before/after when comparison helps |
| Behavior or bug fix | Relevant test result or reproduction outcome tied to the delivered revision |
| Documentation or policy | Link to the published change and a short explanation of what was checked |
| Deployment | Target environment, deployed revision and outcome of the relevant post-deployment check |

For issue work, post a completion comment before closure: outcome, delivered revision,
checks, links or attachments to relevant evidence, limitations and remaining acceptance.
A screenshot supports visual acceptance; it does not replace functional checks. Inspect
captured images before posting and use an authorized destination without exposing
private data. If attachments cannot be posted, provide an accessible artifact link or
report the limitation; never claim an upload that did not happen.

Perform required post-publication checks before declaring their acceptance complete.
If other required evidence is unavailable, keep the relevant acceptance open and name
the next action and owner. Only schedule later monitoring when authorized; follow-up
does not itself enable unattended polling. Reuse the existing result note and evidence
rather than adding a separate reporting phase.

### Close after a best-guess fix

Work as autonomously as the host's permissions allow. When the only missing evidence is
a physical device, a specific user's hardware or the user's own experience (a crash on
their phone, touch behavior on one device, "does it feel right now"), do not park the
issue waiting for it. Diagnose with the available reports and tools, make the best
supported fix, verify what can be verified (emulation, measurement, tests), and close
the issue. The completion comment states plainly what was verified, what could not be
and why, so the user can report again or reopen if the problem persists; never present
untested behavior as tested. A device test is not a user-only question: do not post one
through the question channel. Keep an issue open only when the host policy or the issue
itself explicitly makes that device or user acceptance a closing gate, or when no
plausible fix exists yet; then record the diagnosis, next action and owner.

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

For a bounded pass or an unattended queue session, also read
[coordination](COORDINATION.md) and the host's queue/timer settings, including the
[session review](COORDINATION.md#review-the-session) when the queue drains. For a worker
assignment use [the compact brief](WORKER.md).
