# All nine NW-yard bicycles (#905)

Runtime `b048a0c602d299a1f46cf19d74bcb1ae280836e2` exposes all nine actual
seeded records, rather than inventing bicycles for 18 stalls. Source-order IDs,
original position/yaw, four shared instance batches and colors remain intact.
Only the chosen index moves. The eight new invisible interaction helpers share
geometry/material; no controller, main input, storage or rendered model is added.

Final `tools/bicycletest.cjs` native run: **116 PASS, actual exit 0**, zero WebGL
and page errors, after rebase incorporating #974/#901. All nine identities mount
through ordinary E, follow a validated swept turn, travel 6 metres in one simulated
second using ordinary forward input, steer, freeze when paused, dismount through
the actual touch stand handler, and safely resume standing after browser reload.
Every ride checks the other eight indices' four exact matrices. Existing tests
also cover touch joystick/mouse dispatch, full wheelbase/thin wall/dynamic door,
headroom, unavailable/uneven support, refused exits and safe-session retention.
The native collision world, focus and keyboard lock are controlled collaborators.

The optional original-source baseline import confirms exact visible StreetLife
geometry, instance matrices/colors and collision, including the unchanged parking
RNG sequence. Native 1 exited 1: its new speed assertion incorrectly used the
existing slower reverse gear. Native 2/3 and final use forward travel and exit 0;
no speed/controller change was needed. Original failed output is retained.

One separately authorized isolated StreetLife/Player render completed **117 PASS,
actual exit 0** under a 45-second watchdog (owner PID 2287687). Inspected
`ninth-parked.png` and `ninth-saddle.png` show `yard-1-8`, the original bicycle
and actual Player handlebar camera. Reported draw calls were 14/17 in different
camera frusta, not a before/after performance comparison. The four nine-instance
bicycle batches remain unchanged. This is not full World, physical-phone,
multiplayer-pose or measured-FPS acceptance. Render source was frozen; later #901
changed car background geometry and config, while the bicycle/Player/main/World
sources remained exact. The final native run covers that integration separately.

Six final runtime/fixture source hashes match published bytes. Raw outputs,
original failures, source manifest and PNGs are retained in orchestrator
`worker-905-artifacts` (original `/tmp/lunden-priority-905`).

[Pages run 38537256065](https://github.com/solwation/lunden-3d-apartment/actions/runs/38537256065),
job 115763047357, completed the actual deploy-pages step successfully. Downloaded
public `src/streetlife.js` matches the tested runtime SHA-256 exactly.
