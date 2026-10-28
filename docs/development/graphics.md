# Graphics, materials and lighting

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [performance](performance.md), [plan-material](plan-material.md).

Kitchen appliance details (#1043): `hob.js` keeps zone markings and touch controls
in one canvas texture; its thin bevel adds16 triangles. `hood.js` caches steel,
glass and woven-filter materials, with merged shell/filter/diffuser geometry.
Interior supplies the original hood-lamp material to both LED spots, preserving
the existing lamp wash/pool and independent fan switch. The measured kitchen
component adds3 calls/220 triangles, no shader programs or lights.
[Normal-light before/after pictures and limitations](../validation/issue-1043/README.md).
`src/vertexcompile.js` records exact fragment-only compile callbacks so the
phone's tight-frustum proof can distinguish native vertex positions from unknown
deformation. Lamp-wash and foliage normal callbacks retain their original GLSL
and cache keys; a material flag/name alone never qualifies a callback (#1453).

An individual flat A/B/C CoreHouse lobby pane uses `forceSinglePass` with the
same double-sided transparent material. This avoids the redundant back/front
draw for one plane. The condition is exactly one generated pane; multi-pane
batches, including Hus L's noncoplanar glass, keep two passes (#1453).

Clubhouse finishes (#1480): `playroom.js` now reuses `architectureEdges` for the
construction shell, `buildAO`/`buildWallAO` for floor/ceiling/concave-corner
contact shading, and `buildContactShadows` for furniture. It adds five visible
batches only inside the room, with no lights or postprocessing. Exposed trim
comes from the wall union in `clubhousefinish.js`; pass-through headers do not
cast a floor barrier. See [furniture](furniture.md#clubhouse-finishes-1480) and
the scoped before/after evidence in [verification](verification.md#clubhouse-wall-finishes-1480).

Clubhouse materials (#1481): `clubhousematerials.js` adds a surface-ID attribute
to the existing merged batches; its shared Standard-material shader distinguishes
wood, woven cloth, matte paint, metal and staggered floor planks. Colours use
Three's sRGB-to-linear conversion before becoming vertex colours. Procedural
patterns are evaluated in clubhouse-local world metres; cloth weave fades with
pixel footprint. The warm ceiling wash is a static room-local approximation,
not a dynamic shadow light. Geometry remains native during shader compilation,
with an audited callback registered in `vertexcompile.js`. Rounded/crowned
furnishings are built once in `clubhousefurnishings.js`. No extra visible draws,
image downloads or postprocessing are introduced. See the scoped evidence in
[verification](verification.md#softer-clubhouse-rendering-1481).

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
                       #1579 tints each edge by its surface colour × 0.62; #1592: the material is unlit, so one module-level
                       uniform (`setEdgeLight`, shared by every edge material through the same onBeforeCompile, no closure) scales
                       that tint by (hemi + ambient) × exposure / `LIGHTING.edgeRef` (2.6 = the daytime sum, capped at 1). main.js
                       sets it after `day.update`: day keeps #1579's look, night/blinds/garage darkness pull the lines dark again
                       instead of glowing. Lamps (point lights) are not counted, so lit rooms at night get darker-than-surface lines.
                       #1615: a single vertex-coloured material (the A/B/C/L stair cores incl. door leaves, the playhouse shell) counts as
                       one group over the whole geometry, so its edges take the painted vertex colours, not the white base (light grey).
textures/              image textures the page loads (published by stamp.sh): stair-pictures.jpg = the 2 × 2 atlas
                       of the stair pictures (#220), cropped/straightened from docs/tavla-trappa-*.jpg; angsgras-sovrum1.jpg = the picture over the
                       Sovrum 1 bed (#284), straightened, reflections painted out; miele.jpg = the cat photo in the window-board
                       frame (#322), cropped and straightened from docs/miele-foto-ram.jpg; linjeteckning-sovrum1.jpg = the line drawing over the RÅGRUND
                       chair (#404), docs/tavla-sovrum1-linjeteckning.png on pale paper inside a white mount;
                       eat-sleep-game-repeat-sovrum2.jpg = Sovrum 2's neon print (#430), cropped inside the frame and straightened
                       from docs/tavla-sovrum2-eat-sleep-game-repeat.webp; tavla-akvarell-schaslong.jpg = the watercolour over the
                       chaise (#1095, `painting`), from docs/tavla-akvarell-ansikte-foto.jpg cropped, straightened, glass reflections flattened
src/ao.js              baked ambient occlusion: distance field → multiply overlay on floor/ceiling (AO); buildWallAO: one
                       shader overlay per level on the walls — floor/ceiling bands + inner-corner columns (AO.wall, #1074);
                       each quad is wound to face the room whatever the piece polygon's orientation (#1084: rectangle
                       lintels/window infills and L1201's plan were back-face culled); the ceiling overlay's blockers
                       include door lintels and windows so its band runs over openings too; partial-height pieces
                       (lintels, infills) block only over their own height and skip where they run over a wall's end
                       (#1129: door jambs' bands inside the lintel and a doubled strip showed as stripes over doors);
                       inner-corner columns extend continuously across floorHole/ceilHole and slabBottom without floor/ceiling bands,
                       preventing shadow cutoffs and unshaded rectangular gaps in the stairwell (#1273)
                       (tools/wallaotest.cjs, tools/stairwallaotest.mjs)
src/lights.js          room switches (E), ceiling lamps/pendants (`LIGHTING.pendants` styles copper3 #307, silvia #1105,
                       paper #134, string #174)/spots/LED (by hand only), small lamps (FloorLamp:
                       E, and they switch themselves with the dusk, #234); a pool of 4 point lights goes to the lit
                       lamps that matter (own room, in sight, nearest), fading when it moves
src/pendants.js        movable pendants (#1106): every LIGHTING.pendants lamp is built into its own group and becomes a
                       Möblera om piece; parts within `pendantMove.band` of the ceiling stay there, cords stretch (vertex
                       rewrite on a move only), the pool-light anchors and lamp washes (`wash.relocate`) follow; no new
                       draw calls at home (the string lamp's cord shows only when lowered). Visited flats' bare-bulb
                       outlets (visitlights.js) are not pendants and stay fixed. tools/pendanttest.html
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
                       `washGeometry` (an upright one on a wall; #1092: `holes` = the wall's openings, cut out so the glow lights the brick round a window/door, never its glass — the front-door and patio/terrace washes pass them; the Å-husen's loggia washes need none: their glazing stands in front of the wash and hides it), `glowMaterial` (one per set, opacity = the level), `fadeGlow`
                       #1525: courtyard night ground light — every courtyard bollard gets a warm pool (`COURTYARD.bollards.pool`,
                       one `courtyard-bollard-pools` mesh in courtyard.js, hysteresis fade, out in a power cut) and Hus A–C's lit
                       ground-floor windows spill a faint pool in front (`COURTYARD.windowSpill`, one `windowSpillPools` mesh in
                       surroundings.js `buildWindowLights`, per-vertex level = the window's routine level × night). Front-side only
                       (one pass each), hidden by day, no light objects; radii/strengths *guess*. Night perfcount +2 calls max.
src/daycycle.js        real-time day (#1145; DAY.minutes = 24 × 60, was 60): it follows the visitor's clock (frames lost to the dt cap or a hidden tab catch up from Date.now(); `toNow()` = the wall clock's "Nu"), real solar path for the month (55.7° N), sun → moon light, shader sky
                       (glow, stars, clouds), fog colour; paused / spooled by the wall clock. Daylight (#1073): `LIGHTING.sky`
                       blends `overcast` (even sky/ambient/fill, sun 2.2, exposure 1) → `clear` (darker shade side, sun 3.0,
                       exposure 1.5 so rooms stay ~as bright) by daylight × (1 − overcast); night, rain and the garage keep the old light
                       Cloud deck (#1250/#1251, `SKYLAYER`, all heights *guess*): the jetpack ceiling is 320 m. `DayCycle.update` reads the camera height: weather (`overcast` ≥ `cloudy`, full at `full`) or flight approach forms
                       one noise quad (`deck`, procedural, no texture, one single-pass draw, only drawn from `approach` m under `base`)
                       is the layer's underside (grey) / top (white, sunlit); between `base` and `top` the view whitens (fog near/far `near`/`far`, sky shader `uWhite`);
                       above `top` + `fade` m `above` = 1: `oc` = 0 so the lighting is the clear-day blend (sun 3.0, exposure 1.5) whatever the weather below (night keeps the moon),
                       and weather.js drops the rain / flakes / sound by (1 − above). One shadow-casting light as before. #1266: sky and cloud deck shaders include `colorspace_fragment` so their fragment colors match the
                       output color space of the fogged ground, eliminating the horizon edge band. `node` check: climb with `&weather=rain&jetpack`, log `day.above`, `scene.fog`, sun.
src/balloon.js         hot-air balloon above the cloud deck (#1646, `BALLOON`, all numbers *guess*): one merged vertex-coloured Lambert mesh (envelope, basket, rim, ropes; ~900
                       triangles, no shadows, no light). `src/balloongeo.js` holds the pure parts: a wall-clock (`Date.now`) schedule so every client agrees (visible `window` s of
                       every `period` s, scaled in/out at the ends), the circling drift above the deck, the basket floor (`basketFloor`, a standable surface in Player.groundAt)
                       and the rim wall (`basketCollide`). `update` runs before player.update and carries a player standing in the basket; outside its window, underground or far
                       away the mesh is hidden and update returns at once. It stays up while the player is aboard. `&balloon` forces it on; `window.__app.balloon`.
src/birds.js           gulls (#1252, `BIRDS`, all numbers *guess*): ONE instanced draw call (`InstancedBufferGeometry`, 3 triangles per bird: tail wedge + two wings), no lights, no textures, no sound, no
                       raycast. Circling, banking and the wing flap are computed in the vertex shader from per-instance seeds (fixed mulberry32 seed, same flock every visit) and the accumulated game
                       time, so `update(dt, rain, hidden)` only sets uniforms (no allocations). `count` birds (`lowMemoryCount` on phones), the last `high` at `highAlt` m above the cloud deck
                       (hidden by `uHigh` while the deck covers the sky and the eye is below it). The mesh is hidden (no draw) at night (daylight < `day`), in rain/snow/hail (`rain` ≥ `rain`), in the cloud
                       whiteout (`uWhite`), underground and further than `far` m from `BIRDS.center`; it fades in/out (`fade`). `&nobirds` / `&birds=N` for debugging. The program is compiled by the warm-up like every material (three's `compile` also traverses hidden meshes), but with the mesh hidden its link check and buffer upload used to fall in the first frame it showed (#1265, SwiftShader 208 ms vs ~9 ms median, one slow `getProgramInfoLog`, +1 geometry). `userData.warmDraw` makes `WarmUp` (`withWarmVisible`, both the full and the sliced draw-everything passes, the mirror pass too) show it for that one render; it is drawn at size 0 (`uFade` 0), so no pixels, no extra textures, one extra draw call only in that warm-up frame (first visible frame 23 ms). Test: `tools/birdstest.cjs`; perfcount: +1 draw call, +30 triangles where they are in view.
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

### Verona fixed-pad material isolation (#1012)

Only the three movable Verona parts create private fixed-pad material handles.
All original values/UV0/positions/normals and material identity restore exactly;
noncloth steel and decorative neighbors remain independent. Pattern maps use
existing metre-scale UV1 and the shared bounded two-map cache from upholstery.js.
The normal seasonal decorative atlas mesh stays in `userData.keep`; nothing is
added to its weather/box binding or material. No extra draw is expected from the
source isolation; component draw counts are measured separately before claiming
cost, and no whole-apartment/phone performance is implied.

`LUNDEN_SECRET_TEST_INPUTS=… PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/veronamaterialtest.cjs GAME LOCAL_WORKER OUT`
uses actual three-part builders/merge, a real `decorative:true` neighbor, Patio
and dynbox, source-bound main UI and two local Worker HTTP browser visitors.
Native1/native2 passed33/33 actualCLI0, including all six choices, exact Original,
noncloth/neighbor preservation, actual summer/rain/winter loose/box visibility,
ordinary peer/new visitor/reload, stale edits, offline accepted-cache retention,
old move/material concurrency and keyboard/touch. Component comparisons select
local Original only for their initial two fixture instances, restoring actual
accepted state and normal polling before native HTTP acceptance. The separately
granted `--render` path shows three original/pattern pairs in one bounded
900×560 renderer; no World, physical phone or FPS claim follows from this test.

Granted render1 passed13/13 actualCLI0; the external supervisor measured
7.967473475961s, no deadline and no live descendants. All three original/pattern
pairs were inspected. The renderer is900×560; full-page PNGs are900×600 because
the fixture retains a40px blank bottom strip. Each component stays3draws:
sofa23772triangles and each divan6636, before=after; UV1 programs link. All11
recorded driver/Chrome owners and their temporary profile are gone. These are
component images, not apartment/mobile/FPS verification.

#1012 publication88b7b46ea03e875d386f8267cad3fe61cfcbb388 (ch800): final native33/33
actualCLI0 and schema18/18CLI0 after incoming1015 catalogue/culling. All ten
executable/native paths match final test bytes. Publication1414 paths are hashed;
the complete final freeze differs only in changelog, with every older raw row/time
preserved. All ten render sources were recovered exactly. Only catalogue/main
whole files differ from render; full patio.js and whole upholstery.js remain
byte-identical, and final native exercised the combined incoming version.
Actual Pages38561048171/job115841906736 deployed this exact client and reported
success2026-10-14T12:04:30.6937873Z. Worker-first deployment is recorded in
storage.md. Render remains13/13CLI0 with three inspected component pairs and
no World/physical-phone/FPS claim. Full producers, source freezes, owner/socket
samples, supervisor receipt and cleanup remain in worker-1012-artifacts.
### Outdoor cushion and stored fleece surfaces (#1015)

Each actual Verona module exposes one named decorative `cushions` surface,
independent of its fixed `textile` pads. The eight existing cushion specifications
carry explicit `materialGroup` ownership (sofa4/divan1 2/divan2 2). All eight
box copies are still generated in their original order with their original seed,
stack position, atlas/UV0 and vertex colours; only then are they partitioned into
three private-material batches. `surfaceFor` is an optional explicit builder
handle; ordinary cushion callers retain their existing behavior.

#1146 (the user) superseded the divan part: only the sofa row with its backs
carries decorative cushions, so the divans no longer build cushions or a
`cushions` surface, and the box keeps the four sofa cushions in one `sofa` copy.
`PATIO_TEXTILE_SURFACES` still accepts the legacy divan `cushions` id so older
saved layouts validate; the client simply ignores those entries. The #1015
fixture `tools/patiotextiletest.cjs` still asserts the old divan surfaces and
eight-cushion stack.

`linkPatioTextiles(movable)` runs once after Furniture construction and connects
only those named module surfaces to their matching box-copy handles. There is
no scene traversal/global material registry or frame update. The canonical module
choice drives preview, cancellation, original restore and accepted remote state
in both representations. The dynbox has its own `throw-folded` fleece surface.
Original restores the original atlas/bump/vertex-colour flags; generic patterns
use the existing private UV1 material implementation. No season/stow policy,
geometry, seating, lid contents or neighboring decorative furniture is changed.
### Short/long pile on every rug (#1086)

Every rug has a second material surface `pile` (Lugg): Original = Kort lugg (the unchanged flat mesh) or `pile-long`
(Lång lugg). `longPileMesh(item, '#ffffff', flatMesh)` builds the generic variant lazily once per rug: grid spacing
`LONG_PILE.cell` capped at the #1009 cell budget, round rugs mapped onto a disc, bath-mat corners rounded, the flat
mesh's own geometry as backing (still one draw), UVs matching the flat mesh, and finer/more contrasted shade-only
vertex colours (`LONG_PILE.shag`). Its material is a clone of the chosen textile material (map kept, bump removed,
vertex colours on), cached per textile choice, so every colour/pattern also works with long pile. Long pile raises
`rugTop` by `fiberHeight` like #1009, so furniture/cat support follows. The legacy `rug-longpile-bluegrey` textile
choice keeps its own #1009 mesh and wins over the pile surface. All values are visual guesses.
Measured in the full World (headless Chrome, real GPU, quality 3): draw calls unchanged (342 short and long,
living room); long-pile triangles/bytes per rug: living room 31,498/0.89 MB, zigzag 31,856/0.94 MB, round 1.6 m
16,640/0.48 MB, round 0.72 m 5,728/0.17 MB, bath mats 2,852/0.12 MB each — built and drawn only while long.

### Living-room long-pile geometry (#1009)

Only the explicit `living-room` materialFamily accepts `rug-longpile-bluegrey`. The lazy cached opaque mesh uses a dense connected plush surface, smooth deterministic multiscale height/normal variation, a rounded frayed perimeter and the existing backing. It is stylised plush/loft, not individually resolved realistic yarn fibres; the lower rim remains somewhat faceted. All LONG_PILE shape values are named visual guesses. The actual surface spans38.75–59mm including the original12mm backing and2mm floor gap. The flat59mm effective support plane is deliberately a gameplay approximation to the maximum; not every visible point is59mm high.

A fixed156×96 top grid supplies15,229 surface samples. Actual native geometry has32,268triangles/810,540bytes, finite positions/normals, upward-facing top triangles and a hard33,000triangle/1,000,000byte guard. One visible opaque mesh is reused; no alpha layers, new maps or per-frame geometry allocations. Both real light-wash prepare hooks are installed before first render. Original restores its exact material/geometry/top and hides the cached plush without changing the accepted rug pose.

`tools/longpiletest.cjs` uses actual Furniture/Rearrange/Life, source-bound main controls/cat tick and genuine local browser/Worker HTTP peers. Native8 passed18/18 with per-phase timing and no WebGL; the existing support regression passed25/25, retaining #1013's known loose-object reload-XZ difference while checking supportY. Render4-dense passed7/7 in34.481s with one640×400/FOV72/DPR1 renderer and three inspected original/overview/edge images, one actual draw per rug image. It rendered the explicitly frozen older UI/source snapshot; later shared helper/UI changes require meaningful native and critical-block parity, not a new visual claim about the entire apartment. These component/native results do not certify World, physical phones or FPS.

All original producers/logs/images are retained. Native1 omitted world in the fixture; native2 revealed the actual idle-cat support update gap; native3 was only a manual helper control. Native4 and later bind the corrected main tick. Native7-dense timed out at the external60s deadline during reload setup, after10passes; TargetClosed was secondary, no OOM cause is claimed. The bounded native8 rerun retains two real peers, checks same-context reload before replacing that viewing context with a new visitor, and preserves ordinary native polling. Render1 and render2-soft passed technical checks but failed visual acceptance (grass-like/sparse pins); render3-dense timed out before any image in unnecessary second-peer setup. Render4 changes only render mode to one setup; its timer stops after actual GET and Life/cat objects are explicitly hidden for the rug-only views.

Final rebase targets the immutable published base `88b7b46ea03e875d386f8267cad3fe61cfcbb388`, including #1014’s full surface selector and #1011/#1012 upholstery. The seven rendered geometry/material/support/cat blocks remain byte-identical; main’s only product delta against that base is the approved idle-cat guard. Final-schema18/18 passed. The first final-schema invocation failed before tests because its external fixture environment variable was omitted; the corrected invocation retains its own log. Final-native9 and final-support2 both reached the fixed60s parent deadline (60.896s/60.565s), with no live owned descendants. Native9 has exactly8 recorded PASS checks before termination; support2 failed during newPage before acceptance. They were mistakenly launched concurrently; resource contention is a hypothesis, not an established cause. Both raw failures and removed-profile evidence are retained.

Sequential final-native10 completed46.895s with16/18 checks, CLI1. The two failures were the initial45mm support delta and idle Original restoration: its raw idleProbe began/stayed59mm because native9 had accepted pile in the reused local Worker before timeout. Other16 checks, including new UI, ordinary visitor/reload/concurrent fields and geometry, passed. This fixture-state error is retained; a later run explicitly requires actual GET to show empty local pieces/materials after restarting only the owned local Worker.

Final-native11 passed18/18, actualCLI0 in16.682225s with no live owners, against the full new surface-selector/upholstery runtime. It asserts actual local GET revision0 with empty pieces/materials before starting; original→pile→cancel is14→59→14mm and20 accepted polls remain stable. Final-support3 passed25/25, actualCLI0 in6.393539s, with #1013 legacyXZ explicitly retained. Final-schema2 passed18/18. The subsequent immutable base `b8374a15bbc50322fc5c0599d61a0f9eeb96f216` adds only #1012 verification text; no runtime rerender or further acceptance retry is needed.

Final-native12-post1015 passed18/18, actualCLI0 in15.807750s, on explicit immutable published base `3364240e801ca601c143e25198ca9ca3b1b46f36`, after a fresh owned local Worker GET revision0/empty state. This exercises the incoming final buildFurniture patio-copy linking too. Config/furniture whole-file hashes changed solely for that unrelated incoming family; all seven geometry/material/support/cat critical blocks and the full Rearrange/main driver paths remain byte-identical. Earlier support25 and schema18 remain applicable; no repeated GL or support suite was run.

Published client `eff6a462b13fd45adc56251593115e8e174c53b5` (changelog802) preserves the final-native12 executable/driver hashes and seven rendered critical blocks. Actual Pages38562314387/job115846178170 created this exact SHA at2026-10-14T12:14:39.1206901Z and reported success12:16:07.4188045Z. The client’s actual Worker38562314260/job115846177444 ran npx wrangler deploy12:14:46.5637247Z, Uploaded12:14:50.7279099Z and Deployed12:14:51.0103460Z, versione3b1453e-bda1-4b30-8630-dc49bd1bd8b8. The241 src/data/index publication hashes, complete source producers, original failure receipts and exact owner/socket/profile cleanup are archived with worker-1009 artifacts. Both owned local services and all test browser owners are stopped. No extra screenshots or runtime changes followed the accepted component render.

### HEMNES textile surfaces (#1021)

Only the custom daybed builder binds eight existing textile groups: the upper quilted mattress, lower pull-out mattress, existing quarter-turned quilted spread and five black/holographic/graphic/faux-fur/pink cushions. Each uses its own upholsterySurface/private handle; no traversal recolor or global dayMats mutation. Exact Original retains every original map/UV0, roughness/metalness and shape, including unit-UV printed cushions and the noisy round fur cushion. Generic patterns reuse the existing metric UV1 and cached two-map family. No new geometry, mattress layer or bedding model is invented.

Only the existing spread remains care-index0. Binding occurs before real merge; unchanged other parts receive their existing zero bedCare attribute through normal preparation. Baseline geometry/normal/UV0/index/care/matrix/finishes/rest/footprint comparison runs once in the first proof context. The native merged Mesh count changes30→31 by separating the two mattress handles; this includes hidden contents and is not an actual visible draw-call measurement. Renderer budget and component-image acceptance are recorded separately after their granted run.

The granted render1 recorded13 raw PASS rows (12 meaningful render checks plus1 inherited native-only bypass), actualCLI0 in5.336239s, with no live owners or temporary profile. All three640×400/FOV72/DPR1 component images were inspected: full Original, mixed independent cloth choices retaining holographic/graphic/pink originals, and a closer cloth detail. Each actual renderer frame uses28draws/34,960triangles; choices add no draws or geometry. The render path has exactly one setup and stops material polling after its real GET. Its inherited “ordinary peer” raw label is a render-mode short-circuit, not another HTTP visitor proof; the51-check native run supplies the genuine ordinary-peer evidence. The driver label was clarified afterward without a rerender or product change. These components do not verify the entire apartment, physical phone or FPS.

### Parasol canopy and cloth lamp shades (#1026)

Three existing builders expose private canopy/shade handles. Parasol UV1 uses its actual fully-open radius in planar metres; folding keeps the same cloth reference. DANI inner cylinder uses actual circumference/height UV1, with planar UV1 on its existing cap. Original UV0, cylinder/cap shapes, rattan, wood, pick helper, wash planes and private FloorLamp.shade pointer remain intact. No new rendered mesh or draw pass is introduced.

TUBELAMP’s wire and weave are part of linenTextures, not a separate spiral mesh. Its optional background choice draws colour/metric pattern BEFORE exactly the existing weave/wire/bulb detail passes; the unchanged default still creates the original map/emissiveMap. Alternatives allocate only colour Texture objects and reuse the original emissiveMap; the same private shade material is retained by FloorLamp/focus/washes. Actual600 previews reuse6colour Texture objects (Original+5alternatives256×512),1original emissive Texture and1material handle:7total Texture objects at this surface, not merely5cache entries. All original material/map/emission/UV0/shape data restores without changing live lamp on/off.

The separately granted render1 completed30/30checks, actualCLI0 in4.162446s with no live descendants or temporary profile. All six640×400/FOV72/DPR1 component PNGs were inspected. Original/pattern actual renderer costs match: canopy6draws/1,096triangles, TUBE5/1,260, DANI5/10,666. Canopy checks are clear, TUBE stripes retain spiral/weave/warm glow, and DANI has only discreet visible checks behind its unchanged rattan and warm glow. No new mesh, shadow pass, World or physical-phone/FPS claim follows from these component images. Native52 and schema23 remain separately recorded.

## Shower spray (#1062)

`water.js` gives showers 36 separated narrow nozzle jets in one merged mesh, with
transparent moving breaks in a shared 8×128 texture. A mild quadratic fall keeps
the angled hand shower's jets on the basin plane. `SHOWER_SPRAY` centralises visual
assumptions (*guess*); these are not measured nozzle counts or hydraulic physics.
The two L1007 showerSet templates retain their positions, thermostat picks, splash,
wetness footprint, audio and transient open state. Basin streams are unchanged.
The existing splash ring remains an inexpensive stylised floor effect.

Both real overhead and hand-shower components were rendered in Chromium before
and after, including a later spray frame, and inspected. Geometry per stream is
40 → 1,080 triangles; component render totals grow by 1,000 triangles because the
old transparent DoubleSide cone rendered twice. Measured component calls are
8 → 7, with one stream mesh retained; no added light or render pass.
`tools/showerspraytest.cjs GAME OUT [--baseline]` checks actual Tap state, sound
lifecycle (spy), wetness, floor endpoints, static geometry and texture animation.
Artifacts and source hashes: `/tmp/lunden-showers1062/{before,after}`.
These are bounded components with illustrative walls/floor/lights, not World,
audible-audio, FPS or physical-phone evidence.

Equivalent-house inspection: L1007 has both affected running shower variants.
Other modelled L flats (`VISIT_UNITS`, including L1201) use standardinterior's
static hand-shower fixture, which deliberately does not register water outlets.
A/B/C core/flat-door models do not build these interactive shower interiors.
Those static/nonexistent running-water variants are unaffected; no house
dimensions, fixtures or controls were changed.


## Tower clock (#1067)

The Klockhuset clock uses `TowerClock` instances instead of frozen baked hands. Shared256px dial, four cardinal numerals,
12 strong ticks, wider hour/minute hands and unlit materials preserve contrast at distance/night without increasing
physical dial size or adding lights. All new ratios/offsets are declared in TOWER_CLOCK as visual assumptions.
The hands' fixed conservative bounds cover every rotation; neither instanced mesh participates in the small-detail culler.
The clock adds two draws and144 dynamic triangles, while replacing80 static desktop /64 static phone triangles.
Isolated flat-ground campus captures:10 draws,71425 desktop /29766 phone triangles. See environment and towerclocktest.

## Distant ground shadows (#1079)

The sun's shadow map covers only ±14 m round its target, so `src/groundao.js` bakes soft ground darkening for everything
further out: a disc under every tree crown (surroundings.js `aoTrees`, plus southbackdrop.js's woodland) and a thin band
along the wall feet of Kv. Lunden's blocks, the old S:t Lars/school/HepCat buildings, the mapped backdrop buildings
(outlines and courtyard holes) and Hus L's rectangle (world.js passes `husL`). Everything is one indexed mesh with a
multiply-blended `ShaderMaterial` (one draw call, ~25k triangles, `renderOrder = -1`: after the opaque ground, before glass,
water and the additive light pools), draped over `max(groundY, renderedTerrainY)`; triangles across a height jump
(`maxStep`, e.g. the garage box edge) are dropped. Each vertex carries the point whose real shadow it stands for (`aRef`:
the crown centre, a point 1.5 m up the wall); the vertex shader projects it with `sun.shadow.matrix` (bound by reference in
main.js, so it follows the visited-flat box shift and the sun's angle) and fades the darkening in only outside the map's
texture-space edge (`fade`), so nothing is darkened twice. Without a shadow map (test mode) the matrix stays identity and the
baked shadows show everywhere. Fog fades them; in winter trees keep `bare` of their share. The multiply happens in linear
space, so the strengths look weaker on screen than their numbers. All values are *guesses* in `GROUND_AO` (config.js).

Shadow box outdoors (#1144): the box stayed on our flat (or a visited one) also out in the courtyard, so its rim ran as a
straight line across the lawn between the patios and Hus A (midday: the box's southern edge at z ≈ 23; tree shadows on
one side, none on the other). Outdoors further than `SHADOW_BOX.home` m from our footprint — not in a stairwell or under
the courtyard — main.js now centres the box `lead` m ahead of the visitor along the view, snapped to a `snap` m grid
(the shadow map is redrawn only on a grid step; by a visited flat too, the follow box still holds its rooms). Inside or
right by our flat and inside a visited flat the old centring holds. groundao.js also patches three's `getShadow()` so
every real sun shadow fades out between `SHADOW_BOX.rim` of the map's texture-space edge (where the baked ground shadows
fade in), so a rim still in view is soft. Same single shadow light, map size and shadow pass; values are *guesses*.

## Furniture contact shadows (#1075)

`src/contactshadow.js` gives every floor-standing loose piece a soft multiply-blended rounded rectangle over its
collision footprint (the baked AO in `src/ao.js` only knows walls and fitted cabinets). `buildFurniture` collects the
pieces whose lowest point is within `CONTACT_SHADOW.maxBase` of the floor and that have a footprint (not rugs or the
parasol); a piece's rectangles that tile a larger rectangle (a sofa's back, arms and seat) are merged, and the edge fade
is symmetric round the footprint edge so touching rectangles (the sofa and its chaise) meet without a light seam.
All shadows are one `InstancedMesh` (one draw call, `frustumCulled = false`, no raycast, no shadow casting), the last
child of the furniture group: F hides it, and its `updateMatrixWorld` copies each piece's world matrix every frame, so a
piece moved in Möblera om, hidden for the season or culled by detail takes its shadow along (a hidden piece's instance
is scaled to zero; during a move the piece is hidden behind the ghost, so its shadow appears again on confirm).
Strength, soft width, corner radius and lift are *guesses* tuned by eye in `CONTACT_SHADOW` (config.js).

## Cat card rarity visuals (#1256)

The binder cards (`#binder-view .card`, src/catbinder.js) get progressively fancier by tier with CSS only: no texture, light or draw call in the 3D scene (tools/perfcount.html unchanged). Levels, ★ counts and tilt come from `CAT_CARD.fx`; details and the reduced-motion fallback are in [animals-audio.md](animals-audio.md). Animations are opacity / transform only (twinkle, shine sweep) plus one rotating rainbow frame on the top tier.

## Smooth sky/ground horizon transition (#1266)

At altitudes above 120 m (up to jetpack ceiling 320 m), the distant ground ends at the far clipping plane (1000 m) in full fog. While `scene.fog.color` is transferred to uniforms in sRGB color space by Three.js standard materials (`getUnlitUniformColorSpace(renderer)`), custom `ShaderMaterial` instances (`this.sky` and `this.deck` in `src/daycycle.js`) originally wrote raw linear values to `gl_FragColor`. Adding `#include <colorspace_fragment>` applies `linearToOutputTexel`, matching the output sRGB color of the fogged ground (`0xcfe0ec` -> `(207, 224, 236)`) and seamlessly blending sky, fog, and distant ground across all altitudes and times of day. Zero extra draw calls or textures (`tools/perfcount.html` PASS).

Depth precision at distance (#1276): the camera far is 1000 m and a 24-bit buffer resolves ~d²/(near·2²⁴·0.5) m, i.e. ~10.7 cm at 300 m with the old 0.05 m near plane, so window glass 1–7 cm in front of a façade (backdrops, neighbours, campus decals) z-fought and far houses shimmered. Window-glass materials (`neighborGlass()`, sitebackdrop/southbackdrop `glass`) carry `DECAL_OFFSET` (polygonOffset counted in depth steps, so it holds at any distance), and `updateCameraNear()` in main.js uses `VIEW_NEAR`: 0.05 m indoors/stairwell/flats/garage/vehicles/roofs, 0.12 m on open ground (PLAYER.radius is 0.22 m), growing 2 cm per metre above 3 m altitude to 1.5 m when flying. `&near=m` pins it. SwiftShader depth is float-like and cannot draw the flicker, so `tools/depthprecisiontest.cjs` checks the offsets, near planes and the analytic step. Frames in the western façade batch (`facade`) still sit 1.5 cm in front of their wall without an offset.

## Lens flare towards the sun (#1283)

`src/flare.js` (`FLARE` in config.js; `?noflare` disables it): one ShaderMaterial mesh, one draw call, no texture and no light, parented to the camera and hidden unless the flare is active. Seven additive procedural quads (glow, corona, discs, halos) sit along the line from the sun's screen position through the screen centre. Visibility = sun above the horizon x sun inside the view x not occluded x weather: `day.overcast` damped by `day.above` (above the deck the sky is clear, #1251), rain and the cloud whiteout (`uWhite`) extinguish it. Occlusion is a cheap CPU ray test from the camera along `sunDir` against building AABBs (greet.js `occluders()` plus the `SITE` neighbour footprints), tree crowns (`aoTrees` from surroundings.js) and, indoors, the ceiling and the window openings of L1007; underground / garage / stairwell is always occluded. Intensity follows the target with an exponential smoothing (`FLARE.smoothTime`), so it never pops. Test: `tools/flaretest.html` (run through Playwright like the other tools pages); perfcount covers the budget (the flare only costs a draw call while visible).


## Opaque cloud sea above the flight layer (#1368)

The old #1251 deck could disappear in fair weather, retained transparent noise holes/rim in cloudy weather and left the spherical sky's clouds overhead. Jetpack height was sufficient; it was a visibility failure. `DayCycle` now raises coverage smoothly as the camera approaches the existing150m base in every weather. The unchanged150–190m layer whites out, then the unchanged190–220m transition reveals clear sky and an opaque procedural cloud sea. Overhead sky cloud opacity follows `1-above`. Ground-level weather and views remain unchanged. All heights remain visual guesses.

The deck is now a two-triangle plane. From above its half-span grows to at least the camera far distance; alpha closes all noise/edge gaps by `above=1`. Noise still shades cloud tops and the distant **colour**, rather than alpha, blends to the sky horizon. A single double-sided pass avoids the former transparent two-pass draw. No texture, light, shadow caster, weather input, jetpack physics or movement limit is added.

`tools/skylayertest.cjs` uses actual production DayCycle/WebGL and frozen pre-change `e6f5ce4e:src/daycycle.js`. A magenta↔green ground oracle is visible through the old clear-weather sky (mean channel change133.08); all12 new above-layer cases have exact zero ground-pixel difference: heights220/250/320, clear/partial/overcast, shallow views, far1500 and translated camera. Three controlled ground views remain pixel-identical; fair-weather inside-layer whiteout and disappearance of overhead sky clouds pass. Component18/18PASS, CLI0. Same four fixture lights; clear-flight component2→3 draws and962→964triangles, no ground draw increase. Both fixture screenshots were opened.

A real full-World flight invokes production Jetpack.putOn, holds Space in Player's input state and steps the normal app at1/60s, without raising/clamping heat. Before and after reach feet300.0604m in25.9167 **simulated** seconds, heat0.57593 and no cut, identical positions. At camera165.0563m, whiteout changes0→0.99983; at300.6947m the old cover0/hidden deck becomes cover1/visible deck and above1. Four real-world down/horizon before/after images were opened, with no browser JS exceptions. This is controlled Chromium verification, not E/touch end-to-end or physical-phone FPS.

Public applicability: inspected `kvarteret-lunden` at0afb8bd; it has a fixed daylight scene and no DayCycle, SKYLAYER or jetpack/high-flight feature. This flight-specific sky change does not apply there and no gameplay is transferred.

## Shared physical cinema screen (#1476)

`cinemasurface.js` positions the official cross-origin YouTube iframe with the
pinned CSS3DRenderer behind an alpha-enabled WebGL canvas. A zero-alpha
NoBlending material writes depth at the real screen, preserving foreground
occlusion. The scene background still writes opaque pixels elsewhere. Inactive
surfaces restore their original material and hide the CSS layer. No video
texture extraction, per-frame downloads or new lights are used. See
[furniture lifecycle](furniture.md#cinema-network-video-1376).

The same surface supports all three home TVs (#1483), using unique CSS layers
and their retained screen mesh matrices. Media updates run after movement/rest/
touch camera changes at the end of `step`, so CSS and WebGL use the same final
camera pose instead of allowing a one-frame projection lag.

## Clubhouse precipitation guard (#1485)

The fantasy clubhouse is a completely enclosed off-map interior, without an
outdoor view or normal house occluder. `Weather.update` takes an optional
`enclosed` flag; main passes `player.inPlayroom`. It disables both precipitation
draws for that interior while retaining the actual climate and muffled audio.
Leaving restores ordinary roof-aware precipitation, including the existing car
guard. This also avoids transient particle/roof-edge and hail-bounce cases.
Ordinary indoor windows still show outdoor weather. No geometry, audio gains
or particle budgets change. A/B/C/L house guards are unchanged. This off-map
game room has no public downstream equivalent and must not be ported there.

## Wide screen aspect ratio (#1415)

CSS3D iframe height derives from each physical screen's width/height, and both
projection axes use that derived viewport. The expanded6.34×1.90m cinema plane
uses1280×384px; YouTube adds its normal fitting/bars instead of stretching a
16:9 iframe across the wider physical plane. The idle poster is proportional
as well. Curtain topology, material batch and light count are unchanged.

Clubhouse neon signs (#1384): `clubhouseSigns` paints clipped coloured tube
outlines, glow and a pale core into the existing512×256 atlas. Sign positions,
UVs, geometry, unlit material, ceiling-light swatch and room visibility are
unchanged. `PLAYROOM.clubhouse.neon` holds the assumed colours/pixel widths;
there are no new lights, passes or draws. The private fantasy room has no
public downstream counterpart. See [verification](verification.md#lekstuga-neon-1384).

First-focus stalls (#1508): `InteractionOutline.warmCompiler` feeds the existing
screen/mirror and sliced phone warm-up with compile-only focus variants. Runtime
brightness shaders and source-material appearance/lifetime remain unchanged; no
extra geometry or render pass is added. See [performance](performance.md#first-focus-program-warm-up-1508).
Saved drawings that arrive from IndexedDB after a compile stage started are queued
via `WarmUp.add` and compiled a few per frame (#1514).


Procedural startup backing sizes (#1549): AO, frozen-meal prints and the kitchen's painted picture use
`resourceprofile.js` `profileCanvasSize`/`profileCanvas` before painting. Full retains authored pixels;
light retains the GPU cap and authored drawing coordinates. AO preserves its blocker grid and hole edges.
See [performance](performance.md#paint-procedural-sources-at-startup-profile-size-1549).

## Playhouse posters, neon and zoned light (#1574)

`src/playroomposters.js` builds the hall's, SPEL's and BILJARD's own generated posters (canvas shapes and pixel bitmaps in `src/posterdesigns.js`, no real logos or artwork) on one atlas,
together with SPEL's neon ceiling runs and the two wall neon signs ("GAME ON", "8-BALL"), BILJARD's two green pendants and the warm wall lamps. All of it is one unlit
vertex-coloured mesh (no light source); `src/posterlayout.js` is the pure layout (wall planes, keep-out checks) and every placement, size, colour and level lives in
`PLAYROOM.posters` / `PLAYROOM.zones` (*guess*). BIO is not touched (its posters are #1575's); the hall's west short wall stays free for the popcorn cart.
The runs, lamps and shades sample a white swatch that fills the atlas's last poster cell, which no design uses (#1608: in the
atlas corner it showed as a white square on the 8-BALL sign); `roomPosters` throws if the designs ever fill that cell.
[Before/after](../verification/1608/).
Per-room light: `clubhousematerials.js` exports `CLUB_ZONES` (Vector4 [BIO, BILJARD, SPEL, hall]); each clubhouse fragment scales its ceiling-lamp and ambient terms by the room it is in, so SPEL is
dim and BILJARD pub-like while BIO and the hall are unchanged. The values are live uniforms (set a component, no recompile), meant to be reused for further per-room moods. The light switch (#1365) and
the disco ball work as before; the neon and lamps stay on when the disco light is off.

## BIO film darkening, masking curtains and exit signs (#1619)

A running film darkens the BIO further and slower than #1570: `PLAYROOM.sconces` `dimmed .06`, `ambientDim .18`, `fadeSeconds 6` (both ways; the light switch override from #1570/#1610 is unchanged).
The two velvet curtains are no longer in the room's static batch: `src/cinemacurtains.js` (`CinemaCurtains`, one small dynamic mesh, one draw, shared `furMat`; #1625 tried the room batch but that would keep ~6.1 MB (152 712 vertices x 40 B) of CPU arrays on low-memory phones) rewrites their vertices from
`cinemaCurtainGrid(side, half)` (`src/clubhousefurnishings.js`) while the opening eases (`PLAYROOM.furniture.cinema.curtain`: `aspect 16/9` default, `pad .03` m of black frame, `seconds 2.5`).
The picture is `screen.h * aspect` wide (the iframe letterboxes the video inside the 3.3:1 screen), clamped to the screen. The ratio comes from `CinemaSurface.measure(id)` (`src/cinemasurface.js`): YouTube's
iframe API exposes no video size and the iframe is cross-origin, so the CORS-readable `i.ytimg.com/.../mqdefault.jpg` (16:9) is read and `pictureAspect` cuts away symmetric pure-black bars
(4:3 pillarbox, 2.39:1 letterbox); anything unreadable or offline stays 16:9. `main.js` passes `cinema.surface.aspect` to `playroom.setFilm`; 0 / no film = curtains fully apart.
`src/clubhouseexit.js`: four green NÖDUTGÅNG signs (`PLAYROOM.exitSigns`; #1625: painted into three free cells of the `playroom-posters` atlas and four quads of that unlit mesh, so no draw of their own, no light; the brightness is a constant vertex colour) above the BIO/BILJARD/SPEL passages (north face, seen from inside each room) and the playhouse door.
Test: `tools/bio1619test.cjs`. Limitation: thumbnails of films whose first frame has black edges, or whose uploader added burnt-in bars, can mislead; real devices were not tested.

## DJ surface and active controls (#1667)

`PLAYROOM.dj.panel` is the actual black mixer/deck surface. Controls and atlas ink are
kept inside its footprint; labels on active buttons move with their 6 mm depression.
Inactive/active button faces use two small merged Standard-material batches; the active
one is emissive, so no new light or bloom pass is needed. Static bezels/rails keep the
existing furniture batch. Vinyl uses one shared Standard material and a 128² procedural
groove/paired-highlight texture, a painted ceiling-reflection approximation rather than
a live reflection. All gloss/press/emission values are centralized visual guesses.
The scoped native-input/room render in `tools/playroomdjcontroltest.cjs` checks label
occlusion, edge clearance and observer state; see [result images](../verification/1667/).
