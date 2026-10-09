# Rendering performance

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [graphics](graphics.md), [verification](verification.md).
## Performance (#48)

- `&perf` shows fps, pixel ratio, draw calls, triangles, geometries, textures; `tools/perfcount.html`
  prints draw calls per spot. Baseline → after the first pass: start view 793 → 362 calls, kitchen
  162 → 109, living room 184 → 87, upstairs 148 → 88 (screenshots pixel-identical).
- `src/merge.js` `mergeStatic`: world.js bakes every static, opaque, single-material mesh into one
  per material and cell (Entréplan / Övre plan / outside); doors (leaf + handles merged per door,
  `tagged`), lids, appliances, the key cabinet, furniture, exterior and surroundings are kept out.
  furniture.js merges each piece on its own (not the parasol; `userData.keep` for the beers). Anything
  new that moves, toggles visibility or is a pick target must be in a kept object or have
  `userData.door` — otherwise it gets baked in.
- Detail culling (#189, `src/detail.js`, `PERF.detail`): the exterior and new furniture had grown the start view to ~1200
  calls (the whole flat is in the frustum from the street). Small meshes that would look tinier than `k` are moved to a
  layer the camera does not draw (never nearer than `minDist`, so never within reach), and from outside the flat a mesh
  inside it is only drawn when the line to it passes a façade opening (the front door's leaf is solid while it is shut; open,
  the whole doorway counts, #210 — `tools/detailtest.html`). Start view
  1210 → ~410 calls, the other spots a little lower; screenshots differ by a few dozen pixels. Anything new that
  raycasts at small things far away must allow for layer 7. Anything new that moves by itself (while the visitor may
  stand still) and exists when the culler is built needs `userData.moving` on its root (#267).
- Warm-up (#432, `warmUp` / `warmRender` in main.js): the first time the flat's inside was drawn (the front door opened
  after a fresh start) three compiled the shadow-depth programs and uploaded the geometry / textures in one frame — a
  freeze of seconds. Three frames in (after lampwash's patch) `renderer.compileAsync` compiles every material's program,
  then one frame is drawn with every layer and no frustum culling (shadows too), behind the start screen. SwiftShader
  320 × 200: the door's first frame 5680 → 28 ms. Skipped in headless Chrome (`HeadlessChrome` UA) unless `&warm`;
  `&perf` logs its times. Materials made later (cups, cat coats) still compile when first drawn.
- Shadows: `shadowMap.autoUpdate = false`; redrawn when the sun moved > 0.2°, for 1.5 s after any E
  action (doors swing), and at least twice a second (`updateShadows` in main.js).
- Mirror images (#50): one Reflector (512²) per mirror, at most ONE active per frame (nearest in view
  within 4 m, visitor's level) and none once dynamic resolution has stepped down. The Badrum mirror's
  LED strip is its own lamp (`mirrorLamps` in interior.js → `world.lamps`, switched like the floor lamp).
- Dynamic resolution: pixel ratio drops in 0.85× steps (not below 0.6×) after 2 s under 30 fps, comes
  back after 4 s over 50 fps; off with `&shot`.


Focus regression (#558): #531 created then disposed a temporary brightness material on every target exit, releasing its last GPU program. A real WebGL createProgram counter reproduced 30 new programs for 30 target/clear switches (and 30 for greeted figures). InteractionOutline now caches variants in a WeakMap by source material/instance index, restoring originals on clear and releasing cached GPU resources on source disposal. Different figure indices use an integer uniform in one shared shader. focusperftest checks zero new programs after warm-up, shared-source reuse, first visits to other figure indices and disposal. interactionoutlinetest checks actual pixel restoration, current lamp hooks, geometry animation and index changes. This removes measured shader churn; desktop SwiftShader is not a claim of measured phone FPS.

Southern backdrop (#536): `SITE.south`/`southbackdrop.js` add 54 existing mapped footprints, a real courtyard hole, simple landmark windows and hip/gable roof silhouettes, sourced roads/open fields and 70 low-detail seasonal woodland trees. Four merged surfaces plus two instanced meshes, no new textures/lights/interiors or OUTDOOR expansion. Clear-weather fog ends at 650 m; camera far 1000 m, outer ground edges hidden. Rain retains its 80 m fog target. Untagged dimensions/height/roof details remain assumptions; proposed Hunnerup 30 buildings excluded. `southbackdroptest` checks sources, real courtyard aperture and seasonal buffers. [Sources, budgets and before/after](../validation/issue-536/README.md).

Phone memory (#585): iOS Safari killed the tab after a few steps ("Ett problem inträffade flera gånger"; the first kill
reloads silently via the resume record). Each Reflector's render target is 512² 4× multisampled half-float (~15 MB on the
GPU) and was allocated the first time that mirror reflected and never freed, so memory grew with every mirror walked
past; `updateReflections` now disposes the previous mirror's target when another (or none) becomes active, so at most
one exists. On phones/tablets (`lowMemory` in main.js: mobile UA, iPadOS's touch "Macintosh", or `&lowmem`)
`LOW_MEMORY` in config caps `renderer.capabilities.maxTextureSize` to 1024 (three resizes on upload; the source
canvases are untouched, so redraws still work), the shadow map to 1024² and the pixel ratio to 1.0 (dynamic resolution
used to step up to 1.5× there). Measured with an iPhone UA and a WebGL allocation counter in headless Chromium:
textures 245 → 170 MB, shadow renderbuffers 16.8 → 4.2 MB, mirrors bounded at one target instead of +~15 MB each. Still
large and not reduced: ~105 MB of vertex buffers (plus their CPU copies) and ~200 MB of canvas sources on the CPU.

Christmas tree (#571): in season +8 draw calls and ~20 k triangles where it is in view (desktop and phone frame), no extra light (one pool anchor in the shared pool / wash), a 0.016 ms CPU shimmer per frame (instance + point colours) and a ~27 ms one-off overlap re-judgement on load / moves; out of season nothing is drawn and perfcount is unchanged. `tools/perfcount.html` now takes `?month=…&day=…` (game URL overrides) and `?w=…&h=…` (frame size). [Numbers](../validation/issue-571/README.md).
