# Furniture and furnishings

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [plan-material](plan-material.md), [interactions](interactions.md), [plants](plants.md).
## Module and test map

```text
src/furniture.js       loose furniture from FURNITURE in config (IKEA LANDSKRONA sofa/armchair …)
src/upholstery.js      #1010 explicit builder-owned cloth handles for sofa/armchair/ottoman/gamingchair/kidchair/vanitystool;
                       private material identity survives merge and light washes, original color/map/roughness/UV0 retained,
                       generic patterns use separate metre UV1/map.channel1. No traversal/global-material recoloring.
                       materialSurfaces appends textile/category klädsel to support independent semantic surfaces.
src/cleaning.js        the Klk under the stair on Entréplan (#338, CLEANING in config): `cleaningFittings` (world.js, stay with F: a white
                       wall shelf on the north wall, a tool rail on the east wall, the vacuum's dock) + the `cleaning` builder (a loose
                       item: toilet paper, kitchen roll, labelled bins Städ / Tvål / Påsar, bottles, a mop bucket with its mop, broom,
                       squeegee, dustpan, a step stool, a plain stick vacuum with a blue charging LED); kept under the stair's soffit
src/closet.js          Sovrum 1's walk-in closet (#331, KLK in config): `klkFittings` (world.js, Peab's: white wall standards, a high
                       shelf on the side wall + the far wall, a chrome rail under the side one; stays with F) and the `klk` FURNITURE
                       builder (loose): clothes on the rail, things on the shelves, make-up on the NORDLI, an LED mirror over it (a
                       lamp of its own, 'spegelns lampa', + a Reflector)
src/rugs.js            the rugs furniture.js built (#55, #310, #317): `rugLift(level, x, z)` = a shown rug's top over the floor there
                       (the cat follows it as it walks); `rugUnder` from config: a piece whose whole footprint is on a rug
                       (or `onRug`) is built standing on top of it
src/bedding.js         bedding shapes shared by every bed: `pillow(w, d, h, opts)` (#308) — a stuffed case with pinched-in sides (the
                       corners stick out), full in the middle, thin at the seams, low bumps, a head `dent`, `base(x, z)` to lie on
                       something (a pillow on a pillow); planar metre UVs; `geo.userData.top(x, z)` = its top for stacking
                       `duvet(w, l, th, opts)` (#309): a thick soft shell over a mattress with rounded edges, hanging `drop` over
                       the sides with a flare, low bumps (crumpled near the head), rounded seams, `quilt` channels, `extentL`
                       (a throw ending on top); UVs in metres along the cloth. furniture.js `addMattress` (ticking + a fitted
                       sheet) / `addDuvet` (+ the fold turned back at the head end) build every bed with them (BEDDING)
src/hooks.js           hook rails (#329, HOOKS): Sovrum 1's oak board, black hooks, a terry dressing gown and a hoodie (soft `drape` tubes);
                       #330 the kids' rails (KID_HOOKS, item `set`): `garments` list of gown | hoodie (zip, print) | cap | tote
                       #424 `towelhooks` (TOWEL_HOOKS): two round brushed-steel hooks on a bathroom wall, a mauve terry hand towel on each
src/cushions.js        decorative cushions (one atlas material: leaf print | bobble knit | geometric | corduroy | outdoor weave | striped weave (#399), vertex-colour
                       tint, #313) and the ribbed fleece throws (plum folded on the chaise, grey draped over the armchair's
                       arm; one material per colour) for the LANDSKRONA pieces (CUSHIONS, #278)
src/interior.js        fitted kitchen, laundry, bathroom fittings, tiled floors/walls (FINISH, KITCHEN,
                       TILED_ROOMS in config); merged into one mesh per material; a tiled room's floor runs on through
                       its door openings (`doorwayTiles`, world.js `doorways`, #306): to the closed leaf, the front door's whole depth.
                       Floor drains (#1072, `floorDrain` / FLOOR_DRAIN, all *guess*): a square stainless grate in each shower
                       (Badrum, WC/dusch, the visitable flats' wet rooms via standardinterior.js) and in front of the laundry
                       machines; a few mm proud of the tiles in the floor batch, visual only (collision floor flat)
src/kitchenstuff.js    the kitchen's cabinet/drawer contents (#229): `fillKitchen(P, kind, box)` — plates, bowls, glasses, mugs,
                       dry goods, spices, tea, pots, baking tins, serving/festive china, the corner unit's machines, cutlery,
                       utensils, rolls; interior.js `stock()` fills each front (`o.stock` = the kind, or 'own' / 'empty')
src/cabinets.js        wall cabinets with side-hung doors that open with E (Openables, max 90°; `corner` = that end's door
                       hinges away from the side wall, #154; in world.lids), e.g. the
                       Tvätt wall cabinet over the machines, none over the sink (LAUNDRY_CABINET, #138, #153)
src/openables.js       Openable (#103): the shared helper for fronts that open with E — 'hinge' (with a `max` stop, never
                       through a neighbour), 'flap' (bottom- or top-hinged), 'drawer'; kind 'cabinet', in world.lids.
                       interior.js builds the kitchen fronts, vanity drawers, the Stage 50 mirror cabinet, the Badrum's
                       HAVBÄCK tall cabinet (`havback`, #293), the laundry sink cabinet, the washer/dryer doors and the hall's EL/C cabinet (`buildElCabinet`: fuse box, router) with it
                       (`openFront`, hollow `shell` carcasses); `contents` (a mesh): only drawn while the front is
                       (partly) open (#228)
                       furniture.js `addDrawer` / `addDoor` for furniture (NORDKISA, NORDLI, ALEX, IDANÄS foot end, BYÅS's two end drawers, #212)
src/stuff.js           what is inside wardrobes and drawers (#228, STUFF): `Pack` (tinted boxes merged into one vertex-coloured
                       mesh, no raycast; `rbox` = rounded, #240: folded stacks, garments, shoes; socks are capsules), `garment`, `stack`, `rolls`, `shoes`; `wardrobeFill` (world.js: clothes on the rod,
                       hat shelf, shoes — by the room's person, `personFor`), `drawerFill` (addDrawer `fill`: tees, socks,
                       underwear, pyjamas, jeans, toys, crafts, nightstand). Sovrum 1: NORDLI, NORDKISA, IDANAS drawers;
                       Sovrum 2: wardrobe L, the `pictures` posters "EAT SLEEP GAME REPEAT" (#430, east wall) and "THE GULAG" (#694, west wall over the gaming desk; *guess* 42 × 59 cm); Sovrum 3: wardrobe G + ALEX drawers (#230)
src/shelves.js         what stands on the kitchen's String shelf (`buildShelfDressing`, `SHELF_DRESSING`; #291, moved from the two oak wall boards in #1298,
                       called by furniture.js `stringshelf`): cookbooks, glass jars, lathe-turned stoneware (speckle map),
                       brass candlesticks, a mortar, a cutting board, framed prints (one canvas atlas); merged per material;
                       the white face pot with wire glasses and faux baby eucalyptus hair (#343, lowest board, 'krukan med glasögonen')
                       and the trailing pothos (middle board) are Things (kind 'plant', #185, `userData.things`/`keep` of the shelf piece)
src/aborg.js           the JYSK ABORG café set outside the kitchen window (#406, ABORG): a folding table + two folding chairs (seats)
src/randers.js         the JYSK RANDERS tray table by the armchair (#405, RANDERS): tray, rails, straight legs, a low cross
src/pineapple.js       Livia's pineapple mirror in Sovrum 3 (#412, PINEAPPLE_MIRROR): an extruded oval frame with a scale bump map,
                       a crown of leaves with a herringbone bump, an oval glass with its own Reflector ('ananas')
src/xmastree.js        the Christmas tree (#571, XMAS_TREE): a FURNITURE builder — a dark inner body, overlapping serrated whorls +
                       two layers of branch tips (one vertex-coloured mesh, soft outward normals, #1217 `fluff`), stand/skirt/trunk/presents (one matte mesh), baubles + bead garland (one shiny mesh), a gold
                       star + additive halo sprite, LED string = instanced bulb cores + additive point halos; a small-lamp spec
                       ('julgranen', not auto) with one pool anchor in front; `crownRadius(y)` for the overlap test
src/newyear.js         New Year's Eve (#1199, part of #1170, NEW_YEAR): `newYearPhase(day)` ('count' the last 10 s before 00:00
                       on 31/12, 'cheer' 60 s after), every TV switched on with a countdown via Screen.overlay (screens.js) and the
                       ones it switched on off again; four merged champagne flutes (2 draw calls) on the coffee table until 04:00.
                       #1222: each flute is a real `Flute` (things.js Glass, champagne at DRINKS.pour.glass.champagne.to): its
                       hidden model is the look-ray target while it stands untouched in the merged decor (rebuilt without it once
                       taken); taken/put down it is an ordinary glass (drink, refill from the champagne bottle, F/cleaning send it
                       home); at home outside the glasses' hours it is away (no target). Not in world.looseItems: newYear owns its
                       visibility. Test: tools/newyearglasstest.cjs BASE OUT.
                       #1222 "Skåla": any held Glass has `useAlt` (right click / the 🥂 button): sfx.clink, the glass raised (`toastT`, TOAST.raise s),
                       a line from TOAST and one room message; a nearby player's toast is answered once while a glass is held; Olof
                       answers from the car within TOAST.olof m. main.js `toastHandler`; test: tools/newyeartoasttest.cjs BASE OUT.
                       #1239: each client counts down at its own local midnight (the game clock starts at the visitor's real h:m:s, no
                       longer minute-truncated); TVs retry while the phase lasts (mains back on); entering 'cheer' from any phase starts the fireworks.
                       Fireworks: #1200. Test: tools/newyeartest.cjs BASE OUT (frozen + running clock, screenshots, draw calls)
src/christmas.js       the season layer (#571): `inChristmas(y, m, d)` (1 Dec – 6 Jan inclusive, over the new year) and
                       `ChristmasSeason` (main.js, every frame by the day cycle's date): shows/hides the tree, hides the pieces whose
                       current pose reaches into its crown (+ what stands on them, loose things on them) via `userData.seasonHidden`,
                       re-judged after every furniture move / F; never touches poses or the saved layout
tools/christmastest.html headless test (#571): the date line (30/11–1/12, 31/12–1/1, 6/7–1, directly and on reload), no tree =
                       no collision / pick / light, overlap hiding (plants, armchair corner + its floor lamp, coffee table + fruit
                       bowl), cancelled vs confirmed move, saved spot across reloads and out of season, the season ending mid-move,
                       the #591 default in the armchair corner (doorway free) and the #571 layout id carried over / dropped
tools/tvtest.html      headless test: TVs on/off (living room + Sovrum 3), new programme each time, the remote, F off
tools/pctest.html      headless test: switch the gaming PC on/off (game moves, RGB cycles), the chair is a seat and
                       starts the PC, the bunk seat swings the monitor round (film)
The secretary's stand (legs, braces, wire shelf) uses a white `frame` material from `frameColor` in config (#1292); only knobs and the key plate stay black.
tools/secretarytest.html headless test: the secretary's flap (desk) and its 8 drawers open/close, the open desk blocks;
                       its trinkets (#182): the car to the coffee table stays when the drawer closes, back in it rides along,
                       its place blocked while the drawer is closed, the crayons, the owl, F sends them home;
                       the secret drawer (#183): 10 seeded opens never repeat, a surprise left on the table stays, SECRET.keep
                       #447: a cup down on the open desk (none on the shut flap), the flap does not close under it
tools/opentest.html    headless test (#384: the dishwasher's racks with their door down, behind the front while in): every Openable front (kitchen + furniture) opens/closes with the button; open, none
                       overlaps a closed neighbour or goes through a wall (#154); every kitchen front is stocked (or own/empty)
                       and its contents are hidden when shut and never out through the front (#229); the same for every
                       other front with contents (#230, #231)
tools/bestatest.html   headless test: the BESTÅ display cabinet's six doors open/close, its spots (down over the front) and the
                       lit glass section switch with the room (#191)
```

