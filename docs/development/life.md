# Life simulation and chores

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [food](food.md), [storage](storage.md), [interactions](interactions.md).
## Module and test map

```text
src/toilet.js          toilet (Ifö Spira 6260) with an animated lid and a flush button (`flush`, its own E target in
                       world.lids: dips, sfx.flush, the water drains and returns, no flush until refilled, #155); #321: a deep
                       bowl (rings `TOILET.bowl.profile`, all the porcelain one merged mesh), toilet-blue water (its own mesh);
                       a flush runs streaks down an inset copy of the bowl and swirls the water (emissive spiral), idle = no work
src/toiletpaper.js     toilet-paper holders (#426, TOILET_PAPER): brushed steel beside each toilet (on the tank's wall, the side away from it);
                       E on the roll pulls out a sheet (it turns, sfx.paper, up to `hang`), E on the strip tears it off into the hand as a
                       wad (no placeAt): E on a toilet (main.js `toiletPaper.aim`) opens the lid, drops it in and flushes, it swirls away
                       (stats toiletPaper); the roll thins, F puts full rolls back; not loose, nothing saved
src/contents.js        what is inside cabinets/drawers (#228), shared: `attachContents(meshes, openable, { carry })` — world-space
                       meshes (merged per material), hidden while the front is shut, shown as it opens; `carry` = they ride
                       in the drawer (children of its pivot), else they stand in the carcass; no E targets; `openable.contents`.
                       #231 (CONTENTS in config): a `Pack` with two finishes (matte / gloss, vertex colours) + `frameMatrix(dir,
                       origin)` and the builders: `byasDrawer` (games, pads, remotes | films) / `byasMiddle` (console, router; the
                       open middle, always drawn), `bestaContents` (per wooden door: board games, albums, napkins), `hallWardrobe`
                       (world.js: coats on hangers above cat height, hats/scarves/gloves, a slanted shoe rack along the back,
                       rubber boots — the middle of the floor stays free for the cat; always drawn, stays with F), `mirrorCabinet`
                       (Stage 50), `vanityDrawer` (towels | brushes, plasters, hair ties), `laundrySink` (detergent, basket, pegs)
src/water.js           running water: E on a tap/shower (world.taps from interior.js) → stream + hiss
src/handwash.js        washing the hands (#437, HANDWASH): a running basin tap (not a shower) with a free hand offers a menu
                       ("Tvätta händerna" | "Stänga av …", main.js `tap.options`): both hands rub under the stream (hand.js
                       `rub`, sfx.handwash) and are wet (`setWet`: glossier skin + drops) until dried or after `wetFor` s;
                       E on a towel ("Torka händerna på …", kind 'towel': the bathrooms' and Tvätt's `towelhooks` towels,
                       hooks.js `towelTarget`, and the kitchen towel on the oven's handle bar, built here) dries them, the
                       towel swings; stats handwash / handdry; F: dry. Not saved
src/life.js            the life simulator (epic #364) glue; the `&life` developer scenario (#365). What it builds on:
                       docs/livssimulator-inventering.md (the inventory: reuse / extend / missing per system).
                       `Life` (__app.life): the instances (`life.items`) + a view per instance, `LifeItem` (#366) = a Holdable
                       whose model follows the instance's place (world → `life.group`, a loose item; hand; a store slot's or a
                       carrier's anchor) and state (`view.show`); take / placeAt / putBack move the instance (never lost: home,
                       else where it last lay, else at your feet)
                       The kitchen's food (#373, LIFE_FOOD: `stock` [type, store, slot] + `amounts`): a cheese, a cucumber and a
                       butter in the fridge, frozen peas on the freezer's lower shelf beside the fish fingers, a bread bag in the
                       pantry, labels of our own (lifemodels.js `label`). `life.restock(store)` gives every stock entry with no thing
                       of that type and home left anywhere a fresh one in its home: at the start of a visit (after `restore()`) and
                       whenever a store is opened after being shut (life.update) — never while the old one is in the hand / out / half used
                       The tools (#374, LIFE_TOOLS.stock, same restock): the kitchen knife, butter knife and cheese slicer on the
                       utensil drawer's towels, the cutting board on its long edge against the splashback between sink and hob
                       (store 'boardRack', only the board, "Ställa skärbrädan på sin plats")
src/tasks.js           optional everyday tasks (#392): TASK_NOTE card on the inside of the kitchen cup-cabinet door follows its hinge and opens a Swedish panel (E/click/touch).
                       Domain events prepared/bite/ate, washed/dishwasher, wipe, rubbishOut and vacuumed complete goals in any
                       order; real kitchen worktops only, empty bins need no disposal. Sets deduplicate goals; life.keepPart('tasks')
                       saves progress without replaying bonuses on load. SCORE.first.tasks=30 per task id, again.tasks=5 after
                       explicit "Gör igen"; stats.tasks counts completions. Hints toggle persists as lunden.taskHints.
                       The panel releases pointer lock, closes with its button/E/Escape, and permits touch scrolling.
                       Browser regression: tools/taskstest.html (actual cooking, cloth and vacuum, permutations, save, UI/score).
src/cooking.js         the life sim's kitchen work (M1): actions judged by the tags of the held tool and the food (LIFE_TOOLS.uses:
                       tool tag → food tag, `label`, `not`): the wrong tool is a blocked row "Osthyveln skär inte gurka", nothing used;
                       a new tool = an ITEMS entry with a 'tool:…' tag (ITEMS `noun` = the indefinite form in messages)
                       The cutting board as a station (#375): a cut (action 'cut', the Runner, LIFE.cut.seconds) needs the board on a
                       worktop (`life.worktopAt`, world.js's kitchen surfaces carry `userData.worktop`: "Lägg skärbrädan på
                       arbetsbänken först"), the food on its spot 0 (along the back) and a free result spot (two rows of four in front;
                       none: "Brädan är full", nothing used); a food's ITEMS `cut: { into, g }`; held at a plate, 'pushSlices' moves
                       the board's slices over (as many as fit)
                       Cutting (#376): 'cut' / 'cut3' ("Skära en skiva" / "tre skivor", LIFE.cut.seconds each): the knife chops down
                       per slice (sfx.chop), each cut exactly `cut.g` off and one slice of exactly that (the mass balance); the last
                       `cut.end` g are the end ("gurkänden", `items.namers`, `life.isEnd`: no slice, a scrap); stats cucumberSlices;
                       the slices' faces show the seeds (a canvas texture)
                       The bread bag (#377): 'open' takes its clip off; 'dispense' (ITEMS `dispense` / `dispenseLabel`, LIFE.dispense)
                       "Ta en brödskiva" — one at a time into a free hand, the loaf shorter, 0 = an empty package (pkg 'empty') that
                       stays. A thing with ITEMS `bites` is eaten with a click / the touch button ("Äta", LifeItem `useLabel` /
                       `onUse` → action 'eat', LIFE.eat): to the mouth, a bite off (the slice's outline rebuilt with bite marks),
                       sfx.chew; the last bite removes it; `life.emit` / `onEvent` domain events 'bite', 'ate'
                       Butter and cheese (#378, LIFE.butter / LIFE.slice): 'dab' — the butter knife at the open pack takes LIFE.butter.g
                       (the knife's `machine.load`, a yellow lump; the pack empty → pkg 'empty'); 'spread' — onto a slice of bread
                       anywhere but the hand, the bread's first part { type: 'butter', amount } (a yellow film, lifemodels.js
                       `sandwichLayers`); 'slice' — the cheese slicer at the block on the board / a worktop: a cheeseSlice of
                       ITEMS `slice.g` (on a free board spot / beside the block), the last one is what is left and the block goes;
                       the tools turn `clean: 'used'`
                       A sandwich (#379) = a slice of bread with `parts` (butter, cheeseSlice, cucumberSlice in order, any mix, at most
                       LIFE.sandwich.max): 'addTopping' — a slice in the hand onto the bread is removed and becomes a part of exactly
                       its amount (moved, never copied); named from its parts (`items.namers.breadSlice`: "ost- och gurkmackan",
                       "ostmackan", "gurkmackan", "smörgåsen"); three plates (LIFE_TOOLS.stock) stand in the wall cabinet over the free
                       worktop (store 'plates', interior.js stock 'platesLife': its static stack left out)
                       Eating it (#380): taken off a plate it remembers it (`machine.plate`); each bite gives that plate crumbs (clean
                       'used', the plate's `crumbs` shown) and a 'crumbs' event; the last bite emits 'ate' { name, parts, amount } and,
                       with anything on it, bump('sandwiches', 1, name) — SCORE.first per combination ("Du gjorde en macka!"), then
                       `again`; put back half eaten it stays (and is saved). A LifeItem's meshes a `show()` builds later (layers) get
                       its E target too (`refresh`)
                       The bin under the sink (#381): an ITEMS 'bin' (`fixed`: no "Ta", a target only with something in the hand) in
                       store 'sinkBins' — the grey bin behind the bins' door (interior.js gives that front `bin`: its bottom centre,
                       size; the anchor is scaled to it, the model built 1 × 1 × 1: "Avfall" label, a rising heap); 'throwAway' with
                       the front open: `life.wasteKind` = 'package' (an empty one) / 'food' (the end, slices, leftovers) — else "Det
                       där ska inte slängas"; amount += ITEMS `binVolume` (else 1 / 2) up to `capacity` ("Avfallshinken är full",
                       the waste stays in the hand); `parts` count the kinds (for LIFE-022). Another bin = a store slot + a stock entry
                       A non-life holdable is waste too when it has `wasteKind` + `discard()` (the empty milk carton, #382)
src/waste.js           the life sim's rubbish (M2). #386: three bins under the sink (game categories): ITEMS 'binFood' Matavfall
                       (green, store 'binsFood', behind either door), 'binPack' Förpackningar (small blue, 'binsPack', the left
                       door, `leftDoor` on the bins' front), 'bin' Restavfall (grey, 'sinkBins'); ITEMS `sort` / `label` / `bag` /
                       `fullText`. 'throwAway' names the bin ("slänga gurkänden i matavfallet"); the wrong one: "Gurkänden →
                       Matavfall", the waste stays in the hand (LIFE.rules.strictSorting; false = in it goes with a note);
                       scraps only into Matavfall. A bin with something in it is a target with a free hand: 'tieBag' "Knyta ihop
                       påsen" → an ITEMS 'rubbishBag' in the hand with the bin's amount + parts (moved), the bin empty with
                       `machine.nobag`; 'newBag' "Sätta i en ny påse" (off the roll: no item). items.js ITEMS_VERSION 2:
                       MIGRATIONS[1] splits a saved single bin's food / packages into the new bins
                       #387 `buildDropoff` (__app.dropoff): the drop-off along the portik's east/apartment-facing wall (#538, LIFE_WASTE.dropoff, a game
                       use of an unlabelled drawn space): three underground containers with a lid per category (life targets, `dropoff` = the
                       sort; their outline is collision + an obstacle polygon); 'dropBag' "Slänga matavfallspåsen i
                       matavfallsbehållaren" — only a rubbish bag ("Bara soppåsar här"), its own category while sorting is strict;
                       the bag is removed (one emptying, one reward: stats rubbishOut), the lid lifts and lands with a thud.
                       items.js `serialize` leaves out a default amount and a home that is the slot it is in (#387: the reload
                       record stays under reloadtest's limit; `create` gives both back)
src/dishes.js          the life sim's drinks and dishes (M2): #382 the drinking glass (ITEMS 'glass', amount = ml of drink up to
                       `capacity`, `machine.drink` 'water' | 'milk', one at a time): three at the front of the glass cabinet's lower
                       shelf (store 'glasses', LIFE_TOOLS.stock; kitchenstuff 'glasses' keeps its front row free); held at a running
                       basin tap the tap's rows (main.js wraps `tap.options`: life rows + handWash's) offer 'fillWater' (to the brim,
                       LIFE.drink.fill, "Dricksglaset är fullt") and 'pourOut'; the milk carton in the hand on a glass standing out
                       'pourIn' (LIFE.drink.pourMl, never over the brim, "Häll ut vattnet först", "Mjölken är slut"); 'drink' = a
                       click / "Dricka" (LIFE.drink.sip ml, the glass used, stats water / milk); the level is drinks.js GlassLiquid
                       #383 cleanliness (`clean` 'clean' | 'used' | 'dirty'; lifemodels smears, the glass's milky film, the cup's
                       ring): food on a plate / the board = used, eaten off a plate = dirty + `machine.crumbs`, a cut dirties the
                       knife and the board, butter / cheese the butter knife / slicer, milk drunk the glass, a sip the coffee cup
                       (cups.js `dirty`, keep.js `u`); 'scrape' (a plate at the open bin: its food + crumbs in, still dirty);
                       'wash' at the running kitchen tap (LIFE.wash.taps / seconds: a scrub + sfx.handwash, then clean; food on
                       it / a drink in it first); stores with `cleanOnly` (utensils, plates, glasses, boardRack) and the cup
                       cabinet refuse a used / dirty thing ("Diska den först") while LIFE.rules.washFirst (`life.rules`, free play
                       = false); 'pourOut' empties a coffee cup too; stats washed / scraped. items.set: a machine field set to
                       null is removed
src/dishwasher.js      the dishwasher (#384, DISHWASHER): `buildRacks` (interior.js's DM unit) — two wire racks, Openable 'drawer's
                       in world.lids ("Dra ut / Skjuta in underkorgen"), `blocked` while the door is up ("Fäll ner luckan först");
                       the door is blocked while a rack is out ("Skjut in korgarna först"); a cutlery tray rides on the upper rack.
                       Each rack's `slots` (world pose, size, accepts) become stores.js 'dwLower' (6 plates on edge), 'dwUpper' (6
                       glasses upside down), 'dwTray' (4 tools); a store's `refuse(item)` (life.js putIn): not `dishwasherSafe`
                       ("Skärbrädan diskas för hand"), the wrong rack ("Tallrikar i underkorgen", "Glas i överkorgen", "Bestick i
                       bestickkorgen"), food / a drink left (refused: "Skrapa av … först", "Häll ut … först"); taking needs the door
                       down and the rack out ("Öppna diskmaskinen först", "Dra ut … först"). Coffee cups (src/cups.js, #455)
                       can also be parked in the upper rack ('dwUpper', upside down) and come out clean after a programme.
                       `DishProgramme` (#385, __app.dishProg): E on the panel (a pick box on the door's top band, `door.panelAt`)
                       "Starta diskmaskinen" (door shut, something used / dirty in it) → running for DISHWASHER.seconds of game
                       time: sfx.dishwasher (hum + swishes), a red spot on the floor, an LED; the door opened = paused, shut = on
                       with the time left (the panel's row shows "Diskar – 0:42 kvar"); done: sfx.pling + "Disken är klar", stats
                       dishwasher; only what was in it at the start and still is becomes clean; nothing added while it runs /
                       is paused (refused); kept with the life sim (`x.dishwasher`: state, time left, the ids); a running one
                       holds back the auto-update (main.js); F stops it (nothing washed)
src/actions.js         what you can do with a life-sim thing (#367): `ActionSet.define({ id, label, applies, check, run, consumes,
                       result, duration, interrupt, order, quiet })`, `list(ctx)` = the rows with a Swedish `reason` when blocked
                       ("Öppna kylen först", "Tallriken är full", "För långt bort"); life.js `baseActions`: putOn, take, open, close.
                       main.js: a life target (kind 'life', `options()`) with one row = the usual prompt / button; several = #choices
                       (mouse & keyboard: a list under the crosshair, E = the marked row, 1–4 pick, the wheel moves the mark; touch:
                       a big button per row instead of #action); a life thing up to LIFE.tooFar past reach says "För långt bort"
                       Timed actions (#372, `Runner`, life.runner): an action with `duration` > 0 runs validate (check) → reserve (its
                       inputs `lock`ed, its output places promised in `items.reserved`) → animate (game time: step's dt) → commit at
                       `commitAt` (the check again, then consume + create in one step) → done; an interruption before the commit uses
                       nothing, after it the result stays. life.update interrupts on a hand change or walking LIFE.job.walk m off;
                       main.js on F and sitting down; locks / promises are never saved; the prompt shows "Skära en skiva … 40 %";
                       a running job holds the automatic update back
src/items.js           the life sim's things as data (#366, ITEMS in config), no three.js: instances with a stable id
                       ('cucumber#3'), exactly one place (world | hand | slot of a store | on a carrier), an amount in g / ml /
                       count never below 0, pkg / prep / clean / machine fields; `check(item, place)` = the Swedish reason it
                       can't go there (a shut store, too big, taken, a carrier on itself); `move`, `consume`, `remove`, `audit`
src/stores.js          the life sim's storage places (#369, LIFE.stores): slots with a size class registered with items.js (`addStore`)
                       + an anchor per slot (life.anchors) — the fridge's free glass shelves and door bins (on the door), the freezer
                       (on the frozen bags of its top basket), the pantry (the wall cabinet beyond the hob, interior.js stock
                       'pantry': boxes / jars at the back, slots in front) and the utensil drawer (on its towels). Anchors sit in the
                       front's contents group (contents.js: ride with a drawer, hidden while shut). A pick box per store is the target
                       "Lägga … i kylskåpet" (action putIn) while a life item is held; shut: "Öppna kylen först", full: "Fryslådan är
                       full" — nothing moves. interior.js `stock()` leaves `o.stockFrame` (the contents box, `at(u, d, y)`, `yaw`)
                       Carriers (#370): an item type with `carrier` { slots, size, accepts, spots (per-spot accepts / size: the
                       board's spot 0 = what is being cut, 1–8 = slices), order, fullText } holds others ('on' places, models on its
                       anchors: they ride when it is carried, put down or put in the fridge — `carriers: true` stores only); never on
                       itself or on what lies on it; actions putOn (the held thing onto a carrier) and loadOnto (a plate in the hand,
                       E on a slice: onto the plate)
                       Saving (#371): `items.serialize()` / `load(rec)` — versioned (`ITEMS_VERSION`, `MIGRATIONS[v]`), tolerant: an
                       unknown type is skipped (logged with &debug), a thing whose store / carrier / slot is gone goes home, else onto
                       the free worktop (LIFE.save.lost), a record with nothing readable keeps what is there. It lives in two places:
                       keep.js's `life` part (page-made reloads: everything, the hand too) and the persistent `lunden.life` key
                       (life.js `flush`, LIFE.save.every s after a change and on pagehide; `restore()` at the start of a visit, empty-
                       handed — the home's stock is kept between visits, nothing is used up or goes bad while away). Never with &life
                       (`persist: null`); "Återställ" clears it (not in RESET_KEEP) and blocks the last write (`resetHome.going`)
src/lifemodels.js      the life sim's models (#366): plate, cutting board, cucumber, slice, cheese, butter, bread bag, bread slice,
                       knife, frozen peas (#373), butter knife, cheese slicer (#374), drinking glass (#382: `level(kind, ml)`) — own shapes, labels of our own (`label`); `show(item)` shows the amount / package; carriers have `anchors` (their spots)
src/mess.js            crumbs and dust (#388, LIFE-024, M3; LIFE_MESS): spots { kind crumb | dust | smear, level, x y z, surf worktop |
                       table | floor, room, amt 0…1 } drawn as one InstancedMesh per kind (flat canvas decals in life.group, a fuller
                       spot bigger; never a raycast target). Crumbs from the life sim's 'crumbs' event (`fromEvent`): a bite (on the
                       table / worktop under the food, else the floor at the eater's feet — the flat's floors only, where player.js
                       `isFree` with LIFE_MESS.margin says the visitor reaches, else `nearestFree`), a cut on the board (beside it on
                       the worktop), a slice out of the bread bag; dust now and then (`update`: one bit every dust.every s near a
                       wall, at most dust.perRoom spots a room). A spot near another of its kind grows (merge); past `max` the
                       nearest grows instead: never unbounded, the draw calls fixed (perfcount's "mess cap" line). `take(x, z, r,
                       { level, y, rate, kinds, ok })` removes it (the vacuum, the cloth), events 'add' / 'take'. Saved by amount as
                       the life record's `x.mess` (keepPart). Off: LIFE.rules.mess = false or `&mess=0`; &life starts clean
tools/watertest.html   headless test: aim at every tap/shower, turn it on and off; at every basin wash the hands (#437: the menu,
                       rubbing, wet), the tap off next, dry them on the nearest towel (it swings), counted once; drying by itself
tools/toilettest.html  headless test: flush both toilets (counted, not again until refilled), the lid still opens; mid-flush
                       the water has dropped, runs down the bowl and swirls, after it is back and still (#321)
tools/cooktest.html    headless test: the induction hob on/off (glow), F switches it off; the pan: drawer → hob → drawer, F; the chicken:
                       fry, smoke, the fridge shut stops it, it stops by itself, F; fish fingers fried, eaten, burnt (#214); raw/golden, no hood → the alarm, the hood
                       on → quiet, break a leg off and eat it, eat it all, F whole again (#194); the air fryer: turned 45°, the basket out diagonally on the worktop (#296), three in, start,
                       countdown, paused while out, golden + "End", one out and eaten, burnt in a third run (smoke, the alarm), F (#287);
                       Aviko fries (#301): the bag from the freezer, two portions poured (a third does not fit, no fish finger with
                       them), golden, "End", steam, a bunch and three bites, burnt + smoke + the alarm, F
tools/actiontest.html  headless test (#372): the plan's cutting action through the Runner — a double press consumes once (−10 g,
                       one 10 g slice), interrupted before the commit nothing is used, after it the slice stays, a save mid-action has
                       no locks, the last 4 g, a full board; in &life: the menu, F / walking off / the hand changing stop it, keepWorld
tools/storetest.html   headless test (#369): the stores' slots; the shut fridge refuses ("Öppna kylen först"), open: in, taken out with E
                       and back in with "Lägga osten i kylskåpet", not through the shut door; a full freezer keeps the thing in the hand;
                       the knife rides with the drawer, hidden while shut; reopening never duplicates; F → its home slot; the pantry
tools/itemtest.html    headless test (#366): items.js with plain asserts (two instances, amounts never < 0, one place, carriers,
                       stores, events, carriers without cycles) and the view in the game (&life: take the cucumber, half used = half as long,
                       down, F; a plate loaded with bread + two slices: carried, put down turned, in and out of the fridge, one taken off)
tools/lifetest.html    headless test of the life sim's M1, the sandwich flow (#373 …): the stock in its places named in the prompt, the
                       cucumber out and back, used up → a fresh one on the next opening (never while the old one is out), a new
                       visit keeps the amounts (lunden.life); each tool taken and put back with E, the board off its place and
                       back, the wrong tool's messages with nothing used (#374); no cut off a worktop, a full board, the board carrying
                       its slices, pushing them onto a plate (#375); one / three slices, the chop, the mass balance, fast presses,
                       slices taken one by one, the end, a reload (#376); the bread bag closed / opened, slices down to 0 and no
                       further, the empty bag stays, a slice on a plate, one eaten plain in four bites (#377); a dab and spreading
                       (exact grams, the layer, double presses), cheese slices on the board and the worktop, the last bits (#378); a
                       plate from the cabinet, toppings moved exactly once, names, the layer limit, carried to the table, a reload (#379);
                       seated at the dining table: taken in reach, bites, put back half eaten, the used plate, 'ate', points once (#380);
                       the bin (front first, it fills, full, no knife / plate) and the whole M1 flow in the visitor's own home with a
                       page-made reload in the middle (#381)
tools/life3test.html   headless test of the life sim's M3, clean the home: crumbs from bites on the floor at the feet (one spot that
                       grows, its room), over the table, beside the board after a cut, saved and loaded by amount, dust near the
                       walls where you reach (per room), the cap, the automatic mess off / &mess=0 (#388). `?only=388` runs sections
tools/life2test.html   headless test of the life sim's M2, reset the kitchen: the drinking glass from its cabinet, filled at the
                       running tap to the brim (half-way nothing, double presses), sips, used, milk from the carton up to the brim,
                       no mixing, the carton running out, thrown away and back full, poured out at the tap, the carton saved (#382);
                       used / dirty plates (crumbs, smear), refused in the cabinet, scraped into the bin, washed up by hand
                       (half-way nothing, walking off), the knife and board after a cut, free play, the glass's film, the coffee
                       cup's ring and its cabinet, a record (#383); the dishwasher's racks: door / rack blocking, the right rack,
                       scrape / pour out first, the board by hand, riding along, a full rack, a shut door blocks taking (#384);
                       the programme: refused empty / door down, the panel, the time left, paused, nothing added mid-run, a
                       glass taken out stays dirty, a record, done = clean, unloading, F (#385); three bins: the wrong one names
                       the right one, free sorting, tying the bag (moved, not copied), a new bag, an old single bin migrated (#386);
                       the drop-off: the whole cycle out through the front door, the wrong container, one emptying per bag, only
                       rubbish bags, again with a new bag, the containers collide (#387). `?only=383,385` runs sections
tools/inventorytest.html headless test (#365): the `&life` scenario's start state, the visitor's records untouched, the
                       integration points the inventory names; without &life the game starts at START
```

