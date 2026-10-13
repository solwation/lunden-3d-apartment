# Phone covered-rendering mitigation, 2026-10-13 (#669)

The user crashed while walking in the kitchen and reading the freezer changelog,
without reporting shooting. The 04:00Z/ebb77a7 kitchen report contains note-close,
pause and a landscape-to-portrait viewport transition; it is a plausible candidate,
not confirmed episode identification or proof of a GPU-watchdog cause.

A concrete avoidable load was found: `use(note)` set the 1.5-second moving-shadow
hold for a DOM panel. Full scene/shadow/mirror rendering also continued under reading,
pause and the opaque portrait instruction. The candidate removes the note-triggered
hold, caps covered phone drawing at 10 frames/s and suppresses drawing behind the
portrait instruction or in a hidden document. Logic/network updates continue; warm-up,
first full view and explicit screenshot mode retain their usual drawing. The quality
controller does not interpret covered logic-only callbacks as spare GPU capacity.

The required plan request also uses the new #864 fetch/body timeout (15 seconds),
so its failure reaches the covered retry UI rather than waiting indefinitely.

## Actual browser verification

`tools/phonepaneltest.cjs`, real Chromium + SwiftShader, one real app per run,
480×300 touch/coarse-pointer context, `lowmem`, quality0, no `test` or `shot`.
The automatic loop is stopped only after a complete initial view and hidden loading
cover. A paused Playwright clock advances 17ms before each real `frame(1/60)` call;
the renderer wrapper records and calls the original renderer, not a substitute scene.
The controlled time is for deterministic policy checks: JSON `ms` is virtual-clock
elapsed time, **not CPU duration, GPU duration, FPS or an iPhone benchmark**.

| Case | Callbacks | Before renders/shadow requests | After renders/shadow requests |
|---|---:|---:|---:|
| Normal gameplay | 6 | 6/6 | 6/6 |
| Read actual note (`use(note)`) | 12 | 12/12 | 2/2 |
| Actual close button → gameplay | 6 | 6/6 | 6/6 |
| Pause menu | 12 | 12/12 | 2/2 |
| Opaque portrait instruction | 4 | 4/4 | 0/0 |
| Landscape → gameplay | 3 | 3/3 | 3/3 |

Both final drivers reported ALL PASS and actual exit0, with no pageerrors. The note,
pause and portrait PNGs were visually reviewed; normal rendering resumed immediately.
Existing other shadow holds can still be live in the probe (the 2 after-reading requests
are not claimed to be zero shadow work). Background scene simulation is deliberately
unchanged. These counts establish the changed draw policy, not the precise crash cause.

Before routes the exact `src/main.js` from cbb7699; both final runs otherwise use the
same e7fd772 checkout plus the candidate LOW_MEMORY config. This is a narrow policy
comparison, not old/new entire-build or screenshot equivalence. Candidate source
hashes are retained; final publication rebases may add other agents' independent code.
The plan-load helper succeeded during the candidate's actual full-app startup; #864
separately has 57 native loader/cache checks and four real bootstrap/network recovery
cases (stub main import, not scene/WebGL evidence).

Two exploratory harness attempts were explicitly stopped: one waited indefinitely
for animation-stability click under a controlled clock; another was stopped to pause
the clock fully (install alone follows real time). No completed result is claimed for
those attempts. Final runs use a bounded force-click that dispatches the real button
handler and a fully paused clock. Their artifacts remain outside the repo.

## What to observe in normal play

Reload to the published version, walk around the kitchen, open/read/close the freezer
note and continue walking. Also resume from the pause menu. Report a new crash or stuck
start if it happens; no developer console, scripted benchmark or repeated crashes are
required. #669 stays open while normal-play outcome is followed. These changes reduce
known avoidable load; they do not claim a reproduced/fixed physical iPhone crash.

Evidence: [before](panels-before.json), [after](panels-after.json),
[source hashes](panels-source-hashes.json), [note](panel-note.png),
[pause](panel-pause.png), [portrait](panel-portrait.png).
