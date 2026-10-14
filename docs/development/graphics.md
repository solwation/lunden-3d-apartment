# Graphics, materials and lighting

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [performance](performance.md), [plan-material](plan-material.md).
## Module and test map

```text
src/neighborglass.js   opaque MeshPhysicalMaterial for unmodeled neighboring interiors (#516), shared by exterior.js's
                       ordinary/occupied/entrance glass batches. One six-face 128 px procedural CubeTexture is reused;
                       clearcoat and view-dependent envMap reflections, no live mirror pass or additional lights.
                       Night lowers environment intensity and preserves existing warm occupied-window emission.
                       #569 also shares this environment across ABC's listed openings/loggia/entrance glazing and
                       the nearby mapped school's panes. surroundings.js batches ABC frames into the existing white
                       trim mesh, adds one seal batch and replaces flat window decals with three opaque panes per
                       actual opening. Existing lintel/sill soldier courses and night light quads stay; sitebackdrop.js
                       keeps the school's arches/spröjs in their historical trim batch. neighboropeningstest covers
                       actual ABC pane visibility/bounds and night routines; eastbackdroptest retains source geometry.
                       NEIGHBOR_OPENINGS centralizes visual assumptions; reflection is a generic outdoor impression,
                       not a surveyed or live reflection of surrounding buildings. L1007's clear materials are independent.
src/visitlights.js     lamps of the visitable empty flats (#620): a ceiling lamp per room (a flat fitting in Kök / matplats, Badrum,
                       WC/dusch, Tvätt; a lamp outlet with a bare bulb on a cord elsewhere — VISIT_LIGHTS, *guess*, the brochure
                       says nothing), a switch by each room's door (lights.js `switchSpots` + `Switch`, `VISIT_LIGHTS.manual` /
                       `manualShared` for door-less rooms), all off at every visit, nothing saved, no score. The light is ONLY a
                       second lamp wash (lampwash.js `buildLampWashes(…, { suffix: 'V', boxes })`: shader names, uniforms and
                       the cache key carry the suffix, so one material can carry L1007's set and this one; each lamp brings
                       its own walls `segs` in world coordinates and its own level split `lamp.split`, and the flats' boxes are
                       tested first): no pool light, no new shadow light. The fittings of a flat are ONE merged mesh whose lit
                       state is a per-vertex `lampOn` added to the emissive colour; the switches live in the flat's group and
                       `unit.detail`. `lights.supply` scales it all (#604). tools/visitlightstest.html: switches on wall faces, E,
                       wash and fitting on/off, a real brightness change, power cut and mend, no light objects, a reload starts dark.
src/architectureedges.js sharp architectural edges (#474), captured before loose furniture/decor is added;
                       excludes transparent overlays, cabinet contents and explicit loose roots. One static batch per floor,
                       one per moving door/fitting/lift anchor; 30° creases, no triangle diagonals, 1 mm depth bias with depth testing.
                       #505 filters coplanar construction seams against the solid union and open wall planes;
                       a temporary triangle tree accelerates baked solids. core.js retains edgeSources while baking
                       so open wall panels and individual blocks stay distinguishable. #603: every edge is also split where
                       another crease of its anchor meets or crosses it (a 0.25 m crease grid), since a merged Batch's bounds
                       hide its blocks (the worktop round the sink, vanity tops, thresholds). Moving anchors remain separate.
                       world.js and core.js build them once; furniture and loose things have no outlines. tools/architecturetest.html
                       verifies batching, exclusions, moving doors/lift, no box diagonals, the merged worktop's seams (#603) and real WebGL occlusion.
textures/              image textures the page loads (published by stamp.sh): stair-pictures.jpg = the 2 × 2 atlas
                       of the stair pictures (#220), cropped/straightened from docs/tavla-trappa-*.jpg; angsgras-sovrum1.jpg = the picture over the
                       Sovrum 1 bed (#284), straightened, reflections painted out; miele.jpg = the cat photo in the window-board
                       frame (#322), cropped and straightened from docs/miele-foto-ram.jpg; linjeteckning-sovrum1.jpg = the line drawing over the RÅGRUND
                       chair (#404), docs/tavla-sovrum1-linjeteckning.png on pale paper inside a white mount;
                       eat-sleep-game-repeat-sovrum2.jpg = Sovrum 2's neon print (#430), cropped inside the frame and straightened
                       from docs/tavla-sovrum2-eat-sleep-game-repeat.webp
src/ao.js              baked ambient occlusion: distance field → multiply overlay on floor/ceiling (AO)
src/lights.js          room switches (E), ceiling lamps/pendant/spots/LED (by hand only), small lamps (FloorLamp:
                       E, and they switch themselves with the dusk, #234); a pool of 4 point lights goes to the lit
                       lamps that matter (own room, in sight, nearest), fading when it moves
src/weather.js         weather (WEATHER, #248): a seeded draw per date (`showersOn`, `rainAt`): showers in spring/autumn (a little
                       in summer, none Dec–Feb), thunderstorms 20 Jul – 31 Aug; follows the clock/calendar. Rain = one
                       LineSegments of streaks around the eye ending on the ground or a roof (`roofAt`: the house boxes of
                       greet.js `occluders` + our unit; a walkable roof's real top where there is one, #360), DayCycle `overcast` (grey sky, fog, weaker sun) and `flash`
                       (lightning), sfx.rain (muffled indoors) / sfx.thunder after distance / 343; sitting in our car (#664) `cabinMix(car.openness)` (CAR.cabin, *guess*) knocks the rain down and dulls it with all doors shut (-18 dB, 800 Hz low-pass) and lets it through with a door open, fading with the door's angle, thunder likewise (the car's roof box already keeps streaks out of the cabin; `tools/carsoundtest.html` measures the levels with an AnalyserNode and counts streaks in the cabin); the small lamps come on
                       earlier, the parasol folds; the HUD shows the weather symbol (#660); `&weather=rain|storm|snow|hail|clear`, `&temp=°C`, `&year=` (with `&month=&day=`).
                       Temperature and real weather (#674): `weather.temp` (°C, outdoors even inside the flat; the badge shows it beside the symbol). `simTemp`: the
                       month's mean (`WEATHER.climate`, *guess* from memory of Skåne's normals, mid-month points eased into the neighbours) + a seeded per-date offset
                       blended across midnight + the day's swing (low 03:00, high 15:00) + sun on a clear afternoon − showers; snow capped at 0.5 °C (forced `&weather=snow` ≤ −2 °C). Recomputed 4×/s.
                       `state()` takes real data first when `weather.real` (src/realweather.js) has the hour, else the seeded draw; a switch between the two eases rain, cloud and temperature
                       over `climate.fade` s (`ease`; `&weather=` forced weather is never eased). Real: Open-Meteo hourly `temperature_2m`, `precipitation`, `rain`, `snowfall`,
                       `weather_code` for the anchor (lat 55.685, lon 13.181, 3 decimals) a month at a time, mapped by `hourState` (snow if snowfall > 0.05 cm or WMO 71–77/85/86; hail 96/99;
                       storm ≥ 95; rain by precipitation 0.35…1 at `rainMm`; cloud by WMO code 1/2/3/45/48) and blended between hours; the id of a shower is its first hour (counts once).
                       Months over for more than 7 days: archive-api.open-meteo.com (ERA5; cached for good); newer months: api.open-meteo.com up to 6 days ahead (cached 3 h); further ahead:
                       simulated. Fetched asynchronously 1.5 s after the first update, never before; failures (offline, HTTP error, wrong body) are silent and retried after 5 min.
                       Source and terms: Open-Meteo.com, weather data CC BY 4.0, free for non-commercial use without a key (attribution: credited in this file and shown on the start screen under *Om musiken* as `#weather-credit`, always visible, link rel=noopener to open-meteo.com, #700; README too). The cloud
                       session that wrote it had no access to the live service: **the real request/response were not verified against open-meteo.com** (built from its documentation, tested with
                       `tools/fixtures/openmeteo-2024-01.json`, a hand-made fixture) — try it once on a real machine (`?year=2024&month=1&day=10` should give real January weather). Automated
                       browsers (`navigator.webdriver`) and `&shot` never call the service unless `&weatherapi=/path/file.json` (same-origin fixture, replaces both URLs) is given; `&realweather=0` turns it off.
                       #249: each shower has a `kind`: snow (mostly Dec–Feb; slow swaying Points, a lighter sky, silent),
                       hail (spring, and at the start of some storms; white pellets that bounce once and lie a moment, a
                       louder rattle); ❄️ / 🧊 in the HUD. Walking WEATHER.experience.metres outdoors while it falls calls
                       `onExperience` once per shower → stats walkRain / walkSnow / walkHail / walkStorm (big points the
                       first time, a little each later shower; a badge every time)
