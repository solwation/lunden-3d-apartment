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
src/entranceplants.js  shared plant templates and door-relative entrance placement on ground and loftgång (#498)
src/boxwood.js         merged evergreen entrance hedge and winter snow caps (#496)
src/sillplants.js      flower pots on every inner window board (SILL_PLANTS, #136): five merged meshes, a loose item;
                       `userData.pots` / `rebuild(away)` / `potModel` let one pot be lifted out of the merge (#185).
                       #290: big lush plants (`leafShape` leaves; pelargon, orchid, violet, cactus, ivy, basil, monstera,
                       pothos, fern, olive), squeezed short of the blind's pack (`sill.blind`, `clear`) and the reveal;
                       ivy / pothos trail over the board's edge (`trail`; lying flat round the pot once taken)
src/plants.js          SillPot (#185): each window-board pot is a Holdable; its own model is invisible at home, shows (and
                       the merged meshes are rebuilt without it) once taken; the side-table flower and the kitchen shelf's
                       vase / pot plant are plain Things (kind 'plant'); window boards are put-down surfaces too
tools/planttest.html   headless test: lift pot plants (window board → table, side table → window board, the shelf; the face pot to the
                       dining table and back on its shelf, #343), F home
```

## Recent implementation notes

Living-room palm (#491): original id/position retained; geometry dimensions scale by 0.8, pot by 0.8 × 0.95 (Ø 30.4 × 34.2 cm, extra reduction is a visual choice). Shared rounded brushed-copper pot: src/plantpots.js. Scaling is baked into geometry, so saved furniture transforms cannot undo the size change.

ZZ plant (#495, resized #517): src/zzplant.js builds 15 tapered curved stems with eight paired glossy oval leaves and a terminal leaf each, using docs/references/garderobsblomma-2026-10-08.jpg for the silhouette. Assumed overall height now 126 cm, exactly twice #495; shared copper pot radius 15.2 cm/height 34.2 cm, also doubled. Smooth 16×8 leaf surfaces retain individual green variations, varied lengths/angles and a fine central/lateral vein bump. Floor corner x .37/z 11.4 and stable movable id are retained. Wall bounds bunch foliage clear of the west wall/BESTÅ/palm; wallExcludedMaterials preserves the round pot/soil dimensions instead of deforming them. Four material draws, ordinary shared layouts/restore. Parameters live in FURNITURE. tools/zzplanttest.html checks dimensions, actual round pot bounds, leaf variation, shared copper, mesh budget, cabinet clearance, movement/cancel/shared save/reload/restore; walktest verifies the patio route.

Entrance boxwood hedge (#496, corrected scope): src/boxwood.js replaces SITE.life.strip low faceted clumps in the existing entrance beds x -46..-10.6/-8.5..5.8, z -3.5..-2.9 (center -3.2), built by streetlife.js. The separate parking hedge SITE.shrubs at z -16.3 is restored exactly to its original round instanced seasonal crowns in surroundings.js. Assumed entrance hedge reaches 58 cm above ground (50 cm body on 8 cm soil), 44 cm deep with 4.5 cm rounded corners. Door-derived gaps include 35 cm extra clearance either side of actual leaf openings; existing portik gap and bed extents remain. All runs merge to two draws: evergreen textured bodies and winter snow caps. Matching collision segments now block foliage but leave entrance routes clear. No patio hedge change. tools/boxwoodtest.html distinguishes both locations, checks our passage via real geometry, seasonal parking shrubs/evergreen entrance boxwood and snow; walktest verifies entrance/traversal routes. Verified views in docs/validation/issue-496/entrance.png (camera 1.3/1.7/-5.1) and restored-parking.png (-4/1.4/-13.6) show both distinct strips.

Entréväxter (#498): `src/entranceplants.js`, byggd av `exterior.js`, placerar 11 krukväxter på markplanet och 11 på loftgången vid de åtta lägenhetsentréerna på varje nivå. `ENTRANCE_PLANTS` samlar visuella antaganden om antal, artval, krukmått och bladproportioner. Uteplatsens `planter` stöder valfria `pot`/`foliageScale`; entréernas tre mallar delar geometri/material och använder vanlig DetailCuller. Blad hålls fria från fasad/dörrar och loftgångens yttre gångfält; krukkropp/stam har marksegment respektive höjdbegränsade takväggar. Golvhöjd från `groundY`/loftgången. Referens och webbläsarvyer: `docs/validation/issue-498/README.md`; `entranceplantstest` och `walktest` verifierar passage, höjder och kollisioner.


Plant care (#553, part of #396): `src/watering.js` adds care targets to existing SillPot, plant Things and movable indoor palm/ZZ roots. Watered ids are saved in `x.watering`; no duplicate inventory of plants. Window soil vertex colours and original leaf/flower arrays change per pot and rebuild the same five material batches; own models receive the same transformation, including when moved or returned home. Other plants clone tagged soil materials once so a wet copper pot cannot darken its neighbor. The shelf face-pot eucalyptus is artificial and refuses water. `tools/wateringtest.html` covers actual touch fill/water, reservation/cancellation, exact dose, independent appearance, movement, reload and reset; `planttest` keeps existing lifting intact. All amounts, visual dryness and can dimensions are game assumptions in WATERING.

Plant wind (#518): `PlantWind` reads actual animation progress from apartment windows and the two `SwingDoor.exterior` leaves; cupboards, internal/portik doors and letter flaps do not drive wind. The largest open fraction gates every potted plant, including outside entrances, patio planters and artificial eucalyptus. Shared Weather.kind/rain/storm strengthens rain/snow/hail with smooth easing. Heights, frequencies, strength and a 6 cm maximum displacement per axis are visual/game assumptions in `PLANT_WIND`, not measured weather. Plant phase/stiffness and slow gusts vary; closed openings eventually give exactly zero movement. Pots, soil, saved positions, care state and interaction geometry remain unchanged. Shader bounds expand only the rendering sphere; footprints and geometry positions are unchanged. Per frame only two uniforms change, no extra meshes/material batches/lights; the zero-wind shader skips sine work. Original material hooks and interaction brightness delegate normally. [Validation](../validation/issue-518/README.md).
