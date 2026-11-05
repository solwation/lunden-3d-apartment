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
For chat change requests, create/reuse the matching issue and start or resume scoped
work under [chat intake](.orchestra/shared/ORCHESTRA.md#turn-chat-requests-into-work),
including after an idle watch ends. Respect explicit deferral and reuse an active conductor.
Read [.orchestra/project.md](.orchestra/project.md) and its shared core/coordination
files. `/orkester` starts a queue session; a scoped chat request does not expand to the
whole backlog or enable timers. Reading these files alone starts no work.
The core is maintained in [dirigenten-och-orkestern](https://github.com/solwation/dirigenten-och-orkestern).
