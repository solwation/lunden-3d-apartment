# #2035: living rest while standing still

Component page `tools/avataridle.html` (seeds `player-a` blue, `player-b` red), driven by `tools/avataridletest.cjs`; numbers per frame in [idle.json](idle.json).

- [idle-60s-pair.png](idle-60s-pair.png): both players over 60 s. Weight shifts, glances and all three gestures (crossed arms, hands in pockets, stretch) occur at different times for the two seeds.
- [idle-variations-a.png](idle-variations-a.png): player A close up: rest, weight on each leg, a glance, crossed arms, stretch and pockets.

Checks: `node --test tools/avataridletest.mjs` (60 s sequences, three seeds: weight, glance and at least one gesture; ankle drift < 3 mm; hip roll 0.04-0.1 rad with the free knee bent more; seeds out of step, same seed repeatable; crouch, seat, held hand, gaze target, turning view and mirror image unaffected), the existing avatar node tests (143 pass) and the browser run (PASS: gestures cross / pockets / stretch on the sheet, ankle drift 0; `Avatar.update` of 20 standing avatars unchanged within the noise).

Limits: the hands stay straight along the forearm (no wrist roll), so the folded arms show the palms; poses are judged by eye against ordinary idle behaviour, not motion capture.
