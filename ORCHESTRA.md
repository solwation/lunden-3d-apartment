# Dirigenten och orkestern

A model-independent workflow for delivering scoped, verified changes with a conductor
and optional workers. *Dirigenten* (the conductor) is the agent thread the user talks
to; it spawns, briefs, monitors, integrates and reviews *orkestern* (the orchestra),
the workers it directs. This file is the shared method; repositories, issue systems,
permissions, release rules and timers belong in the host policy. User instructions and
platform restrictions take precedence.

## Read map

| Role/run | Read at startup/resume, in order |
| --- | --- |
| Conductor, scoped task | Host policy; this read map, checklist, *Start and resume*, *Keep progress observable* and *Default time limits*; [ISSUE-WORKFLOW.md](ISSUE-WORKFLOW.md) for GitHub issues |
| Conductor, bounded pass or queue session | The above plus [COORDINATION.md](COORDINATION.md) and the host's queue/timer settings |
| Worker | Host policy, [WORKER.md](WORKER.md), the brief and the phase sections it names |

Read each applicable policy once per session; on resume reuse it unless changed, and
resolve Issueflow as its guide specifies. Before each phase, read its section below
and any linked procedure needed for that work; reuse unchanged sections already read.
The checklist routes phase reading, not extra documents. This reuse never replaces
fresh queue fetches, claim checks or recovery required below and in COORDINATION.md.

A host may optionally map labels, paths or topics to relevant document sections.
Apply all matching entries and name them in the brief; search long references for
relevant sections rather than reading them in full by default. This context map
supplements the required core reading and never waives applicable rules.

