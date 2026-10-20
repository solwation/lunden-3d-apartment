# Plants and pots

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [furniture](furniture.md), [graphics](graphics.md), [environment](environment.md).
## Module and test map

```text
src/plantwind.js       shared GPU foliage sway (#518): plantWind height/phase/stiffness attributes survive material merges;
                       shared time/power uniforms and matching custom sun-depth shader. Existing plant builders select
                       foliage materials explicitly, leaving pots/soil/decor unchanged. Sill home/own models retain their
                       five/two foliage batches and rebuild wind/shadows after moving or watering.
tools/plantwindtest.html real opening/weather transitions, all plant families, actual WebGL foliage/pot pixel checks,
                       focus brightness compatibility, movement/return and no per-frame vertex uploads.
src/plantpots.js       shared rounded brushed-copper pot geometry/material (#491, #517)
src/foliage.js         leaf-card crowns and branching trunks for the site's trees, shrubs, courtyard plantings/vines and the far
                       southern woodland (#679, FOLIAGE): `lobeGeometry(level)` (core + alpha-tested cards, radial normals, AO
                       vertex colours), `leafMaterial()` (one shared, two-sided, `leafAtlas()` 512 / 256 px), `trunkGeometry()`,
                       `barkMaterial('bark' | 'birch')`; instancing and seasons.js unchanged
tools/foliagetest.html headless test (#679): every crown batch on the shared leaf material, atlas size, triangles per lobe (≤ the
                       old 80), soft normals, cut-out shadows, branching barked trunks, January bare / July back, leafy pixels
                       (`?lowmem` for the phone profile)
src/entranceplants.js  shared plant templates and door-relative entrance placement on ground and loftgång (#498)
src/boxwood.js         merged evergreen entrance hedge and winter snow caps (#496); shared cached 256 px leaf atlas
src/patiohedge.js      rounded, tapered patio hedge geometry/material (#680), shared by world.js/exterior.js
src/hedgeform.js       shared clipped-hedge form (#1143): dented subdivided body, darker/pinched foot, tone vertex colours, stem shader
src/sillplants.js      flower pots on every inner window board (SILL_PLANTS, #136): five merged meshes, a loose item;
                       `userData.pots` / `rebuild(away)` / `potModel` let one pot be lifted out of the merge (#185).
                       #290: big lush plants (`leafShape` leaves; pelargon, orchid, violet, cactus, ivy, basil, monstera,
                       pothos, fern, olive), squeezed short of the blind's pack (`sill.blind`, `clear`) and the reveal;
                       ivy / pothos trail over the board's edge (`trail`; lying flat round the pot once taken)
src/plants.js          SillPot (#185): each window-board pot is a Holdable; its own model is invisible at home, shows (and
                       the merged meshes are rebuilt without it) once taken; the side-table flower and the kitchen shelf's
                       vase / pot plant are plain Things (kind 'plant'); window boards are put-down surfaces too
tools/planttest.html   headless test: lift pot plants (window board → table, side table → window board, the shelf; the face pot to the
                       dining table and back on its shelf, #343), F home; #559 explicitly excludes café flower removed in #490/436fb82,
                       selects actual upper shelf plant, verifies real interaction targets and reports missing fixtures instead of hanging
```

## Recent implementation notes

