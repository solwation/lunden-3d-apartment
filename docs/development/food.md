# Food, kitchen appliances and drinks

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [life](life.md), [furniture](furniture.md).
## Module and test map

```text
src/ovens.js           oven (drop-down door) + microwave (side door) in the tall unit, E opens (world.lids)
src/hob.js             the induction hob (#158): E switches it on/off (the front zone glows, "9" on the display, a hum);
                       in world.lids, `world.hob` (`zone`, `on`) for the pan/chicken; stays with F but F switches it off
                       #1043: bevelled glass, printed circular zones/crosses and touch controls; the live digit reads upright
                       from the front. Zone centres, glass height and cooking/placement/audio methods are unchanged.
src/pan.js             the frying pan (#159), a Holdable in the middle drawer under the hob (`world.panDrawer`, a child
                       of the drawer while at home); E on the hob with it in the hand stands it on the front zone (`onHob`).
                       #484: dirty after cracking an egg, washed by the shared dish action at the kitchen tap;
                       cannot return to the drawer with an egg or (washFirst) while dirty. F pauses the hob and
                       preserves food/dirty cookware in place. life.keepPart("pan") keeps cleanliness and world pose.
src/eggs.js            #484: Eggs registers the pan as a one-slot cooking store, crackEgg uses the existing Runner
                       (one raw egg -> one cracked item, cancellation consumes nothing). Heat only on the hob
                       while switched on; machine.cook/cooked persists, supports serving and sandwich toppings.
                       EGG sizes/times/stock are guesses/game parameters. tools/eggtest.html.
src/eggmodels.js       original carton, shell and egg geometry; frying whitens the translucent white and browns
                       it if left on too long. Bread uses the same cooked egg model for its topping.
src/sockets.js         the kitchen's wall sockets (#442, #510, KITCHEN_SOCKETS): black double sockets at the top of the splashback
                       under the wall cabinets (over the Moccamaster, between the sink and the hob, in the corner; they replaced
                       the "Hörnbox" on the worktop), merged into the kitchen (stay with F); `mouths()` (fixed: the Moccamaster's
                       and the air fryer's, `taken`), `nearestFree`, `cordToMouth` (a cord along the worktop and up the wall), `plugAt`
src/toaster.js         the toaster (#401, TOASTER): an OBH Nordica Piano Black (no logo; a canvas label with the dial and four buttons), a
                       Holdable standing in the bottom drawer of the drawer unit by the corner (`world.toasterDrawer`, rides with it, "Öppna
                       lådan först"); put down upright, its front to you (a worktop surface runs from the hob to the corner too); E on the plug
                       beside it plugs it into the nearest free wall socket within TOASTER.cord ("För långt från uttaget", sockets.js,
                       #442), the cord along the worktop and up the splashback to it; E on the lever / front toasts (glowing slots, tick + hum, pops with a pling after
                       TOASTER.seconds; again = STOP; unplugged: "Brödrosten är inte inkopplad"); taking it unplugs it; F: home, unplugged;
                       keep.js keeps it plugged in (`keepState` / `loadKeep`, a hook any Holdable can use); empty toasting for now (#394)
src/chicken.js         #708: whole fridge chicken cooks only on the existing courtyard grill; pan attempts keep it
                       in hand with a clear hint. E lifts the whole bird from the grate; off-grill cooked parts can be eaten.
                       CHICKEN.cookSeconds/burnSeconds and SCORE.each.grilledChicken=35 are guessed game parameters.
                       Golden completion rewards once per bird, then existing smoke/darkening leads to burnt + deduction.
                       Life extra x.chicken saves progress, placement, consumed parts and reward/penalty flags; loading is silent.
                       F returns it home quietly without replenishing parts or clearing cooking/reward flags.
                       #1124: eating the last piece of a cooked (or burnt) bird renews it (`renewIfEaten`): a new raw generation on its
                       plate at home in the fridge, rewardable again, saved through x.chicken; event chickenRestocked + a hint.
                       Events chickenPlaced/chickenTaken/grilled/chickenBurnt/chickenEaten/chickenReturnedHome carry
                       stable item.id/type, machine.cook/cooked/burnt, state and (where relevant) surface; pan refusal is explicit.
                       tools/grillchickentest.html: bounded actual Chicken/Grill/Pan/Life fixture + raw/golden/burnt images.
                       #717: the grill E helper stops at the cooking grate so real food meshes own pickup ray hits.
                       tools/grillinteractiontest.html checks actual main raycast/HUD, desktop E, touch and +1 per eaten piece.
                       #1157: the bird cooks on either kettle — the courtyard grill or L1007's patio kettle (#1121). initLife takes
                       the list (courtyard first); `chicken.grill` is the one it lies on, saved as place {grill:true, kind:'kettle'}
                       for the patio kettle (the old {grill:true} still means the courtyard). Main offers 'grillChicken' on whichever
                       kettle is aimed at (or a spot within 0.4 m of its `grateWorld()`); both emit grillLit/surface 'grill' for the task.
                       tools/patiochickentest.cjs: real game, kettle refusal unlit, placement, golden +35 once, burn, save/load, courtyard.
src/sausages.js        #1124: grill sausages. Each kettle grill's grate is a life store (courtyard 'grillGrate', L1007's patio kettle
                       'kettleGrate', #1121; SAUSAGE.slots spots across the bars, clear of the chicken in the middle): a raw sausage
                       from 'sausagePack' (fridge slot 11, beside the chicken's plate) goes on with putIn, grills only while that grill
                       is lit (`machine.cook`/`cooked`, burnt from SAUSAGE.burnAt), is taken off like any life item and saved with the
                       items. The chicken and sausages do not share a grate. A grilled sausage goes into a 'hotdogBun' (bunBag, pantry
                       slot 1) through cooking.js addTopping (one per bun, raw refused); eating it ("varmkorven") bumps `hotdogs`
                       (SCORE guesses) and consumes +1 life like a sandwich. Counts, sizes, colours and times are assumptions.
src/sausagemodels.js   #1124 builders for lifemodels.js: pack, sausage (browns with cook), bun bag, split bun with its sausage part.
tools/sausagetest.html real game (?life&shot&test): stock homes, closed fridge, raw refusal, both grates, lit-only grilling, burn,
                       chicken/sausage sharing, save/load, bun assembly, one per bun, eating and score.
src/hood.js            the cooker hood (#194, `world.hood`, in world.lids): E runs the fan (whoosh, green LED; its light is a
                       separate button = its own lamp, #221 — the fan does not light it, like a real hood) and
                       draws the chicken's smoke up into it; the smoke alarm in the kitchen ceiling (SMOKE_ALARM) beeps
                       and blinks red after `delay` s of smoke the hood does not take (`chicken.freeSmoke`); F: fan off
                       #1043 shell is brushed steel with a glass control strip, two merged texture-mesh filter panels
                       and two LED diffusers sharing the existing lamp material; no new light or smoke/audio controller.
src/coffee.js          Moccamaster on the worktop (MOCCAMASTER): E brews (red light, sound, the jug fills); tank + switch on the left, jug
                       on the right (#315); the coffee colour (jug, cups, mixes) is COFFEE in config, a dark Scanian roast (#316).
                       #334: it only brews with water in the see-through tank and coffee in the open filter basket, else the switch
                       says what is missing (`blockedText`); the jug held at a running tap fills with water (`fillTarget`), at the
                       machine pours it into the tank (`tankTarget`); brewing drains the tank and leaves wet grounds (`spent`), so
                       every pot needs both again; `prime()` fills both (tests), `reset()` (F) empties them; keep.js keeps them
src/coffeejar.js       the coffee jar beside the Moccamaster (#334, COFFEE_JAR, docs/kaffeburk-sked-*.jpg): rounded square glass, ground
                       coffee on a slant, dust on the glass, a bamboo lid that flips up while the beech scoop (a Holdable, `Scoop`)
                       is out of its glass loop; E on the jar takes the scoop full / fills it again / (full) hangs it back; the
                       full scoop at the Moccamaster tips into the filter (`filterTarget`, a puff, sfx.scoop); `aim(item, door)` =
                       the ritual's focus swaps (main.js updateFocus); stats `handBrew` = the first pot by hand
src/airfryer.js        the air fryer (AIRFRYER, #287): an OBH Nordica Easy Fry Deluxe in the worktop corner left of the freezer, turned
                       `rot` 45° with its front diagonally out of the corner (#296; one group, so the basket's slide, the panel,
                       the slots and the vents turn with it), its cord up the splashback to the corner wall socket (#442); E on the handle pulls the basket out / in, E on the panel starts / stops a run
                       (200° + a game-time countdown, fan hum, glowing vents; basket out = paused; "End" + beeps); fish fingers go
                       in the open basket (`FishPack.airfryHeld`, a child of the basket; a look into the open basket takes the
                       nearest one), cook golden in one run, burn in a third (smoke from the vents → the smoke alarm); a loose
                       item; F: off, in, emptied. Fries (#301) go in instead of fish fingers (one kind at a time), see fries.js
src/fruit.js           the copper fruit bowl on the coffee table (#326, FRUIT, docs/fruktskal-dorre-koppar.jpg): a Dorre wire bowl (band,
                       zig-zag wires, base wheel; one merged mesh, roomEnv copper) with apples, a pear, an orange, a clementine and
                       bananas; each piece a holdable like the fish finger: E takes it, click / "Ät" bites (a scoop out of it in the
                       flesh colour; an orange / a banana is peeled first, a banana bitten off from the tip), eaten after
                       FRUIT.bites; #1056 apples/bananas retain a named, non-edible core/peel in the hand for placement or Matavfall;
                       banana bites advance from held top (negative local x) toward the bottom, over the remaining bites; put down anywhere, E on the bowl puts it back in its spot (anything else: "Inte i fruktskålen");
                       stats fruit (SCORE.first per kind); a loose item, F puts every piece back whole; the cat never sits in it
src/fries.js           Aviko frozen fries (#301, FRIES): a stand-up bag (canvas print, our own plain wordmark) leaning on the freezer's
                       top shelf, a Holdable like the milk (not hidden with F, sent home); in the hand, E on the open air-fryer basket
                       pours a portion (the bag tips, sfx.pourFries; FRIES.portions per bag, FRIES.max in the basket, not with fish
                       fingers): a heap of sticks (one InstancedMesh, a child of the basket) that drop in, cook pale → golden in one
                       run, burn in a third (smoke from the vents → the smoke alarm, a deduction); done and pulled out they steam
                       (cups.js `Steam`) for FRIES.steam s; E with a free hand takes a bunch (FriesBunch: click / "Ät" eats one fry,
                       put down / taken again); stats fries / friesCooked / friesBurnt; F: emptied, the bag full; `&fries` = a done
                       basket out (screenshots)
src/beershelf.js       #511: four correctly typed packages (two global DIPA/two global TIPA) on the fridge's upper glass shelf.
                       Real product photos/Untappd labels plus readable names/breweries; each package is a BeerCan (#587).
                       BEER_SHELF centralises placement, can/bottle proportions and product-photo crop. Volume/type come from
                       source metadata; diameters/heights are explicit standard-package assumptions, not manufacturer dimensions.
                       Closed fridge hides the entire group; meshes do not intercept existing item/door raycasts.
src/beercan.js         #587: each shelf package as a Holdable (BEER_CAN, game parameters *guess*): its home in the shelf group (hidden
                       with the closed fridge, the back box only while held); "Ta <label name>", E / "Drick" with nothing aimed at =
                       a gulp straight from the can/bottle (sips gulps empty any size; it rides a little higher as it gets lighter,
                       stats.beer); empty = "den tomma burken/flaskan", a package for the bin (`discard`, back full the next time the
                       fridge is opened, as the milk); put down / back on its spot / F home. keep.js keeps it under `keepName`
                       (the shelf spot, since the daily beers change name) with its ml (`keepState`).
                       #1006: finishing a whole can/bottle restores +1 life via shared consume contract; per-gulp stats preserved.
src/beershelfdata.js   daily startup refresh and complete durable metadata+image cache; see storage.md.
src/beershelfschema.js shared strict wire format and Europe/Stockholm day.
cloudflare/beershelf.js GET-only public-source adapter; globalByStyle normalized ranking, merge Double/Triple IPA styles,
                       take the first two unique beers each, and join the source's product/enrichment catalogues.
                       Real packaging/volume required; missing/invalid metadata or any image fails the complete batch.
data/beer-shelf-default.json prepared real four-beer snapshot with embedded original images; fetchedAt=0 never claims daily success.
tools/beershelfcachetest.html real image decoding, atomic daily caching, offline/timeout/partial failure and actual reload;
                       #711 slow local decode + CPU startup stall/late promise handoff; #718 local fetch/body/schema/decode failures return an uncached empty runtime shelf, actual BeerShelf label textures, successful live recovery and reload.
tools/beercantest.html closed fridge blocks, take/back, drink empty, the bin, back on reopening, F, a page-made reload.
tools/beershelfmodeltest.html shelf clearance, real canvas labels, can/bottle sizes and stable package count.
tools/beerrecoverytest.cjs headless test (#1006): real BeerCan/Beer portion consumption, terminal +1 life, dedup, HUD policy, offline replica and WebSocket sync.
src/beer.js            the big beer (BEER, #117), a Holdable: served on the lounge table when you sit in the lounge sofa,
                       click / "Drick" drinks a gulp (the level drops), back on the table = full; cups drink too.
                       #1006: finishing a whole served lounge beer restores +1 life via shared consume contract; serving anew refills.
src/drinks.js          what a glass / cup holds (DRINKS, #166): `Contents` (amounts per drink, pour over a second, sip in
                       proportion, mixed colour weighted by `tint`), `pourAmount(vessel, drink, fill)`, `GlassLiquid` (a
                       lathe up to the level inside the glass's inner profile, `inner` from furniture.js); colours mix in
                       sRGB, milk uses its `withCoffee` colour in coffee (café au lait)
src/milk.js            the milk carton in the fridge (MILK, #168), a Holdable at `fridge.milkAt`: E with the fridge open
                       takes it, it pours milk into glasses and cups (DRINKS.pour); not hidden with F, only sent home
                       #382: it holds MILK.ml and loses what it pours (a vessel's share of DRINKS.ml); empty ("den tomma
                       mjölkkartongen", `drink` null) it is a package for the bin (`discard`: gone until the fridge is opened
                       again after being shut, then full at home); its amount is kept with the life sim (`life.keepPart('milk')`)
src/cups.js            coffee cups (CUPS): the wall cabinet over the Moccamaster opens; a cup is taken straight into the
                       hand (empty, brewed or not, #141), put down on a table / worktop / floor, back in the open cabinet
                       with E on it; the jug is a Holdable (Jug): E on a standing cup pours, E on the hot plate puts it back;
                       a cup holds a Contents (drinks.js): milk and whisky pour in too (DRINKS.pour.cup); coffee + whisky =
                       `kask` ("koppen med kaffekask", sips count as stats.kask, #169);
                       patterns (#215, `DESIGNS`, CUPS.designs; `&cups=i,j,k`): opening the cabinet puts a cup of a new pattern on
                       every empty shelf spot (a spare from the pool, or the one put down longest ago past CUPS.maxOut); spare
                       cups are out of the scene (state 'spare'); a cup put back keeps its pattern; F: none out, three in
                       steam (#216, CUP_STEAM): a few swaying wisps in one mesh per cup while it is hot (`heat`: fresh coffee 1,
                       cools over CUP_STEAM.seconds, milk cools it), leaning back when the cup moves
src/fishfingers.js     fish fingers (FISH, #162): a carton on the freezer's lower shelf; E takes one straight into the hand
                       (FishFinger, like a cup), click / "Ät" bites (FISH.bites, shorter each time, sfx.chew), put down
                       anywhere / taken again / E on the carton puts it back; F clears them away and refills the carton;
                       fried (#214): E on the pan on the hob lays one in (FISH.fry.slots, not with the chicken), frozen pale →
                       golden after fry.seconds, burnt + smoke from burnAt; fried ones steam, crunch, never go back in the carton
src/fridge.js          the fridge: hollow, lit, opens with E (in world.lids); `shelfSpot` = the chicken's place; the freezer is
                       the same class (`freezer: true`, #161): drawers + shelves, the changelog note rides on its door;
                       #504 adds a hollow grönsakslåda and four hollow freezer drawers: Openable pivots in world.lids with two m-sized slots each.
                       #695: shell, liner and shelves merged per material; the inside (`inner`: liner, lamp, shelves, the drawers and
                       what is stored in them) is drawn only while the door is open (`update`), like the beer shelf.
                       COLD_DRAWERS measurements/travel are assumptions based on the original model, not manufacturer measurements.
                       Door fully open before pulling/loading; drawers fully in before closing a door. F closes drawers before doors.
                       Transparent walls let actual stored food be selected; held food targets loading boxes while the grip can still close.
                       Anonymous juice blocks/frozen-bag blocks are removed. Old fridge/freezer store ids/slot indices remain; freezer slots 0–2 use the upper glass shelf.
                       Drawer stores fridgeDrawer/freezerDrawer1–4 keep contents/amounts/homes through normal Life saving; anchors follow their pivot.
                       tools/colddrawertest.html covers real front/loading/pickup actions, full storage, followers, door guards, real reload and F.
                       open past FRIDGE_ALARM.after s it beeps and a red LED blinks (`onAlarm` → a deduction, #288; the note
                       open pauses the freezer's timer, `paused`); F shuts both
tools/beertest.html    headless test: sit in the lounge sofa → beer, drink it empty, back = full, a sip of coffee, F
tools/milktest.html    headless test: the milk not reachable through the closed fridge, take it, back on its shelf, pour into a
                       glass, an empty cup and a cup of coffee (lighter brown), up to full, on the worktop, F sends it home
tools/fishtest.html    headless test: open the freezer, eat a fish finger, put one on the dining table and the floor, one
                       back in the carton (it counts down), F clears them and refills it; the cat walks to one on the
                       floor (on all four: up first, hips raised, every leg swings, sits to eat, #224) and eats it,
                       ignores one on the table, stops when it is taken up first (#163)
tools/toastertest.html headless test (#401): the toaster in its shut drawer is blocked, open → take → on the worktop upright; unplugged
                       refuses, plugged in at the corner wall socket (and the hob–sink one, #442), toasts (glow, the update waits, counted), pops, STOP, taking unplugs, too far
                       refuses, back in the drawer rides with it, F, a page-made reload keeps it plugged in
```


