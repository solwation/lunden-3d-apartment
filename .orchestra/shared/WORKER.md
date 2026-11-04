# Worker brief

The conductor writes a session block once and a short assignment block per worker; do
not send the entire coordination history to every worker. Workers read host rules and
relevant topic docs themselves.

Session block, written once per session (a file in the conductor's scratch area or the
status comment) and referenced from each assignment as "session block: <path/link>":

```text
Resolved Issueflow revision/content (the conductor's session snapshot):
Applicable project hooks: names/phases, triggers/timing, procedure links, owner, required/optional evidence:
Heartbeat and question channel:
Integration/publishing owner, handoff record/queue and publishing rules:
Owner/session label:
Resource rules and limits (capability/effort selection limit):
Follow-up owner, evidence format, destination and timing (default):
```

Assignment block, at most about eight lines per worker:

```text
Session block: <path/link>; batch brief: <path> (if any)
Issue/repository and acceptance:
Scope, likely files, boundaries, short plan/helper output (if any):
Checkout/base revision, isolated ports/server config, evidence directory:
Other workers' file responsibilities and insertion anchors:
Capability/effort choice, reason, stop/reassessment condition:
2–3 risk-based checks, mandatory release gates, shared expensive verification (queue/turn) if any:
Result expected: required evidence, and any follow-up override:
```

When several issues follow the same pattern, write one batch brief and refer to it
instead of repeating it. It holds the common pattern, files, 2–3 checks and the session
block reference. Each assignment then carries only its assignment block plus
"batch brief: <path>", with issue-specific lines overriding the batch brief.

Rules for the worker:

- Isolation: follow the [isolation rules](ORCHESTRA.md#isolate-concurrent-agents):
  only your assigned checkout, ports, servers and temporary/build directories; confirm
  a server serves your checkout before collecting evidence. Start background servers as
  `cmd & pid=$!` and stop them with `kill "$pid"`.
- Scope: work only the assigned scope and preserve others' changes. Use existing
  helpers/harnesses; verify the agreed risks, then stop expanding. When you start the
  first active sub-issue of a parent, also add the parent's missing work label; its
  removal and closure belong to the conductor.
- Escalation: tell the conductor promptly when evidence changes the plan, a check fails
  or access is denied. To escalate, send a concise diagnosis and the preserved
  patch/evidence rather than retrying blindly or raising effort for an ordinary command
  failure. Never bypass a denial.
- Handoff: when the whole issue implementation and assigned checks pass, follow the conductor's
  [handoff procedure](ORCHESTRA.md#handoff-for-integration) and the session's resolved
  Issueflow guide. Record the integration owner, owner/session label, branch/checkout,
  exact commit, evidence and next action. Use `integration-ready`, retain handoff
  ownership and free your slot; do not remove the claim as if returning to backlog.
  A helper returns its part without changing the issue to ready while another worker
  is still implementing. Do not mark a failed check or unfinished result ready. For corrections or pause,
  follow the guide and the conductor's next assignment; do not close the issue.
- Reporting: commit (and push when the host allows) at each meaningful milestone, so
  progress survives the loss of the worker. A helper returns revision/patch, checks and
  limitations to the integration owner; it does not publish or close the issue. Before
  returning, stop every background process you started and release shared locks; the
  conductor stops a reported worker that still has background work instead of waiting.
  Return outcome, commit, checks/evidence, remaining acceptance and rough phase times.
  A waiting handoff is not an active worker; retain its checkout until integration or
  preservation is confirmed. Then wait for a new assignment; never continue a queue
  chain yourself. Resume an interrupted checkout rather than duplicate finished work.
