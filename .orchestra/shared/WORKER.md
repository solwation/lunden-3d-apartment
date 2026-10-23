# Worker brief

The conductor fills this into the assignment; do not send the entire coordination
history to every worker. Workers read host rules and relevant topic docs themselves.

```text
Issue/repository and acceptance:
Scope, likely files, boundaries:
Checkout/base revision, port and evidence directory:
Owner/session label and other workers' file responsibilities:
Resolved Issueflow revision/content (reuse conductor's session snapshot):
Short plan and independent helper output (if any):
2–3 risk-based checks and mandatory release gates:
Integration/publishing owner:
Heartbeat, question channel and required result evidence:
```

Work only the assigned scope. Preserve others' changes. Use existing helpers/harnesses;
verify the agreed risks, then stop expanding the task. Tell the conductor promptly if
new evidence changes the plan, a check fails or access is denied. Do not bypass denial.
A helper returns its revision/patch, checks and limitations to the integration owner;
it does not independently publish or close the issue.

Return outcome, commit, checks/evidence, remaining acceptance and rough phase times if
known. Wait for a new assignment after completion. Never autonomously continue a queue
chain. Resume an existing interrupted checkout rather than duplicate finished work.
