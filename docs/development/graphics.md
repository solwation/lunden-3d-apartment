# Graphics, materials and lighting

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [performance](performance.md), [plan-material](plan-material.md).
## Module and test map

```text
src/neighborglass.js   opaque MeshPhysicalMaterial for unmodeled neighboring interiors (#516), shared by exterior.js's
                       ordinary/occupied/entrance glass batches. One six-face 128 px procedural CubeTexture is reused;
                       clearcoat and view-dependent envMap reflections, no live mirror pass or additional lights.
                       Night lowers environment intensity and preserves existing warm occupied-window emission.
                       NEIGHBOR_OPENINGS centralizes visual assumptions; reflection is a generic outdoor impression,
                       not a surveyed or live reflection of surrounding buildings. L1007's clear materials are independent.
src/architectureedges.js sharp architectural edges (#474), captured before loose furniture/decor is added;
                       excludes transparent overlays, cabinet contents and explicit loose roots. One static batch per floor,
                       one per moving door/fitting/lift anchor; 30° creases, no triangle diagonals, 1 mm depth bias with depth testing.
                       #505 filters coplanar construction seams against the solid union and open wall planes;
                       a temporary triangle tree accelerates baked solids. core.js retains edgeSources while baking
                       so open wall panels and individual blocks stay distinguishable. Moving anchors remain separate.
                       world.js and core.js build them once; furniture and loose things have no outlines. tools/architecturetest.html
                       verifies batching, exclusions, moving doors/lift, no box diagonals and real WebGL occlusion.
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
                       (lightning), sfx.rain (muffled indoors) / sfx.thunder after distance / 343; the small lamps come on
                       earlier, the people go in, the parasol folds; 🌧 / ⛈ in the HUD; `&weather=rain|storm|snow|hail|clear`.
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
                       #468: every rail spans the room's side-wall faces (CURTAINS.rail, plan.json); kitchen cloth spans the full width too. Living-room fabric matches both the kitchen's botanical motif and its light background.
                       Its '-valance' state id avoids inheriting the removed long curtains' position; subsequent positions save normally.
src/lampwash.js        every lamp's light wherever the visitor is (#276, #294, #295, LIGHTING.wash): each pool anchor (small lamps
                       and ceiling lamps) lights the flat inside the lit materials' own shaders (`patch(scene)`: onBeforeCompile on
                       every MeshStandard/Lambert/Phong material, re-scanned every 120 frames; no extra mesh or draw call) exactly
                       like its pool light (same fall-off and range, Lambert on the surface's colour, no specular), only where it
                       sees: its visibility polygon (rays to walls, closed doors but not wardrobe fronts (#297), the façades' outer faces) is a row of a float
                       texture; lamp data in a small float texture. It shows k × (1 − pool) and the pool light k × pool (cross-fade,
                       Lights.update → `set(i, k, pool)`), so a lit room looks the same near, far, upstairs or from outside
src/mirror.js          the one mirror material (gradient + glints; hall and bathroom mirrors); the lit mirrors (Badrum LED, Hollywood, Klk) use `litMirrorMaterial` + `litEmissive` + `litReflect` (LIGHTING.mirror, #339)
src/reflections.js     mirror images: a Reflector per mirror, only the nearest one in view (< 4 m) renders; `dim` scales a lit mirror's image (#339)
src/seasons.js         month → tree colours/leaf cover and snow on ground, roofs, hedges, paving (SEASON)
src/huego.js           the Philips Hue Go on Sovrum 1's window board (#409, #428, HUE_GO): the classic frosted bowl, a lamp of its own; its
                       action menu (#367, an ActionSet; FloorLamp `options`) = Tänd/Släck + Byt färg (scenes), the colour kept by keep.js
src/screens.js         TV programmes drawn on a canvas (PROGRAMS: space, underwater, superheroes, unicorn …), channel
                       snow, the Ambilight colour per programme; `Screen` is shared by the TVs in furniture.js
tools/mirrortest.html  headless test: in front of every mirror its Reflector is the active one, on the glass (#139)
tools/weathertest.html headless test: showers per season, thunderstorms only in late summer, a shower ramps in; with &weather=storm:
                       drops (none inside Hus L), grey sky, a flash and back, ⛈ in the HUD, people in; snow only in winter, hail in
                       spring / storms, snowflakes not in Hus L, walking 20 m out in it counts once, not indoors; clear = no rain
```

## Recent implementation notes

Takgardinernas ljus (#499): `CURTAIN_LIGHT` samlar antagen svag transparens, diffus transmission, råhet och genomlysning. Alla sex `Curtain`-uppsättningar använder matt, lätt transparent tyg med `depthWrite` och `forceSinglePass`; de vanliga täta skuggorna stoppar direkt sol. `daylightCut` styr rummets befintliga diffusa fyllnad via `Blinds.update`, fullängd från gemensam transmission, kappans lilla bidrag från `spec.dim`. Plissématerial och vertikal styrning är oförändrade; inga nya ljus/renderpass. `curtaintest` verifierar även alla sex lagrade lägen efter riktig omladdning och tygens dags-/kvällsgenomlysning. Vyer och begränsningar: `docs/validation/issue-499/README.md`.


Basin mixer levers (#526): interior.js supplies side-mounted pins for kitchen/laundry goosenecks and top paddles for the two vanity mixers. Their positions and proportions are assumptions in TAP_LEVER, with the existing mixer finish. Tap in water.js adds one merged dynamic mesh per basin, tagged moving for the detail culler, and a widened elliptical pick at the control rather than the outlet. outlineRoot targets that physical lever. Lever progress follows isOpen with a reversible 0.24 s eased lift; flow and sound synchronize even after an external state change. Water outlets/handwash/dish/fill APIs keep their existing positions. Taps remain transient across reloads (keep.js); new/reset visits start shut with handles down. Showers retain their thermostat controls. watertest checks all four levers, touch/desktop use, nozzle rejection, quick reversal, live state, sound stopping and an actual reload; cuptest and life2test sections 382/383 cover jug filling and dishes. Four extra draws at most; no new material/light/render pass.

Focus material lamp scans (#548): InteractionOutline tags its temporary shader material with INTERACTION_MATERIAL_SOURCE. LampWashes.patch follows that original source, so its periodic 120-frame discovery scan cannot insert duplicate lamp declarations into the focused shader. The wrapper reads the current original compile hook and cache key, including a first lamp patch while the object is already focused. No extra geometry, passes or lighting; original materials, live uniforms and appearance forwarding remain intact. interactionoutlinetest covers repeated scans on Standard/Physical materials, the real closed entry door, and discovery during focus.

Focus materials (#558) survive focus exit and are reused by source/index; the source material disposal releases all cached variants. Instanced figure selection is a shader uniform, so walking the eye across people does not generate a distinct GPU program for each figure. Dynamic getters still forward live source appearance and lamp shader hooks (#548). Tests: focusperftest and interactionoutlinetest.

Plant wind (#518): `src/plantwind.js` adds a shared vertex deformation to explicitly selected foliage materials and the matching sun-depth material; existing lamp wash and interaction brightness hooks remain composed. Height/phase/stiffness attributes survive static material merges. Two shared uniforms update per frame, with no vertex uploads, extra light or draw pass. `PLANT_WIND` caps displacement at 6 cm per horizontal axis; pots/soil and collision/interaction positions remain static. Rendering spheres include sway margin without changing model dimensions. See plants.md and tools/plantwindtest.html for WebGL pixel verification.
