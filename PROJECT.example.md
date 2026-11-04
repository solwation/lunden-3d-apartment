# Host orchestra policy — copy outside the imported subtree

Replace every placeholder before use. This is configuration for a human/LLM reader,
not executable code. Keep project details here, never in the shared instructions.

- Entry rules and relevant topic documents: <paths>.
- User language: <language>. Explicit user scope: <argument or request>.
- Mode: <single task or unattended queue>; empty scope: <bounded pass (default) or
  queue session>.
- Repositories and coordination issues: <owner/repo, status issue per repository>.
- Issue workflow authority: shared ISSUE-WORKFLOW.md for GitHub; specify an adapter
  for other trackers. Local ancestor/port constraints: <policy>.
- Excluded coordination labels; active/session labels: <names>. Session ID project
  short name and label prefix: <name, default repository name; `orkester: `>.
- Claims, race handling, expiry and handover: <rules; retain documented integration
  ownership for finished handoffs, distinct from an active implementation claim>.
- Integration queue and recovery: <where owner, branch/checkout, commit, evidence and
  next action are recorded; how the owner resumes a waiting handoff or PR>.
- Capacity: <concurrent active issue workers, includes helpers; integration-ready
  waits and parent summary labels use no slot>; whether the conductor's own
  implementation counts as a slot; direct conductor implementation: <allowed?>.
  Expensive shared verification: <browser/e2e/device runs and how they are queued>.
- Per-worktree isolation: <port range or allocation, server/config overrides, no
  `reuseExistingServer` across checkouts, check that the server serves this revision>.
- Runtime/model selection: <available economical/stronger capabilities, concrete model
  identifiers/effort controls in the adapter, or selection unavailable/locked>. Follow
  the core resource policy; document limits rather than assuming inherited effort is
  economical. No provider-specific identifier is required by the shared core.
- Poll interval, idle watch, heartbeat and stale-work limits: <durations or disabled>.
  Wait mechanism: <how the runtime waits between polls and while idle>; when the
  runtime cannot wait: <e.g. run a bounded pass and report it>.
- Questions/blocked work: <channel and label lifecycle, e.g. the `user question`
  label>. Release rule in a pass: <e.g. only once no open issues remain/never>.
- Intake hooks: <local procedure and triggers, or none>; they run while workers are
  busy, never delaying startable work. Credentials never go here.
- Session review on queue drain: <default, extra areas to inspect, or disabled>.
- Workspace, server and browser setup: <relevant local docs>.
- Required tests, release checks and evidence-before-close: <rules>.
- Phase hooks: <definitions below or a link to project documentation; none if unused>.
- Publishing: <branch/PR/direct policy and authorization>; no force push by default.
- Delivery mode: <direct to main | PR the user merges | PR with auto-merge>.
- Cross-project boundaries and attribution/licenses: <rules>.
- Installed shared version: <release and exact commit>; update using shared INSTALL.md.
- Upstream discovery: <official repository/release source>; check at conductor
  startup/resume, reuse successful results for 24 hours by default. Relevant bug fixes
  always get a proposal; other upgrades <optional/opt-in preference>. Proposal channel
  and import authorization: <existing issue/change workflow and permissions>.

The shared workflow supplies planning, delegation, scoped verification and stop rules.
Do not duplicate it here. Project constraints override shared defaults, not explicit
user instructions or platform restrictions.

## Project phase hooks

Define only activities this project needs, using the phase names from ORCHESTRA.md:
`planning`, `implementation`, `verification`, `review`, `delivery`, `follow-up`.
Omitted phases have no additional hooks; core checks still apply. Remove this template
and the illustrative example if unused. Multiple hooks in a phase run in listed order.

```text
Hook name:
Phase:
Trigger (which changes/tasks) and timing (entry, exit or a specific phase event):
Procedure (practical steps/commands or a project document path and section):
Owner (conductor or named worker/role):
Required or optional:
Expected evidence, destination and completion condition:
```

For example, a project with UI/UX or 2D/3D graphics could define this screenshot lifecycle.
This is an illustration, not a default screenshot requirement. The project must supply the
actual routes, scenes, camera angles, viewports, test data and artifact/upload procedure
in its own guide.

| Hook | Phase and trigger/timing | Project procedure | Owner | Requirement and completion evidence |
| --- | --- | --- | --- | --- |
| Capture UI | `verification`: UI/UX or graphics changes, after preview/rendering is ready | Follow the project's screenshot guide for affected states/scenes | Implementation worker, or conductor if working alone | Required when triggered: images plus revision/environment in the assigned artifact destination |
| Inspect UI | `review`: UI/UX or graphics changes, before approving delivery | Inspect captured images against acceptance and any reference images | Conductor | Required when triggered: review outcome recorded; defects corrected and affected images refreshed |
| Share UI result | `follow-up`: UI/UX or graphics changes, before issue closure | Follow the project's upload guide; link or attach reviewed images in the completion comment | Conductor | Required when triggered: accessible evidence for the delivered revision, or report the capture limitation |

For optional activities, mark them optional explicitly and report a failure or skip.
An unavailable required tool does not silently make an activity optional. Existing
queue intake hooks keep their own triggers and schedule under COORDINATION.md.
