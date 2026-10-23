# Host orchestra policy — copy outside the imported subtree

Replace every placeholder before use. This is configuration for a human/LLM reader,
not executable code. Keep project details here, never in the shared instructions.

- Entry rules and relevant topic documents: <paths>.
- User language: <language>. Explicit user scope: <argument or request>.
- Mode: <single task or unattended queue>; reading docs never starts the queue.
- Repositories and coordination issues: <owner/repo, status issue per repository>.
- Issue workflow authority: shared ISSUE-WORKFLOW.md for GitHub; specify an adapter
  for other trackers. Local ancestor/port constraints: <policy>.
- Excluded coordination labels; active/session labels: <names>.
- Claims, race handling, expiry and handover: <rules>.
- Capacity: <worker cap, includes helpers>; direct conductor implementation: <allowed?>.
- Runtime/model selection: <inherit or available capability/cost preference>; no
  provider-specific identifier is required by the shared core.
- Poll interval, idle watch, heartbeat and stale-work limits: <durations or disabled>.
- Questions/blocked work: <channel and label lifecycle>.
- Intake hooks: <local procedure and triggers, or none>; credentials never go here.
- Workspace, server and browser setup: <relevant local docs>.
- Required tests, release checks and evidence-before-close: <rules>.
- Publishing: <branch/PR/direct policy and authorization>; no force push by default.
- Cross-project boundaries and attribution/licenses: <rules>.
- Installed shared version: <release and exact commit>; update using shared README.

The shared workflow supplies planning, delegation, scoped verification and stop rules.
Do not duplicate it here. Project constraints override shared defaults, not explicit
user instructions or platform restrictions.