## Recent implementation notes

BESTÅ wall placement (#492): the whole cabinet is a wall-mounted movable root (including doors, contents and spots), and its preview must fit vertically within the floor/ceiling. Existing misplaced saves remain selectable and can be moved or restored individually. Regression: tools/bestaplacementtest.html.


Sliding wardrobe seams (#537): world.js extends G/L carcass ends, top and plinth to the outer track and adds rebated jambs/track lips behind the leaves. doors.js insets the two panels within the opening (4 cm meeting overlap); the inner panel carries a small meeting stile, merged into its existing mesh, with 1 mm outer-track clearance. WARDROBE in config centralizes these construction assumptions (not measured Peab joinery). All three fitted wardrobes share the fix; no new materials or final draw meshes. tools/wardrobetest.html checks 315 closed seam rays including side/top/bottom clearances at ±80°, both leaves partially/fully open without track overlap, visible openings and side switching. opentest and walktest cover existing cupboards/routes.

Entrance mirror (#540): HALL_WALL.tall is the user's pictured black IKEA NISSEDAL 65 × 150 cm (docs/spegel-nissedal-svart-65x150.jpg), centred on the same 1.30 m hall/kitchen partition, leaving 32.5 cm to either end. Frame width/depth and hanging height remain assumptions. keycabinet.js already derives frame/glass/Reflector dimensions from config; the stable movable identity f-mirror-nissedal-0 keeps rearranging/saved moves. The upstairs NISSEDAL remains its separate 40 × 150 cm model. Browser verification: mirrortest plus actual entrance-mirror selection/placement/reflection/save/restore. Its LED night light (#572, `HALL_WALL.tall.nightLight`) hangs in the same group and moves with it; see graphics.md.

Laundry interiors (#550): interior.js replaces each solid washer/dryer block and front black disc with a thin shell, an indexed extruded white face with a circular hole, an inward steel cylinder and a recessed black drum back. Existing body materials stay merged in Batch; moving round doors and their dimensions are unchanged. Openable.laundry exposes kind/front/centre to src/laundry.js for three static item anchors physically inside the drum. LAUNDRY.drum contains the assumed proportions; laundrytest checks actual garment bounds/door access and walktest keeps existing routes clear. #687 adds a curved tinted porthole, handle and hinges to each moving door, plus drum paddles/perforations and a simple fascia drawer and programme knob; these remain batched with the appliance geometry and do not change the laundry interactions.

Usable wardrobe laundry shelves (#552): world.js exposes the two bedroom wardrobes' construction frames and existing sliding-leaf references, retaining their positions/geometry/collision. stuff.js wardrobeFill reserves LAUNDRY.wardrobe.reserve at the negative local quarter of the existing hat shelf. Laundry creates two vertically stacked static item anchors there, with a held-only front pick; no extra shelf/tray mesh. One covering panel must fully clear the folded garment width before storage/taking is allowed. Stored garments keep their own model and stable id and do not slide with the door. The hall wardrobe is handled separately by HallCare (#556). All reserve/capacity/spacing figures are assumptions.

Bed care (#555): bedding.tagBedding marks only duvet/spread vertices with bedCare 1 (or bunk 1/2); other geometries receive zero before mergeStatic. The marker survives merging without preserving extra draws. BedCare deforms the marked vertices from captured positions/normals, retaining smooth source normals via the deformation Jacobian and restoring exact arrays when made. Frame, mattress, pillows and collision footprints remain unchanged. BED_CARE holds assumed fold height/pull/time. rest.onBegin marks only lying bed/berth rumpled; sitting leaves it alone.

Hall jacket/shoes (#556, #685): coatrack and shoerack expose existing first jacket/sneaker coordinates in userData.hallCare and omit those decorative originals. The same exported jacket/shoe builders make live Items models; their jacket trims and shoe finishes share cached materials so mergeStatic can keep each wearable to a small number of batches. Jackets have rounded, padded bodies, hanging sleeves/cuffs, a hood or collar, front fasteners and raised puffer channels; sneakers have layered soles, shaped uppers, tongues and laces, while boots have shafts and soles. The jacket still switches between flat/floor and hanging poses without replacing its geometry. The coat-rack beanie is a rounded lathed cap with a folded brim. Hall wardrobe construction exposes its existing frame/leaf references; contents.js reserves the first coat position, retaining seeded placements of the remaining coats, hats and shoes. HALL_CARE centralizes assumed floor/pick/access settings. Fixed joinery and rack collision footprints retain their geometry; hangtest checks the enhanced hanging models remain inside rack width and wardrobe bounds, and wardrobetest checks panel travel and seams.

Hanging clothes stay inside (#610): coatrack sets its outer hooks a jacket's measured half width (sleeves included) in from the rack's ends, so every jacket (and the life jacket on hook 0) hangs within the board's width and footprint; the hall coat/shoe racks are 86 cm, centred on the free wall between the EL cabinet (CABINET_FIXES z1 0.865) and wardrobe G, 2 cm clear of each. The hall wardrobe's rod half-length excludes the jamb lips (#537), its end coats sit their own reach (hood, jitter) in from the ends; wardrobeFill only puts a shelf box/stack where it fits short of the end (Sovrum 2's L wardrobe had one 8 cm through its end). World stores each fitted wardrobe's `contentsBox`; tools/hangtest.html checks the rack against the EL cabinet and wardrobe, all three wardrobes' contents (+ the hall's life jacket) inside their carcass interiors and SMÅSTAD's clothes inside its sides.

HAVBÄCK reserve rolls (#557): interior.js exposes the original five bottom-shelf roll anchors and the real front; contents.js omits their decorative cylinders. ToiletPaper registers Items models at those fixed carcass anchors, shown/accessible only when the actual door is open. Existing cabinet shell, shelves, front and footprint are unchanged.

Christmas tree (#571, #591): `XMAS_TREE` + FURNITURE `xmastree` (level 0, x 0.82, z 8.45, rot −135: presents towards the room). #571 put it in the SW corner by the window (palm and ZZ plant); #591 (the user: "hörnet till höger om vitrinskåpet") moved the default to the NW corner — seen from the living-room doorway the BESTÅ hangs on the right-hand (west) wall and this is the corner to its right, nearer the doorway, where the armchair, the stool, the NYMÅNE floor lamp and the RANDERS tray table stand (hidden while the tree is there). The crown keeps 5–8 cm off the west and passage walls, clear of the BESTÅ (z ≥ 9.95) and ~0.8 m west of the doorway (x 2.15–3.25); the spot is a *guess* (screenshots: [issue-571](../validation/issue-571/README.md), [issue-591](../validation/issue-591/README.md)). A layout entry under the #571 id carries over when it was confirmed elsewhere and is dropped when it still holds the old default (rearrange.js `apply`, `carryOld`, like the Verona sofa #489). Height from the room's RH 3.0 m: crown to 2.5 m, star tip ~2.8 m. All sizes, colours and counts are visual *guesses*. `src/christmas.js` shows it 1 December – 6 January inclusive by the day cycle's date; out of season it is hidden (`seasonHidden`), has no collision (rearrange.js `refresh` skips it), no E target and no light (lights.js `shown`). In season, every piece (not rugs) whose current footprint (or box, for pieces without one) is within the crown's radius at its own lowest height is hidden for the time being, with the pieces on its surfaces (`groupFor`) and the loose things on it (`looseOn`); their lamps go dark, their footprints, seats and moving segments go away; poses, revisions and the saved layout are untouched, and the layer is re-judged after every move, remote layout change (rearrange.js `apply` reveals first so a hidden piece moved elsewhere carries its things), F and date change. During a Möblera om move the layer waits for confirm/cancel; the season ending while the tree itself is being moved cancels that move.

Verona patio lounge modules (#692): config places the three-module sofa row and each 1.3 m divan as its own `veronasofa` item. Each root owns its frame, cushions, seats and footprint, so rearrange rotation, collision checks, seats and saved poses apply independently. The previous single-root saved transform is converted once into poses for the three new ids on both local load and shared-layout GET; an unmoved legacy sofa is retired without changing the new default arrangement. `tools/veronatest.html` covers module seats, rotation, cushion following and old layout migration.

## Runtime rug support (#1008)

`registerRug` records the existing rug's actual local top (`item.h + .002`) on
`userData.rugTop`. `rugSupport(level, worldXZPoints, margin=.02)` tests the actual
shown matrix, including accepted translation/rotation. One rug must contain the
whole sampled furniture base; the original 2cm wall/headboard slack and initial
`rugUnder` build remain. No geometry/material or horizontal grouping changes.
`floorRugLift` preserves that initial lift, and Rearrange derives a per-piece
`floorRest` anchor without changing existing original poses.

Ordinary floor preview uses that anchor plus live rug support. While a rug is
hidden for a move preview, `rugPreviewSupport` keeps its original support active;
cancel only removes the preview. Accepted apply takes `snapshotRugSupport()` before
poses/materials and calls `reconcileRugSupport(snapshot, movedSet)` afterwards.
This is an explicit before/after boundary for a later height-changing rug material,
not a new layout revision. Derived Y adjustments update actual stacked pieces,
loose placements, seat/aim spots and lamp metadata through the existing refresh
and carry hooks. Moving a rug does not drag furniture in XZ. The existing
`CatSpawner.followRug()` reads the same live top.

Repeated apply is cheap when poses/material choices did not change. Reconciliation
is idempotent and does not write the shared layout. Fresh-page native evidence
covers support Y, not full-position reload: pre-existing #1013 double-carries a
saved loose plate in XZ during initial layout restoration, reproduced with the
unchanged pre-1008 apply. That separate defect is not fixed or accepted here.

## Indoor upholstery choices (#1010)

All six actual movable indoor padded seats expose their own `textile` surface
through the existing material library and revision-checked furniture protocol:
LANDSKRONA sofa/armchair, ottoman, gaming chair, kids chair and vanity stool.
Each builder explicitly passes its cloth parts/private material handles to
`upholsterySurface`; decorative cushions/throws, oak/dark/gold legs, white chair
frame and gaming plastic/base/armrests keep their materials. The ottoman's
piping and gaming chair's integrated upholstered accents restore their distinct
original finishes. Cloth material color/map changes in place, so merged meshes,
focus outlines and both lamp-wash hooks retain identity. Original UV0 is never
changed; UV1 preserves metre scale for the two shared128px procedural patterns
(`MATERIAL_LIBRARY.upholsteryTile`, visual guess). No per-frame scene walk.

The six stable IDs are derived from the same FURNITURE type/level/coordinates/
serial/suffix as buildFurniture, separately whitelisted in materialcatalog for
Worker validation. Existing version1, rug/curtain IDs and pose/material revision
separation remain intact. Katalog/Worker44f3be6 was actually deployed before
this client. Bed frames and patio seat pads remain in #1011/#1012; wood beds,
paper-cord SKANSNÄS, ABORG steel, bamboo, bedlinen/bedCare and loose cushions
are not silently enrolled. Browser/model evidence and limits are in verification.md.


## IDANÄS frame upholstery (#1011)

Only the actual Sovrum1 IDANÄS receives a `textile` surface, named
“Sängstommens tyg”, through the same private upholsterySurface handles.
The main padded frame, tilted headboard and two moving drawer fronts share
that selection. `addDrawer` accepts an optional explicit `frontPart` callback
while building its front; other callers follow the unchanged default. Drawer
interiors, contents, dark shadow seams, wood legs, mattress/bedding, bedCare
attributes and Pingping remain separate. Original melange map/channel0, its
6×6 repeat, color and .95 roughness restore on the same private handle;
patterns use UV1 after static merge and on the kept moving fronts. No new
mesh/triangle/draw is added to the ordinary closed/open bed.

`BED_UPHOLSTERY_MATERIAL_IDS` separately whitelists the actual existing
`f-bed-1-4.35-2.55-0-0`; it does not change the six indoor-seat IDs/types.
Two MYDAL frames and HEMNES daybed are wood and are not enrolled, nor is the
generic upholstered bed variant that has no actual FURNITURE instance.
Bedlinen/cushion families retain their own scope and material identities.

## Verona fixed-pad cloth (#1012)

Each actual movable Verona `sofa`, `divan1` and `divan2` registers its own
`textile`/`klädsel` surface named Fasta dynor. `veronaModule` receives that explicit
optional handle and marks only its seat/back pad meshes with metric UV1 before
the normal per-piece merge. It reuses `upholsterySurface`, existing presets and
physical repeat; no new pattern generator or tunable is introduced.

The shared global `cushionMat` is retained for `decorative:true` neighbors and the
legacy unpartitioned `all` builder. Steel/slats, part geometry/rotation, standable
footprint, rest spots, loose decorative atlas groups and dynbox copies are
unchanged. Native evidence compares all three actual parts and one real neighbor
against source-bound originals, then exercises actual Patio summer/rain/winter
visibility while fixed-pad choice remains. Native per-part merged meshes stay
3→3. Decorative cushion/box material editing belongs to separate #1015.


## IDANÄS linen (#1019)

The one actual double bed adds five semantic surfaces after its existing frame
`textile`: fitted sheet, pillowcases (head and hotel originals), duvet/fold,
knitted foot throw and accent pillow. Each explicit builder-owned handle preserves
its original finishes; pillowcases retain separate printed and plain-white
original materials. Existing generic upholstery choices/metric UV1 are reused.
`addMattress` accepts a final optional surface only for the fitted layer, never
the ticking; `addDuvet` accepts `o.surface` before its unchanged care tag for both
main/fold shapes. Default callers and actual MYDAL/HEMNES controls remain original.

No shape, seed, pillow-top stacking, Pingping home, drawer action/interior, rest
spot, footprint or soft-placement data changes. Both duvet/fold and foot throw
retain care-index0 in the same original bed unit. Independent material bindings
change merged grouping, not original per-part geometry or UV0.
### Independent MYDAL linen (#1020)

Both actual unicorn/vader MYDAL objects expose six BUNK_LINEN surfaces (lower/upper sheet, pillowcase and duvet/fold), bound explicitly before merge through upholsterySurface. Optional addMattress sheet-only binding and addDuvet o.surface reuse #1019's contract, retaining default behavior and care:k marking. Each sheet/case/duvet owns one private finish; ticking, wood/ladder, drawable upper base, original UV0, geometry, footprints and Rest/watch spots are unchanged. Original restores existing maps/colors; generic patterns use metre UV1. Six independent finishes add four merged meshes per model; the actual component render separately measures five→nine draw calls, unchanged25,556triangles. No new geometry or global material mutation.

## Shower fittings (#1042)

`interior.js` shares two cached local shower templates between our bathroom/WC and
`standardinterior.js` in L1004 (L1201 keeps its separate generic wet-room builder). The rain head has a shallow profiled
cap and concentric silicone nozzles; the hand shower has a tapered handle, angled
spray face and rail clamp. Mixers have bevelled wall rosettes, end grips and a
marked safety button. Hoses use 48 longitudinal / 8 radial segments. Static parts
remain merged by material, with one small additional safety-marker material and
no new light, animation or render pass. Detail proportions are visual assumptions,
not verified Tapwell product dimensions (`SHOWER_FITTINGS` in config). Existing
water outlets, spray directions, thermostat picks and sound/interaction code stay
unchanged. A/B/C have no corresponding furnished shower interior in this model.

## LANDSKRONA cushion shaping (#1040)

`seatModule` uses a cached closed crowned shell for both horizontal seats and
rotated back cushions, with small same-cloth welt tubes. Sofa and armchair share
this shape and the softened arm fronts. `LANDSKRONA.upholstery` holds visual
guesses, not measured dimensions. All new cloth explicitly receives UV1 through
`upholsterySurface.part`; piping uses the existing private cloth material and
merges into the same draw batch. Decorative cushions/throws and the builders'
rest, placement and collision metadata retain their existing anchors. The seat
crown peaks at the old seat top so the fixed throw/pillow placements stay clear.

`BASELINE_FURNITURE=/absolute/path/to/old/src/furniture.js node
tools/verifyfurniture1040.cjs http://localhost:8871 before /tmp/furniture1040`
serves the explicit old builder through a browser route; use `after` for current
code. Set `PLAYWRIGHT_MODULE`/`CHROME_PATH` when needed. `VIEWS` selects comma-separated
PNG filenames; `CHECKS_ONLY=1` runs without rendering. After a baseline checks run,
set `EXPECTED_LANDINGS=/path/to/before_checks.json` to ensure every previously
available indoor cat seat remains available. The default armchair ray already hits
a decorative cushion above the cat's permitted landing height; that unchanged
rejection is recorded separately from successful sofa landings. Both runs compare the old/new metadata, merged mesh/triangle counts and
pattern/original restoration, exercise real Rest and cat landing selection, and
capture matched daylight/evening room views. Arm-front welts follow the rounded
front surface rather than a flat floating outline. Images enable full quality for a
single draw, returning to lazy mode after capture. This is desktop browser
function/visual evidence, not a physical Surface Pro frame-rate measurement.

Kitchen cutlery stock (#1052): `CUTLERY_STOCK` lays out two shallow staggered piles of three
original #1039 pieces per compartment (36 instead of 24 overall). `kitchenstuff.js` retains
the insert, detailed geometries and its two material batches; drawer motion and hidden-when-closed
contents remain unchanged. `tools/cutlerystocktest.cjs GAME OUT` checks the actual plan kitchen
and Openable, individual compartment bounds, stock count and real WebGL costs.
[Paired pictures, costs and limits](../validation/issue-1052/README.md).

## String shelf on the kitchen wall (#1272, #1291, #1298)

`stringshelf` (`STRING_SHELF`, `src/furniture.js` `stringshelf`): the user's 60s String-style wall shelf
(docs/stringhylla-referens-foto.jpg, measures from docs/stringhylla-matt-anteckning.jpg: 81 wide, 32.5 deep, sides 75.5 high).
Two white wire ladder sides (rails + a rung every 4 cm across the depth) and three dark-brown boards, thin boxes in two flat-colour
materials (no texture). Board thickness, board heights, wire sizes and colours are *guesses* (the
"Hyllplan …" line of the note is illegible). Origin = the shelf's centre, local z 0 = the wall.

**#1298: it replaced the two oak wall boards.** It hangs on the kitchen face of the hall/kitchen partition (x 2.15, centred on z 1.06 = where
the oak boards with black brackets were, z 0.56–1.56; the shelf spans 0.655–1.465), the LOWEST point of its sides 1.84 m above the floor (the
user's "ca 1,84 m" so nobody bumps their head, *guess*), the top at 2.595 under the 3.0 m Entréplan ceiling (the 2.5 m soffit is only over
Tvätt/Badrum, west of x 2.06), clear of the framed print below (top 1.70) and of the light switch (z 1.65). The wall clock and the calendar
are back at their old spots (`WALL_CLOCK` z 4.16 / y 2.0, `CALENDAR.z` = the clock's); the drawings by the toilet door were never moved.
What stood on the old boards (`src/shelves.js`, `SHELF_DRESSING`) now stands on the three boards (by the shelf's own `boards` heights,
28 cm between boards, so nothing there is taller than that): lowest board — cookbooks, two jars, the face pot (Thing 'krukan med glasögonen'),
the landscape print; middle — the pothos (Thing, vines over the front edge), jug, vase, mortar on a book, the small print, bud vase, tea tin;
top (open above) — candles, the olive bottle, the botanical print, the cutting board with plates and a bowl. The static items are merged per
material into the shelf piece (they move with it in Möblera-läget); the two plants are `things` + `keep` of the piece, exactly like the wine
rack's bottles, so they can be taken and put back and follow the shelf when it is moved. The old `buildWallShelves` / `WALL_SHELVES` and the
`shelves` loose group in `world.js` are gone.

Like the wine rack it is a `picture` piece in `src/rearrange.js` (wall placement via the wall ray, rotate, saved layout,
Home reset, NAMES `stringhyllan`, floor/ceiling box check) and has no collision footprint; on another wall it may reach into a
perpendicular wall near a corner (explicit limitation). Saved layouts: the piece id comes from its x/z, so `carryOld('stringshelf', …)`
in `src/rearrange.js` `apply` takes both earlier defaults (#1272 z 4.55, #1291 z 4.16): stale entries under any old id are dropped so the new
default applies, one that was moved away from every old default carries over. Test: `tools/stringshelftest.html` (position 1.84 m,
dressing on every board, no old board left, plants follow, migration), `tools/planttest.html` (taking the plants off the shelf).

## Children’s billiards (#1328)

`src/billiards.js` adds the local child-size table to `Playroom`: merged cloth/frame/legs/six pocket mouths, 16 instanced rolling balls (solids/stripes and cue), one animated cue and the two scoreboards in one canvas-textured batch. These are four existing visible draws; the #1411 rotation adds no light, texture or draw. The complete group is hidden outside the room, and `Playroom.update` freezes its simulation outside. Four outer-frame segments block the player without obstructing the entrance/exit. `PLAYROOM.billiards` centralizes guessed dimensions, its quarter-turn yaw and playability coefficients; these are not measured apartment fittings. The group rotation turns the short end toward the south doorway while the table stays at the centre. Collision corners follow that rotation. Camera aim is inverse-rotated once before local physics or a shared stroke; incoming stroke directions, ball snapshots and Worker simulation stay in table-local coordinates. The rendered balls, cue, pick box and scoreboards inherit the group rotation.

`src/billiardphysics.js` is a renderer-independent equal-mass local simulation with bounded substeps, linear friction, ball/ball and cushion restitution, six pockets and safe cue respotting after a scratch. Aim over the table and use E/touch; horizontal camera direction selects the stroke, a new stroke waits for rest, and the next stroke after all object balls are pocketed re-racks. No rules, multiplayer or sound are included (#1329/#1330). Verify with `tools/billiardtest.mjs`, real-app `tools/billiardtest.cjs` and the room lifecycle test. Gameplay is excluded from the public downstream.

### Rules and board (#1354)

`src/billiardrules.js` is a renderer/network-free local rules model (reusable for the shared room, #1355): free play (no turns/goals/end) or simplified two-sided 8-ball. The table is open until the first legal pocketed ball picks solids (1-7) or stripes (9-15); a legal pocket keeps the turn; fouls (cue ball pocketed, no ball touched, wrong group or 8 first) pass the turn without ball in hand (the physics respots the cue ball); the 8 wins only once your group is cleared and without foul, otherwise it loses; a finished game blocks strokes until a new rack. `BilliardPhysics.firstHit` reports the first object ball the cue touches. `Billiards` settles each stroke into the rules once balls rest, and two canvas boards (one per long rail, a shared texture) show mode, whose turn, target and last verdict, with two real pickable buttons each (`playroomBilliardsMode`, `playroomBilliardsRack`; E / touch action button via the normal focus). Test: `tools/billiardtest.mjs` (rules) and the board section of `tools/billiardtest.cjs`. Gameplay: never transferred downstream.

### Shared table (#1355)

With the players room connected (`ghosts.connected`) the children's-room table is one game shared by everybody who stands in the room; offline it stays the local game above. The room (`cloudflare/players.js`, Worker) owns the game: it keeps `{ snap, st: seats, busy }` in memory and in storage `pool`, runs every stroke through `simulateStroke` (`src/billiardsync.js`: the same `BilliardPhysics` + `BilliardRules`, fixed step `STEP` = 1/120 s, ~15 ms CPU) and broadcasts `{ t: 'pool', k: 'S', i, d, ms, e, st }` (direction, duration, end snapshot) to the players whose last position is inside the room. Clients (`Billiards.onNet`) animate the stroke with the same fixed step and then adopt the room's end snapshot (`adopt`, whole millimetres, so nobody can drift; the local run ends <1 mm from it, `Billiards.drift`). There is no ball stream: one request and one broadcast per stroke / rack / mode switch.

- Requests `{ t: 'pool', k: 's'|'m'|'r', q, d? }`: shoot, next mode (new rack), new rack. `q` = the table sequence the client last saw; the room accepts only `q === current`, so stale or simultaneous requests get `{ k: 'no', why: 'stale' }` plus the current table `{ k: 'T', e, st }`; also refused: `away` (not in the room / more than `PLAYERS.pool.reach` = 3 m from the table), `busy` (balls still rolling, `busy` = stroke duration + 0.2 s), `fast` (more than one action per 0.5 s per connection), `turn`, `over`. Payload limits are the normal 256 bytes / 6 messages per second per connection and the monthly request cap.
- Seats (8-ball only): `st[0]`/`st[1]` are the player ids of Spelare 1/2. The first to shoot when it is a free seat's turn takes it; a seat whose holder has left the room is free again; the holder of the other seat may not take this one while somebody else is in the room, but a player alone in the room plays both sides. Free play has no seats. The board shows "Du är Spelare N" for a seated client.
- Entering the room (first state with a position inside, also after a reconnect) sends `T` with the existing table; with nobody inside, the table is dropped (memory + storage) and the next visitor gets a fresh free-play rack (sequence 1). Hibernation keeps the table (storage). Any player in the room may press mode/rack (no stroke is lost: refused while balls roll).
- Tests: `node --test cloudflare/billiards.test.mjs`; real clients: `tools/billiardpeertest.cjs`. Gameplay: never transferred downstream; sounds stay #1330.

## Expanded hidden clubhouse (#1374, part of #1369)

`src/clubhouse.js` supplies the assumed18×10.4×2.7m fantasy plan: a south hall, west BIO, middle BILJARD and east SPEL. These are game choices, not measured A/B/C/L architecture. `clubhouseLayout()` supplies partition/header boxes and collision edges with three1.5m clear doorways; the outer room bounds remain shared through PLAYROOM, including Worker presence. The billiard table is centred inside BILJARD at(-1500,-1501.83), halfway between its north wall and the south partition inner face (#1482). Its short end still faces the doorway (#1411). The render transform, collision, shadow and server reach share PLAYROOM.billiards; ball snapshots remain table-local. The west room now has a framed2.6×1.46m local TV screen, red velvet side curtains and eight armrest seats in two rows, split by an assumed0.82m center aisle. Each seat has a normal rest target aimed at the screen; per-chair footprints leave the aisle and route behind the east row available for approach and standing. Dimensions, colors and finishes are guesses. The gaming desk/stool remain in SPEL; `furniture.desk.x/z` offsets keep the pieces together. The under160cm gate and always usable exit remain.

`clubhouseSigns()` draws four labels in one512×256static atlas. The existing ceiling panels sample a cream atlas swatch and share the signs' draw, keeping the whole visible room at15draws in the lifecycle checks; no new real lights. Static canvas data is released after upload on phone profiles. Disco rays test actual partition/header entry faces; an open doorway lets a ray continue to the hall instead of painting an invisible plane. Room mesh/targets/updates remain hidden outside.

Tests: `node --test tools/clubhousetest.mjs cloudflare/billiards.test.mjs`; `tools/playroomtest.cjs` includes three held-W doorway routes, a complete four-side walk around the table, entry/exit/height gates, sitting/getting up, switches and outside draw preservation; `MOBILE=1` uses the supported844×390touch profile. `tools/billiardpeertest.cjs` exercises real app entry and the shared table through an isolated local Worker. This personal game interior is never transferred to the public repository. Cinema seating/video remain separate#1375/#1376.

### Softer clubhouse furnishings and materials (#1481)

`clubhousefurnishings.js` builds rounded, slightly crowned cinema cushions,
padded armrests, cylindrical legs and continuous folded curtain meshes. The
seat top, back height and original collision/rest footprints remain the limits;
the gaming stool now has a round upholstered seat. Furniture edges, lamp rims
and the billiard-table rails have small bevels. Billiard physics and pick targets
remain independent of these visual meshes.

`clubhousematerials.js` supplies one PBR finish shader for the existing room and
table batches: linear vertex colours, metre-scale staggered floorboards, subtle
wood grain, filtered cloth weave and distinct paint/wood/fabric/metal roughness.
A static, room-local ceiling-light approximation and cloth grazing response add
warm light variation; these are visual approximations without new light objects,
shadow maps, external textures or vertex deformation. The callback is explicitly
registered with `vertexcompile.js`, preserving the phone's geometry-bound culling.
`PLAYROOM.appearance` centralizes the artistic assumptions. These gameplay
furnishings have no counterpart in the public viewer and are not ported.

### Clubhouse finishes (#1480)

`src/clubhousefinish.js` derives exposed skirting runs from the actual outer and
partition wall solids, including both sides and passage jamb returns. No trim
crosses the three passages or the exit threshold. Dimensions in `PLAYROOM.finish`
remain visual assumptions; no Peab measurements or house A/B/C/L layouts change.
The construction shell uses the existing `architectureEdges` builder before
furniture merges into it. L1007's `buildAO`/`buildWallAO` add floor/ceiling bands
and concave corner shading; headers affect the ceiling without closing passages.
The existing `buildContactShadows` supplies one batch under chairs (above the
cinema carpet), desk, stool, DJ bench and billiard table. All belong to the hidden
Playroom group, with no real lights and no new frame-loop code. The public viewer
has no gameplay clubhouse, so this finish has no downstream transfer.

### Clubhouse TV and computer (#1365)

`src/playroomdevices.js` owns two local canvas screens at the TV/desk
positions, following `furniture.cinema` and `furniture.desk` offsets. E/touch on the
cinema screen opens film suggestions/search and the separate cinema player
(#1475); it shows a static BION prompt. The armrest remote is removed. The
monitor starts the computer, then starts/stops a timing game:
stop the marker inside green to add a hit; misses still count as attempts and
allow a new round. The white/blue box beside the monitor toggles its power.
The normal biostol/stool seats and rest reach remain; no new input mode is needed.

Computer power forwards to the existing `Playroom.onSwitch('pc', on)` hook;
disco uses its original hook and switching behaviour. Leaving powers down the
computer, freezes its game updates and closes the cinema player. Device state is local,
not saved or synchronized. Room/device audio remains #1330. This is gameplay, excluded from the public downstream.
`PLAYROOM.devices` holds the assumed texture size, redraw cap and timing-game
settings. The two screens add at most two draws/four triangles. The canvas screens add no lights or audio nodes. Tests: real-app `tools/playroomtest.cjs`, desktop and `MOBILE=1`.


### Cinema network video (#1376)

`src/cinemaplayer.js` accepts a visitor's own HTTPS YouTube watch/shorts/live/embed
link, youtu.be link or 11-character video ID. The cinema screen opens a native
modal dialog and frees pointer lock; movement stops while it is open. The official
YouTube IFrame API is loaded only after film selection, with a privacy-enhanced
`youtube-nocookie.com` iframe, explicit origin/referrer and `playsinline=1`.
Nothing autoplays: the visitor presses Spela or the player's own play control for
sound. Pause preserves the media position; Stäng av, back, Escape, movie end,
room exit/respawn and pagehide destroy the player and remove its iframe. A
request generation prevents late API callbacks from reopening a closed player.
The physical cinema screen shows BION and an E/touch prompt. Its target opens
the chooser from standing positions and both seat rows within BIO; its armrest
remote and old sailing channel are removed (#1475). Computer, disco and seat
anchors remain available.

The video is shown in the cinema dialog, not on a WebGL texture: an external
iframe is not a canvas image source, and this app does not extract or download
third-party video. Visitors need no account or API key. Video choice is visit-only;
no URL is stored, shared with peers or sent to the game Worker. YouTube receives
the chosen video request. Private/missing videos, denied embeds (101/150), missing
client identity (153), network failure and timeout have actionable Swedish messages.
Some videos require sign-in or disallow embedding; choosing a different video is
necessary. A blocked autoplay prompts a native player click.

Primary references: [official IFrame API](https://developers.google.com/youtube/iframe_api_reference)
(play/pause/destroy, errors, autoplay and minimum200×200 viewport),
[player parameters](https://developers.google.com/youtube/player_parameters)
(origin, playsinline and autoplay), [canvas image sources](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Using_images).
The tracked app has no CSP declaration and the Pages HTTP response checked on
2026-10-20 has no CSP header; no policy relaxation was needed. The iframe remains
cross-origin. This personal clubhouse gameplay has no public downstream transfer.

## Clubhouse DJ bench (#1424)

`PLAYROOM.dj` describes a guessed 1.4 × .65 m corner bench, .68 m high, at
local (2, −4.6), under the right speaker. The top, four legs, two platters and
small mixer share the existing static furniture mesh/material. Its pick box
uses the **same** `PlayroomMusic.target`/choices as both speakers (#1423), with
no new controller, media, audio policy or panel. Its one full footprint adds
four ordinary collision edges; all previous footprints/edges and table yaw
π/2 are exact. The actual table north edge is −.99, bench front −4.275:
3.285 m separation, leaving a conservative 2.285 m beyond the full 1 m cue.
These are model distances, not measurements of a real room.

Actual app: E start/pause, touch same-element resume/OFF and audio RMS .011–.022;
W walks from the south hall round the table to the bench and back, blocks in
front of the bench at z−4.100, then native touch exit releases the playing media.
Standing-eye matched desktop/touch images and room overview are retained in
local orkester state `codex-surface-20261020/dj1424/`. The pair of room builders
shows +412 triangles, no new visible mesh/material/texture, with the entire
room still hidden outdoors. The static mesh box/sphere are exact. Matched
960×600 desktop and 844×390 touch views stay at 13 calls, 8,974 → 9,386 triangles;
these targeted views are not a new global performance profile. The audio lifecycle/race tests from #1423 remain
applicable to unchanged audio code. A/B/C/L and public downstream: not applicable
to this personal clubhouse gameplay feature.

Rigid lamp batches (#1453): Hue Go's opaque dome/face merge within their shared
bowl anchor; Dani's inner fabric cylinder/cap merge within their common lamp
anchor. Original material references, lamp targets, pick meshes, glow planes,
Dani materialSurfaceId/UV1 and the Hue Go color menu are retained. No parts are
removed or simplified. The pre-upload canonical builder comparison retains
all ordered attributes and24 positive physical rays per lamp.
