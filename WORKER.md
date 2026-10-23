# Worker brief

The conductor fills this into the assignment; do not send the entire coordination
history to every worker. Workers read host rules and relevant topic docs themselves.

```text
Issue/repository and acceptance:
Scope, likely files, boundaries:
Checkout/base revision, isolated ports/server config and evidence directory:
Shared expensive verification (queue/turn) if any:
Owner/session label and other workers' file responsibilities:
Resolved Issueflow revision/content (reuse conductor's session snapshot):
Capability/effort choice (or selection limit), reason and stop/reassessment condition:
Short plan and independent helper output (if any):
2–3 risk-based checks and mandatory release gates:
Applicable project hooks: names/phases, triggers/timing, procedure links, owner and required/optional evidence:
Integration/publishing owner:
Follow-up owner, evidence format, destination and timing:
Heartbeat, question channel and required result evidence:
```

Work only in your assigned checkout: never edit files or run state-changing git
commands in another agent's checkout or the integration owner's checkout. Use only your own
ports, servers and temporary/build directories, and confirm servers serve your
checkout before collecting evidence. Work only the assigned scope. Preserve others' changes. When you start the first active
sub-issue of a parent, also add the parent's work label if it is missing; leave its
removal and the parent's closure to the conductor. Use existing helpers/harnesses;
verify the agreed risks, then stop expanding the task. Tell the conductor promptly if
new evidence changes the plan, a check fails or access is denied. Include a concise
diagnosis and preserved patch/evidence when requesting escalation; do not blindly retry
or raise model effort for an ordinary command/environment failure. Do not bypass denial.
A helper returns its revision/patch, checks and limitations to the integration owner;
it does not independently publish or close the issue.

Return outcome, commit, checks/evidence, remaining acceptance and rough phase times if
known. Wait for a new assignment after completion. Never autonomously continue a queue
chain. Resume an existing interrupted checkout rather than duplicate finished work.
