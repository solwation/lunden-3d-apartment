# Rendering performance

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [graphics](graphics.md), [verification](verification.md).
## Performance (#48)

- `&perf` shows fps, pixel ratio, draw calls, triangles, geometries, textures; `tools/perfcount.html`
  prints draw calls per spot (since #695 the draws to the screen, counted per draw: see the #695 section — older numbers in
  this file, the start view's above all, came from `renderer.info` and can be too low). Baseline → after the first pass: start view 793 → 362 calls, kitchen
  162 → 109, living room 184 → 87, upstairs 148 → 88 (screenshots pixel-identical).
- Bicycles (#683): the shared frame/tyre/metal batches add two instanced calls at the bike yard; one
  merged alpha-spoke batch serves the courtyard rack and one serves all basement bikes. `perfcount`
  now includes the bike yard, courtyard rack and west CYKEL room: desktop 333 / 316 / 142 calls;
  phone (`?lowmem&w=390&h=844`) 322 / 220 / 119. Both profiles pass the overall budgets (desktop
  peak 471 calls / 994,961 triangles; phone peak 322 calls / 903,094 triangles).
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
  raycasts at small things far away must allow for layer 7. Marks physical traces include the shared
  `DETAIL_HIDDEN_LAYER` (#805), preserving hits on culled details; rendering and nearby focus-ray layers remain unchanged. Anything new that moves by itself (while the visitor may
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


## Hus A entrance outside the detail gate (#887)

The courtyard façade cuts a permanent entrance opening. Hiding all of CoreHouse A beyond its original 14 m front rectangle left
that opening empty from L1007's patio. Only the actual ground-floor lobby/entrance geometry now remains beside the culled detail group:
one merged opaque batch, fixed glass, the same animated leaf, and their outlines. No extra triangles, invented blocking plane or wider
lift/stair detail radius. Static batches keep native frustum culling and their existing shadow flags; no extra reflection pass.
Native source geometry at x1.8/z14 retains 8 meshes/572 triangles, versus the complete near core's 10,946 triangles. Near splitting
adds one opaque mesh (80 versus 79 total meshes), preserving the same summed triangles. These are mesh/triangle counts, not measured FPS.
The bounded actual World comparison at 900×560 DPR1 (quality0/3, no test mode) adds 10 completed-view draw calls at the patio
(118→128) and 562 rendered triangles; near adds two calls (174→176 /176→178) with unchanged rendered triangles.
These frozen-camera counts do not establish live FPS or phone performance.

## Local shot cold collision preparation (#715, 2026-10-13)

Local Nerf darts call `Marks.hit` while flying. Previously `Marks.segment` created a `TriGrid` synchronously for every
static surface with at least 200 triangles before asking whether its bounds intersected the short dart segment.
That transformed every triangle and populated world-cell Maps even for scenery far outside the shot. The remote
combat spatial fixes did not cover this local path. It is a concrete source of first-shot CPU work, including during PvP.

`src/marks.js` now checks a private conservative position-derived world box before creating that grid. It ignores
and preserves authored `geometry.boundingBox`, includes float32 rounding used by TriGrid's world vertices, and is
invalidated alongside the grid when furniture moves. Moving/instanced/skinned surfaces retain the existing path;
render-detail layers and physical hit decisions retain their existing policies. Overlapping cold grids still build
synchronously; this change removes distant preparation, not every possible shot hitch.

`tools/marksbroadphasetest.cjs` supplies unmodified `524ebc9:src/marks.js` to the companion module-only browser fixture.
Two actual local Darts/Marks shots, 60 identical steps and eight distant 16,128-triangle spheres: cold first update
**47.3 → 1.7 ms**, total update work **48.6 → 2.9 ms** in Chromium. Every active-dart count and final position, velocity,
travelled distance, visibility/flight/spent flag and splash count match. Separate instrumented proof: 2,145 position
reads versus 11,904 for a distant indexed sphere. All ten checks passed; actual physical-marks regression also passed.
This controlled CPU result is not apartment FPS or a physical-phone measurement. It supports publishing a candidate
against the user's recurring shooting lag without treating another user test as a prerequisite for implementation.


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

Visitable flats' lamps (#620): one more lamp wash (`uLampDataV`, up to 24 lamps) in the lit materials' shaders, left at once outside the two flats' boxes (a box test first), no pool light or shadow light; +1 merged fitting mesh per flat and two small meshes per switch, ~+9 draw calls of ~300 in L1004's kitchen view (measured with the lamps hidden / shown), nothing from the street side beyond the flats' windows. interactionoutlinetest allows one set of each (`uLampData` + `uLampDataV`).

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

**Lamp-wash patch after the warm-up (#668).** `turntest ?lowmem&spots=living,kitchen` failed with 10–20 new programs in the
first kitchen lap (and `living` now and then). Not SwiftShader timing: listing `renderer.info.programs` that appeared per frame
(turntest now prints each new program's cacheKey tail and the objects using it) showed the same materials under a new key,
`…|lampwash` → `…|lampwash|lampwashV`. `LampWashes.patch()` runs every 120 frames for both washes (ours, `Lights`; the visitable
flats', `VisitLights`) and gives materials made since the last patch the lamp shader, which sets `needsUpdate` and so recompiles
them. The first periodic patch fell ~120 frames after the start, i.e. in the first frames after the warm-up (3 frames in), and
hit whatever was drawn then (mess meshes, drop-off, instanced things); in turntest that is the kitchen's first lap. Fix:
`WarmUp` takes `prepare()` and calls it right before the first compile; main.js passes both washes' `patch(scene)`. After it:
0 new programs at living and kitchen in 3 of 3 runs (2 `?lowmem` + 1 desktop; the other spots pass too, before: kitchen 20 / 20 / 10 new in three runs, living 11 in one).
Materials created later (cups, cat coats) are still patched by the 120-frame loop and compile when first drawn.

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

Real weather (#674) costs nothing per frame beyond a few typed-array reads (`RealWeather.at`) and a 4×/s simulated temperature; one month (24 × days hours × 4 arrays, ~15 KB) is held, at most three months in memory, the fetch happens once after the first frames.

Not knobs (yet): the campus facades' LOD (#589) is chosen once at build time (a runtime switch needs a second geometry
per batch), and the Christmas tree's shimmer costs 0.016 ms (#571) — not worth one.

**Keeping future graphics safe (step D).**
- *Budgets:* `PERF.budget` in config — per view at the highest level: ≤ 520 draw calls and ≤ 1 000 000 triangles at
  every perfcount spot, ≤ 320 MB estimated texture memory (every material's textures, w × h × 4 + mips, capped at the
  device's texture size); phones (`?lowmem`): ≤ 370 calls, ≤ 950 000 triangles, ≤ 225 MB. Set ~20 % above the scene on
  2026-10-09 (desktop: 433 calls at park, 836 725 triangles in the big hall, ~266 MB in 240 textures; phone 390×844:
  305 calls / 784 426 triangles in the basement, ~188 MB) — *guess*. (The start view was under-counted then: it drew ~770
  calls on the phone, not ~190 — #695; every other spot was counted right and fits.) `tools/perfcount.html` (and `?lowmem&w=390&h=844`)
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


## Phone memory probe and texture cap (#628, refs #585 — not verified on a device)

iPhone 14 Pro froze, reloaded and showed "Ett problem inträffade flera gånger" again. `tools/phonememtest.cjs` (Playwright
Chromium on SwiftShader; run instructions in [verification](verification.md)) simulates the phone — **844×390 landscape (the
game asks for landscape), DPR 3, iPhone UA, touch** — wraps the WebGL calls to total texture / renderbuffer / buffer bytes over
time, reads JS heap and long tasks, throttles the CPU (`--cpu 4,6`), walks the flat (start, hall, living room, kitchen,
upstairs, every mirror, patio, stairwell storeys, garage) and compares the total with an iOS budget that is a *guess*
(`--budget-mb`, default 600: iOS kills the WebContent process somewhere between a few hundred MB and ~1 GB on a 6 GB iPhone; the
real figure is unknown). All GPU numbers are estimates from the page's own allocations, not readings from a GPU.

**Does #585's work apply in a phone profile?** Yes: with the iPhone UA `lowMemory`, `isPhoneDevice` (the `phone` class, from
`(pointer: coarse) and (hover: none)`), `maxTextureSize` 1024, shadow map 1024², pixel ratio 0.9 (quality level 2 × the 1.0 cap)
and the lite campus facades are all on. Note that the iPhone UA also makes the start warm-up *run* (it skips only
`HeadlessChrome`), like on a real phone: `--nowarm` appends `HeadlessChrome` to compare.

**Before (main at d654ad5, estimates, MB):**

| point | textures | renderbuffers | buffers | canvas | GPU total |
|---|---|---|---|---|---|
| after load (before warm-up) | 36 | 4 | 89 | 9 | 138 |
| after the warm-up (262 textures, 205 programs) | 207 | 7 | 104 | 9 | **327** (peak) |
| after the route (every spot, 9 mirrors, stairwell) | 207 | 7 | 104 | 9 | 327 (no growth) |

Besides the GPU: 186 MB of CPU canvases (the sources of canvas textures), 134 MB of CPU copies of the geometry
(3 320 geometries, kept by three), ~335 MB JS heap → GPU + heap + canvases ≈ 854 MB vs the 600 MB guess.
What grows: only the **start warm-up** (textures 36 → 207 MB in one burst behind the start screen, programs 50 → 205). It matches "loads, starts playing, then freezes". Walking everything *without* the warm-up (`--nowarm`) ends
at 182 MB of textures, so the warm-up only moves the cost forward by ~25 MB. Mirrors are **not** the problem any more: one
shared 256² 4× half-float target (~3 MB) at level 2, no growth over nine mirrors, no new render targets while walking; the
shadow map is 1024² (4 MB). Largest items: textures 207 MB (145 MB in ~27 textures of 513–1024 px with mips), vertex buffers
103 MB (merged world, 49 MB in one group), canvas sources 186 MB (curtain prints 24, escape plan 11, rugs 27, garage floor
10, cat board 9), geometry copies 134 MB.

**Change:** `LOW_MEMORY.maxTextureSize` 1024 → 512 (config). On a screen under 850 px wide a base level above 512 is
rarely sampled (*guess*; compared by screenshots only: living room, mirror and kitchen views look the same, mirrors 1/3/7 draw
their reflection). Desktop untouched. After: textures 207 → **105 MB**, GPU peak 327 → **226 MB**, total estimate 854 → 753 MB
(still over the 600 MB guess); perfcount `?lowmem&w=390&h=844` texture estimate ~98 MB, budget passes.

**Not done (measured, but not safe to change blind):** the 134 MB of CPU geometry copies (raycasts read them), the 186 MB of
canvas sources (many canvases are redrawn, freeing needs a per-module opt-in), vertex-buffer quantisation, and warm-up changes.
Frame times in SwiftShader (seconds per frame) say nothing about the phone. **Physical iPhone verification is still required.**

**Step 2 (#628, phone only, not verified on a device):** (1) `freeCanvasAfterUpload(tex)` (`src/lowmemory.js`, `lowMemory` only) shrinks a
canvas texture's source canvas to 1×1 in three's `onUpdate`, i.e. right after the upload. Opt-in, only for canvases drawn once and
never cloned or redrawn: curtain prints, the garage escape plan / floor / sign plates, the rugs (archRug, rugTexture, zigzag,
pile), K-pop poster atlas, AO overlays and street-sign atlas. NOT applied to anything that calls `needsUpdate` again (cat board,
drawing sheets, calendar, cheat note, cups, signs that change) or may be cloned. A later re-upload (e.g. after a lost WebGL
context) would show these blank, so on a phone `reloadOnContextRestore(canvas, reload)` (`src/lowmemory.js`, wired in `src/main.js`) reloads the
page on `webglcontextrestored` after a loss, through the ordinary resume (place + world, as "Ladda om"), at most once per 60 s
(sessionStorage `lunden.glReloadAt`; then it only logs). Crashlog still reports loss/restore. Tested by `tools/glrestoretest.cjs`. (2) `WarmUp` option `lazyHidden` (phone): stage 4 (upload of every texture of hidden objects)
is skipped; they upload when first shown. Measured with `phonememtest --cpu 1 --dwell 600` (estimates, MB):

| | before (a3541b8-ish) | after |
|---|---|---|
| textures after warm-up | 105 | 87 (94 at the end of the route; 195 → 211 textures) |
| GPU peak | 235 | 224 |
| CPU canvases after warm-up | 187 | 106 |
| JS heap peak | ~343 | ~338 |
| sum of the three peaks | 766 | 732 (guess budget 600) |

Screenshots of start, living room, kitchen and the nine mirrors before/after are the same (the one pixel-diff outlier was a
different camera yaw). perfcount `?lowmem&w=390&h=844` passes (textures ~74 MB). The canvases still held (~106 MB): cat board 9,
cheat note 6, cups, 2828×1000 and 2160×1076 canvases of other makers, many small ones. Still not done: geometry CPU copies (135 MB:
raycast, marks.js, basket bounces, DetailCuller and `edgeSources` read them), chunking the one-frame warm-up draw, vertex buffers.

**Step 4 (#628, phone only, not verified on a device): geometry copies and normals.** `src/lowmemory.js`: `freeGeometryAfterUpload(geo)`
hooks three's `onUploadCallback` so that `normal`, `uv`, `uv1`, `color` and `plantWind` are replaced by empty typed arrays of the
same kind once the GL buffer exists (`position` and `index` stay: raycasts, TriGrid, DetailCuller, architecture edges, marks and
basket bounces read them). A raycast's interpolated uv/normal then reads NaN instead of throwing; `marks`/`basket` use the face
normal from `position`. `mergeStatic` hooks its outputs, and `freeSceneGeometryCopies(scene, renderer)` (main.js, right after the
`WarmUp` is built, before the first draw) hooks every other mesh geometry. `packNormals` also turns Float32 normals into
normalized Int8 ×4 (12 → 4 bytes on the GPU; axis-aligned normals exact, smooth ones within 0.4 %) while nothing is uploaded yet.
Opt-outs: skinned meshes, morph targets, geometries with any dynamic attribute or a `bedCare` attribute, and
`geometry.userData.keepCpu` (set by watering, fruit and the drawing sheet, which rewrite their arrays or read `hit.uv`). A
console canary warns (`freed vertex attribute …`) if a freed attribute is cloned or marked `needsUpdate`; none fired in the
runs below. A new maker that rewrites or clones a mesh's vertex arrays after the first draw must set `geometry.userData.keepCpu`.
`&keepgeo` (with `&lowmem`/phone) turns all of it off for an A/B run. Not touched: desktop.

Measured with `phonememtest --cpu 1 --dwell 600` (the full route, SwiftShader estimates, MB), `&keepgeo` vs default:

| | before | after |
|---|---|---|
| CPU copies of geometry | 138 | 66 (position 48, colour 5.5, normal 4.7, uv 4.1, index 1.9 left) |
| vertex buffers (GPU) | 113 | 88 |
| GPU peak | 229 | 204 |
| JS heap after the warm-up (steady) | 369 | 301 |
| JS heap at load, before the warm-up | 375 | 394 (the packed copies; freed at the first draw) |
| steady heap + GPU + CPU canvases (after warm-up) | ~690 | ~600 |

The old "sum of the three peaks" (769 vs 785) hides this: the heap peak is the moment before the warm-up, the GPU peak after it,
so they do not coincide; the heap peak itself did not fall. Parity checks (before/after identical): 112 aim samples at seven
spots (focus kind/name) and 56 `marks.hit` hits (points and normals); sitting on the sofa, armchair and stool and standing up;
nine mirrors, start, hall, living room, kitchen, patio, stairwell and garage screenshots differ only by rain streaks.

Not done: positions (48 MB CPU, 48 GPU; needed by raycast, could move to TriGrid's own world-space copy), vertex colours
(Float32 → byte would band dark tones), uv, merged non-indexed geometry (indexing would cut vertices but costs frame time),
the transient +19 MB at load (pack in place), the ~106 MB of CPU canvases and the heap's remaining ~300 MB.

## Phone graphics a little finer (#662 — not verified on a device)

The iPhone crash (#585/#628) can no longer be reproduced, so `LOW_MEMORY` was raised carefully, one knob at a time, measured
with `tools/phonememtest.cjs --route living,mirrors,stairwell` (iPhone 14 Pro profile, 844×390 @3, SwiftShader; GPU
numbers are the page's own allocations; budget 600 MB is still a *guess*). Peak GPU estimate, MB (JS heap/canvas copies
vary ±30 MB between runs, so the GPU column is the comparable one):

| step | textures | renderbuffers | canvas | GPU peak | GPU + heap + CPU canvases |
|---|---|---|---|---|---|
| baseline (512 / 1024² / 1.0) | 97 | 7 | 9 | **203** | 768 |
| `maxPixelRatio` 1.0 → 1.25 | 95 | 7 | 14 | 206 (+3) | 778 |
| + `maxTextureSize` 512 → 768 (tried) | 137 | 7 | 14 | 248 (+42) | 820 |
| `maxPixelRatio` 1.25 + `shadowMapSize` 1024 → 1536 (**taken**, 512 textures kept) | 100 | 12 | 14 | **216 (+13)** | 721 |

Taken: `maxPixelRatio` 1.25 (start level 2 now draws at 0.9 → 1.125×, the top level at 1.25×; the drawing buffer is 14 MB instead
of 9) and `shadowMapSize` 1536 (the map is 9 MB instead of 4; levels 0–1 still use 1024 through `QUALITY.shadowSize`, levels 2–3
wanted 2048 and are capped at 1536). Not taken: `maxTextureSize` 768 costs +42 MB for a base level a 844 px wide screen
rarely samples; `startLowMemory` stays 2 (the adaptive levels, `quality.js`, still step down on a slow frame rate and back up,
and the lost-context reload is unchanged). Everything is still above the 600 MB *guess* in total (as before #662: the
CPU canvases and geometry copies dominate), GPU peak is 216 MB, +13 MB (+6 %) over the baseline. Desktop is untouched
(`lowMemory` only). perfcount `?lowmem&w=390&h=844`, `glrestoretest.cjs` and `turntest.html?lowmem` pass. To go back: `LOW_MEMORY`
`maxPixelRatio: 1.0`, `shadowMapSize: 1024` in `src/config.js`. Screenshots: `/tmp/shots-grafik` (not in the repo; the living
room looks slightly crisper, nothing else changes).

Ghosts (#666, `src/ghosts.js`), avatars (#705, `src/avatar.js`): each other player costs two draw calls (one SkinnedMesh with vertex colours, one
name tag sprite), no shadow pass, no extra pass for the outline (a fresnel term in the same Lambert material's shader, one program for
all), at most `GHOSTS.max` (30); hidden beyond `GHOSTS.far`, the tag beyond `GHOSTS.tagFar`, posed only within `AVATAR.poseFar` m (a
13-bone IK pose + matrix update, ~0.05 ms). **Triangles per avatar: 3 582 – 3 794** (the 8 hairstyle × sleeve variants; `avatarTriangles(v)`;
the earlier merged dummy was 1 652), before and after: one draw call each, no texture (so nothing on the low-memory mode's texture
budget; a variant's base geometry ≈ 0.4 MB, built lazily, an avatar owns a 45 KB colour attribute, a 13-bone skeleton with an 8 × 8 float bone
texture and a material). One name tag texture (256 × 64) per distinct name, shared, disposed with its last ghost. Nothing exists without
other players. Our own mirror image (#691): +1 draw call and ≈ 3.7 k triangles inside the mirror pass only (while a mirror reflects and
the frame is not a held one), posed lazily from the pass; the main camera never draws it. perfcount is unchanged (no players there).

## iPhone loses the WebGL context after one very long frame (#669 — not verified on a device)

Crash reports (`/crash/public`, 2026-10-10/11, three iPhone 14 Pro cases, all `low: 1`): fps ~53 → 5–15, **one frame of 4.4–4.7 s**
(`lagMs`), `webglcontextlost` → `restored`, the warm-up `phase` still `compiling` at up 112 s, draw calls 150–220 → 878–906,
`prog` 298 → 299, plus two `Script error.` (kind `error`, up 7 s, `phase: compiling`).

**What was measured** (headless Chromium, iPhone 14 Pro profile 844×390 @3, `?lowmem&perf&warm`, SwiftShader — frame times are
not iPhone times; counts are):

| finding | evidence |
|---|---|
| **The draw-call jump is the shadow pass, not a new view.** | `info.render.calls` is per `render()` and includes the sun's shadow pass: 209 in the first frame, **845** in the frame that redraws the shadow map (the `hitch` log: `shadow:true`, `shadowMap` 11 s under SwiftShader). A shadow redraw every 1 s (levels 0–1; 0.5 s at level 2) lands in any heartbeat sample, so 150–220 → ~900 is normal, not a spike. perfcount phone views stay at 44–305 calls. |
| **A material disposed while the warm-up compiles leaves it in `compiling` for ever.** | three's `compileAsync` polls `properties.get(material).currentProgram.isReady()` in a bare `setTimeout`; a disposed material has no program → `TypeError … reading 'isReady'` (a "Script error." on the device: three comes from another origin), the promise never settles. Reproduced: dispose 5 scene materials while the state is `compiling` → still `compiling` after 150 s (`warm.done` false: no adaptive quality, mirror variants and the draw-everything frame never done). Matches the reports (`phase: compiling` at up 112 s, `Script error.` at up 7 s = when the compile starts). The device's parallel shader compile (KHR_parallel_shader_compile) makes that window long enough to hit. |
| **The heavy stages were each ONE frame.** | Stage 3 (mirror variants) compiles 109 programs in one frame (SwiftShader 1 s sync on a desktop CPU; `lagMs` 4.4–4.7 s on the phone fits ~110 programs × ~40 ms of main-thread shader translation — a *guess*), the draw-everything frames upload ~1250 geometries / ~100 textures at once (8 s and 15 s under SwiftShader). With the warm-up stuck in `compiling`, all of that happens at first sight *while playing*. |
| Not reproduced: the context loss itself (SwiftShader has no iOS watchdog). | The long frame is the best explanation, not proven. |

**Fixes (phones: `sliced`, `lowMemory`; the robustness part is for everyone):**
- `src/warmup.js` `whenReady()` replaces `compileAsync`: every program read is guarded, it gives up after `WARM.timeout`
  (8 s) and never leaves the state machine. After the same dispose test the warm-up runs on to `done` (desktop and phone).
- `sliced` compile (`WARM.programs` 4 new programs or `WARM.compileMs` 20 ms per frame, `renderer.compile` per `WARM.batch` 8
  objects through a stand-in scene; the next slice when the last one's programs are ready, at most `WARM.ready` 1.5 s):
  the most new programs in one frame while warming is 5–15 (draw slices: shadow depth programs), not 109.
- `sliced` draw: `WARM.drawObjects` 120 objects or `WARM.drawVertices` 200 000 vertices per frame (33 slices per pass; the rest
  sit on layer 31 for that one render, the cameras skip it; layers, not `visible`, so children of hidden meshes still draw;
  a single huge merged mesh still gets one slice of its own).
- Diagnostics (`src/crashlog.js`, `frameDiag` in `main.js`): every heartbeat sample has `warm` (`compiling 12/113`, `drawing
  3/33 mirror`, only until done) and `worst` = [CPU ms, new programs, shadow redraw, warm state] of the slowest frame ≥ 50 ms
  since the last beat — the next report shows directly whether a long frame was a compile, a first draw or a shadow redraw.
- #662's values (pixel ratio 1.25, shadow map 1536) are **unchanged**: nothing measured implicates them (the same loss happened
  at px 0.6 before #662).

SwiftShader run, complete warm-up in the phone profile, sliced: `done` after 554 s (every frame is seconds under SwiftShader;
on a phone a slice is a normal frame plus a few ms), 262 programs (old: 242), 66 draw slices, `hidden textures left for later`.

**Interplay with #668 (`prepare()`):** the lamp washes' periodic patch (every 120 frames) recompiles every material made since
the build under a new key; a sliced warm-up lasts hundreds of frames, so `startCompile` and `startDraw` call `prepare()` before
each stage (not only before the first compile). Programs after a full sliced run 262 vs 242 unsliced, the difference probably being
such late recompiles (the "298 → 299 late program" in the reports is the same kind). Materials made after `done` still compile
(and get patched) on first sight.

The first-frame burst above is addressed by #697 below. Still open: materials made after startup (cups, cat coats, new
life items) compile on first sight; `worst`/`warm` in the next iPhone report will show whether those cause a long frame.
Context-loss prevention still needs verification on a real iPhone; #669 remains open.

## Triangle budget over by the basement's bike racks (#704)

`tools/perfcount.html` failed on desktop (big hall 1 020 495 > 1 000 000) after #683's realistic bikes. Cause, found by hooking `onBeforeRender` on every drawn mesh at the view and diffing against c5a1a9e: the garage bakes every rack's bikes (2 104 triangles each: frame 620, tyres 816, metal 664) and stalls (384 each) into the *area shell* mesh. That mesh is one per area, so its whole bounding sphere is always in the frustum and every bike in the area is drawn from anywhere in the basement: the L-house shell 22.6 k → 77.3 k, the next 14.9 k → 55.3 k, three smaller shells +25 k (about +105 k together), the rest of the increase being doors and the courtyard rack. Not the courtyard's Hus A–C or the other models listed in the issue.

Fix: `bikeGeometry(lod)` / `standGeometry(lod)` in `src/streetlife.js` take a level. Level 1 (near) has 6-sided tubes, a 6×20 tyre torus and 4×20 rim torus (2 104 → 1 552 triangles per bike, no visible change at the distances the old set was judged at); level 0 (far) has 4-sided open tubes, a boxy saddle, a 4×16 tyre and 3×16 rim (756 per bike; stall 240 → 96). `Garage` builds each rack row (per area) as two meshes in the area's own shell material, so the tube light level still applies, and `Garage.update` shows the near one within `GARAGE.bikeLodNear` (10 m, *guess*, plus the row's bounding radius) of the camera and the far one beyond. The row meshes are also frustum-culled on their own. Spokes stay one alpha batch (4 triangles a wheel pair). Cost: +9 draw calls at the big hall (352 → 361 desktop, 281 → 284 phone), well inside the call budgets.

| view (triangles) | desktop before | desktop after | phone before | phone after |
|---|---|---|---|---|
| big hall | 1 020 495 | 922 959 | 873 618 | 757 874 |
| basement | 973 417 | 879 189 | 921 702 | 820 262 |
| bike room | 800 375 | 743 755 | 730 216 | 671 572 |
| bike yard | 750 755 | 739 715 | 703 146 | 692 106 |
| upstairs | 736 479 | 725 439 | 637 118 | 626 078 |
| park | 909 031 | 897 991 | 591 864 | 588 384 |

Desktop peak is now 922 959 at the big hall (budget 1 000 000), phone peak 820 262 at the basement (budget 950 000). The courtyard rack and the bike yard's instanced bikes only got the lighter near geometry (no distance swap); they are the next lever if the budget is hit again. To find what a view's triangles are made of, hook `onBeforeRender` on every mesh, render once and sum `index.count / 3` (× `count` when instanced) per mesh, with the material colour and bounding box to recognise merged batches.

## Phone warm-up before the first complete view (#697)

`WarmUp.blocksView` gates ordinary scene and mirror renders on low-memory devices until sliced warm-up reaches `done`.
Compilation starts on the first controlled frame rather than after three ordinary frames. All upload/mirror slices stay
behind the loading screen or the existing resume cover; only the first complete ordinary render releases it. Desktop
warm-up timing and headless skips keep their previous behaviour. Pixel-ratio, shadow and quality configuration are unchanged.

Measured with `tools/firstframetest.cjs`, Chromium/SwiftShader, iPhone UA, 844 × 390 @3, `?lowmem&perf&warm&shot` at the start
view, noon in July. Screenshot mode pins quality 3 (the existing phone limits still apply); the harness pauses the initial
animation loop and drives real `frame(1/60)` calls. Baseline: 339e769; after: 77cb75e plus #697 (also includes #688’s grass
shader/atlas, so this is not a same-geometry frame-time comparison).

| Count | Baseline frame 0 | After frame 0 | After first complete view |
|---|---:|---:|---:|
| New shader programs | 74 | 0 | 0 |
| Buffer uploads (`bufferData`) | 2,692 | 0 | 0 |
| New textures | 111 | 0 | 0 |
| Image upload calls (`texImage`/`texSubImage`, etc.) | 116 | 0 | 0 |

Warm-up finished in 226 controlled frames (35 normal and 35 mirror upload slices). The largest preparatory frame created
7 programs, uploaded 449 buffers and made 17 image upload calls. The first canvas upload slice created 2 programs and
uploaded 341 buffers / 8 images; the initial offscreen environment-map pass during compilation created 1 program.
The regression gate allows at most `WARM.programs + WARM.batch` (12) new programs per preparatory frame, allowing the
compiler to finish its object batch, and exactly zero in the first complete view. All 249 cached programs linked; no
shader or page errors, and five start-view turns needed zero new programs. Public `hideLoading`, `showOverlay(false)`
and screenshot mode kept the loading/resume cover until a real view existed. Desktop/skipped state gates were checked.

These are GL call counts, not iPhone frame times or proof that the iOS watchdog will keep the context. A physical iPhone
check is still required for #669. The loader can remain visible longer while preparation completes; hidden seasonal
textures still upload lazily later, as before.

## Phone draw calls at the start view (#695)

`tools/perfcount.html?lowmem&w=390&h=844` reported 766 draw calls at `start` (budget 370) on one machine and 188 on another.
**Cause: the measurement, not a recent model.** perfcount read `renderer.info.render.calls` after `render()`, but a nested
render inside the frame (three's PMREM regenerating the sky's environment, a mirror's Reflector) resets `info` half-way, so
the count held only the draws after it. Whether a run printed ~190 or ~770 depended on whether such a render fell in that
frame. Counted per draw, the phone start view was 769 / 772 / 772 at b155cf4 (2026-10-09, when `PERF.budget` was set),
6765803 and 73f185e, and 783 on 74bb6c4 — no commit of the last day broke it (the courtyard's grill, benches and playground
merge into their batches; bikes, bins, Olof, the ghosts add a few calls each where they are in view). The phone budget of 370
was set from the under-counted numbers, but every other spot fits it (peak 332), so it stays; the desktop's 520 too.

**perfcount** now counts every `renderBufferDirect` that draws to the screen (no render target, outside the shadow pass) and
sums `info`'s triangles around each one (with `info.autoReset` off for that render); shadow / mirror / environment draws are
printed apart (`+36 shadow/mirror/env` at start: the PMREM). Every spot reads ~4 more than before (draws before the nested
render that used to be dropped).

**Where the start view's 783 phone draws went** (each mesh by its group and position; a temporary hook on
`renderBufferDirect`): ~490 meshes inside the flat that the DetailCuller's sphere test let through the windows (its margin
grows with the radius: a sofa or a fridge "passes" a window it is metres from); 72 outline line sets of doors, lids and
appliances (architecture edges, never culled: the culler took meshes only); 37 our car in its garage stall (under the patio,
underground); 33 the patio's furniture behind the flat; ~40 the fridge and the freezer (every shell, liner, shelf and bin a
mesh of its own, the inside drawn behind the shut door); the rest the façades, backdrops, entrance plants and the street.

**Changes:**
- `src/detail.js`: from outside, a thing is also hidden when (a) its box, projected from the eye onto the façade plane,
  misses every opening; (b) every line from the eye through those openings runs into a full-height wall of its storey
  (`world.openings.walls`: the plan's wall polygons as rectangles, `wallStrip` in world.js; doorways are gaps, half walls are
  left out); (c) it is on Övre plan and every such line climbs through the floor between the storeys away from the stair's
  hole (`openings.slab`). Things beyond the flat (the patio, the garage under it) are judged the same way: a line that meets
  our façade within its width and below its roof goes through the flat, or below its floor through the foundation and the
  ground (*guess*: nothing under our façade opens; not used with the eye below ground). All three are conservative (box ⊇
  mesh, walls only where the plan has them); the sphere test stays. The outline lines (`userData.architectureEdges`) are
  judged like meshes.
- Phones only: `PERF.detail.lowMemoryOutside` 0.7 (*guess*) — small things inside the flat (r < `maxR`) seen from outside go at
  0.7 × their usual distance (the kitchen's jars and cups from the street, ~15 m).
- `src/fridge.js`: shell, liner, glass shelves and door bins merged per material; the inside (liner, lamp, shelves, drawers
  with their stored food) is drawn only while the door is open, like the beer shelf. At the start view the fridge and freezer drew 40 calls, now 15.

**Measured** (perfcount, headless Chromium + SwiftShader, July noon; before = 5ac634a with the new counter, after = this change):

| spot | phone before | phone after | desktop before | desktop after |
|---|---|---|---|---|
| start | 782 | 359 | 849 | 445 |
| kitchen | 187 | 187 | 347 | 347 |
| living | 237 | 237 | 349 | 349 |
| upstairs | 223 | 223 | 325 | 325 |
| patio | 92 | 92 | 112 | 112 |
| courtyard | 163 | 163 | 173 | 173 |
| courtyard bikes | 228 | 223 | 326 | 256 |
| karpvagen | 74 | 74 | 85 | 85 |
| garage | 118 | 118 | 386 | 316 |
| bike yard | 331 | 256 | 342 | 267 |
| park | 177 | 174 | 482 | 414 |
| east | 49 | 49 | 61 | 61 |
| big hall | 287 | 249 | 364 | 295 |
| basement | 322 | 249 | 362 | 289 |
| bike room | 125 | 125 | 149 | 149 |

Phone: PASS (peak 359 calls at start ≤ 370; 822 566 triangles in the basement). Desktop: PASS (peak 445 calls at start ≤ 520;
925 263 triangles in the big hall). Start-view triangles: phone 892 934 → 659 728, desktop 962 303 → 732 493.

**Checked by pixels (desktop 1280 × 800, `&weather=clear`):** at 11 views (the start, the street near / far / oblique / east, the
patio three ways, the doorstep, Karpvägen, the courtyard) everything hidden only by the new tests (58–834 things per view) was
drawn and hidden again in the same frame: 0–16 pixels of 1 024 000 differ (single pixels along window frames). With the front
door open, at the doorstep 0 pixels at 900 × 600 (a few at 640 × 400). Not covered: a mirror inside the flat seen from outside
reflects from its own viewpoint while the culler judges from the eye (as before). Phone screenshots (390 × 844, clear weather): Karpvägen,
the courtyard, the patio and the kitchen are pixel-identical before and after; the start differs in 228 of 329 160 pixels, all
inside the kitchen window (a small thing on the worktop gone at ~15 m: the phone factor) plus a 1-px line on the brick that had
shown through (`/tmp/claude-0/shots695`, not in the repo).

**Not done:** the kitchen's fronts and drawers are an Openable each (2–3 calls apiece, ~30 at start): batching them like the
visited flats' `batchFronts` (#621) is a larger change; the entrance plants (~13 calls at start, one pot, soil and foliage
mesh per plant); the street's start view still draws ~170 things through the kitchen window that are really in view.

Leaf-card trees (#679, `src/foliage.js`): the crowns stay one InstancedMesh per batch (site trees + shrubs, courtyard plantings,
vines, southern woodland) on ONE shared material and atlas, so draw calls do not change. Per lobe 60 triangles (phone 56)
instead of 80, trunks 46 instead of 28 (a leader and three branches); the cards are single quads drawn two-sided. Textures:
one 512² leaf atlas (256² on phones, a `DataTexture`, ~1.3 / 0.3 MB with mips) and two 64 × 128 bark textures. perfcount on
84c3207 without → with (calls unchanged at every spot; the `start` spike to 768–837 calls is #695 and comes and goes in
both): desktop kitchen 628 034 → 621 648, park 895 157 → 893 663, big hall 1 007 801 → 1 006 343 triangles (over budget
before as well, #704); phone kitchen 437 230 → 426 064, park 579 166 → 571 220, basement 915 934 → 908 628; textures
~297 → ~298 MB desktop, ~81 → ~82 MB phone. One new program pair (leaf material + its alpha-tested depth variant), compiled
by the warm-up like every scene material. No distance LOD: an InstancedMesh draws every lobe; fewer cards on phones only.

Combat collision (#715) uses a capped conservative private occupancy grid, prepared incrementally with native-raycast fallback. [Actual-scene CPU update measurements and cold-build limitations](../validation/issue-715/README.md) document the confirmed desktop gain; these are not rendered-frame/FPS measurements or physical-phone validation.

Cold-path diagnosis (#715): `combatWorldMetrics().lastPath` holds one copied record of the latest **completed** asynchronous obstacle query (completion order, not start order for concurrent callers). It records `result`, `reason` (`clear`, `blocked`, `deadline`, `cancelled`, `cache-invalidated`, `instance-mutated`, or `error`) and final `stage` (`prepare`, `cache`, `traversal`), plus elapsed time, active intervals between yields, total yielded wall time, the subset spent awaiting promoted cache entries, maximum active slice, promoted-cache count and deadline overrun. Read it with `const { combatWorldMetrics } = await import('./src/combatworld.js'); combatWorldMetrics().lastPath` on the game page after the shot resolves. Active intervals are wall-clock measurements, **not thread CPU or GPU time**; yielded time includes other tasks, cache construction and scheduling delays and does not isolate each cause. No scene objects, player identifiers, paths or history are retained or uploaded. A delayed deadline callback can overrun while the query is yielded; elapsed time alone does not prove one long synchronous raycast. The native 2 s deadline, scheduling and hit decisions are unchanged. See [new evidence and scope](../validation/issue-715/README.md#cold-path-diagnosis-2026-10-13).

Nerf (#714) adds bounded private spatial indices and per-shot instanced selection, with cooperative obstacle validation and a conservative 2 s deadline. [CPU-only apartment validation, preparation and cold-miss limitations](../validation/issue-714/README.md) separate the actual scene from small-module/Worker tests; no measured FPS or physical-phone claim.


## Cold triangle copying (#715, 2026-10-13)

TriGrid still constructs the same Float32 world-space triangles and synchronous cell map. Copying a world
vertex now uses three scalar stores instead of allocating `[x, y, z]` and calling `Float32Array.set` for every
vertex. Groups, private bounds, binning, hit traversal and invalidation are unchanged; no new background jobs,
quotas or readiness states are introduced. Separate native constructor-phase measurements on the production
furniture component found transformation/copying dominated the tested cases, rather than cell binning.
Independent historical-source parity and balanced uninstrumented construction/actual Darts samples establish
less cold work in those component fixtures; no measured reduction of the earlier full apartment's 625 ms spike
or physical-phone FPS is asserted. [Measurements and limits](../validation/issue-715/README.md#cold-triangle-copy-follow-up-2026-10-13).

## Phone panels and covered rendering (#669)

Reading the freezer note previously set the moving-shadow hold for 1.5 seconds even
though it only opened DOM. This requested the full shadow pass on every frame.
The note no longer requests that hold. Doors and other moving shadow casters keep it.
After startup and warm-up, phones keep simulation, DOM and network updates running
while drawing at most once per `LOW_MEMORY.coveredFrameMs` under reading/pause panels
(100 ms, a conservative assumption rather than a device measurement). The opaque
portrait instruction and hidden document suppress those regular scene/mirror/shadow
renders. Closing the panel or returning to landscape draws the next gameplay frame
immediately. Quality adaptation is reset while the phone view is covered; fast
logic-only callbacks must not be mistaken for spare GPU capacity.

Warm-up, the first complete visible frame and explicit `&shot` mode retain their
usual rendering. Shadow time accumulates over skipped draws; simulation time and
multiplayer updates are not throttled. `tools/phonepaneltest.cjs` uses the real app,
real WebGL and a controlled clock to compare draw/pass counts, not physical FPS or
proof of a fixed iPhone watchdog failure.


Current local cold Marks diagnosis (#715): after private-bounds rejection and scalar TriGrid copying, the native production-furniture component's actual Marks mesh collector still spends most cold overlapping/distant query time scanning private bounds. The diagnostics driver separates instrumented scan/grid/hits/native/residual intervals from uninstrumented query/Darts timing; it changes no production runtime. See [current samples, reproduction and limits](../validation/issue-715/README.md#current-private-bounds-diagnosis-2026-10-13). These component intervals neither attribute the previous full apartment 625 ms spike nor measure phone FPS.


The subsequent #715 scalar-bounds mitigation keeps native getter/extrema semantics and all transforms/padding/cache behavior. Independent baseline/native parity and balanced uninstrumented furniture-component runs reduce whole-list cold query/Darts work, with no warm gain and a measured regression for the isolated largest mesh. [Exact samples, retained failed stochastic attempt, deterministic parity inputs and limitations](../validation/issue-715/README.md#scalar-private-position-bounds-candidate-2026-10-13) prevent extending that result into an unmeasured apartment/phone claim.


Current full-apartment diagnostic (#715, source d962618b) retains a local cache-cold 90.4 ms effect-update spike and incoming/obstacle cache waiting after a 30 s scheduler window. It is one no-test/quality 0 same-browser injected-effect sample, not reciprocal combat, a native before/after or phone-FPS proof. Idle startup rendering, shadow intervals and later render calls are separated and retain their actual different draw counts. [Raw-case summary, provenance and finite remaining investigation](../validation/issue-715/README.md#current-actual-apartment-diagnosis-after-scalar-bounds-2026-10-13) records no remote-warm claim and no additional runtime change.


### Combat cache queue selection (#715)

`combatworld` now reuses a cache-job selection within one synchronous builder callback until the queue head changes or spatial completion changes eligibility. The original urgent-first/spatial-first order, every between-operation budget check, timers, admission limits and raycast/cache algorithms are preserved. The former implementation searched hundreds of queued jobs again for every vertex/triangle/bitmap cell. `tools/combatcachetest.{cjs,html}` retains the unchanged historical source, bounded phase diagnosis, complete operation/buffer parity, independent native hit metadata, urgent/invalidation/disposal/large-AABB checks and uninstrumented reversed-order callback-throughput observations; it loads actual Three without WebGL or the apartment. Existing `combatworldtest.html` remains the broader native query/path regression. [Results and limits](../validation/issue-715/README.md#cache-queue-selection-remedy-2026-10-13).

Spatial readiness and bitmap readiness are distinct: the existing scheduler postpones bitmap filling while any admitted spatial view remains unfinished. `fallbackQueries` increments for a nonempty ray candidate before rangedHits, including spatial-accelerated traversal; it does not count only full-mesh native raycasts. The new representative 804-job component shows greater spatial progress in the same 100-callback allowance, not actual apartment readiness, full effect/frame time, thread CPU/GPU work or physical-phone FPS. Source-stamped raw results are saved before native result screenshots; incomplete later phases cannot produce CLI green.


`nerfapartmentprobe.cjs --cache-acceptance` provides a separate finite ordinary-app check of the cache scheduler: native 30-second callback progress, actual scene geometry/cache counts, independent native solid-hit metadata before/after, actual local/incoming Darts and deadline query, followed by two quality-0 native draws and one bounded CDP PNG. Automatic app-loop registration alone is paused; native clocks/idle/rAF callbacks remain active. Source-stamped checkpoints precede images and retain failed or incomplete final phases. [Current observations and validation limits](../validation/issue-715/README.md#actual-apartment-cache-acceptance-after-scheduler-selection-reuse-2026-10-13). First-run CLI 1 is retained for the erroneous four-children-per-dart fixture assumption; production darts have two meshes each/four combined. No CPU/GPU/FPS or causal cross-host before/after claim follows from that partial result.

Corrected actual-app cache acceptance: 17 checks/real CLI 0, 118.987 s, no source mismatch/page errors; native 30,000.2 ms progresses 0→31 spatial-ready with 804 pending/0 bitmap-ready. The clear obstacle finishes within its original 2-second deadline. A root-reviewed actual 480×300 CDP image shows the ordinary room/gun and local/incoming darts; this remains same-browser injection with a paused app loop, not a fully warm cache, reciprocal WS PvP, a phone measurement or a causal before/after benchmark. The first wrong-hierarchy fixture run remains CLI 1/image incomplete.
