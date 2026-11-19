# #2152 — daylight indoors falls off with the distance from the windows

`tools/browsertest.sh node tools/windowlight2152browser.cjs http://localhost:8224 <out>` (SwiftShader, 960 × 600 rendered,
each half 640 × 400), 15 June 13:00, `&blinds=0&curtains=0`, quality 3. "Före" = the same build with `windowLight.enabled = false`
(exactly the old even hemi/ambient/fill light and exposure); "Efter" = on (WINDOW_LIGHT gain 4, base 0.45, as committed).
Mean luminance (0–255) of each half:

| strip | view | före | efter |
|---|---|---|---|
| `vardagsrum-klart.png` | living room towards the south window, clear | 158.3 | 158.4 |
| `vardagsrum-mulet.png` | the same, overcast | 136.8 | 132.6 |
| `sovrum1-mulet.png` | Sovrum 1 towards the north window, overcast (clear: 173.0 → 166.1) | 152.9 | 141.3 |
| `hall-ovre-mulet.png` | Övre plan's hall between the shut bedroom doors, overcast (clear: 187.7 → 134.2) | 173.3 | 119.3 |

The rooms keep about their mean brightness, but it moves to the windows: the ceiling and side walls by the glass are lighter,
the window wall itself and surfaces facing away from the glass (the soffit's front in Sovrum 1) darker, and the deep hall
behind shut doors loses ~30 %.

Cost (same run, living room, 12 frames with gl.finish; SwiftShader is CPU-rendered, so relative only): quality 3 off 50.1 ms /
on 51.0 ms per frame; draw calls 423, triangles 859 976 and programs 216 identical on and off (a uniform toggle, no new program).
Quality 0: the light is off (396 calls). No page or shader errors.