## Recent implementation notes

Vacuum bin capacity (#485) is configured by `CLEANING.vacuum.dustCapacity`: 3.0 mess units (three times the former 1.0, a gameplay choice). The HUD, full stop and suction limit all use this value. Browser checks: `tools/life3test.html?only=390,391,485`.

Uppdragslapp (#509): `TasksManager.build3DCard(cups.cabinet)` monterar ett enda blad på koppskåpets faktiska innerblad (`cabinet.innerFace`, från dess fronttjocklek och gångjärn). `TASK_NOTE` innehåller pappersmått och relativa höjd-/sidlägen, alla visuella antaganden. Kortet följer luckans transform, är spärrat när skåpet är stängt och använder befintlig rekursiv skåpraycast; ingen lapp på arbetsbänken. Luckans `userData.moving` uppdaterar DetailCuller under animation. `taskstest` täcker innerplacering, verklig rörelse och touchläsning utöver tidigare uppdragsflöden.


Portik bin orientation (#538): LIFE_WASTE.dropoff derives the row centre from PORTIK.east (10 cm nominal body-to-wall gap) and the midpoint of the open bay wall, yaw −90° so fronts/labels face west into the passage. No bin transform is saved: geometry, collision segments/polygon and targets rebuild together from this config on normal reload/reset. portiktest verifies all three bag/lid actions, clear passage both ways and actual reload/full reset; life2test ?only=387 derives aiming/collision checks from the row transform. Placement and bin dimensions remain game assumptions in the unlabelled Peab space.

Laundry loading (#550, part of #395): src/laundry.js registers laundryBasket/laundryWasher/laundryDryer with the existing Items slot rules and Life putIn/take actions, after buildStores and before restore/restock. Basket stock has three stable clothes instances with original basket homes, so moving them to a machine never replenishes duplicates. Machine anchors stay in the static carcass and are hidden while the round door is shut; the held-only invisible drum pick uses the physical leaf for focus. Closed/full stores retain every garment. src/laundrymodels.js builds flat shirt silhouettes, per-id cloth colours and a dirt patch; moisture independently darkens cloth. LAUNDRY dimensions, basket position and slot capacities are assumptions; its merged slatted basket has four collision segments against Tvätt's east wall. tools/laundrytest.html covers actual touch loading, drum bounds, door visibility/access, full capacity, independent state and a real page reload; itemtest/walktest/perfcount cover existing inventory, routes and draws. Programme and drying/folding are subsequent #551/#552 parts.

Laundry wash programme (#551): src/laundryprogramme.js adds one fixed control display/pick at the existing washer fascia and normal Life start/status actions. LAUNDRY.washSeconds=35 is assumed game time, not a product specification. Starting requires a fully closed front and a nonempty load with dirt; it captures original ids. Opening pauses with no time loss, closing fully resumes, new loading stays blocked while running/paused, and an original garment can be removed while paused. Only captured ids still inside at completion become clean, wet and unfolded; removed/new garments are unchanged. F cancels without changing item state. Existing generic pump sound runs only while washing, stops on pause/cancel/finish, and completion emits laundryWashed. One Basic canvas display draw, no extra light/pass; label/texture changes only on state or displayed second. laundrytest covers the actual panel touch action, pause/removal/replacement, a real saved-progress reload, exact wet result and F cancellation; life2test section 385 guards dishwasher independence.
