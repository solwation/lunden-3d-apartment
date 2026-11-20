# #2210 — combat bow scenario aims at the intended body

Base: `962aa3f7` (integrated #2209). Only the combat test and its guide change;
production bow/arrow physics, collision volumes, combat, Worker and config are unchanged.

## Cause and scope

Readiness uses relative camera nudges, and the screenshot keepalive restores its
captured yaw. That activity is not an aiming contract. The old bow step released
in whatever direction those helpers left, unlike the later Nerf step which resets
aim. The issue packet `o=[1.25,1.54,11.56], d=[.716,0,-.698], s=42` misses
a standing B fixture at `[2.6,0,9.9]` (seed `anon`) with the current actual
arrow-tip/collision modules. The real randomly identified app peer is covered
separately by the full browser run, not inferred from that fixture seed.
A bare reset to the old horizontal -40° is also unsuitable: it can hit a logical
head and cost two hearts, while this scenario expects exactly one.

The bow step now looks at the currently visible B's torso (feet + 1 m) after
reciprocal readiness, updates real matrices, and calls the ordinary full-draw
trigger. It additionally rejects a head-contact packet. It does not prescribe a
hit target, widen anatomy, retry a shot, or override the real bow origin, speed,
gravity, obstacle query, authoritative Worker or production time budgets.

## Checks

- `aim-reproduction.json`: direct current `bowSegments`/`bowPlayerContact` confirms
  the reported packet misses, and a camera looking at the fixture torso produces
  a first body contact (2 assertions). This is numeric before/after evidence;
  a still picture cannot establish a missed authoritative damage packet.
- `node --test cloudflare/bowhead.test.mjs`: 4/4 pass. Covers actual gravity step,
  falling arrow-tip/range, first body before later head, authoritative 2/1 damage,
  cached/forged/rate/origin cases, recovery and lethal receipt.
- Full browser invocation (same run supplies both images):
  `PLAYWRIGHT_MODULE=/home/devcontainers/kvarteret-lunden/node_modules/playwright BROWSERTEST_MEM=9G BROWSERTEST_TIMEOUT=30m SHOTS=docs/verification/2210 tools/browsertest.sh node tools/combattest.cjs http://localhost:8431 http://localhost:8432 testtoken`.
  Final count and complete result are in `browser.txt`.

Independent known failure: [#2227](https://github.com/solwation/lunden-3d-apartment/issues/2227).
The initial “no shot even sent” assertion treats absolute `Ghosts.shots` as a
combat-only count, although `sendShot()` also increments it for other outbox types.
B's no-hurt/no-shot-render checks pass. That assertion is untouched here; this
run must **not** be described as a wholly green `combattest` run. The integration
owner is aware of the acceptance limitation. The first run also demonstrated
that the observer screenshot took 85 seconds after the arrow, enough for the
real 60-second Worker recovery alarm to restore its one-heart injury before
the nine darts. That produced `[9,8,7,6,5,4,3,2,1]` instead of death/respawn.
`before/browser.txt` retains the complete initial run (3 FAIL total).
The first observer image (`before/combat-two-armed-players.png`) visibly shows
B at 10 hearts again after the logged arrow left B at 9. The final test takes
both slow native pictures before any damage, then fires the ordinary bow and
nine darts together. The 60-second production recovery rule is unchanged. The staging rerun stopped after 258 s on an implementation mistake in the test:
its new pre-picture restoration called `heldItem().putBack()` after the ball was
already thrown, so the hand was null. `staging-attempt.txt` retains that failure.
The restoration now uses optional chaining; syntax and diff checks preceded the
necessary replacement run. This added 4m18s of browser time, plus the replacement
run below. Production sources stayed frozen throughout each browser run.
No run is scheduled solely for the independent counter bug.

## Evidence and limits

Native 960×600 app screenshots from the same full multiplayer run are inspected
without cropping or rescaling. They establish visible remote props/players;
`browser.txt` is the evidence for the bow packet, damage, lives, points and respawn.
No visual product change is claimed. All three real app contexts (two combatants
and an observer) use local in-memory Worker, not production accounts or storage.
SwiftShader evidence does not establish physical GPU/mobile FPS.

The wrapper is requested with `BROWSERTEST_MEM=9G` on this 32 GiB host due to the
issue's reported 4G failure and three full app contexts. This host reports no
systemd user scope, so its ceiling is **not enforced** and no 9G peak claim is made.
The historical 4G failure was not reproduced here solely to consume memory.

Public downstream: not applicable. `kvarteret-lunden` deliberately excludes
combat gameplay and Cloudflare; its neutral world has no `combattest` consumer.
No portable rendering, input or avatar implementation changes are involved.

Equivalent houses: not applicable to a camera/setup-only combat test correction.

## Final result and timings

Final run: **21 PASS, 1 known independent FAIL (#2227)**, 292 s wall time.
Bow packet is a real body shot at 42 m/s, B is 9/10 and sees the remote arrow.
The subsequent nine real Nerf shots yield `[8,7,6,5,4,3,2,1,10]`; A has ten
hits/ten PvP awards, B ten deductions/one death, checked safe outdoor respawn,
and keeps the saber and other stats. There are no page errors in the log.
The observer screenshot now precedes the arrow; no damage timer/Worker rule changed.

Both final 960×600 images were opened and visually inspected at native aspect:
`combat-B-sees-A-ball.png` shows the remote prop/player and native fight HUD;
`combat-two-armed-players.png` shows both solid armed peers in the actual room.
These are visibility context, while the packet/life/spawn assertions are the
behavioral evidence. The first image's airborne ball touches the top border;
no claim depends on a fully contained ball silhouette.

Phase timing (wall): initial source diagnosis/plan/patch about 3 min; first
browser 326 s; staging correction/coordination about 2 min; interrupted staging
attempt 258 s; null fix/source review under 1 min; replacement browser 292 s;
final image review/docs/commit about 2 min. Browser sum is 876 s (14m36s), including
4m18s lost to the documented null-restoration mistake. Near ten minutes, scope
was reassessed with the integration owner: only the necessary replacement was
continued, no broad suite or performance profile. Node checks took under 1 s.

Local app/Worker ports 8431/8432 and the test browser are stopped before handoff.
Root owns integration, image publication, acceptance with #2227, release and closure.

Published combined source `d65fb81ab5d556120a6b18c092d499bd5e7806c2`; pinned evidence https://github.com/solwation/lunden-3d-apartment/issues/2210#issuecomment-7043359092. Pages run44762984377 succeeded before closure. No Worker source/config changed. Conductor reviewed the disjoint source changes; source-bound browser evidence is reused, with the exact #2227 predicate independently tested.
