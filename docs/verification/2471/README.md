# Linux runner completion and child cleanup (#2471)

The original #2322 run `20261127T100940966690-3289134` saved six captures and
`capture.json`, logged commandlet result 0 and completed editor shutdown at
2026-11-27 10:17:09 UTC. Its outer exit was 143 and `result.json` was absent.
The original signal sender was not recorded, so forwarding by a particular
Unreal daemon is **not proven**. In particular, UnrealTraceServer's startup
"Signalling parent" handshake uses SIGUSR1 (10), not SIGTERM (15).

## Reproduced supervisor defect

A small real-process regression needs no engine:

1. The runner launches a fake editor, which starts a detached worker and exits 0.
2. The worker's SIGTERM handler sends SIGTERM to `getppid()` and exits.
3. Because the runner is a child subreaper, the worker's new parent is the runner.
4. The old cleanup sends SIGTERM to that worker, killing the runner before it
   can persist its successful editor result.

The same process fixture was run against the source at `7a137273` and the fix:

| Runner | Supervisor exit | Result written |
| --- | --- | --- |
| Before | -15 (SIGTERM; shell convention 143) | No |
| After | 0 | Yes, editor exit 0 |

This establishes the cleanup failure mode independently of the original signal's
unrecorded sender. The permanent regression is
`test_adopted_worker_cannot_forward_cleanup_term_to_supervisor` in
`tools/unreal-engine/tests/test_linux_runner.py`.

## Changed contract and verification

Only the editor receives cooperative SIGTERM. After a bounded natural-exit grace,
remaining invocation workers receive SIGKILL and are reaped, including detached
workers and subsequently adopted descendants. Pre-existing direct children are
excluded. Shared owner/sponsor-managed services are intentionally allowed to
outlive the wrapper: their actual executable must match the engine's
UnrealTraceServer/zenserver or the installed Zen executable, and their command
line must explicitly name this editor as sponsor/owner. Process names alone do
not qualify. The observed services use `fork --sponsor=<editor PID>` and
`--detach --owner-pid <editor PID>`. Their own owner/sponsor rules determine when
they exit; the original Trace log explicitly reports termination with no active
sponsors or connections. The runner does not claim that every service is reaped.

An atomic, unsuccessful `completed: false` result is written before launch.
Handled outcomes replace it with a finalized result. External SIGTERM/SIGINT are
recorded as failed cancellation (143/130), cleanup failures remain failed, and
timeouts remain failed. A hard kill cannot execute cleanup; its pending record
continues to report failure rather than fabricated completion.

Verification command:

```sh
python3 -m unittest discover -s tools/unreal-engine/tests -p test_linux_runner.py -v
git diff --check
```

The scoped suite covers the real forwarding regression, detached TERM-resistant
workers, cancellation with released slots and no surviving fake editor,
pre-launch pending records, cleanup errors, pre-existing children, and positive
and negative daemon identity/sponsor contracts, alongside the existing engine,
log, Automation-report and profile guards. No Unreal process, shared engine,
DDC or warm project was changed or started for this verification.

This repair changes supervisor behavior and has no product image to capture.
The original six #2322 images remain separate visual evidence; these process
tests make no new claim about their colour, depth or rendering performance.
