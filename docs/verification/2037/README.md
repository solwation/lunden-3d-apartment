# #2037 breath in the cold, flush and sweat — verification

Component page `tools/avatarbreath.html`, driven by
`PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarbreathtest.cjs http://localhost:8237 docs/verification/2037`
(served by `tools/devserve.py`, SwiftShader). Data: `breath.json`.

- `winter.png`: three avatars outdoors at −6 °C in snowfall (the middle one running): a soft puff in front of each mouth (5 draw calls).
- `indoors.png` / `mild.png`: the same indoors and outdoors at 14 °C: no puffs (4 draw calls).
- `winterFaces.png`: a close-up in frost from the side; the runner's puff is bigger and has drifted further.
- `faces.png`: left rested, right the same look after a 40 s sprint: flushed cheeks and a sweat sheen on the forehead.
- `faces30.png` / `facesLater.png`: 30 s and 75 s later: the flush halfway down, then gone.
- `crowd.png`: 12 running avatars in frost: 14 draw calls with puffs, 13 without — all puffs share one draw call.
- `breath.json` `ghosts`: the real `Ghosts` / `Ghost` wiring — a running ghost outdoors in frost builds heat and puffs into `Ghosts.breath`.

Node: `node --test tools/avatarbreathtest.mjs` (7 tests). Not tested: the full app with the real weather (the `wetEnv` wiring is #2018's) and real phones.
