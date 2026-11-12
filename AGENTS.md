# Agent instructions

Read [CLAUDE.md](CLAUDE.md) before working in this repository. It contains the shared workflow,
verification requirements (including saved result images embedded in an issue comment before closing)
and the requirement to carry relevant improvements over to the public
[downstream project](https://github.com/solwation/kvarteret-lunden) without personal content,
gameplay or Cloudflare integrations.

## Queue priority

All `solwation/kvarteret-lunden` issues have `priority: low` unless the user gives a later
explicit exception (user, 2026-11-04). Startable original issues always come first;
original priorities order original work normally, while public low-priority work is
oldest first. Already active work may finish. See [CLAUDE.md](CLAUDE.md) and
[the local orchestra policy](.orchestra/project.md) for correction and selection rules.

## Shared orchestra and issue workflow

For issue labels/state, follow [.orchestra/shared/ISSUE-WORKFLOW.md](.orchestra/shared/ISSUE-WORKFLOW.md),
the canonical guide from github-dashboard. Finished handoffs use `integration-ready`,
retain their documented integration owner and consume no active slot; only that owner
or integrator resumes them. See the [handoff policy](.orchestra/project.md#integration-handoffs).
For chat change requests, create/reuse the matching issue and follow
[chat intake](.orchestra/shared/ORCHESTRA.md#turn-chat-requests-into-work) and the
[local intake mode](.orchestra/project.md#scope-queue-and-ownership). When the agent
creates/adds a work issue and no orchestra is active, start the same queue session
as `/orkester`, including after an idle watch ends; otherwise reuse the active
conductor. Explicit scope, a single-task/pass request, deferral or stop takes
precedence. "Create an issue" alone is not deferral. Read
[.orchestra/project.md](.orchestra/project.md) and its shared core/coordination files.
Reading these files alone starts no work; this rule acts within an active agent
session and installs no external issue listener that starts a new agent.
The core is maintained in [dirigenten-och-orkestern](https://github.com/solwation/dirigenten-och-orkestern).