src/groundglow.js      light without lights (#434, #433): additive fall-off decals — `poolGeometry` (an ellipse draped over `groundY`),
                       `washGeometry` (an upright one on a wall), `glowMaterial` (one per set, opacity = the level), `fadeGlow`
src/daycycle.js        60-minute day: real solar path for the month (55.7° N), sun → moon light, shader sky
                       (glow, stars, clouds), fog colour; paused / spooled by the wall clock
src/blinds.js          pleated blinds, bottom-up (BLINDS, #273): one per window in the reveal on the room side of the frame
                       (the living room's split window: two), `blind: 'dark' | 'light'` per WINDOWS entry; the fabric (a
                       zig-zag rebuilt only while it moves, castShadow) + the top rail are two meshes per blind, the bottom
                       rail / cords are baked; E opens #blind-panel (BlindPanel, reading mode like the clock's strip): W / S,
                       ↑ / ↓ or ▲ ▼ held; the visitor's room loses daylight (`DayCycle.dim`) by its blinds' cover; a white
                       one glows by day and warm from a lit room (`lights.roomLit`); localStorage 'lunden.blinds'; F keeps them
src/curtains.js        Sovrum 1's curtains (#342, CURTAINS): two floor-length teal jungle-print panels (our own canvas print) on a white
                       ceiling track under the soffit from the west wall; a split (#362): they meet at the window's middle and part
                       to either side, the same share of their way (the west one to an end stop by the west wall, #403: the RÅGRUND
                       chair moved south out of the corner; both stacks clear of the glass); wave folds rebuilt only while they move (count fixed, spacing shrinks); part of Blinds
                       (`blinds.curtains`): E opens #blind-panel sideways (A / D, ← / →, ◀ ▶ held: together / apart), the daylight cut (`dim`, less than blackout), a teal glow by
                       day, saved in 'lunden.blinds'; fittings: F keeps them; stats `curtains`; `&curtains=0…1`
                       #463: Vardagsrum has three botanical linen panels on a wall-to-wall rail over the patio door too. Optional
                       CURTAINS.panels defines each closed span and parking side; cover sums the window overlap.
                       #464: kitchen valance is one short panel (hem 2.45 m), initially spread along the existing rail, dim 0.03.
                       #468: every rail spans the room's side-wall faces (CURTAINS.rail, plan.json); kitchen cloth spans the full width too. #566 gives the living room its own dense dark-green IKEA leaf print on white (IMG_0571); kitchen fabric stays unchanged.
                       Its '-valance' state id avoids inheriting the removed long curtains' position; subsequent positions save normally.
src/lights.js #604     the mains (`setSupply`, 0 … 1, from power.js): every glow, pool light (not a `fire` lamp: the grill) and wash
                       × supply; `room.on` / small lamps' on are kept through a cut; `roomLit` false; `FloorLamp.glow` = k × supply (the tree)
src/lampwash.js        every lamp's light wherever the visitor is (#276, #294, #295, LIGHTING.wash): each pool anchor (small lamps
                       and ceiling lamps) lights the flat inside the lit materials' own shaders (`patch(scene)`: onBeforeCompile on
                       every MeshStandard/Lambert/Phong material, re-scanned every 120 frames; no extra mesh or draw call) exactly
                       like its pool light (same fall-off and range, Lambert on the surface's colour, no specular), only where it
                       sees: its visibility polygon (rays to walls, closed doors but not wardrobe fronts (#297), the façades' outer faces) is a row of a float
                       texture; lamp data in a small float texture. It shows k × (1 − pool) and the pool light k × pool (cross-fade,
                       Lights.update → `set(i, k, pool)`), so a lit room looks the same near, far, upstairs or from outside
src/mirror.js          the one mirror material (gradient + glints; hall and bathroom mirrors); the lit mirrors (Badrum LED, Hollywood, Klk) use `litMirrorMaterial` + `litEmissive` + `litReflect` (LIGHTING.mirror, #339)
src/reflections.js     mirror images: a Reflector per mirror, only the nearest one in view (< 4 m) renders; `dim` scales a lit mirror's image (#339)
                       Our own avatar in the mirrors (#691): `setMirrorExtra({ before, after })` runs around each reflector pass (not on a held frame), ghosts.js
                       puts our solid avatar (src/avatar.js, id `me:<name>`) where we stand, looking where we look, with the weapon in hand, walking
                       by the ground speed of the last frames, poses it only then, and hides it again; the main camera never sees it. Same pass, same
                       target: +1 draw call and ≈ 3.7 k triangles in the mirror pass, nothing otherwise. Not while seated / lying (`mirrored`
                       callback), never in raycasts (hidden outside the pass, under the ghosts' group). Windows and glass use the env map, not a live image, so they show nothing.
                       Own typing (#743) uses that same before/after hook and reflector pass: one non-raycast Sprite, hidden afterwards from the main camera.
                       A lazy shared 512×96 RGBA atlas (192 KiB, no mipmaps) holds twelve pre-drawn “Skriver”/dot phases; frames change UV offsets,
                       without repainting or marking the texture dirty. The sprite reuses ghost tag dimensions and its existing above-head anchor (there is no own name tag). Owners lease one
                       material/texture; reset, self-name replacement and disposal release the lease, with the last owner disposing both resources.
src/seasons.js         month → tree colours/leaf cover and snow on ground, roofs, hedges, paving (SEASON)
src/huego.js           the Philips Hue Go on Sovrum 1's window board (#409, #428, HUE_GO): the classic frosted bowl, a lamp of its own; its
                       action menu (#367, an ActionSet; FloorLamp `options`) = Tänd/Släck + Byt färg (scenes), the colour kept by keep.js
src/screens.js         TV programmes drawn on a canvas (PROGRAMS: space, underwater, superheroes, unicorn …), channel
                       snow, the Ambilight colour per programme; `Screen` is shared by the TVs in furniture.js
tools/mirrortest.html  headless test: in front of every mirror its Reflector is the active one, on the glass (#139); our own avatar is drawn once inside the active mirror's pass, hidden again after it and not at all when no mirror reflects (#691)
tools/weathertest.html headless test (#674 too: simTemp, RealWeather against a mock service, the fixture in the page, 404 → the draw, cache on a second load, future → simulated, `&temp=`): showers per season, thunderstorms only in late summer, a shower ramps in; with &weather=storm:
                       drops (none inside Hus L), grey sky, a flash and back, ⛈ in the HUD; snow only in winter, hail in
                       spring / storms, snowflakes not in Hus L, walking 20 m out in it counts once, not indoors; clear = no rain
```

## Recent implementation notes

Takgardinernas ljus (#499): `CURTAIN_LIGHT` samlar antagen svag transparens, diffus transmission, råhet och genomlysning. Alla sex `Curtain`-uppsättningar använder matt, lätt transparent tyg med `depthWrite` och `forceSinglePass`; de vanliga täta skuggorna stoppar direkt sol. `daylightCut` styr rummets befintliga diffusa fyllnad via `Blinds.update`, fullängd från gemensam transmission, kappans lilla bidrag från `spec.dim`. Plissématerial och vertikal styrning är oförändrade; inga nya ljus/renderpass. `curtaintest` verifierar även alla sex lagrade lägen efter riktig omladdning och tygens dags-/kvällsgenomlysning. Vyer och begränsningar: `docs/validation/issue-499/README.md`.


Basin mixer levers (#526): interior.js supplies side-mounted pins for kitchen/laundry goosenecks and top paddles for the two vanity mixers. Their positions and proportions are assumptions in TAP_LEVER, with the existing mixer finish. Tap in water.js adds one merged dynamic mesh per basin, tagged moving for the detail culler, and a widened elliptical pick at the control rather than the outlet. outlineRoot targets that physical lever. Lever progress follows isOpen with a reversible 0.24 s eased lift; flow and sound synchronize even after an external state change. Water outlets/handwash/dish/fill APIs keep their existing positions. Taps remain transient across reloads (keep.js); new/reset visits start shut with handles down. Showers retain their thermostat controls. watertest checks all four levers, touch/desktop use, nozzle rejection, quick reversal, live state, sound stopping and an actual reload; cuptest and life2test sections 382/383 cover jug filling and dishes. Four extra draws at most; no new material/light/render pass.

Focus material lamp scans (#548): InteractionOutline tags its temporary shader material with INTERACTION_MATERIAL_SOURCE. LampWashes.patch follows that original source, so its periodic 120-frame discovery scan cannot insert duplicate lamp declarations into the focused shader. The wrapper reads the current original compile hook and cache key, including a first lamp patch while the object is already focused. No extra geometry, passes or lighting; original materials, live uniforms and appearance forwarding remain intact. interactionoutlinetest covers repeated scans on Standard/Physical materials, the real closed entry door, and discovery during focus.

Focus materials (#558) survive focus exit and are reused by source/index; the source material disposal releases all cached variants. Instanced figure selection is a shader uniform, so walking the eye across people does not generate a distinct GPU program for each figure. Dynamic getters still forward live source appearance and lamp shader hooks (#548). Tests: focusperftest and interactionoutlinetest.

Plant wind (#518): `src/plantwind.js` adds a shared vertex deformation to explicitly selected foliage materials and the matching sun-depth material; existing lamp wash and interaction brightness hooks remain composed. Height/phase/stiffness attributes survive static material merges. Two shared uniforms update per frame, with no vertex uploads, extra light or draw pass. `PLANT_WIND` caps displacement at 6 cm per horizontal axis; pots/soil and collision/interaction positions remain static. Rendering spheres include sway margin without changing model dimensions. See plants.md and tools/plantwindtest.html for WebGL pixel verification.

Living-room curtain print (#566, #570): `ikea_leaves` in `curtains.js` redraws broad organic lobes from `docs/gardiner-vardagsrum-ikea-img-0571.jpg` as a seamless canvas repeat. Under #570 the ink colour matches the living-room rug's olive green (`#5a6150`) for harmony with the room, keeping the dense pattern and crisp white ground. Fine thread lines cover both colours. Existing cloth UVs gather with the folds, with no new material, mesh, light or render pass; #499 opacity/diffuse transmission/shadows remain. `curtaintest` checks actual texture coverage/colours, fixed UVs through movement, kitchen independence and the existing six-room interaction/save/light checks. #584 halves the repeat (`tile` .90 → .45 m, read off the photo with a *guessed* 145 cm panel width) so the lobes are ~12–16 cm like a dense textile print; the canvas's mipmaps and anisotropy 4 keep it free of moiré at distance, and `curtaintest` checks the repeat stays ≤ .5 m.

Hall mirror night light (#572): `HALL_WALL.tall.nightLight` gives the entrance NISSEDAL a warm-white LED strip round the frame's outer back edge (one merged emissive mesh), a soft additive halo on the wall behind it (`glowMaterial` with its own rounded-rectangle fall-off texture, one mesh) and an invisible pick box over the glass. keycabinet.js returns it as a small-lamp spec (`hallWall.lamps` → `world.lamps`), so lights.js switches it with the dusk (LIGHTING.auto, follows the clock), E on the mirror toggles it, and it shares the existing pool lights / lamp wash (one anchor `out` m in front of the glass) — no extra light, pass or reflector. It lives in the mirror's group, so Möblera om carries strip, halo and anchor (rearrange.js moves the anchor, main.js re-bakes the wash). Strip width, halo reach, colour and light are *guesses* by eye. loosemirrorstest checks the anchor follows the mirror; lighttest toggles it with the other lamps.

Christmas tree lights (#571): no light of its own per bulb. The tree is a small-lamp spec (`julgranen`, `auto: false`: lit whenever the tree stands, E toggles it) with one pool anchor `XMAS_TREE.ahead` m in front of it, so it shares the pool lights and the shader lamp wash like the floor lamps. The 160 bulbs are one InstancedMesh of unlit cores plus one additive `Points` halo layer (the shared groundglow fall-off texture), recoloured on the CPU every frame by christmas.js (a per-bulb sine shimmer + a slow wave up the tree, × the lamp's fade `k`); the star's emissive is the lamp's `shade`, its halo an additive sprite. Hidden furniture's lamps give no light: lights.js `shown` also checks `userData.seasonHidden` on the lamp's object and its parents (`roomLit` too). Colours, counts and strengths are *guesses* by eye ([day/night screenshots](../validation/issue-571/README.md)).

Shadow receiving on hand-built fronts (#602): the sun is the only shadow-casting light, and the house's walls and ceilings are what keep it off indoor surfaces. A mesh with `receiveShadow = false` ignores that, so the low evening sun (SUN_LOW, orange) lit it straight through the house: the cup cabinet's door (`cups.js`, built beside the merged row whose `Batch.meshes()` receive) looked lighter and more yellow than its neighbours at dusk, the same `M.front` material notwithstanding. Every opaque part of a door built outside the merged rows sets `castShadow = receiveShadow = true` (cups.js, the laundry wall cabinet in cabinets.js, the hall's key cabinet). `cupshadetest` compares the closed cup door's pixels with its neighbour's at noon and two evenings (≤ 3 per channel; it measured 14 before) and checks those hand-built doors receive shadows. The same goes for the flat things that move with a door or drawer (#607): the changelog note on the freezer (changelog.js), the task card inside the cup door (tasks.js), the name signs on Övre plan (signs.js), the hob's body (hob.js; its glass top already received), the letter box's plates and flap (world.js `letterFlap`) and the Spider-Man suit in its drawer (spidersuit.js) set `receiveShadow`; they lit up warm in the low sun before. Only receiving: no extra caster in the shadow pass, so the shadow budget is unchanged, and the planes cast nothing, so no self-shadow acne. cupshadetest checks them all. #609 did the rest of that sweep: the coffee maker's cord and every wall plug (`sockets.js` `plugAt`), the toaster's label, lever, cord and plug (toaster.js), the pan's handle (pan.js), the secretary's drawers with their knobs, key and contents (furniture.js `trinket` and the secretary's `moving` drawers), the smart display and smart speakers (nest.js) and the SYMFONISK speakers' opaque parts (furniture.js `symfonisk` `add`; the transparent lamp shade still only casts). cupshadetest checks each named openable and the toaster.

### Reusable curtain textile choices (#997)

Each real Curtain exposes one category `gardin` textile surface shared only by its own existing panels. Bounded per-set material variants preserve DoubleSide, opacity/depthWrite/forceSinglePass, shadows, roughness and the original emissive-light response. `map` and `emissiveMap` stay paired; both light-wash hooks are installed through the existing prepare callback. Original is the exact original material/map pointer. Generic 128px maps are cached by choice and original tile scale; their 0.4m physical repeat is a visual guess in MATERIAL_LIBRARY.curtainTile. Existing panel UVs/geometry/folds, coverage/transmission, rails and saved movement do not change.

`tools/curtainmaterialtest.cjs` runs actual Curtain/Blinds/Rearrange, source-bound main registration/UI, and two local Worker HTTP browser visitors with zero WebGL in native mode. Native: 21/21 (including actual precise-vertex ray → source-bound main use/access); unchanged rug library regression: 29/29; Worker schema: 12/12. One bounded 640×400/FOV72/DPR1 component renderer produced eight inspected images across all six sets (16/16 checks), including the living-room three panels open/closed. These are component views, not an apartment/physical-phone/FPS claim. Original failed runs and complete producers are retained: native1 called unsupported Color.length; final-native1 incorrectly required globally empty poses after legitimate rug moves; final-native2/3 aimed into open cloth gaps because Panel deliberately retains fixed full-track bounds. The corrected fixture aims precise actual vertices and preserves existing GET poses; no runtime bounds or geometry were changed for these tests.

Publication verification for #997: client Refs96da5b3 follows the actual deployed Worker-first a5c74aa. Earlier progress notes reported 14 render checks by mistake; the unmodified original render1 result contains 16 passing checks (six common, eight image budgets, page errors and source freeze). Final native is 21/21; no image rerun was needed for this reporting correction.

Actual Pages run 38554226716 / job 115819253847 created the client96da5b3 deployment at 2026-10-14T11:06:43.759Z and reported success at 11:06:54.269Z. Root independently matched all 240 published source/data/index hashes. Worker-first remains a5c74aa (run38552880671/job115814826761); the client changes no Worker runtime/catalogue and needs no second Worker deployment.

### Independent indoor cushions and throws (#1014)

The sofa's four cushions/folded plum throw and the armchair's two cushions/draped
grey throw register eight stable semantic surfaces before static merging.
`CUSHIONS` supplies their IDs/names; existing forms, folds, transforms, rest spots
and footprints are untouched. Their six-column original atlas (print/knit/geo/
cord/weave/stripe), vertex tints, UV0 and fleece maps remain exact. No global atlas
or `throwMats` is mutated. Patio cushions/copies remain separate future work.

`upholsterySurface(group,name,{id,category,replaceDetails})` reuses #1010's bounded
private handles and shared two generic pattern maps. Defaults remain
`textile`/`klädsel`/false for existing seating and future bed builders. Only these
decorative surfaces opt into replacing atlas details: alternatives disable
vertexColours and original bumpMap, use metric UV1 for patterns and restore exact
original flags/map/bump/color on Original. Materials keep their identity through
merge, both lamp washes and interaction-outline transitions.

`tools/cushionmaterialtest.cjs GAME LOCAL_WORKER OUT` uses actual sofa/armchair
builders, before-1014 source-bound originals, merge, Rearrange and main terminal
controls. Native has zero WebGL and two genuine local HTTP browser visitors. All
eight parts cycle all six choices; exactly one merged material changes per
non-original part choice and every original attribute/map/flag restores. Raw
per-part UV0/color/map metadata and bounded model counts are archived. Original
geometry/finishes/rest/footprint match the #1010 baseline. Native merged mesh
counts are sofa4→7 and armchair4→5 (+4 total); component draw measurements and
images are separate from full-World or phone performance. `--render` requires
the shared GPU slot. Original component comparisons temporarily pause fixture
polling after the actual GET and choose local Original; native HTTP acceptance
restores the actual accepted R.state and normal polling before exercising UI,
while the renderer keeps explicit component selections stable.

Initial native1 passed33/35 but its two inherited base-cloth assertions wrongly
counted every newly independent UV1 cushion as base cloth. Corrected per-surface
native3/native4 passed36/36; every one of eight parts tests all six choices and
records exact original UV0/color/map flags. Native2 stopped before tests on a
fixture syntax error; both original producers and raw CLI1 logs are retained.
The four-image render1 has actualCLI1 (10/12): its two common Original comparisons
read a local Worker left with legitimate saved choices from native4, while their
before-record was captured before GET. Image/shader/budget checks passed and all
four images were inspected; source hashes match the render freeze. The component
fixture now explicitly selects local Original before its Original comparisons,
without altering accepted HTTP state. No runtime workaround or unapproved GPU
retry was used. Component measured draw calls are sofa4→7 and armchair4→5,
with triangles unchanged11256/6696. This is not a whole-apartment/phone FPS result.

The first post-rebase native run retained34/36 andCLI1: the fixture's local
component Original reset also reached later HTTP-only visitor/reload setups.
It is now explicitly limited to the initial two component-proof instances;
new/reloaded visitors retain the actual GET result untouched. A focused selector
check covers different surface names with the same Original choice, and the HUD
cache key includes both material piece ID and surface ID.

Final #1014 native2 after the bounded component/HTTP separation and HUD fix passed
37/37 (actualCLI0); shared Worker layout tests passed16/16CLI0. Publication
`4b1b0264d63c679132e8260fddeed67069dd6b70` (ch796) records1411 source hashes.
Nine executable whole paths match the final native exactly; incoming food wiring
changed main.js outside all six byte-exact exercised production fragments.
CUSHIONS/LANDSKRONA/LEVELS/MATERIAL_LIBRARY remain equal. All prior changelog raw
rows/publication times are preserved. The rejected4c01b87 push was never published.
Actual Pages38558606214/job115833827515 created this exact client deployment and
reported success2026-10-14T11:44:40.2112767Z. Worker-first remains the actual
573551e deployment described in storage.md. Render evidence remains four
inspected pictures and two passing image/shader/budget checks, with processCLI1
(10/12), not a green render-suite claim or full-World/phone verification.
