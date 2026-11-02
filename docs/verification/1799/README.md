# #1799 — legs that do not run in the air

Rendered by `tools/ghostairposetest.cjs` on the component page `tools/ghostairpose.html` (real `Ghost` / `Avatar`,
SwiftShader). From left to right: walking (`am` 0), jetpack flight (`am` 1, 5 m/s forward), web swing (`am` 2, 4 m/s
forward, falling 1.5 m/s) and wall climbing (`am` 3, 0.6 m/s up; the wall is seen edge-on).

- `airpose-side-before.png` — before (origin/main 73f44870): every mode runs the walking gait in the air.
- `airpose-side.png` — after, from the side: the flyer's legs hang straight and trail back (Superman), the swinger's
  trail the swing, the climber steps like on a ladder with one foot up towards the wall; walking is unchanged.
- `airpose-front.png` — after, from the front: the climber's knees point outwards, the hanging legs stay together.

Checks (all passed): gait 1 walking and 0 in every air mode; flying/swinging ankles 0.38–0.47 m behind the hips with
under 0.05 m of sway (no cycle); climbing feet alternate (0.26 m lift each) and stay exactly still when the climb stops;
walk → take off → fly → land → walk → climb → stand moves no ankle more than 0.15 m per 1/30 s frame (an unblended switch
would be 0.4–0.7 m); 90 frames of walking/standing at four speeds are byte-identical to the previous source.