Krukväxternas blommor och blad (#985): `src/furniture.js` (`flower`, `pinkFlower`) och fönsterväxterna i `src/sillplants.js` (`pelargon`, `orchid`, `cactus`, `violet`) använder naturtrogna kronblad, blomcentra och bladkurvor i stället för förenklade ellipsoider och icosahedron-blobs:
- `flower` / `pinkFlower` i `src/furniture.js`: två lager välvda blad med mittveck och naturlig hängprofil (via återanvänd `leafShape`), böjda stjälkar med calyx, kupade kronblad (`flowerPetal`) och ståndarcentrum i gult (`heartMat`), med bevarad `windPlant` och `mergeStatic`.
- Fönsterblommor i `src/sillplants.js`: pelargoner med individuella florets och pedicels i umbeldome, orkidéer med 3 foderblad, 2 breda kronblad och kontrastfärgad läpp (labellum), Saintpaulia med 5 sammetslika kronblad och gula dubbelknappar (anthers), samt kaktusblommor med stjärnformiga kronbladslager och ståndarkärna.
- Bevarar batchning, 0 extra draw calls, vattenpåverkan (`tintPot`) och växtsvaj.

Living-room palm (#491): original id/position retained; geometry dimensions scale by 0.8, pot by 0.8 × 0.95 (Ø 30.4 × 34.2 cm, extra reduction is a visual choice). Shared rounded brushed-copper pot: src/plantpots.js. Scaling is baked into geometry, so saved furniture transforms cannot undo the size change.

ZZ plant (#495, resized #517): src/zzplant.js builds 15 tapered curved stems with eight paired glossy oval leaves and a terminal leaf each, using docs/references/garderobsblomma-2026-10-08.jpg for the silhouette. Assumed overall height now 126 cm, exactly twice #495; shared copper pot radius 15.2 cm/height 34.2 cm, also doubled. Smooth 16×8 leaf surfaces retain individual green variations, varied lengths/angles and a fine central/lateral vein bump. Floor corner x .37/z 11.4 and stable movable id are retained. Wall bounds bunch foliage clear of the west wall/BESTÅ/palm; wallExcludedMaterials preserves the round pot/soil dimensions instead of deforming them. Four material draws, ordinary shared layouts/restore. Parameters live in FURNITURE. tools/zzplanttest.html checks dimensions, actual round pot bounds, leaf variation, shared copper, mesh budget, cabinet clearance, movement/cancel/shared save/reload/restore; walktest verifies the patio route.

Entrance boxwood hedge (#496, corrected scope): src/boxwood.js replaces SITE.life.strip low faceted clumps in the existing entrance beds x -46..-10.6/-8.5..5.8, z -3.5..-2.9 (center -3.2), built by streetlife.js. The separate parking hedge SITE.shrubs at z -16.3 is restored exactly to its original round instanced seasonal crowns in surroundings.js. Assumed entrance hedge reaches 58 cm above ground (50 cm body on 8 cm soil), 44 cm deep with 4.5 cm rounded corners. Door-derived gaps include 35 cm extra clearance either side of actual leaf openings; existing portik gap and bed extents remain. All runs merge to two draws: evergreen textured bodies and winter snow caps. Matching collision segments now block foliage but leave entrance routes clear; each carries the hedge's top (y 0.58, a fifth number, streetlife.js) so a jump clears it (#636, player.js `clears`). No patio hedge change. tools/boxwoodtest.html distinguishes both locations, checks our passage via real geometry, seasonal parking shrubs/evergreen entrance boxwood and snow; walktest verifies entrance/traversal routes. Verified views in docs/validation/issue-496/entrance.png (camera 1.3/1.7/-5.1) and restored-parking.png (-4/1.4/-13.6) show both distinct strips.

Entréväxter (#498): `src/entranceplants.js`, byggd av `exterior.js`, placerar 11 krukväxter på markplanet och 11 på loftgången vid de åtta lägenhetsentréerna på varje nivå. `ENTRANCE_PLANTS` samlar visuella antaganden om antal, artval, krukmått och bladproportioner. Uteplatsens `planter` stöder valfria `pot`/`foliageScale`; entréernas tre mallar delar geometri/material och använder vanlig DetailCuller. Blad hålls fria från fasad/dörrar och loftgångens yttre gångfält; krukkropp/stam har marksegment respektive höjdbegränsade takväggar. Golvhöjd från `groundY`/loftgången. Referens och webbläsarvyer: `docs/validation/issue-498/README.md`; `entranceplantstest` och `walktest` verifierar passage, höjder och kollisioner.


Plant care (#553, part of #396): `src/watering.js` adds care targets to existing SillPot, plant Things and movable indoor palm/ZZ roots. Watered ids are saved in `x.watering`; no duplicate inventory of plants. Window soil vertex colours and original leaf/flower arrays change per pot and rebuild the same five material batches; own models receive the same transformation, including when moved or returned home. Other plants clone tagged soil materials once so a wet copper pot cannot darken its neighbor. The shelf face-pot eucalyptus is artificial and refuses water. `tools/wateringtest.html` covers actual touch fill/water, reservation/cancellation, exact dose, independent appearance, movement, reload and reset; `planttest` keeps existing lifting intact. All amounts, visual dryness and can dimensions are game assumptions in WATERING.

Plant wind (#518): `PlantWind` reads actual animation progress from apartment windows and the two `SwingDoor.exterior` leaves; cupboards, internal/portik doors and letter flaps do not drive wind. The largest open fraction gates every potted plant, including outside entrances, patio planters and artificial eucalyptus. Shared Weather.kind/rain/storm strengthens rain/snow/hail with smooth easing. Heights, frequencies, strength and a 6 cm maximum displacement per axis are visual/game assumptions in `PLANT_WIND`, not measured weather. Plant phase/stiffness and slow gusts vary; closed openings eventually give exactly zero movement. Pots, soil, saved positions, care state and interaction geometry remain unchanged. Shader bounds expand only the rendering sphere; footprints and geometry positions are unchanged. Per frame only two uniforms change, no extra meshes/material batches/lights; the zero-wind shader skips sine work. Original material hooks and interaction brightness delegate normally. [Validation](../validation/issue-518/README.md).

Patio fan palm (#524): only FURNITURE's `detailedPalm` planter uses the open 48-segment fibre-clay pot, curved fibrous trunk and 16 ×17 individually folded fan fingers. Dimensions/positions stay at the existing assumptions; small entrance palms retain the cheap template. PATIO.palmDetail centralizes visual assumptions. Four material meshes, two shared 128px bumps, 10,632 triangles, unchanged pot footprint; ordinary wind/shadow attributes retained. `tools/patiopalmtest.html` checks actual open soil, geometry/cost and wall clearance; [before/after and phone view](../validation/issue-524/README.md).

River park (#533): 90 assumed mature deciduous trees constrained to six aerial-derived canopy patches, 95 woody understory clumps and 190 low bank tussocks; sourced paths and a central grass glade remain clear. Reuses surroundings' instanced crowns/trunks and `registerTrees`; persistent angled branches distinguish bare mature trees from poles. Low waterside growth turns dry brown through `registerSeasonal`. All plant feet sample rendered terrain triangles. Counts/species/dimensions are visual assumptions in SITE.riverPark, not an individual-tree survey. [Evidence and seasons](../validation/issue-533/README.md).

ZZ plant regression (#561): `tools/zzplanttest.html` measures bounds and material draws across visible physical meshes, excluding hidden/ghost interaction targets introduced by watering. It retains the actual copper pot dimensions, every visible leaf/stem, cabinet clearance, movement, saved rotation/reload and original restoration.

Roof terraces (#605): `src/terracedecor.js` bakes patio.js `planter` palms / bananas / agaves (the shared cheap templates, cached per pot size and scale) plus its own olive, box/hydrangea, pot-flower, raised-bed and railing-box plants into one merged soft batch for all of Hus L's terraces; their plant-wind attributes survive the merge (`windGeometry` for the new ones, cloth gets zero sway). Foliage is squeezed towards the stem to stay clear of the screens and the set-back wall. See [environment](environment.md).

Patio hedges (#680): `patiohedge.js` reuses boxwood’s cached 256 px grayscale leaf atlas with a lighter green tint, broader leaf repeats and bump. `PATIO.hedge` marks the original 1.1 m height and new rounding, narrower foot and ±3 cm top waves as visual guesses. All L1007/neighbour runs join exterior’s existing hedge batch: one material/mesh, no added lights or draws. Plan extents and original rectangular collision segments remain unchanged; `registerSnow` still turns the material white, hides the colour map in winter and restores it in summer.

Measured with desktop `tools/perfcount.html` before/after #680 on the same scene: patio 109 → 108 calls, 512,661 → 514,965 triangles; overall peak 479 → 478 calls and 922,959 → 925,263 triangles. Texture estimate stays ~301 MB in 303 textures; both runs pass the budgets. These are render counts, not device frame-time measurements.

Leaf-card trees (#679): `src/foliage.js` replaces the flat-shaded icosahedron crowns of the site's trees and pavement shrubs (`surroundings.js` `trees`), the courtyard's plantings and pergola vines (`courtyard.js`, only the two geometry/material lines; the plantings batch is named `courtyard-shrubs`) and the far southern woodland (`southbackdrop.js`). Each lobe (radius 1, instance-scaled exactly as before) is a small lumpy core (a 20-triangle icosahedron with scattered normals and leaf-shaped holes in its texture) inside alpha-tested leaf-cluster cards on a shell, tilted off the tangent plane for a ragged outline; normals point out from the lobe centre (soft shading, no facets), vertex colours darken the underside and inside. Cards are single quads drawn two-sided: the shared material patches `normal_fragment_begin` so a card's back keeps the front's radial normal instead of three's flipped one. One `DataTexture` atlas (512 px desktop, 256 px phone: three leaf clusters + the core cell; a linear tint mask, transparent texels carry the leaf colour so mipmaps get no dark rims) and one white `MeshStandardMaterial` with `alphaTest` and `shadowSide: DoubleSide` — the depth material copies `map`/`alphaTest`, so the crowns cast lacy shadows. Triangles per lobe: tree 60 (phone 56), shrub 48 (phone 40), far 36 (phone 30) — below the old 80 per lobe; the trunks (tapered, open-ended, a leader and three branches into the crown, two of them forked; 64 px tileable bark, white birch bark with dark streaks) are 46 instead of 28. Instance colours and leaf cover are still set by `seasons.js` (`registerTrees`): winter shrinks the crowns to nothing and the branches carry the bare silhouette. Trees do not sway (plant wind is only for the potted plants by open windows, #518). All shapes, counts and colours are visual *guesses* in `FOLIAGE`. #1083: `surroundings.js` `fitCrown` narrows a site-tree lobe (width only; trunk spot and crown height unchanged) whose cards would reach within `FOLIAGE.wallClearance` (0.2 m, *guess*) of a `SITE.blocks` footprint it overlaps in height — the courtyard trees drawn 1.5–2 m from Hus A/B/C (e.g. [−21, 44.4], [−43.3, 44.4]) otherwise grew through the brick and windows (probe: 10 crowns, up to 1.6 m deep, since the leaf-card crowns of #679; Hus L had none). Not done: species-specific leaf shapes (one atlas for all), a distance LOD (InstancedMesh draws every lobe at any range; the core and mipmapped cards keep far crowns solid), the roof terraces' `terracedecor.js` balls, the window-sill plants.

Shared hedge form (#1143): `hedgeform.js` `hedgeBody` builds both the patio hedges and the entrance boxwood runs as a subdivided box (`cell` grid, bottom face dropped), rounded at the edges, dented mostly inward by smooth world-space noise (`dent`, `HEDGE` in config.js, all *guess*), pinched and darkened at the foot and varied in tone through vertex colours; leaf UVs are unwrapped so the long edges have no seam. `hedgeMaterial` adds brown stem glimpses in the leaf atlas's dark gaps in the lower 40 % (only while the map is on, so winter snow stays plain). Same draws as before (patio batch 1, boxwood 2); hedge triangles 6 600 → 25 748 in the full scene. Hus A/B/C have no hedges; the parking shrubs (SITE.shrubs) are round instanced crowns and unchanged. tools/boxwoodtest.html allows ±1.2 cm dent tolerance on the bed edge.


## Fixed entrance pots on phones (#1455)

`entranceplantbatch.js` groups only the rigid pot/soil children of the current twenty
L-house entrance records into six exact geometry/material batches. Leaves, their wind
shader/seed, placements, physical meshes and eight-sided collisions stay unchanged.
A/B/C use other builders and have no corresponding source group. The phone-only main
hook runs after Detail construction; desktop rendering is unchanged. Each color render
uses the existing per-source Detail masks and actual visibility, without a new distance
or occlusion rule. Empty batches are invisible. Original masks are restored in finally,
including nested renders and exceptions; source meshes keep answering physical rays.

The color proxies never cast shadows. During the real shadow pass, the original meshes
use their exact captured masks, original materials/cast flags and shadow-camera frusta.
No main-camera selection removes a caster, and no dynamic instance indices enter the
existing shadow tiles. Explicit mixed/all-layer warm draws retain their original policy;
prefilled native buffers let WarmUp compile/upload the instance variant behind its cover.
See [performance](performance.md) and [verification](verification.md) for measured limits.