Reading these files alone never starts an unattended run. A chat request for changes
starts the workflow under [chat intake](#turn-chat-requests-into-work). An empty scope,
such as a bare `/orkester`, lets the conductor choose the work: by default one
[bounded pass](COORDINATION.md#run-a-bounded-pass); a host policy may configure a queue
session instead.

## Checklist

| Phase | Gate |
| --- | --- |
| Start | [Update check](#check-the-installed-workflow) per host settings; integration checkout [on current remote main](#resume-unfinished-work-first); [resume or discard unfinished work](#resume-unfinished-work-first) |
| `planning` | [Short plan](#start-with-a-short-delivery-plan); issue claimed under Issueflow; [resources](#spend-resources-deliberately) and [team](#choose-the-smallest-useful-team) chosen; [hooks](#apply-project-hooks-at-each-phase) resolved |
| `implementation` | Own checkout under the [isolation rules](#isolate-concurrent-agents); assigned scope only |
| `verification` | [Agreed risk-based checks](#verification) pass on the delivered revision |
| `review` | [Handoff](#handoff-for-integration) retains owner/evidence while waiting; [conductor reads the combined diff](#review) against acceptance |
| `delivery` | [Published under host rules](#delivery); delivered revision verified |
| `follow-up` | [Completion comment](#follow-up) with evidence before closure; active labels removed; [checkout removed](#clean-up-checkouts) |

## Start and resume

### Turn chat requests into work

Treat a user's chat request for changes as a request to get them resolved. Before
implementation, create one issue per independently reviewable change, or update an
existing matching issue, in the host's tracker; capture the requested outcome and
acceptance under [Issueflow](ISSUE-WORKFLOW.md) for GitHub. Then start or resume the
orchestra within that scope without asking for a separate `/orkester` command or
confirmation. This also applies when no orchestra is running, none has run yet, or
the previous idle watch has ended. Follow startup/recovery below and the host's run
mode; a scoped request does not silently expand to the whole backlog or enable timers.

If a run is already active, add the request to that conductor's work and apply the
normal selection and ownership rules; do not start a competing run or reset its idle
deadline just because a message arrived. Reuse issues and preserved work on resume.
Assess each message that arrives during the run at once. A change request or bug
report gets its issue (created or reused) before the current task continues; it then
joins selection or goes to a free slot under capacity. A clarification of work in
progress updates that work's issue instead.

An *operational action* changes no code or configuration: reloading, restarting an
existing service, a status check or a snapshot. It needs no issue of its own, but
relieving a reported bug with one does not resolve it: the report still gets an issue
recording the diagnosis and the relief applied. The hand-back says which messages
became which issues and which only led to operational actions.

Respect explicit limits such as "do not start the orchestra", "only create issues"
or "discuss only". Record requested changes as issues when allowed, keeping any
explicitly deferred work paused and unclaimed until the user authorizes execution;
do not let queue selection bypass that limit. A prior explicit stop still applies
unless the user authorizes resumption. Answer questions, status requests and discussion
without inventing change tasks; a request for changes to these instructions is itself
work under this rule. Chat intake does not grant publication permissions beyond the
host/user rules or install a background listener.

### Check the installed workflow

At conductor startup/resume, follow the host's upstream settings and
[update-discovery procedure](INSTALL.md#check-for-upstream-updates); reuse a successful
check within the update-check [time limit](#default-time-limits). Always propose relevant published bug fixes; other
upgrades are optional. Discovery never imports updates or enables unattended work.

### Resume unfinished work first

At startup/resume of any run, before reading code or selecting new work, fetch and
fast-forward the integration checkout to the remote main branch when it is clean. A
dirty or diverged integration checkout is never overwritten: treat its changes and
commits as leftover work below. Read, plan and create new worktrees from the remote
main branch, never from a stale local main.

Then look in the checkouts this run will use, and in the host's worktree root for
checkouts earlier sessions left behind (`git worktree list`, local branches, branches
without a remote), for uncommitted changes, commits not on the remote main branch,
and claims or active labels left by an earlier session. Compare only against the
remote main branch (`origin/main`), never against local main, and decide each item
from evidence, not age:

- **Already on main** (another session may have delivered it): `git diff origin/main --
  <paths>` is empty, `git cherry origin/main <branch>` marks every commit `-`, or the
  linked issue closed with a revision containing the change. Discard the local copy,
  worktree, branch and stale claim; if only part landed, resume the missing part.
- **Not on main**: identify its issue (branch, commit message, claim, matching issue),
  claim it and finish it as a normal delivery before new selection; useful work without
  an issue goes under a matching or new one. A `+` from `git cherry` alone does not
  prove this: the same patch in a different context, or a later reimplementation, also
  shows `+`. Confirm with a content comparison against `origin/main` and a search of
  its history for the commit message or issue reference first.
- **Owned by a visibly active agent**: not leftover; never touch it
  ([takeover](COORDINATION.md#coordinate-and-recover)).

Discard only on proof; when in doubt, preserve it as a commit on a private branch.
Note briefly what was fast-forwarded, resumed or discarded. This brief check does not
replace the queue fetch.
Leftover checkouts from earlier sessions follow [clean up checkouts](#clean-up-checkouts).

## Planning

### Start with a short delivery plan

Before implementation, write a few lines in the assignment or issue:

- Outcome and boundary: what must work, which modules/data can change.
- Critical path: what must happen in order, what can overlap.
- Checks: normally 2–3 tied to specific failure risks, plus mandatory gates.
- Ownership and done: worker, checkout, integration owner, closure evidence.
- Follow-up: owner, evidence format, destination and timing.
- Project hooks that apply and their evidence.

Spend minutes on it. Read relevant modules and topic docs, not the whole application.
Resolve a material unknown with one focused investigation, then update the plan. File
count or elapsed time is a signal to reassess, not a reason to create child issues.

### Apply project hooks at each phase

A host policy can add activities (manual steps or existing commands; no hook runner is
installed) to the phases named by this file's sections. Each hook states name, phase,
trigger and timing, procedure, owner, evidence/destination and whether it is required;
hooks in a phase run in listed order ([template](PROJECT.example.md)). Resolve them while
planning, put owners and evidence in the plan/brief and read a procedure before running
it; the conductor checks outcomes at
each phase boundary. A false trigger means not applicable. A failed or unavailable
required hook blocks the dependent transition or closure: preserve evidence, name the
next action, continue only independent work; optional failures are reported, not
acceptance. Record outcomes bound to revision and environment and repeat a hook only
when its trigger recurs with stale evidence, its procedure says so, or a failure needs
rechecking. Hooks never weaken core checks or grant permissions or monitoring; queue
intake hooks follow [COORDINATION.md](COORDINATION.md#select-and-claim).

### Spend resources deliberately

Minimize total work for an accepted result (model effort, context, tool calls, setup,
coordination, elapsed time) on every platform; quality, authorization, evidence and host
timers stay gates.

| Task and risk | Starting choice |
| --- | --- |
| Established pattern, bounded edits or routine checks | Lower-cost capable worker, low/moderate reasoning where selectable |
| Uncertain diagnosis, coupled design, unfamiliar boundaries or high-impact failure | Stronger reasoning for the uncertain part; delegate resolved implementation economically |
| Conductor planning and review | Enough for dependencies and risk; routine queue work needs no maximum effort |

The host adapter names model identifiers and effort controls; set them per assignment
when supported instead of inheriting the conductor's strongest setting, and assume no
price from a model name. When selection is locked, say so once and save through scope,
context and tools. Never claim a model the tool did not use or ask the user about
routine settings. Record the choice in one plan line: capability/effort, why, and a
stop/reassessment condition. Brief workers with a [session block once and a short
assignment block](WORKER.md) carrying acceptance, paths and findings; prefer targeted searches, bounded output and batched reads; reuse fresh
setup, data and evidence; stop exploring once acceptance is met.

Escalate for a concrete capability gap, ambiguity, high-impact risk or failed bounded
approach, not for a failed command: fix environment issues directly, correct known defects in
scope, and apply stronger
reasoning only to the remaining difficulty (immediately for demonstrated risk). If an
approach fails again without new evidence, stop and reassess; preserve checkout, patch
and diagnosis rather than restart. Record the reason, and return to the economical
setting once the uncertainty is resolved.

### Choose the smallest useful team

Within one issue, prefer direct work when a handoff costs more than it saves: one
implementer and one conductor review (the conductor may implement when policy allows).
Without delegation, perform the roles in turn and say so; never simulate subagents. Add
a second worker only when independent investigation, a separate area or verification
preparation saves total work or shortens the critical path, never just to fill idle
capacity; state its output and files. Helpers and reviewers count against the worker
cap; workers do not spawn teams. Independent reads need no extra agent. Across issues,
independent deliveries run concurrently up to capacity
([coordination](COORDINATION.md#select-and-claim)).

One integration owner combines and publishes each issue. A helper needs no child issue
for tests, docs or review and verifies on the owner's exact revision. Keep coupled edits
together; serialise overlapping writes and integration. Create child issues only for
independently useful deliveries; children inherit priority constraints and parent
acceptance stays visible. Publish larger work as verified slices, never unfinished code
to meet a timer.

## Implementation

Make the scoped change; unrelated defects become separate issues.

### Isolate concurrent agents

- Each writing agent, the implementing conductor included, works in its own checkout
  (for example a `git worktree` on its own branch). Never edit or run state-changing git
  commands (checkout, switch, stash, reset, clean, rebase, commit) in a checkout you do
  not own; reading is fine. Only the integration owner changes the integration checkout.
- Whoever creates a writing checkout marks it as in use before work starts: write
  `issue=<owner/repo#N>` and `session=<session ID>` to `orchestra-claim` in its git
  directory (`git rev-parse --git-dir`, outside the working tree). A checkout that has
  no commits yet otherwise looks integrated to [clean-up](#clean-up-checkouts). If the
  platform creates the checkout, the worker writes the marker first.
- Worktrees share stash and refs: never `git stash` beside other agents; park work in a
  commit on your own uniquely named branch.
- Give each checkout its own ports, server configuration, temporary/evidence and build
  directories, and confirm a server serves this checkout's revision before its evidence
  counts. Share caches, databases or devices only when safe or taken in turns.
- Stop processes you started by PID, never by name pattern, and release shared locks
  before reporting.
- Never send personal data from the user's environment (name, e-mail, account IDs) to
  external services; use the project's public identity.
- Remove a worktree only after its work is integrated or preserved: the integration
  owner removes it during [follow-up](#follow-up), and the session review and the next
  startup prune what that missed ([clean up checkouts](#clean-up-checkouts)).

## Verification

Choose checks from the change's dependency path, inputs and failure modes; existing fast
suites and release gates still apply.

| Change | Minimum useful evidence |
| --- | --- |
| Documentation/instructions | Diff, links and consistency with retained requirements |
| Local behavior | Relevant component check and affected real integration/route |
| Shared protocol, persistence, security or other shared component | Changed boundaries and representative consumers; broaden for a stated risk |

Use the existing harness; add a regression check only when it catches a meaningful
failure. Fix failures this change caused and rerun affected checks; track proven
unrelated baseline defects separately (they waive no acceptance). A partial check is
not evidence for the whole; do not claim performance for an environment other than the
one measured ([examples](#examples)). Hard contracts and explicit user gates are never waived; evidence only a
device or the user can supply is no closing gate by default
([best-guess closure](#close-after-a-best-guess-fix)).

Bind results to revision, inputs, environment and quality mode. Keep the checkout and
relevant inputs stable while verification runs against them; continue editing in a
separate checkout if needed. If an edit overlaps a run, invalidate affected results
and rerun the affected checks against a stable revision. After an unrelated rebase,
rerun only checks touched by changed code, inputs, conflicts or a concrete risk.
Correct a faulty evidence setup and repeat only that check. A guessed historical
threshold alone does not justify optimization. Stop once agreed checks pass; when
verification passes its [time limit](#default-time-limits), reassess and pick the
smallest check for the missing proof, without skipping required verification or hiding failures.

## Handoff for integration

Only completed implementation with passing assigned checks can be handed off. Follow
[Issueflow](ISSUE-WORKFLOW.md) for all work-label transitions: waiting uses
`integration-ready`, active integration/review uses the active label. A helper reports
its part without marking the whole issue ready while other implementation continues.

The handoff comment and private checkpoint record issue, integration owner,
owner/session label, branch/checkout, exact commit, checks/evidence, remaining
acceptance and next action. Retain the ownership label against competing claims.
The worker stops its processes, releases locks and frees its slot; retain checkout
and commits until integrated or preserved. Waiting uses neither active time nor
capacity; a parent summary label uses no slot either.

The conductor tracks handoffs, including open PRs, in its integration queue and
resumes review/integration under the same ownership. Corrections need a named owner
and next action, with Issueflow's active-correction or backlog transition; rejected
work cannot stay ready. A genuine integration wait retains handoff ownership; a
pause, return to backlog or user question releases work labels and claim. Preserve
branch and evidence in either case. Only accepted integration, required checks and
the host's publication/closure steps finish the issue.

## Review

The conductor reads the combined diff and results (and required images) for missed
acceptance, integration errors and scope creep. No routine reruns of green checks and
no second review agent; request one bounded correction per concrete defect, not for
wording preferences.

If a material review finding exposes a cause that could recur in similar assignments,
update the brief, applicable topic instructions or required checks before starting
more assignments with that risk. Notify owners of affected work already in progress;
independent work continues. Apply this throughout the run, not only to early deliveries.

## Delivery

Follow host release rules, preserve concurrent work, and never route a denied action
through another agent. After syncing, inspect changed upstream files and repeat only
affected checks. A commit, a deployment and verified behavior are distinct; report
exactly what exists: outcome, revision, checks, limitations, deployment, remaining work.
Attribution names the actual tool when required.

*PR mode* (the host's delivery mode is a PR the user merges, see
[PROJECT.example.md](PROJECT.example.md)): the result note says "PR open, not on main";
the issue closes only after the merge, or by the host's rule. Use the
[handoff procedure](#handoff-for-integration) while waiting. Whichever session's queue
fetch first sees the merge verifies delivery evidence and performs [follow-up](#follow-up).
Merge order and branch refresh: [Select and claim](COORDINATION.md#select-and-claim).

## Follow-up

The conductor owns follow-up unless the plan names another owner. Choose the smallest
useful evidence. Before closure, post a completion comment with outcome, delivered
revision, checks, evidence links/attachments, limitations and remaining acceptance
in an authorized, accessible destination:

- UI/UX, styling, 2D/3D graphics or rendering: screenshots or rendered comparisons,
  with revision and environment, embedded or linked as accessible artifacts. Include
  before/after when useful; images supplement functional checks. If capture or hosting
  is unavailable, state the limitation and reason. Inspect images, expose no private
  data and never claim an upload that did not happen.
- Behavior: test or reproduction result.
- Documentation: published text link and recorded checks.
- Deployment: deployed revision and post-deployment check.

Run required post-publication checks before claiming them. Then release labels under
[Issueflow](ISSUE-WORKFLOW.md); leave unmet acceptance open with next action and owner.
Schedule later monitoring only when authorized. Reuse the result note; follow-up is
no separate reporting phase. Last, remove the issue's checkout
([clean up checkouts](#clean-up-checkouts)).

### Clean up checkouts

Checkouts are per issue and per worker, so they accumulate unless each phase that ends
one also removes it. Once the issue's change is verified on the remote main branch and
the issue is closed, the integration owner removes the issue's worktree or clone and
its work branch as the last follow-up step; a waiting handoff keeps its checkout
until integrated. Collect evidence before removal.

Proof that nothing is lost is the same as when [resuming](#resume-unfinished-work-first):
the working tree is clean and every local commit is on the remote main branch, or its
patch is (`git cherry`), or the closed issue records a delivered revision that contains
the change. Anything else is preserved first, as a bundle or a private branch, and the
note says where. A checkout whose issue is still open is never removed by someone else.

The [session review](COORDINATION.md#review-the-session) and the next startup prune
what individual follow-ups missed across the host's whole worktree root, not only the
current session's directories. [`scripts/prune-worktrees.sh`](scripts/prune-worktrees.sh)
classifies every checkout under given roots as integrated, active, unproven or protected
and removes only the integrated ones. A claim marker whose issue is not shown closed, or
a checkout without commits of its own whose HEAD changed recently (`--min-age`), counts
as active, so another session's fresh checkout survives a whole-root prune; it is a dry run unless `--apply` is given,
`--archive <dir>` preserves unproven work as bundle and patch before removal, and
`--protect` keeps named clones. The host policy names the worktree root and the archive
location.

### Close after a best-guess fix

When the only missing evidence is a physical device, a specific user's hardware or the
user's own experience ([examples](#examples)), do not park
the issue or post it as a user question. Diagnose with available reports and tools,
make the best supported fix, verify what can be verified (simulation, measurement,
tests) and close; the completion comment says what was and was not verified and why, so
the user can reopen. Never present untested behavior as tested. Keep the issue open only
when the host policy or issue makes that device or user acceptance a closing gate, or
no plausible fix exists yet; then record diagnosis, next action and owner.

## Keep progress observable

Follow host heartbeat rules. Reassess and then diagnose when a delivery passes the
progress [time limits](#default-time-limits) without useful output: inspect hung processes, resume and
preserve evidence rather than restart, and do not let setup, polish or coordination
consume hours. Record coarse phase times, worker count and rerun reasons in the
completion note; claim speedups only from comparable tasks and reopen rates, never from
issue timestamps.

## Default time limits

Review points, not deadlines, and only where the runtime shows elapsed time; a host
policy can change any of them.

| Limit | Default | Where |
| --- | --- | --- |
| Reuse a successful update check | 24 hours | [Check the installed workflow](#check-the-installed-workflow) |
| Reassess verification before another costly sweep | about 10 minutes of verification | [Verification](#verification) |
| Reassess, then diagnose, a delivery without useful output | about 30, then 45–60 minutes | [Keep progress observable](#keep-progress-observable) |
| One turn on shared expensive verification | under about 5 minutes | [Select and claim](COORDINATION.md#select-and-claim) |
| Longest wait before noticing a user stop, while polling or idle | about 60 seconds, as the wait mechanism allows | [Poll, idle and stop](COORDINATION.md#poll-idle-and-stop) |

## Examples

Illustrations of generic rules above; they add no rules.

- *A partial check is not evidence for the whole*: a component render or a single
  route does not show the whole application working.
- *Performance only for the measured environment*: frame rates in an emulator or a
  headless browser say nothing about native hardware.
- *Repeat only the faulty check*: a screenshot taken with a wrong camera angle is
  recaptured for that view, not for every scene and platform.
- *Best-guess closure*: a crash reported on the user's phone, touch behavior on one
  device, or "does it feel right now".
