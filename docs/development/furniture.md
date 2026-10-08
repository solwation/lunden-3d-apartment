# Furniture and furnishings

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [plan-material](plan-material.md), [interactions](interactions.md), [plants](plants.md).
## Module and test map

```text
src/furniture.js       loose furniture from FURNITURE in config (IKEA LANDSKRONA sofa/armchair …)
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
                       its door openings (`doorwayTiles`, world.js `doorways`, #306): to the closed leaf, the front door's whole depth
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
                       Sovrum 2: wardrobe L; Sovrum 3: wardrobe G + ALEX drawers (#230)
src/shelves.js         kitchen wall shelves (WALL_SHELVES, #291; raised to 1.85 / 2.25 m in #333 for the framed print "THIS KITCHEN IS FOR
                       DANCING" 40 × 50 under them, a FURNITURE `pictures` item drawn on a canvas: `paint` / `print`): cookbooks, glass jars, lathe-turned stoneware (speckle map),
                       brass candlesticks, a mortar, a cutting board, framed prints (one canvas atlas); merged per material;
                       the white face pot with wire glasses and faux baby eucalyptus hair (#343, `WALL_SHELVES.facePot`, lower
                       shelf, 'krukan med glasögonen'; it replaced the eucalyptus vase) and the trailing pothos are Things (kind 'plant', #185)
src/aborg.js           the JYSK ABORG café set outside the kitchen window (#406, ABORG): a folding table + two folding chairs (seats)
src/randers.js         the JYSK RANDERS tray table by the armchair (#405, RANDERS): tray, rails, straight legs, a low cross
src/pineapple.js       Livia's pineapple mirror in Sovrum 3 (#412, PINEAPPLE_MIRROR): an extruded oval frame with a scale bump map,
                       a crown of leaves with a herringbone bump, an oval glass with its own Reflector ('ananas')
tools/tvtest.html      headless test: TVs on/off (living room + Sovrum 3), new programme each time, the remote, F off
tools/pctest.html      headless test: switch the gaming PC on/off (game moves, RGB cycles), the chair is a seat and
                       starts the PC, the bunk seat swings the monitor round (film)
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

