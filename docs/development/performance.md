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
  stand still) and exists when the culler is built needs `userData.moving` on its root (#267). A root whose `userData.detailUnit` is true is judged
  as one thing by its whole bounding sphere (#598, the car: its wheels went at ~40 m while the body drove on floating; out of
  its garage stall the whole car now stays drawn, up to ~20 more calls while it is in view far off). While the flag is false
  (the car in its stall) its meshes are judged one by one as before.
- Warm-up (#432, now `src/warmup.js`, extended by #592 — see below): the first time the flat's inside was drawn (the front door opened
  after a fresh start) three compiled the shadow-depth programs and uploaded the geometry / textures in one frame — a
  freeze of seconds. Three frames in (after lampwash's patch) `renderer.compileAsync` compiles every material's program,
  then one frame is drawn with every layer and no frustum culling (shadows too), behind the start screen. SwiftShader
  320 × 200: the door's first frame 5680 → 28 ms. Skipped in headless Chrome (`HeadlessChrome` UA) unless `&warm`;
  `&perf` logs its times. Materials made later (cups, cat coats) still compile when first drawn.
- Shadows: `shadowMap.autoUpdate = false`; redrawn when the sun moved > 0.2°, for 1.5 s after any E
  action (doors swing), and at least every `QUALITY.shadowInterval` s of the quality level (`updateShadows` in main.js).
- Mirror images (#50): one Reflector per mirror, at most ONE active per frame (nearest in view
  within 4 m, visitor's level), all drawing into one shared target (#592) whose size is the quality level's (512² / 256² / off). The Badrum mirror's
  LED strip is its own lamp (`mirrorLamps` in interior.js → `world.lamps`, switched like the floor lamp).
- Dynamic resolution: replaced by the adaptive quality level (#592, below); off with `&shot`.


Focus regression (#558): #531 created then disposed a temporary brightness material on every target exit, releasing its last GPU program. A real WebGL createProgram counter reproduced 30 new programs for 30 target/clear switches (and 30 for greeted figures). InteractionOutline now caches variants in a WeakMap by source material/instance index, restoring originals on clear and releasing cached GPU resources on source disposal. Different figure indices use an integer uniform in one shared shader. focusperftest checks zero new programs after warm-up, shared-source reuse, first visits to other figure indices and disposal. interactionoutlinetest checks actual pixel restoration, current lamp hooks, geometry animation and index changes. This removes measured shader churn; desktop SwiftShader is not a claim of measured phone FPS.

Southern backdrop (#536): `SITE.south`/`southbackdrop.js` add 54 existing mapped footprints, a real courtyard hole, simple landmark windows and hip/gable roof silhouettes, sourced roads/open fields and 70 low-detail seasonal woodland trees. Four merged surfaces plus two instanced meshes, no new textures/lights/interiors or OUTDOOR expansion. Clear-weather fog ends at 650 m; camera far 1000 m, outer ground edges hidden. Rain retains its 80 m fog target. Untagged dimensions/height/roof details remain assumptions; proposed Hunnerup 30 buildings excluded. `southbackdroptest` checks sources, real courtyard aperture and seasonal buffers. [Sources, budgets and before/after](../validation/issue-536/README.md).

Phone memory (#585): iOS Safari killed the tab after a few steps ("Ett problem inträffade flera gånger"; the first kill
reloads silently via the resume record). Each Reflector's render target is 512² 4× multisampled half-float (~15 MB on the
GPU) and was allocated the first time that mirror reflected and never freed, so memory grew with every mirror walked
past; `updateReflections` now disposes the previous mirror's target when another (or none) becomes active, so at most
one exists. On phones/tablets (`lowMemory` in `src/lowmemory.js`: mobile UA, iPadOS's touch "Macintosh", or `&lowmem`)
`LOW_MEMORY` in config caps `renderer.capabilities.maxTextureSize` to 1024 (three resizes on upload; the source
canvases are untouched, so redraws still work), the shadow map to 1024² and the pixel ratio to 1.0 (dynamic resolution
used to step up to 1.5× there). Measured with an iPhone UA and a WebGL allocation counter in headless Chromium:
textures 245 → 170 MB, shadow renderbuffers 16.8 → 4.2 MB, mirrors bounded at one target instead of +~15 MB each. Still
large and not reduced: ~105 MB of vertex buffers (plus their CPU copies) and ~200 MB of canvas sources on the CPU.

Campus facades on phones (#589): #576–#581 took the east backdrop (`east-backdrop`, eight merged batches) from ~21 k to
75 351 triangles, all drawn (and shadow-cast) wherever the campus is in the frustum. On `lowMemory` devices
`buildCampusFacade` / `buildSchoolFacade` take `lite` (`CAMPUS_LOD` in config): no dentils, quoin joints or fine
glazing bars (the centre post and one rail stay), each stepped cornice merged into one profile (`oneProfile`), sills
and window crowns as flat planes, arches with 3 segments and roofs on a 2× coarser grid. Bodies, eaves, ridges, colours,
brick/render, every window and the clock tower are the same; same batches, same draw calls. Phone (`?lowmem&w=390&h=844`):
east backdrop 75 351 → 33 676 triangles (budget `maxTris` 36 000, *guess*), perfcount −41.7 k triangles at every spot,
calls unchanged; desktop unchanged. `eastbackdroptest.html?lowmem` runs the phone build. Distance-based LOD on desktop was
not done (it would need a second geometry per batch). [Numbers and screenshots](../validation/issue-589/README.md).

Christmas tree (#571): in season +8 draw calls and ~20 k triangles where it is in view (desktop and phone frame), no extra light (one pool anchor in the shared pool / wash), a 0.016 ms CPU shimmer per frame (instance + point colours) and a ~27 ms one-off overlap re-judgement on load / moves; out of season nothing is drawn and perfcount is unchanged. `tools/perfcount.html` now takes `?month=…&day=…` (game URL overrides) and `?w=…&h=…` (frame size). [Numbers](../validation/issue-571/README.md).

Roof terraces (#605): `src/terracedecor.js` adds 3 draw calls (one merged solid, soft and bulb mesh for all eight furnished terraces) and ~31 k triangles where Hus L's courtyard side is in view, nothing from the street side (the gate puts them on layer 7 north of the set-back wall below the roof, and beyond `TERRACE_DECOR.far`). perfcount: park 433 → 436 calls, big hall 836 725 → ~868 k triangles, still within PERF.budget; no lights, no textures, materials exist for the warm-up. `tools/terracedecortest.html` keeps a 50 k triangle budget.

## Turn-around hitches (#592)

The visitor reported freezes when turning around, indoors and out, on a phone and a work PC.

**Measuring (step A).** `src/hitchlog.js` (`HitchLog`, `__app.hitch`) counts the WebGL context's calls
(`createProgram` = a shader compile, `createTexture` = a texture's first GPU upload, `tex(Sub)Image*` uploads and their
pixels, `bufferData`, `createFramebuffer`, `renderbufferStorage*`) and times every frame by phase (`adapt`, `step`,
`update`, `render`, and inside `render` the shadow-map pass `shadowMap` and the mirror pass `mirror`). With `&perf` a
frame of at least `PERF.hitch.ms` (50 ms, *guess*) is logged to the console (`hitch {…}`) with those deltas, whether
and why the shadow map was redrawn (`shadowWhy`: `hold` after an action, `age` = the twice-a-second refresh, `sun`),
which mirror reflected, the camera's yaw and position. The game loop's body is `frame(raw)` (`__app.frame`).
`tools/turntest.html` waits for the warm-up (`&warm`, `__app.warm.state`), stops the loop, runs 60 settling frames, then
at nine spots (living room, kitchen, hall, upstairs, patio, the street in front, courtyard, Karpvägen, the roof) turns
360° in 15° steps twice, one `__app.frame(1/60)` per step, and fails on any new program or new texture while turning.
Lap 1 minus lap 2 = what was drawn for the first time.

SwiftShader caveat: WebGL runs in the GPU process, so a frame's GPU work is paid by whichever later frame first waits
on the GPU (three does when it first uses a program). The warm-up's draw-everything frame shows up 15–27 s later in a
settling frame with no counts at all; `?sync` (one `readPixels` per frame) attributes work correctly but costs seconds
per frame. Frame times below are therefore relative; the counts are what the gate trusts. Not GPU timings.

**Before (headless Chromium, SwiftShader, 640×400 desktop and `?lowmem&w=390&h=844`, noon in July; night `&time=22&lights`
and winter `&month=12&day=20&weather=snow` showed the same):**

| spot | lap 1 | lap 2 |
|---|---|---|
| living room (SKOGSGRÄNSEN / LINDBYN) | 57 new programs (48 phone), 2 new textures, 4 framebuffers, 6 renderbuffers; one frame 12–51 s, then 150–1600 ms frames | 0 programs, still 2 textures / 4 framebuffers |
| upstairs (four mirrors in reach) | 0 programs (4 on the phone), 3 new textures, 6 framebuffers, 9 renderbuffers | the same textures again |
| kitchen, hall, patio, street, courtyard, Karpvägen, roof | 0 programs, 0 new textures | 0 |

Causes, in order of size:
1. **The mirror pass compiles a second set of programs.** A Reflector draws the room into a half-float render target,
   where three uses no tone mapping and linear output: a different program for every material it sees. The warm-up
   compiled and drew only the screen's variants, so the first mirror in view compiled 43–46 programs in one frame
   (12–51 s under SwiftShader; on a GPU the synchronous compile + link of ~50 programs is a freeze of a second or
   more) and a few more each time new things turned into its view.
2. **Every change of active mirror allocates a new render target.** Since #585 the previous mirror's 512² 4×
   multisampled target is disposed when another becomes active, so turning between two mirrors creates a texture,
   two framebuffers and three renderbuffers (~15 MB) every time, on every lap.
3. Not seen while turning: new programs from lamps or pool lights (the light count is constant, night = day),
   textures of things coming into view (the warm-up's draw-everything frame had uploaded them), garbage collection.
   Still to watch: the shadow map is redrawn twice a second (`age`, 5–95 ms of the frame under SwiftShader, the
   largest regular spike at the indoor spots); the warm-up drew the shadow pass with the shadow camera's own layers,
   so what the DetailCuller had on layer 7 was first drawn into the shadow map later; and the dynamic resolution's
   pixel-ratio steps reallocate the canvas.

**Fixes (step B).** `src/warmup.js` (`WarmUp`, `__app.warm`, `WARM` in config) replaces main.js's warm-up and runs in
stages from the game loop: compile every material → draw everything once (every layer, now also the sun's shadow
camera's, no frustum culling) → compile every material again with the mirror target bound → draw everything once into
the mirror target → in idle slots (`requestIdleCallback`, ≤ `WARM.sliceMs` each, 500 ms timeout) `renderer.initTexture`
every texture of every material, hidden objects included (`__app.warm.state` ends at `done`). `src/reflections.js`: all
mirrors draw into ONE shared render target (`mirrorTarget()`, `SharedReflector` = three's Reflector with its target
swapped), allocated once by the warm-up and never disposed — at most one existed since #585 anyway, so the GPU memory
bound is the same. Programs after the warm-up 107 → 196 (the mirror variants); the mirror warm-up draw costs as much as
the first one (5.8 / 6.3 s under SwiftShader, behind the start screen). Pool lights were already a constant set (#234),
so no light work was needed.

After (same runs as above): **0 new programs and 0 new textures while turning at all nine spots, desktop and phone**;
no render targets or renderbuffers allocated while turning (living room lap 1 still makes 8 `bufferData` calls the first
time the mirror draws, then none). Longest turning frame (SwiftShader, loaded machine, unsynced) 12 204 → 662 ms on
the desktop frame and 9 886 → 484 ms on the phone frame; median frame at the mirrors 204 → 101 ms.
Not covered: materials made after the start (cups, cat coats, new life items) still compile when first drawn.

**Adaptive quality level (step C).** `src/quality.js` (`Quality`, `__app.quality`, `QUALITY` in config) replaces #460's
three pixel-ratio tiers (`dynRes`). One level 0 (lowest) … 3 (highest), steered by the real frame time: down one level
when 3 frames of ≥ 50 ms fall within 0.5 s (repeated hitches) or after 1.5 s under 30 fps; up one level only after 5 s
in a row over 52 fps and never within 20 s of a step down; at most one step per 1.5 s (all *guess*). It only adapts
while playing (not on the start screen or paused), after the warm-up, and not with `&shot` (highest) or `&quality=n`
(pinned; both not remembered). The level reached is remembered per device (`localStorage` `lunden.quality`); phones
(`lowMemory`) start at 2, everything else at 3. perfcount checks the drop on a low frame rate, the drop within 0.6 s on
repeated hitches, no step up right after a step down, the recovery, and that the knobs are registered.

The registry: a feature that costs frame time calls `quality.register(name, { apply(level, quality), state(level), cost })`
(main.js, after the thing exists). `apply` runs at once and on every change and sets the feature's cost for that level,
reading its per-level value from a `QUALITY` table; `state` is the line in the `&perf` overlay (`quality.describe()`),
`cost` a note of what it saves. Current knobs (level 0 → 3):

| knob | 0 | 1 | 2 | 3 | notes |
|---|---|---|---|---|---|
| `resolution` | 0.6× | 0.75× | 0.9× | 1× | of the capped device ratio (1.5, phones 1.0), never below 0.5; a step reallocates the drawing buffer once |
| `shadows` | 1024², every 1 s | 1024², 0.75 s | 2048², 0.5 s | 2048², 0.4 s | phones capped at 1024² (#585); a size change reallocates the map once |
| `mirrors` | off | off | 256², every 2nd frame | 512², every frame | the shared target is resized once on a change; never drawn in a frame that redraws the shadow map |
| `detail` | ×0.6 | ×0.75 | ×0.9 | ×1 | DetailCuller's cut distances (#460's `setQuality`) |
| `weather` | ×0.35 | ×0.6 | ×0.85 | ×1 | share of rain streaks / snowflakes / hail drawn |

Not knobs (yet): the campus facades' LOD (#589) is chosen once at build time (a runtime switch needs a second geometry
per batch), and the Christmas tree's shimmer costs 0.016 ms (#571) — not worth one.

**Keeping future graphics safe (step D).**
- *Budgets:* `PERF.budget` in config — per view at the highest level: ≤ 520 draw calls and ≤ 1 000 000 triangles at
  every perfcount spot, ≤ 320 MB estimated texture memory (every material's textures, w × h × 4 + mips, capped at the
  device's texture size); phones (`?lowmem`): ≤ 370 calls, ≤ 950 000 triangles, ≤ 225 MB. Set ~20 % above the scene on
  2026-10-09 (desktop: 433 calls at park, 836 725 triangles in the big hall, ~266 MB in 240 textures; phone 390×844:
  305 calls / 784 426 triangles in the basement, ~188 MB) — *guess*. `tools/perfcount.html` (and `?lowmem&w=390&h=844`)
  fails past them; raise one only on purpose, with the reason in the commit.
- *A new heavy feature* (a new pass, a particle system, a big animated canvas, many lights or casters): add its per-level
  values to `QUALITY` and `quality.register(...)` it in main.js (see the table above); make sure its materials exist when
  the warm-up runs (or call `renderer.compileAsync(object, camera, scene)` when it is created) and that it does not
  allocate render targets or textures on first view (share / allocate up front, like `mirrorTarget()`); run turntest
  (0 new programs / textures) and perfcount (budgets).
- *Spreading heavy work:* the mirror keeps last frame's image (`hold`) in any frame that redraws the shadow map, and at
  level 2 draws every other frame (`QUALITY.mirrorEvery`); the warm-up's texture uploads run in idle slots of at most
  `WARM.sliceMs`. The DetailCuller's re-judging was measured at < 1 ms median (2682 items, 2–3.5 ms worst) and the
  whole `step` at ~1.4 ms, so the CPU side needed no spreading.


Visited flat L1004 (#574): its own group, merged per material and level like ours (`buildVisitFlat`, ~83 top-level children,
~156 draw items with door/window/lid anchors and their architecture edges). `VisitUnit.cull` (STANDARD.detail 12 m): from
inside our flat or down in the garage nothing of it is drawn; farther than 12 m from its footprint only its shell (walls,
floors, ceilings, window frames: 8 calls); near it everything. perfcount (desktop) before → after: start 198 → 198, garage
drive 340 → 348, park 433 → 441, every other spot unchanged; budget PASS. Measured at L1004 itself: street in front 216 →
391 calls, its hall 185 → 333, its living room 138 → 284, its upstairs hall 154 → 209 (within the 520 budget). The build
adds ~45 geometries and ~8 textures (3-stav parquet, tiles) and one extra architecture-edges pass at start. No lights: it has
no lamps (daylight only); the sun's one shadow map moves onto it when the visitor is within STANDARD.near m.

L1201 (#573) and the far shell: from afar a visited flat now also shows a stand-in for its windows (glass and shut sashes
merged into one mesh per material, `VisitUnit.standIn`) and its exterior doors, so its openings are not open holes. Measured
with both flats (desktop, calls with → without the visited flats): garage drive 363 → 343, park 455 → 435, L1004's street
387 → 202; at L1201: the loftgång in front of it 263 → 117, its hall 249 → 116, its living room 248 → 109, its Allrum 136 →
107. perfcount (desktop and `?lowmem`) within PERF.budget.

Opening kitchen fronts in the visited flats (#621): every front an Openable of its own costs two calls (its mesh and its
architecture edges; measured +42 at L1004's kitchen, its hall view 493 → 541, over PERF.budget). `standardinterior.js`
`batchFronts` draws all of a flat's fronts as one vertex-coloured mesh + one LineSegments: each vertex carries its front's
index (`fi`) and the vertex shader moves it by that front's pivot (a mat4 uniform array, MAX_FRONTS 40; its shadow through a
patched `customDepthMaterial`), E aims at an undrawn box per front and the focused one is brightened in the shader (`aimAt`).
Measured (desktop, worst of 12 yaws): L1004 kitchen 473 → 475, hall 493 → 495; L1201 kitchen 369 → 371. One new program.

