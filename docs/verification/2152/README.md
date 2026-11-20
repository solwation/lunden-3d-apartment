# #2152 — daylight indoors falls off with the distance from the windows

`tools/browsertest.sh node tools/windowlight2152browser.cjs http://localhost:8224 <out>` (SwiftShader, 768 × 480 rendered,
each half 512 × 320), 15 June 13:00, `&blinds=0&curtains=0`, quality 3. "Före" = the same build with `windowLight.enabled = false`
(exactly the old even hemi/ambient/fill light and exposure); "Efter" = on (review round 2: WINDOW_LIGHT base 0.6, gain 2.2,
bounce 0.6 warm, tint, skyWarm 0.5, stairwell well 0.35, as committed). Mean luminance (0–255) of each half and its
red/blue ratio (warmth):

| strip | view | före | efter | R/B före → efter |
|---|---|---|---|---|
| `vardagsrum-klart.png` | living room towards the south window, clear | 158.5 | 171.1 | 1.073 → 1.133 |
| `vardagsrum-mulet.png` | the same, overcast | 136.9 | 143.7 | 1.077 → 1.136 |
| `sovrum1-mulet.png` | Sovrum 1 towards the north window, overcast (clear: 173.0 → 181.0) | 152.3 | 153.5 | 0.991 → 1.051 |
| `hall-ovre-mulet.png` | Övre plan's hall between the shut bedroom doors, overcast (clear: 191.0 → 176.6) | 173.1 | 152.1 | 1.017 → 1.078 |

Review round 2 (the first delivery took the upper hall from 173 to 119 overcast, left surfaces turned from the glass flat grey
and looked cold): a warm bounce share of each window's light reaches surfaces facing away from the glass — Sovrum 1's soffit front
168 → 165 (was clearly darker), the window wall beside its window 91 → 105, the ceiling over it 62 → 72; the kept base light is
tinted warm (every view's R/B rises ~6 %); the stairwell is a bounce-only source for the upper storey, so the upper hall keeps
88 % (overcast) / 92 % (clear) of its old mean, its doors lit warmly from the stair side and darker towards the far side.

Cost (same run, living room, 12 frames with gl.finish): draw calls 425, triangles 861 928 and programs 279 identical on and
off (a uniform toggle, no new program); quality 0: the light is off (398 calls, 279 programs). Frame time on SwiftShader
(CPU-rendered, noisy: the two identical quality-0 runs measured 36.2 and 45.8 ms) quality 3 off 37.8 / on 50.3 ms — relative only,
not a GPU measurement. No page or shader errors.
