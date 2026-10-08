# Life simulator – inventory of what exists (LIFE-001, #365)

What the life simulator (epic #364) can build on, as of 2026-10-04. For every part: **reuse as is**, **extend** or
**missing**. "(test)" = checked in a browser by `tools/inventorytest.html` (or the existing test named); "(code)" =
read in the code only. Coordinates are plan metres (x east, z south, y up).

## Interaction

| Part | Where | What it does | Verdict |
|---|---|---|---|
| Focus | main.js `updateFocus` | One raycast from the eye (`HOLD.reach` 2.2 m, `REST.reach` when seated) against every pickable; each pickable's `userData.door` is its *target* `{ name, kind, verb, blocked, blockedText, toggle }`. The hit is dropped when `behindWall(hit)` (the eye → hit line crosses a wall outline of the level). Special cases (pan → hob, fish → pan / air fryer, the jug, the remote) rewrite `focused` after the raycast. (code; holdtest / cuptest drive it) | **extend**: one shared function for "which actions does (hand, target) allow", instead of more special cases (LIFE-003) |
| Use | main.js `use(thing)` | A long `if … else if` on `thing.kind`: doors, lids, cabinets, holdables (`toggle`), `place` (`item.placeAt(point)`), `fry`, `airfry` … | **extend**: an action kind that runs a computed action (LIFE-003) |
| E / click / touch | main.js keydown, `#action` button, mousedown | E = `use(focused)`; a click / the touch button with nothing aimed at = `heldItem().use()` (bite, sip, fire). The touch button's text is the verb + name. (test: touchtest, holdtest) | **reuse**; a choice of several actions is **missing** (LIFE-003) |
| Prompt | `#prompt`, `#action` | Exactly one action: "Tryck E för att {verb} {name}"; `blocked` shows `blockedText` (default "Lägg ifrån dig det du håller först"). | **extend**: a short list when there are several (LIFE-003) |
| Through walls | `behindWall` | Plan-view test against `levels[i].wallSegments`. Shut fronts are no test: their own mesh is a pickable in front of what is inside (the fridge door, a drawer front) and hides it from the raycast. (code) | **reuse**; a shut container must also *say* so ("Öppna kylen först") — **missing** (LIFE-005) |
| The hand | hand.js | The arm and hand in the camera; `reach(point)` on E; grips the held thing at `grip`. (test: holdtest) | **reuse** |

## Things in the hand

| Part | Where | What it does | Verdict |
|---|---|---|---|
| `Holdable` | holdable.js | One thing in the hand (`heldItem`, `setHeld`, `handBusy`); a home with an invisible pick box (E there puts it back); `take`, `putBack`, `placeAt(p)` (lying by `restPose`, a random turn), `use` (click), `tick`. Other things are `blocked` while the hand is full. (test: holdtest) | **reuse** as the view of a life item; **extend** `placeAt` with a turn and a preview (LIFE-004) |
| Placement | main.js `updateFocus` | Holding a thing with `placeAt`: `world.cupSurfaces` (table tops, the worktop, window boards; `soft` for beds and sofas) or else the floor (`floorSpot`, not in the stair hole, on a rug's top) within reach → a `place` target; a white ring (`placeGhost`) marks the spot. (test: holdtest) | **extend**: a ghost of the thing, snap points, R to turn (LIFE-004) |
| Own `placeAt`s | cups.js, fishfingers.js, fries.js, fruit.js, pan.js, pingping.js, miele.js | Each standing / lying in its own way, random turn. | **extend** (a turn argument) |
| Things | things.js | `Thing` (bottles, glasses, pot plants, the photo), `Glass` (a `Contents`), `Trinket` (home in a drawer frame: rides with the drawer, put back only while it is open — "Öppna lådan först"). (test: thingtest, secretarytest) | **reuse**: `Trinket` is the pattern for slots that ride with a drawer |

## Fronts, cabinets, contents

| Part | Where | What it does | Verdict |
|---|---|---|---|
| `Openable` | openables.js | 'hinge' / 'flap' / 'drawer' fronts, kind 'cabinet', in `world.lids`; `isOpen`, `t` (0…1), `object` (the pivot: a child of it rides along). (test: opentest) | **reuse** |
| Static contents | contents.js `attachContents`, kitchenstuff.js `fillKitchen`, interior.js `stock()` | Decoration merged per material, hidden while shut; `carry` = rides in the drawer. Every kitchen front has `o.stock`: plates, glasses, mugs, dry, tea (wall cabinets), cutlery, utensils, rolls, drawerPots (drawers), baking, serving, festive, corner, sink, or `'own'`. (test) | **reuse** as decoration; slots for real things are **missing** (LIFE-005) |
| The kitchen | interior.js | East run (fronts face west, x ≈ 4.95): tall unit (oven, microwave) z ≈ 0.5, Moccamaster z 1.40, dishwasher z 1.40, sink z 2.08 (cabinet + the bins front z 2.58), drawer units z ≈ 3.0 / 3.7 (hob, the pan's drawer) / 4.5; the return run along the fridge / freezer. Free worktop between the sink and the hob: z ≈ 2.4…3.3 on the `counter` surface (x 4.98…5.52, y 0.93). (test) | **reuse** |
| Pantry | — | No pantry as such. The wall cabinet over the corner beyond the hob (stock `dry`, z 4.03) holds packets and spices. | **missing** → that cabinet as the pantry (LIFE-005) |
| Utensil drawer | interior.js | The top drawer under the hob (stock `utensils`, z 3.71) and two cutlery drawers (z 2.99, 4.46). | **extend** with tool slots (LIFE-010) |

## Stores

| Part | Where | What it does | Verdict |
|---|---|---|---|
| Fridge | fridge.js | Hollow, lit; door in `world.lids` (kind 'fridge'); `shelfSpot` (the chicken), `milkAt` (the milk); glass shelves at 0.45 / 0.82 / 1.2 / 1.52 m over its floor, three door bins; a door alarm after `FRIDGE_ALARM.after` s. (test) | **extend** with slots (LIFE-005) |
| Freezer | fridge.js (`freezer: true`) | Two shelves (`shelves`), four drawers (decoration, not separate Openables); the fish-finger carton (fishfingers.js) and the fries bag (fries.js) on the shelves. (test) | **extend** with slots |
| Milk | milk.js | A `Holdable` at `fridge.milkAt`, pours (`drink: 'milk'`). Reached only through the open door (the shut door is in the way of the ray). (test: milktest) | **reuse** (the life sim must not make a second carton, #373) |
| Fish fingers | fishfingers.js | A carton counting down (`left`, FISH.n), taken one at a time straight into the hand. (test: fishtest) | **reuse**; the counting is one of the "amount" solutions below |

## Appliances

| Part | Where | What it does | Verdict |
|---|---|---|---|
| Dishwasher (KEZA9310W) | interior.js | A 'flap' Openable "diskmaskinen", `stock = 'own'`; the racks are static wires, no slots, no programme. (test) | **extend** (LIFE-020/021) |
| Bins under the sink | interior.js | Three static bins (grey, green, blue) behind the right-hand front (`stock = 'own'`). No fill, no E target. (test) | **extend** (LIFE-017) |
| Stick vacuum + dock | cleaning.js (#338) | Decoration in the Klk under the stair (`CLEANING.vacuum` x 4.20, z 6.61), a loose item (F hides it); no E target. (code) | **extend** (LIFE-025) |
| Taps | water.js | Every tap / shower: E on / off (stream + hiss), kind 'tap'; the kitchen tap "köksblandaren" at (5.31, 1.16, 2.08). (test: watertest) | **reuse** (LIFE-018/019) |
| Hob, hood, air fryer, Moccamaster | hob.js, hood.js, airfryer.js, coffee.js | On/off machines with their own timers (`update(dt)`), F resets them. (test: cooktest, oventest) | **reuse**; the timed-action runner (LIFE-008) is new and separate |

## Food and drink

| Part | Where | Amount is kept as … | Verdict |
|---|---|---|---|
| `Contents` | drinks.js | fractions of a vessel per drink, poured over a second (`pour`, `update`), `sip` | **reuse** for glasses / cups |
| Cups | cups.js | a `Contents` + `heat`; patterns; states `cabinet` / `held` / `placed` / `spare` | **reuse** |
| Fish fingers | fishfingers.js | carton `left` (count); a finger's `bite` (0…FISH.bites) | per module |
| Fries | fries.js | bag `portions`; basket `count`; a bunch's sticks | per module |
| Fruit | fruit.js | `bites` per piece (FRUIT.bites) | per module |
| Chicken | chicken.js | pieces broken off | per module |
| Coffee | coffee.js, coffeejar.js | the jug's `fill`, the tank's `water`, `grounds` (scoops) | per module |

**Should become shared**: "amount" is solved five ways (vessel fractions, counts, bites, portions, scoops). The
life sim adds one domain layer (LIFE-002, `src/items.js`): an amount with an explicit unit (`g` | `ml` | `count`) that is
never below 0, on a stable item id with exactly one place. The existing modules keep their own state for now; the code
notes which could move over.

## State

| Part | Where | What it does | Verdict |
|---|---|---|---|
| Game time | daycycle.js, wallclock.js | `day.hour` (60-minute day, spooled / paused by the wall clock). Per-frame work runs in main.js `step(dt)` (tests drive it directly). | **reuse** `step(dt)` seconds for action durations (the game-hour runs 24× real time and can be spooled: not for a 1 s cut) |
| Reload record | keep.js (#277) | `saveWorld` / `loadWorld`: versioned (`v: 1`) plain JSON parts (clock, car, open, lamps, on, grill, coffee, sonos, parasol, things, rest, cat), each optional and read tolerantly. Only for page-made reloads. (test: reloadtest) | **extend** with a `life` part (LIFE-007) |
| Persistent home | localStorage `lunden.*` | Blinds, furniture on/off, stats … survive a new visit. | **missing** for items: `lunden.life` (LIFE-007) |
| Återställ | reset.js (#303) | Clears every `lunden.*` key except `RESET_KEEP`. (test: resettest) | **reuse**: a `lunden.life` key is reset automatically (not in `RESET_KEEP`) |
| Stats / score | stats.js, `SCORE` | `bump(key, n, id)`, `SCORE.each / first / again`, badges, `penalize`. (test: scoretest) | **reuse** |
| Touch | touch.js | Left = stick, elsewhere = look; pointer events on any `button` are ignored, so buttons never steal the look. (test: touchtest) | **reuse**: menu choices are buttons |

## The developer scenario `&life`

`?life` (with `&shot` for screenshots) sets a reproducible start (src/life.js `devScenario`, `LIFE.dev` in config):

- every loose thing at home, every front, the fridge and the freezer shut, nothing in the hand;
- no cat turns up; the clock at 12:00, paused (unless `&time` is given); furniture shown (not stored);
- the visitor at (4.35, 2.75) facing the east worktop (unless `&at` is given);
- test things: an empty cup (5.24, 2.62) and the milk (5.26, 2.95) on the free worktop between the sink and the hob, an
  empty wine glass on the dining table (3.55, 1.45);
- resume.js neither reads nor writes the resume / F5 records, and the head script never sets the "Laddar…" cover:
  the visitor's own place is untouched (test). Stats and the score still count as usual.

Later LIFE issues add their things to the scenario (the board, the knife, the cucumber …).

## M1 – the sandwich flow (done: #373 – #381)

What M1 added on top of the above (code in src/life.js, src/cooking.js, src/stores.js, src/lifemodels.js; the test is
`tools/lifetest.html`): the kitchen's food and tools in their places from the start and restocked on the next opening
(`LIFE_FOOD`, `LIFE_TOOLS`), the utensil drawer's three tools and the board's place on the splashback, the board as a
station on the worktop, cutting the cucumber (exact grams, the end), the bread bag, butter and cheese, a sandwich as a
slice of bread with parts, eating in bites with a used plate and the `ate` event, and the bin under the sink. The bins'
row: **extended** (the grey one is the game's "Avfall" bin); the plate cabinet over the free worktop: **extended** (a stack
of three real plates); the utensil drawer: **extended**; the milk carton never empties (milk.js), so it is no waste yet.

## M2 – reset the kitchen (#382 – #387)

Code in src/dishes.js (and cooking.js's bin), the test is `tools/life2test.html`.

- **#382 drinks**: the glass cabinet: **extended** (three real drinking glasses at the front of its lower shelf, store
  `glasses`); the taps: **extended** (a basin tap's rows are the life sim's actions — fill the glass, pour it out — plus
  washing the hands, #437); drinks.js `Contents` / `GlassLiquid`: **reused** for the glass's level; the milk carton:
  **extended** (it holds 1000 ml and runs out — also when it pours into the old glasses and cups —, the empty carton is a
  package for the bin and a full one is back on its shelf after the fridge has been shut and opened). Rules: the fill stops
  at the brim (no spill for the drinking glass; the old glasses keep the spill deduction #288), one drink at a time, drunk
  from = used. The carton's amount is saved as a part of the life record (`x.milk`, `life.keepPart`).
- **#383 clean and dirty**: items.js `clean` is now used everywhere (food on a plate = used; eaten off it, a cut, butter,
  cheese, milk = dirty) and shows (smears, crumbs, a milky film); the coffee cups (cups.js): **extended** with `dirty` (a ring
  after a sip, refused in the cup cabinet until washed). Scraping a plate at the open bin moves its food and crumbs into the
  bin (still dirty). Washing up by hand at the running kitchen tap (water.js taps + the life sim's tap rows): a scrub, then
  clean; the only way for the wooden board. Rule: a used / dirty thing is refused in its cabinet / drawer ("Diska den
  först", `LIFE.rules.washFirst`, false = free play).
- **#384 the dishwasher's racks**: the static rack wires: **replaced** by two racks that roll out (Openable drawers, only
  with the door down) carrying slots (stores `dwLower` / `dwUpper` / `dwTray`). Rule for leftovers: refused (scrape the
  plate / pour out the glass first). `dishwasherSafe` decides: the wooden board is washed by hand. The coffee cups
  (cups.js) are not life items, so they stay hand-wash only for now.
- **#385 the programme**: the dishwasher gets a panel and a short game programme (idle / running / paused / done, the time
  left, the door pauses it, a floor spot, hum, a chime). Only what was in it at the start is washed; nothing can be added
  mid-run (refused). Its state is a part of the life record (`x.dishwasher`) and it counts as time-bound for the
  auto-update.
- **#386 sorting**: the bins under the sink: **extended** (all three are life-sim bins now: Matavfall, Förpackningar,
  Restavfall — game categories). The prompt names the right bin, the wrong one keeps the waste in the hand (or, in free
  sorting, takes it with a note). A bin with something in it is tied up into a rubbish bag that carries its fill; a new bag
  comes off the roll (no item of its own). A saved single bin is migrated (items.js v2).
- **#387 carried out**: **new**: a drop-off by the car park's east end (a game spot — the real waste room is not in Peab's
  material): three containers, one per category, only rubbish bags, each bag counted once (stats `rubbishOut`). Then a new
  bag goes in under the sink and the cycle repeats. The saved records were made smaller (a default amount and a home that is
  the slot itself are left out).

## M3 – clean the home (#388 – #391)

Code in src/mess.js (and the vacuum / the cloth below), the test is `tools/life3test.html`.

- **#388 crumbs and dust**: **new** (src/mess.js): spots of mess with an amount on a worktop, a table or a floor, drawn as
  one instanced decal mesh per kind with a cap (marks.js' pattern, **reused** as an idea, not its code: mess is saved).
  Crumbs come from the life sim's existing `crumbs` event (#380, **extended**: a bite says where the eater stands; cutting
  and the bread bag emit it too), dust gathers slowly near the walls. Reachable floor = player.js `isFree` / `nearestFree`
  (#314, **reused**). Saved as a part of the life record (`x.mess`, `life.keepPart`). `LIFE.rules.mess` / `&mess=0` = off.

## M4 – small chores (#396)

- **#553 watering**: existing indoor window pots, plant Things and movable palm/ZZ are **extended** with saved care ids, wet soil and per-pot window foliage changes. Artificial shelf eucalyptus refuses watering. One **new** Items watering can reuses the M0 hand/slots and M2 basin filling/pouring; no separate inventory. WATERING defines assumed game capacity/dose/timing and display dimensions. State lives in the same life record (`x.watering` and the can instance amount).

- **#554 table setting**: the existing movable SKANSNÄS is **extended** with six ordinary plate/glass slot pairs matching its chairs. The same M0 dish instances move from kitchen cupboards to the table; plate food and glass liquids remain attached/saved. Full or wrong slots retain the held item. No dish duplication, extra inventory or saved table counter.

- **#555 bed making**: bedding.js and existing bed/rest targets are **extended** with vertex-marked rumpling and a timed make action. Double bed, daybed and individual bunk berths save their original stable ids in x.beds. No inventory, new visible mesh or collision changes; cancellation restores rumpled cloth and made cloth exactly restores its source geometry/normals.
