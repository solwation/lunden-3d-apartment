# Food, kitchen appliances and drinks

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [life](life.md), [furniture](furniture.md).
## Module and test map

```text
src/ovens.js           oven (drop-down door) + microwave (side door) in the tall unit, E opens (world.lids)
src/hob.js             the induction hob (#158): E switches it on/off (the front zone glows, "9" on the display, a hum);
                       in world.lids, `world.hob` (`zone`, `on`) for the pan/chicken; stays with F but F switches it off
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
src/chicken.js         the roast chicken in the fridge (#160), a Holdable: E on the pan on the hob lays it in (a child of the
                       pan); fried on a lit zone for CHICKEN.cookSeconds it sizzles, browns and smokes (the smoke follows it)
                       until smokeSeconds after the heat, or at once back in the fridge with the door shut
                       (#194: raw it is pale `CHICKEN.raw`, golden once fried; cooked, E breaks off legs, wings, then body
                       pieces into the hand — `ChickenPiece`, a click eats it; F makes it whole and raw again)
src/hood.js            the cooker hood (#194, `world.hood`, in world.lids): E runs the fan (whoosh, green LED; its light is a
                       separate button = its own lamp, #221 — the fan does not light it, like a real hood) and
                       draws the chicken's smoke up into it; the smoke alarm in the kitchen ceiling (SMOKE_ALARM) beeps
                       and blinks red after `delay` s of smoke the hood does not take (`chicken.freeSmoke`); F: fan off
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
                       FRUIT.bites; put down anywhere, E on the bowl puts it back in its spot (anything else: "Inte i fruktskålen");
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
                       Real product photos/Untappd labels plus readable names/breweries; no pickup/drinking mechanic.
                       BEER_SHELF centralises placement, can/bottle proportions and product-photo crop. Volume/type come from
                       source metadata; diameters/heights are explicit standard-package assumptions, not manufacturer dimensions.
                       Closed fridge hides the entire group; meshes do not intercept existing item/door raycasts.
src/beershelfdata.js   daily startup refresh and complete durable metadata+image cache; see storage.md.
src/beershelfschema.js shared strict wire format and Europe/Stockholm day.
cloudflare/beershelf.js GET-only public-source adapter; globalByStyle normalized ranking, merge Double/Triple IPA styles,
                       take the first two unique beers each, and join the source's product/enrichment catalogues.
                       Real packaging/volume required; missing/invalid metadata or any image fails the complete batch.
data/beer-shelf-default.json prepared real four-beer snapshot with embedded original images; fetchedAt=0 never claims daily success.
tools/beershelfcachetest.html real image decoding, atomic daily caching, offline/timeout/partial failure and actual reload.
tools/beershelfmodeltest.html shelf clearance, real canvas labels, can/bottle sizes and stable package count.
src/beer.js            the big beer (BEER, #117), a Holdable: served on the lounge table when you sit in the lounge sofa,
                       click / "Drick" drinks a gulp (the level drops), back on the table = full; cups drink too
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

