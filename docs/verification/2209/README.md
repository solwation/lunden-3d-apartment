# #2209 — legacy rifle head width follows the rendered head

Base `f9658b5846490a7c8b1c9c9f4bb27712d8d3fd57`, own ext4 checkout, static server 8429 and local Worker 8430. Exact source-byte hashes and a hash of the legacy head span are in [source.json](source.json).

The current client already uses the shared three-box collider. The Worker still supports cached v1 rifle packets via old profile/region helpers; those 17 helpers still multiplied x/z by `[.93,1,1.08][look.build]`, even though #2141 stopped scaling the drawn head by body build. This change sets only those old head widths to 1. Existing cached-client permissions, box dimensions, protocol versions, damage/range/rate/points and current Combat/Worker consumers are retained. No new anatomy region, per-polygon acceptance, hair/eye requirement or mesh refinement is added.

Copied build widths in 17 historical rifle fixtures and the Worker test ray builders were adjusted to match, without broadening their scope. One frozen heavy-build packet from before #2141 now lies outside the unit-width legacy region and its expected result is correctly false. The existing actual wire-build test now includes medium build as well as narrow/heavy.

## Concrete behavior

[Same ordinary ray and same legacy packet across all three builds, before/after](build-ray.json). Style 0, height 1, ray origin `[-0.072,1.62,-4]`, direction `[0,0,1]`:

| Build | Before entry / head proof | After entry / head proof |
|---|---|---|
| Slim (0) | 3.9301155735 m / false | 3.9177706208 m / true |
| Medium (1) | 3.9177706208 m / true | 3.9177706208 m / true |
| Heavy (2) | 3.9036621059 m / true | 3.9177706208 m / true |

This is a reproduction of the width inconsistency and its correction, not a new exact-anatomy promise.

## Checks

- `node --test tools/riflebuildtest.mjs`: **1/1 pass** ([regression.txt](regression.txt)), same profile entry/region/legacy packet and current box ray for slim/medium/heavy; forged reversed ray remains rejected.
- `node tools/headboxestest.cjs`: **15/15 checks** ([boxes.txt](boxes.txt)): ordinary shared boxes, turn, crouch, body boundary, range and invalid inputs.
- `node --test cloudflare/headboxes.test.mjs cloudflare/players.test.mjs`: **79/79 pass** ([worker.txt](worker.txt)). The unmodified base was 79/79; after the width fix the single frozen ×1.08 fixture needed the correction described above, then the suite passed. Existing v1 proof/room authority and v2 head/body/ray/origin/range/rate/damage/recovery/lethal-receipt behavior remain covered.
- `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/headboxesbrowsertest.cjs http://localhost:8429 http://localhost:8430 docs/verification/2209`: **28/28 pass**, **zero errors** ([browser.txt](browser.txt), [result.json](result.json)). Two actual native Ghosts/Combat peers and the actual local Worker: above-head miss, native wall obstruction, three box levels, body1/head2, turn, movement, crouch, lethal/replayed receipts, points and markers. Gameplay peers deliberately create no WebGL; a separate tiny real Avatar debug render has three visible boxes.
- Syntax for all 19 changed existing JavaScript fixtures/modules and `git diff --check`: pass. The 17 historical per-polygon browser fixtures were not rerun as a sweep; only their copied scalar was corrected and syntax checked.

The change has no new visible graphic result: it corrects an invisible legacy classification calculation. The native [debug render](avatar-head-boxes.png) was inspected as an illustration of the existing approximate lower/middle/crown collider only; it is not before/after anatomical proof. No full-apartment, physical-device or FPS claim. #2210's existing bow issue is untouched.

## Delivery boundary

Head-related changelog uses `group: head-hits`; conductor renumbers its provisional id after the final rebase. `interactions.md` and `storage.md` now explicitly document build-independent x/z widths and cached v1 behavior. No personal state, stored data, service or deployment configuration changes. Public downstream: **not applicable**, PvP/gameplay/Worker logic excluded from kvarteret-lunden.

Conductor owns integration/publication, completion evidence and optional pinned debug-image embedding, release checks, issue closure and checkout removal. No push or closure by the worker. Approximate phases: plan/investigation 2 min, implementation 2 min, verification/documentation 5 min (including one corrected old fixture and bounded before/after diagnostic), total about 9 min; one worker, no helpers.

Published source `962aa3f7a925167eb6078d1206b78f938c80f8fa`; pinned evidence: https://github.com/solwation/lunden-3d-apartment/issues/2209#issuecomment-7042749381. Both Pages and Worker deployment succeeded before resolving.
