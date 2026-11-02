# Outdoor timber gym — #1811

Code revision: `ca95c15f0f81110768dba9cfa2e13d5098479860`. Shared integration base: `48cf6fddd8b29172ec79485393074d951417195a` (#1818). No publication or issue closure was done by the implementation worker.

## Views

- `before-site.png` / `after-site.png`: the same rooftop view of the grass strip SW of Östra längan at Karpvägen, before/after three timber stations and their terrain-following woodchip patch.
- `after-equipment.png`: closer view of pull-up frame, bench press and step platform at the actual site; all existing trees, path and buildings remain.
- `touch-pullup.png`, `touch-press.png`, `touch-step.png`: real touch-button entry and the three distinct exercises, with repetition status and visible exit action. These use the app's normal phone start/install-dismissal flow.

All six images were opened and inspected. The clean equipment view replaces an initial capture with stale bench HUD text after the integration test. The rooftop comparison is reused from the unchanged gym geometry before the unrelated seat/river rebase; final close equipment and merged E/C checks use the revision above.

## Checks and limits

Native keyboard section: 16 checks pass (three targets, finite six-mesh geometry, free approaches, E start, equipment-specific camera/log motion and several repetitions, E/Space safe exit, menu cancellation and no page errors). Native phone-profile touch pass: 17 checks pass for the same stations, normal touch actions, pause and menu cancellation. Merged-source check: 5 checks pass for actual player collision at a gym post, retained gym and south-bus-bench focus, gym E/C safe-entry exit and glass-bench E/C returnToEntry. `result.json` retains phase results and the exact shared base.

Initial fixture attempts failed because canvas clicks do not enter mouse mode, exercise state arrives on the next app update, and shot mode pre-hides the overlay/HUD. The phone also has its normal install sheet and a separate visible Börja button. The final pass uses the actual visible controls; no HUD CSS was forced and failed/partial attempts are not counted as complete runs. Earlier keyboard exercise evidence is reused; the later gaze change is exercised by touch and the main.js merge by the focused native E/C check.

Placement (-143,33), heading, dimensions, timber colours, chip surface and exercise timings are assumptions interpreted from the two issue reference images. The nearest retained tree is 10 m from the site centre. No physical phone, hardware FPS, precise surveyed gym installation or custom remote-avatar exercise animation is certified. The first-person exercise/score/input state is original-only; a public port may independently assess passive generic park equipment without copying gameplay or original images.

Observed phase times: inventory/reference reading and plan about 6 min; implementation/docs about 8 min; focused browser verification, fixture corrections and shared-source check about 13 min including waits. No broad suite or hardware profile was run.