#708 validation (2026-10-11): `tools/grillchickentest.html` passed 28 bounded assertions using the actual Chicken, Grill, Pan, Life and stats modules on base `4963cc0`; console/page errors were empty. It covers explicit pan refusal/hob non-cooking, grill-only progress and pause, exact +35 once with badge, golden/burnt domain events, raw/golden/burnt round-trips, late extra registration, off-grill pose, eating, F preservation, and silent restoration. Raw/golden/burnt WebGL captures show the actual occupied grill briefly extinguished for visibility. Final base `2587774` preserves #712 counter reset and #695 fridge/culling changes; the exported chicken model and tested cooking classes were unchanged upstream. Main focus/restore hooks were reviewed and syntax checked; no full apartment startup or broad cooking suite was run.

#717 verification (2026-10-11, runtime base `580ecf7`): 24 actual-main browser assertions passed. The test temporarily
recreates the old 1.1 m E box in the same loaded scene: its nearest production raycast hit is the grill; the corrected
helper ending at the 0.65 m grate selects the golden chicken. Actual mouse pointer lock/keyboard E and touch action
handlers cover empty-grill lighting, raw placement, golden pickup, floor placement, exposed-leg breakoff and two bites.
The main onCooked path awards +35 once; completing an eaten piece awards the existing +1 with actual score and badge
feedback, while the first bite, saved-state restoration and F do not duplicate it. Eating points/config are unchanged.
The test aims at the exposed distal bone rather than an occluded thigh center. Desktop/touch pickup and eating HUD
screenshots were reviewed; the grill was extinguished for readable food, and the touch capture waits for fullscreen resize.
No page/shader errors were recorded. The animation loop is stopped for bounded manual steps; real frames are rendered
at pixel ratio 1 (initial backbuffer 640×420), with the headless default warm-up skip. No broad suite/performance claim.
`tools/grillinteractiontest.cjs` drives the HTML wrapper (Playwright module/Chrome path via env, dev server URL argument).
Final base `a555dfb` preserves unrelated context-restore probe, combat-HUD and outdoor foliage updates; relevant cooking/focus classes
were unchanged upstream and final source syntax/diff checks pass.


Cooking regression fixture (#774): `tools/cooktest.html` binds `fridge`, `stats` and `smokeAlarm` from the real `__app`,
including the air-fryer/fries checks. An asynchronous fixture exception produces `SOME FAILED` with its stack and all
previous PASS/FAIL rows. The original cooking assertions and full-render 900×600 iframe remain unchanged. Actual run
through `runtests cooktest --jobs 1`: **82 PASS, 0 FAIL**, 132.925 s, no pageerrors; loaded `/index.html` without `test`,
controller false, measured viewport 900×600. Log and mode evidence: `/tmp/runtests-229228/cooktest.log`, `summary.json`.

### Bicycle-stowed portions (#1034)

FruitBowl, FishPack, Fries and Chicken expose explicit `saveStowed(item)` / `loadStowed(state)` owner adapters used only by keep’s actual bicycle-hand bridge. They restore one existing logical portion without a second bowl/carton/heap withdrawal, consumption or reward. Fruit uses the existing slot and private shape; Fish and Fries reuse or create the one matching pool model and preserve its portion sequence/source counts. Putting it away or consuming/resetting it ends the restored-hand receipt immediately.

Chicken’s existing Life extra remains authoritative and loads first. Whole/part/body restoration preserves generation/cook/reward/gone/bodyLeft; an existing gone part or already withdrawn body index must substantiate the pointer. No breakOff or cooking/consumption callback is replayed. Silent whole-bird take only restores its held state. This does not add general persistence of all other loose food; the remaining unique-object bridge is #1035. `tools/bicyclestowfoodtest.cjs` exercises real owners/Player/Life/keep and actual browser reloads with controlled appliance/collision collaborators, without World/WebGL.
## Beer poured into existing glasses (#1007)

BeerCan exposes the ordinary drink/pour interface; Glass.press/pourFrom, Drick and Contents retain the existing glass/mixture quantities and timings. DRINKS adds beer with the existing patio beer finish and a champagne-like0.85 fill (visual guesses), never cup/patio-decoration healing. Capture the drink kind before withdrawing the last source ml. Pouring reserves actual ml once, with the same BeerPortion object attached to glass lots. Actual sips reduce every beer lot in proportion to the entire mixed drink; only that volume advances the source ledger. The ledger terminal flag emits one original ID, whichever combination of can/bottle/glasses finishes it. Emptying through pouring, home/clear, spill or a lost part does not advance drunk volume; the old source-empty fallback was removed. New servings replace only the source ledger, while old glasses retain their old generation. Original gulp/sip statistics remain with their existing owners.

Glass passes terminal IDs through the existing main→Combat.consume hook. All food/direct-beer/glass claims share one small Combat receipt queue because Ghosts supports one pending consume. Dedup remains before enqueue, full-health clamp/offline/minute recovery use existing rules, rejection cannot poison the next valid claim, and a queued online claim stays bound to its original socket without offline/reconnect replay. No server protocol or HP authority changes. DRINKS.beerLots64 is a conservative bookkeeping-budget guess: an additional distinct source is honestly blocked before withdrawing ml, without silently discarding provenance.

## Fruit remains (#1056)

`Fruit.isRemnant` derives the terminal apple/banana state from the normal bite count.
The original mesh remains the single holdable; its geometry switches
to the core/peel using the existing vertex-colour material and E target. This also
keeps the shared placement ghost consistent and adds no visible draw calls. Completion still emits
`onEaten`/`onConsume` exactly once; remains have no Ät action and expose the existing
`wasteKind = food`/`discard()` contract for Matavfall. Wrong/full bins keep the hand.
F restores whole fruit and a new portion generation, as before. Pear/citrus completion
keeps its original disappearance policy. No new lights or textures.

`fruit.initLife(life)` registers `x.fruitRemains`: completed apple/banana slots,
generations, placed poses and discarded tombstones only. Held remains return to the
bowl on an ordinary visit/reload; the existing bicycle-hand adapter restores them
to the hand when its receipt is present. Terminal stow records use empty scoops;
remnant geometry never depends on historical bite scoops. Loading is silent,
validated atomically and never repeats consumption. Uneaten loose fruit retains its
previous persistence policy.

`tools/fruitremainstest.cjs GAME OUT` runs actual FruitBowl/Life/waste/keep in native
Chromium, genuine document reloads, bin sorting/capacity, duplicate completion,
terminal Life→bike→reload and malformed saves. Four actual WebGL component images
show the peeled banana, upper cut, peel and core. These are isolated components,
not full World/physical-phone/FPS evidence.

Verification: focused native3 passed 15/15 with no browser exceptions, and the
unchanged `bicyclestowfoodtest.cjs` passed 104/104 on the geometry-swap source.
The four focused images were opened. Artifacts/source hashes are under
`/tmp/lunden-fruit-1056/native3` and `bicycle-final`. Native1 retains two fixture
failures from stale bin references after Life replaced its instances; reacquiring
the actual bins corrected the fixture without relaxing product assertions.

Final combined-source verification after preserving #1059/#1057: focused
`combined-final` passed 15/15, no browser exceptions; final images were opened.
Every focused runtime/producer hash matches the committed source. The earlier
104-check bicycle run retains every executed main-function fragment byte-for-byte;
its sole whole-file drift is the unrelated removed material-library close handler.
