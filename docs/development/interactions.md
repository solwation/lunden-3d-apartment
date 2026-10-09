# Interactions, controls and HUD

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [life](life.md), [storage](storage.md), [verification](verification.md).
## Module and test map

```text
src/interactionoutline.js  subtle target-only material brightness, normal depth testing, no edge geometry (#531)
src/compass.js         camera-relative geographic compass; shares DAY.planNorth calibration (#528)
src/hudicons.js        shared neutral SVG icons, pressed states and accessible labels (#525)
src/hudicons.css       neutral mobile/desktop button surfaces, focus states and no-blur fallback (#525)
index.html             page shell, HUD, start overlay, import map (three from jsDelivr, pinned)
src/player.js          WASD/arrow/joystick movement, circle-vs-segment collision, step-up, gravity; outdoors the terrain (`groundY`, #256);
                       `isFree` / `obstacles` / `nearestFree` / `unstick` (#314, see Input notes); up on the roofs (#360): `aloft`
                       (outdoors > ROOFS.aloft m over the ground, over our flat above UNIT_TOP − 0.3) = `outdoors`, level 0, the
                       roofs' walls instead of a level's segments, no obstacles; `groundAt` takes the highest roof ≤ feet + stepUp
src/fall.js            falling (#361, FALL): player.js keeps `fall` (the highest feet since leaving the ground + the deepest free gap
                       under them) and calls `onLand(drop, gap)`; only a gap over FALL.free counts (the stair's risers, the ramp never).
                       Over FALL.hurt (3 m): sfx.landing + sfx.ouch ("aj"), the view jolts, #fall goes red then black, no walking, the
                       visitor wakes at FALL.wake outside the front door facing the house, "Du slog dig …" while it fades in; only the
                       place is reset (`onWake` hooks, e.g. the jetpack of #359 going home), a deduction `fall` + stats `falls`. Over
                       FALL.soft: a soft thud and a knee-bend. Off a roof's edge (#360) or the jetpack's thrust cut high up (#359; with
                       it on, the drop = the landing speed v² / 2g); `&fall=h` drops you from h m (falltest.html)
src/jetpack.js         the jetpack (#359, JETPACK): our own unbranded pack (one vertex-coloured mesh) on the east wall of the portik's small room
                       (#520: `JETPACK.hook`, `face: -1`, `floor: 0`) under the yellow sign
                       "Låna Jetpack på eget ansvar. Se upp för fiskmåsar." (`sign`); E puts it on (hands free; outdoors and in the
                       garage — under the garage / stairwell / portik's ceiling no thrust, "Inte inomhus", walking back in keeps it on),
                       `player.jet` = it: Space / ⬆ (#jet-up) thrust, C / Ctrl / ⬇ down faster, WASD / the stick steer at `speed` with
                       inertia (`player.flying`, `player.jv`), no thrust = falling; `ceiling`, OUTDOOR's edge and the roofs' walls
                       hold (+ `roofs.blocks` / `above`: a roof edge or canopy in the way of the body); the landing hurts by the speed
                       it came down at (v² / 2g as the drop, fall.js); heat (#jetpack bar, `heat`) cuts the thrust when full.
                       E with nothing else (`dropTarget`, touch: "Ta av dig jetpacken") stands it down in front of you; walking in
                       through a door with it on stands it down outside; F / waking after a fall (`fall.onWake`) send it home; keep.js
                       part `jetpack`; flames (rig on your back) + smoke (one Points) + #jet-glow + sfx.jetRoar; stats `flights`
                       (SCORE.first: the first take-off); `&jetpack` = on from the start (tools/jetpacktest.html)
src/spidersuit.js      the Spider-Man suit (#597, SPIDER, all values *guess*): our own drawing (red top with web lines + a small spider,
                       blue under it, no licensed artwork) folded in the second drawer of Walter & Kian's MALM (furniture.js names
                       that drawer box 'spidersuit-drawer'; its pick box only answers with the drawer open). E puts it on anywhere
                       (the jetpack's flow: `dropTarget` "Ta av dig dräkten" lays it folded in front of you, keep.js part
                       `spidersuit`, F home to the drawer); hand.js `suitHands` = red gloves, blue sleeve. `player.suit` = it:
                       outdoors only (`player.canClimb`: not in the flat, the garage, the stairwell, nor flying the jetpack), walking
                       or falling into a wall whose push-back faces you, with a roofs.js surface ≥ `minWall` over the feet behind it
                       (`roofAhead`), holds you on it (`player.climb` = the wall's normal); W / S (the stick) up / down at `climb`,
                       A / D sideways at `side` (stops at the building's side), Space lets go (a normal fall), down at its foot you
                       stand; a roof surface behind the wall within `reach` of the feet is pulled over onto. Webs: a click with
                       nothing in focus and empty hands (`click` → 'web') or the touch 🕸 (#web-btn) raycasts the drawn scene up to
                       `web.range`; a strand (one Line) flies out at `web.speed`, a splat (one plane) sticks on the hit face for
                       `web.life` s, at most `web.max`; sfx.thwip. `&spidersuit` = on from the start (tools/spidersuittest.html)
                       #600: with it on fall.js never hurts (a soft landing). Space / the touch jump button (#jump-btn, left of
                       🕸, shown with the suit on) is a *press* (`player.spaceDown` / `jumpPress`): standing outdoors where it
                       climbs it jumps at `jump` m/s; on a wall it lets go. A strand that sticks outdoors calls `player.attach`:
                       `player.swing` pulls you at `swing.pull` towards the anchor under `swing.gravity` of gravity, the strand
                       reeled in at `reel` (at its length the outward speed goes = the swing), at most `speed`; the walls hold
                       you (up the anchor's own façade you slide on; another façade to climb = onto it). At `arrive` m from the
                       hands: onto the anchor's façade when it is one to climb (`climb`), else let go; Space / the jump button,
                       `max` s or `stall` s getting no closer let go, the speed carries on in the air (`player.fling`, `fling`
                       drag) until the landing, and flung into a façade holds you on it. The strand stays taut while you swing.
src/touch.js           on-screen joystick (left) + drag-to-look (right), multi-touch pointer events
src/viewport.js        early CSS-surface observer: keeps canvas buffer/camera in sync through startup rotation (#567)
src/main.js            renderer, lights, input modes, door raycast prompt/button, loop (step)
                       shortButtonLabel uses exact target-owned verbs for structural fronts, seats, taps, wiping, speakers and generic placement (#502).
                       Touch buttons/choice rows shorten only known unambiguous actions; small item/package names, specific transfer destinations and blocked reasons remain.
                       Desktop prompts keep their full context. tools/actionlabeltest.html covers actual utensils/package/transfer buttons; opentest checks all front labels.
src/rearrange.js       furniture cheat (#465): § / Enter (#596; not from a focused field/button nor in rearrange mode) / >_ inside the touch score badge opens the console; either exact code "olof is the goat" or "sarah is the goat" unlocks rearrangement.
                       buildFurniture exposes stable movable ids and separates framed pictures before per-frame merging.
                       E/click selects and confirms, R/turn rotates, X/cancel abandons the local 35%-opacity ghost. Rugs never
                       carry things above them; support surfaces identify carried furniture and local Holdables/life items.
                       Confirmed world poses update footprints, seat targets, surface heights, light anchors/washes, rug data
                       and Marks caches. Local cached authoritative layout is lunden.furniture.layout; unlock is a convenience.
                       GET/PUT /furniture uses DrawingRoom's serialized durable storage, revision-checked atomic batches;
                       conflicts cancel and pull the winning layout, previews never sync. Decorative mirrors (LINDBYN, both NISSEDAL, SKOGSGRÄNSEN, pineapple, vanity and closet) are independent
                       wall pieces with their reflectors; furniture builders expose wallMirrors, detached before layout restoration.
                       Bathroom mirrors/cabinets remain fixed. tools/rearrangemirrortest.html and tools/loosemirrorstest.html verify
                       independent movement, reflection, restoration, reload and fixed-mirror exclusion.
                       § / Meny opens clickable rearrangement controls with a free cursor; Esc exits the mode and cancels the preview,
                       including native pointer-unlock events. Touch keeps its input mode when leaving the menu.
                       The compact edit panel shows selection/placement steps, selected-only Rotate/Cancel, Menu and Done.
                       Reset controls sit in a collapsible menu section and retain both confirmations; Enter inside the console only submits the code.
                       tools/rearrangeuitest.html covers the touch badge hit area, § and Enter (opens in play; submits inside; ignored in other fields, focused buttons and rearrange mode), panel states, cancellation and menu scrolling.
                       Original-position reset (button / Home) asks for confirmation and uses the same atomic move; detached Thing supports and the fruit bowl follow
                       furniture, including layouts saved before #475.
                       Whole-layout reset also asks for confirmation, writes every registered home pose atomically, and rejects a changed global revision (#481).
                       tools/rearrangeresettest.html covers both confirmations, cancellation, followers and all-room reset.
                       Physical bounds ignore Ambilight; the TV targets support surfaces and follows BYÅS in the same saved batch, repairing legacy sunk TV poses on load (#478, tools/rearrangetvtest.html). Browser tests: tools/rearrangetest.html, tools/rearrangefollowtest.html;
                       Wine racks use wall placement with their detached bottles; SYMFONISK lamps/speakers use support surfaces like the TV (#482).
                       tools/rearrangeplacementtest.html verifies wall rotation, bottle followers, sill/table placement and reload.
                       The Christmas tree (#571) is an ordinary piece ('julgranen') while it stands; out of season it is hidden and
                       not selectable. Pieces it hides (`userData.seasonHidden`, src/christmas.js) are not selectable either and
                       keep their poses; `apply` reveals them while poses change, `refresh` skips them; tools/christmastest.html.
                       Worker tests: cloudflare/layout.test.mjs. Development: cloudflare/dev.mjs and ?cloud=http://localhost:8145.
src/minimap.js         plan view with the visitor's arrow, current room highlighted (top right, under the HUD buttons); hidden, shown with the
                       stats (Tab / T / 📊, #85), K shows it alone
src/measure.js         tape measure (Q / 📏): two points on any surface, distance label
src/rest.js            sitting / lying down (REST): seat & bed spots from furniture userData.rest, look clamp
src/holdable.js        things you take and hold (one at a time): home + pick box, held pose in camera space,
                       use = click / touch button / fast look; E on the home puts it back, E on a table top /
                       worktop / the floor (HOLD.reach) puts it down (`placeAt`, lying by its shape — `restPose`;
                       cups stand). While something is held other things are `blocked` ("Lägg ifrån dig …")
                       #368: `placeAt(p, yaw)` + `poseAt(obj, p, yaw)` (every class that puts down its own way has one; Miele
                       none): main.js snaps the spot (LIFE.place: a 5 cm grid inside a table's / worktop's edges, 10 cm on the
                       floor), the turn = the view in 45° steps + R / the ⟳ button (#turn-btn), and a faint ghost of the thing
                       (`itemGhost`, its meshes with one see-through material) stands exactly where E will put it; without
                       `poseAt` the ring as before. Looking away cancels (still in the hand); a life item never goes under the floor.
                       #487 adds white depth-tested outlines (LIFE.place.outlineOpacity, 1 mm depth bias) to the same
                       ghost, including valid returns: Holdable.homeMatrix reads the live drawer/home frame, life
                       putIn/putOn preview the same free slot/anchor as their actions, cups preview their free shelf.
                       Blocked/closed targets and non-placement menu rows show no return ghost. Home targets take
                       precedence over the generic surface beneath them. tools/returnmarkerstest.html covers the
                       cloth, leaning board, fridge access, cups and a moved support; holdtest covers other placement.
src/hand.js            the visitor's arm + hand (HAND, #195, #238): three meshes in the camera (sleeve, cuff, the hand: palm,
                       thumb, four three-joint fingers of capsules + the bare wrist, with morph targets relaxed | grip |
                       spread), hidden when empty; holding a thing the fingers close round its `grip` (or the right edge of
                       its box; `handCurl` overrides how far they close: the fish finger is pinched) and follow it, `handPose: 'palm'`
                       (the basketball) carries it on the palm turned up; petting the cat with a free hand (#242) the palm
                       strokes it (`cat.petHand()`, its own spare hand only while you hold something) and `player.kneel` crouches;
                       E (main.js `use`) reaches towards the target and back with the fingers opening. The detail culler (#189) looks again whenever the held thing changes (`refresh()`)
src/book.js            the book on the side table by the armchair (BOOK, #140), a Holdable: click / "Läs" opens
                       #book-panel (a spread; A D / ← → / click turn pages, E / Esc close; reading mode)
src/things.js          bottles and glasses (#152): furniture builders list `userData.things` (wine rack, BESTÅ), each
                       becomes a Holdable: take, stand on a table, back in its own place. Bottle: `drink`, tips while it
                       pours; Glass (#167): with something that pours in the hand (`drink` + `pour(secs)`), E on a glass
                       standing out pours (DRINKS.pour.glass); click / "Drick" sips; back in the BESTÅ = empty; a full
                       vessel's target has `blockedText` ("Vinglaset är fullt") instead of "Lägg ifrån dig …"
                       Trinket (#182): the secretary's things (`trinket()` in furniture.js, origin at the bottom centre, merged
                       per material); home = a local spot in its drawer (`homeParent`), so it rides along; its back box sits
                       in the drawer, raycasts only while held and is blocked ("Öppna lådan först") while the drawer is shut
src/secret.js           the secret drawer (SECRET, #183): all surprises (SECRETS in furniture.js) are Trinkets in it, one shown;
                       each open draws a new one by weight (never the same twice, rare ones pling, stats.secrets/secretKinds),
                       at most `keep` left lying around (older ones go home hidden); `&secret=i` picks the first one
src/saber.js           the lightsaber in Sovrum 2 (SABER), a Holdable; the blade burns marks where it cuts in (#96)
src/rifle.js           the AK-47 (#196, RIFLE): a folding-stock AKMS lying in NORDLI's wide bottom drawer (a Trinket, KINDS.rifle,
                       rides with the drawer); click = a shot, held (`trigger`: mouse button / the touch button) = automatic;
                       hitscan from the eye → a 'hole' mark (marks.js), the lawn target scores, the cat meows; after RIFLE.mag
                       the empty magazine drops to the floor and a full one clicks in; F clears the dropped magazines
src/target.js          the Nerf target on the lawn behind the hedge (TARGET, #99): rings × distance bonus, "+N" badge,
                       a score board beside it (localStorage 'lunden.target'), E clears it; it rises out of the grass
                       only while a holdable with `hitsTarget` (blasters, lightsaber, wands) is in the hand and sinks
                       under it otherwise (#144, #179); saber cuts and wand magic on it score too
src/basket.js          Tilly's basketball (BASKET): a Holdable in a wall holder over her daybed; click shoots it on an arc
                       through the point you look at (near the rim: at the rim, coming down at `entry`), right click / the
                       🏀 button (#power-btn, its icon = the held thing's `altIcon`) dribbles; out of the hand it bounces off
                       every raycast surface (`marks.segment`, glass and doors too), rolls out, lies still (placed), and is
                       caught when it passes the hand (or E). `Hoop`: a portable hoop on the asphalt west of our entrance,
                       up while the ball is out of its holder (rises like the Nerf target), analytic collision (rim, board,
                       pole, base); down through the rim = a basket (stats baskets / threes from beyond `three` m)
src/marks.js           marks on surfaces (MARKS, #96): `hit(from, to)` = first surface on a segment (glass, doors, lids
                       → none; the cat → meow), `add(kind, hit)` / `burn(hit)`; one ring buffer, an InstancedMesh per
                       kind (burn, glow, star, butterfly, splash) with a per-instance fade, a Points puff of smoke;
                       `magic(hit, eye)` = the wands' stars + fluttering butterflies (#97); darts splash paint (#98)
src/breaking.js        shooting things to pieces (#263, BREAK): glasses, bottles, cups, the jug and the beer are registered
                       (`breaker.add(item, kind)`); Marks.hit with `{ weapon }` (rifle / dart / saber / wand; `glass: true` =
                       the bullet goes through window panes) smashes one standing in the way (not held; darts only `light`
                       kinds): `item.shatter()` (Holdable: hidden, no E target; a cup goes 'spare'), shards in two pooled
                       InstancedMeshes (glass / china) that bounce once and fade, a 'splash' of what it held, sfx.shatter,
                       a cat near meows; `mend()` after BREAK.back s or F. Stats shattered (first per kind) + shatterRange
                       (`Breaker.points`: distance × weapon)
src/trigrid.js         world-space triangle grid per big static mesh, so short segment hits skip three's full raycast
src/remote.js          the TV remote on the coffee table (REMOTE), a Holdable: click = next programme (on if off),
                       right click / ⏻ (touch) = power, on the TV in the look direction (not through walls)
src/toys.js            Nerf blasters (#236: pistol, drum, long — rounded profiles merged per material) + darts (Sovrum 2), magic wands + sparkles (Sovrum 3), the flashlight
                       (hall wardrobe; one always-present SpotLight), all Holdables (TOYS)
src/drawing.js         crayon drawing on the paper on the Sovrum 3 desk (DRAWING): canvas texture, drawing mode
                       (view down, pointer free, palette #draw-panel, 1–9, E/Esc back), saved in localStorage;
                       "Ta teckningen" / T takes the sheet into the hand (a blank one stays), E on the desk puts it back
src/posters.js         drawings taped up (#176): HeldDrawing (the sheet in the hand, shares setHeld) and Posters — E on a
                       wall (near a wall outline, or a material with userData.poster) / the fridge or
                       freezer door (child of the door, swings with it) tapes it up if the whole sheet lies flat on one
                       mesh (9 probes); also the underside of a top bunk (material userData.posterCeiling, #199: facing
                       down, the picture's top = the viewer's screen-up, rec.up; within REST.reach.lie when lying in the
                       lower bunk); one plane + canvas texture with tape per poster; max DRAWING.maxPosted; IndexedDB
                       'lunden'/'drawings'
                       E on a poster (kind 'poster') opens #poster-panel (#177, reading mode): Släng (S) / Ta ner (T) /
                       Stäng (E, Esc, ×); Ta ner keeps its id, put back without taping = back up where it was
src/paperball.js       a drawing thrown away (#177): crumpled in front of the camera, thrown, bounces on the floor (walls:
                       the level's collision segments), shrinks away after DRAWING.ballSeconds; not saved
src/calendar.js        the cat calendar (CALENDAR): a cat per month, the days, the chosen date; #cal-panel picks it
src/todo.js            the TODO post-its on the fridge door (#340, TODO_NOTES): loadTodo (data/todo.json, else
                       todo.sample.json), sorted by `byPriority` (high → medium → low, oldest first; no `prio` = low,
                       #431), `cleanTitle` (an issue title → a short phrase), one canvas atlas on one plane (a child of
                       the door, kept clear of drawings via posters.reserved); each note: the text, `#N` small top right,
                       a muted "pågår ✓", 🐞 / ★. Only a teaser (#431): no E target (the plane is out of raycasts), no
                       list to read; F keeps them
tools/todo.py          the open issues → data/todo.json at publish time (stamp.sh); `Lapp:` line, kind, in-progress,
                       `prio` from the `priority: …` label (none = low, for the post-its only), sorted like loadTodo
src/keycabinet.js      the IKEA LINDBYN mirror Ø 110 (living room since #205), the hall's IKEA NISSEDAL mirror (#226; a second upstairs, #332), IKEA SKOGSGRÄNSEN
                       over the secretary (#265, `SKOGSGRANSEN`: tinted glass + a tint overlay, copper bars below the horizon)
                       + the hall's Solstickan key cabinet (E) with the Renault key (E → beep beep);
                       the cabinet is in world.lids, the key (world.carKey) a target only while it is open
src/turbo.js           Kaffeturbo (#217, TURBO): TURBO.cups cups' worth of coffee (cups.js passes the coffee per sip) within
                       TURBO.window real seconds → `player.boost` = TURBO.speed (indoors too) for TURBO.seconds, the fov wider,
                       #turbo ("Kaffeturbo!" pops, then a small label with a bar) + #turbo-edge rainbow glow, our own
                       CC0 chiptune (generated fallback; Sonos ducked meanwhile); real time (`turbo.now`), `&turbo`
src/stats.js           visitor statistics (localStorage), "+1" badges per event, the HUD panel
                       (hidden; Tab held / T / 📊 shows it; touch, #245: narrower than the right-hand controls, scrolls with a
                       finger — touch.js ignores #stats — ⤢ full screen in columns, ✕ closes; rows go into #stats-body)
                       The score (#197/#198): `totalScore()` from SCORE in config shows top left (#score, `renderScore` after
                       every count) with a "+N" when it grows. Balanced (the user): you can grind for ever, but easy repeats give
                       little and rare / hard things a lot — `each` = points per event, `first` = per distinct thing the first
                       time (`bump(key, n, id)`, main.js `idOf(thing)` = name + position; doors, lamps, seats, taps, fronts,
                       songs, rooms, new cat coats) and `again` (fractions) every time after, `breeds` = per cat by how rare
                       its breed is, `secrets` = per surprise kind (+ rare kinds); `rawScore()` unrounded. Repeats show no badge
                       Deductions (#288, SCORE.penalties, `penalize(key, sub)`): the fridge/freezer door alarm (and more while it
                       beeps), food burnt, the smoke alarm, a spill (E on a full glass/cup with a pourer: it runs over, a splash),
                       a cat shot / cut / hit (by weapon); a red "−N reason" by the score, `stats.penalties` counts, the "Avdrag"
                       row; a deduction takes at most what the score has (`penaltyPoints`): never below 0, no debt. The
                       leaderboard gets the net score (the Worker keeps each row's best)
tools/walktest.html    headless movement test (+ #355: round the block, the stairs, the recess, the portik, sprint, nearestFree; #417: garage door → the
                       turn → the big hall → our stall → the basement door → the Hisshall; #415: the portik → down the stairwell → the garage lobby → up to
                       våning 3 → the loftgång)
tools/touchtest.html   headless touch-input test (synthetic pointer events); the choice menu (#367, &life): the butter's two rows as
                       buttons, a tap opens it without turning the view, a number / E pick, one action = the usual button, slice → plate
tools/measuretest.html headless test of the tape measure (wall to wall in the living room)
tools/scoretest.html   headless test: points from 0, a door (again: a little), the grill, a fish finger the cat eats, cats by breed
                       (+ a new coat), 100 sips (no cap), a basket / a three, secret kinds (+ rare), the balance; deductions (#288):
                       the fridge alarm (+ longer, the note pauses the freezer), a burnt fish finger, the smoke alarm, a spill, the cat
                       shot (hiss, flight, once, no cat for a while), never below 0 / no debt, the red "−N"; reset
tools/todotest.html    headless test of the TODO post-its (#340): the sample loads, sorted by priority (no label = low,
                       #431), on the fridge door (swing with it), no E target / no panel, no drawing over them, F keeps
                       them, cleanTitle
tools/keytest.html     headless test of the hall key cabinet: open, car key reachable only then, beep; the car starts in its stall (#358),
                       comes out through the opened garage door, parks, leaves back into its stall, the door shuts
tools/clicktest.html   headless test of left click as E (#443): nothing under #arm, the freezer and a fish finger by click, put down on
                       the table where the ghost showed, a blocked target nothing, eaten by click / right click with nothing in focus,
                       the rifle still shoots at the freezer, seated a click does not stand you up, the remote's right click = power
tools/esctest.html     headless test of Esc on the start screen (click-to-start cover, ignored over the note)
tools/crouchtest.html  headless test: C crouches (Ctrl too, other Ctrl shortcuts prevented), seated C stands up, leaving mid-visit
                       asks (beforeunload), not on the start screen nor on a new-version reload (#274)
tools/papertest.html   headless test: each toilet's paper holder — pull sheets out (the roll turns, max 4), tear the strip into the hand
                       (pulling blocked), throw it in the toilet (the lid opens, it flushes, counted, swirls away), F refills (#426)
tools/resttest.html    headless test: sit on every seat and lie in every bed (spot, no walking, up again looking the same way;
                       head turned, old spot behind: up in front, #202; every spot ahead / turned, from behind: free floor, #302; in every bed the eye clear of the bedding, #308; no two bedding surfaces within 1.5 mm, #335)
tools/stucktest.html   headless test (#314): a 5 cm scan of both floors (doors open; the free floor in one piece, pockets out of
                       reach listed), getting up from every seat / bed with the old spot inside it, F putting the sofa / bed back
                       round you, the car parking on you, the hoop rising under you, a door shut on you, a resume record in the bed
tools/falltest.html    headless test (#361): a 2.5 m drop is soft, a 5 m drop hurts (red, black, no walking, awake at the front door,
                       counted + a deduction); the stair up / down (also crouched), the ramp,
                       the outdoor stairs (#355), out of the top bunk, a resume record: no free fall
tools/jetpacktest.html headless test (#359): the jetpack on its hook in the portik room, E puts it on (hands free, HUD), Space lifts
                       (the climb cap, flames, heat, the first flight counted), letting go falls, a soft landing, the ceiling, C down faster,
                       OUTDOOR's edge, onto Hus C's roof (counted), stood down there and on again, keep.js round trip, Hus L / Hus A hold,
                       overheating cuts out, a cut high up hurts (home on its hook), in through the front door = stood down outside,
                       F home, touch ⬆ and "Ta av dig jetpacken"
tools/spidersuittest.html headless test (#597): the suit in the MALM drawer (no target through the shut drawer), E on, indoors no
                       climbing, laid on the floor and on again, keep.js round trip, onto Hus C's façade (W up, D sideways, S down,
                       Space lets go unhurt), up and over onto its roof, the area's edge not climbable, webs stick (max, gone after
                       `life`), F home, the `spiderman` cheat, touch: the stick climbs, 🕸 shoots, "Ta av dig dräkten";
                       #600: an 8 m drop is soft in the suit, Space jumps high (once per press), a web on the façade pulls you up
                       to it onto the wall, one held back by the pergola lets go, Space mid-swing flies on and lands unhurt, a
                       web on the street pulls you there; the jump button by 🕸 jumps; without the suit no jump and 8 m hurts
tools/sabertest.html   headless test: take the lightsaber, swing it, hang it back
tools/toystest.html    headless test: blaster (dart lands), wand (sparkles), flashlight (beam follows the view)
tools/wandtest.html    headless test: a wand's magic on the wall (stars + butterflies), none in the sky, gone after a while
tools/nerftest.html    headless test: a dart leaves a paint splash in the blaster's colour on the wall, drops, fades
tools/targettest.html  headless test: target points (rings × distance bonus), a dart in the bullseye, E clears the score;
                       down in the ground empty-handed, up with a blaster / the saber / a wand (#179)
tools/booktest.html    headless test: take the book, read, turn pages, close, put it down, back on the side table
tools/holdtest.html    headless test: put things down (coffee table, dining table, floor), one at a time, F → home; the preview
                       (#368): the cup's ghost on the grid inside the table, ⟳ / R turn 45°, looking away cancels, down as the ghost;
                       the hand (#195): hidden when empty, at the saber's grip, a reach out and back; Pingping (#269): take him
                       (both hands on his sides), a hug (squashed, counted), onto the sofa (not a cup), back in the bed, F
                       the fruit bowl (#326): an apple bitten three times then eaten (counted), a pear on the dining table, an
                       orange back in the bowl, a cup not into it, F refills it
tools/drawtest.html    headless test: drawing mode, a crayon line from pointer events, clear, E back, saved
tools/baskettest.html  headless test: the daybed's drawers (shoes, hair things), take the ball → the hoop rises, dribble and
                       catch, a throw at the wall stays in the room, shots from 4 m (a basket) and 7.5 m (a three), a miss, F
tools/rifletest.html   headless test: the AK-47 rides with its drawer, 30 shots of automatic fire leave bullet holes, reload,
                       the magazine on the floor, a click = one shot, a shot in the lawn target scores, F
tools/turbotest.html   headless test: Kaffeturbo with an injected clock — three cups in five minutes (not spread out, not milk /
                       whisky), faster indoors, the text, more coffee adds time, over again; `walktest.html?turbo` walks at that pace
tools/calendartest.html headless test: today's date at the start, pick a date on the calendar, the sun follows
```

## Recent implementation notes

Tilly posters (#493): separate unmerged planes with stable per-art ids (suffix poster-nova/moon/bloom/lumi/starlyt). src/layoutmigrations.js retires only the former group id from cached and shared layouts, restoring default posters without overwriting later individual moves. Worker persists migration once and rejects writes by old group clients.

Artwork across storeys (#494): pictures/painting/individual kposters validate the entire preview against the destination floor and ceiling. Their current movable level is inferred from saved world Y in the disjoint LEVELS intervals on every apply, while homeLevel/home retain their original storey and matrix. Stable ids and layout schema remain unchanged; shared config item.level is never mutated. tools/artleveltest.html verifies both directions, destination selection, boundaries, reach, cancel, shared sync/reload and original restore.

Interaction target highlight (#513, corrected by #531): src/interactionoutline.js keeps the existing target/owner API but now raises only the active physical target's outgoing linear light by INTERACTION_OUTLINE.brightness (1.12). No edge geometry, topology cache, contour lines or extra draws remain. Temporary private shader materials forward live appearance properties to the originals, preserving lamp/appliance changes through stored references or mesh.material, textures and existing onBeforeCompile hooks (including lamp washes); #548 delegates periodic lamp shader discovery to the original source rather than decorating the focus wrapper twice; target change, blocked focus or clear restores the exact original material and disposes temporary clones. Original meshes and ordinary depth testing handle occlusion and animated leaves/drawers. Instanced figure shaders select gl_InstanceID so greeting one person never highlights every figure. Invisible pick boxes use their existing physical outlineRoot/outlineOwner; selected allowed action rows, desktop/touch focus and rearrangement remain synchronized. tools/interactionoutlinetest.html checks actual utensil/leaf/drawer targets, exact restoration, stable allocation, contrasting background pixels, smooth detailed geometry, shared neighbours, wall occlusion, zero extra draws and actual selected-instance shader pixels; returnmarkerstest guards the separate placement/return preview outlines.

HUD controls (#525): src/hudicons.js supplies own 24 px/1.7-stroke SVGs and idempotent setIcon/setPressed helpers. initHudIcons inventories fixed HUD shortcuts, relevant panel controls/close icons and jet/vacuum indicator symbols. main.js keeps text actions and maps the held basketball alternate action separately; Sonos/ClockPanel/BlindPanel render current state/direction icons; BoardPanel uses neutral labelled pin/trash SVGs and dynamic calendar/task buttons share the same surfaces. CSS vars in src/hudicons.css control neutral glass/edge/2 px blur; text/icon opacity stays 1, >=48 px icon targets, distinct pressed/active/disabled/focus states, @supports and hud-no-blur fallback. SVGs never intercept pointers. No renderer passes or icon library. Drawing palette represents real ink colors. docs/validation/issue-525/README.md inventories controls and day/night/snow/mobile/desktop before/after. hudiconstest checks accessibility, touch area, real button/alternate actions, state icons and fallback draw counts; touchtest/clocktest/blindtest/sonostest/boardtest/calendartest/taskstest guard existing behavior.

Top-right segmented badge (#582): index.html groups furniture, stats, mute and pause (in that order) in `#hud-top`. On touch, src/hudicons.css makes it one fixed glass pill (same --hud-glass/edge/blur and shadow as single buttons) with 48 px transparent segments, thin dividers and segment-level pressed/active/focus states; it has display: contents off touch, so the desktop mute button keeps its own bottom-right place. touch.js ignores look drags starting on the group, and the touch #level label is capped to stay clear of it. hudiconstest/compasstest/viewporttest/touchtest cover target size, clicks and placement.

## Input notes

- A visit starts outside, ~12 m in front of the entrance façade facing the house (`START` in config);
  the walkable outdoor area is `OUTDOOR` (#355): the whole block — in front of Hus L, behind it (our patio, out through
  the gap in the hedge), through the portik, round Hus A, B and C and down the stairs to the park level and the garage
  drive; Hus L's row is a wall except our façades; the neighbours' screen walls and hedges collide
  (`exterior.userData.segments`). walktest walks from `START` in through the front door and round the block.

- Start screen has two buttons: *Mus & tangentbord* (pointer lock) and *Touch* (joystick).
  A Surface has both, so the visitor chooses. Touch-only devices (`(pointer: coarse) and
  (hover: none)` → `body.phone`, set by an inline script in index.html) get a short start screen:
  no key list, one *Börja* button (= Touch). `&phone` forces it for screenshots.
- Esc on the start screen = *Mus & tangentbord*. Browsers don't treat Esc as a user activation, so
  it can't call requestPointerLock/start audio: it hides the start screen and shows `#arm` (see-through, a small "Klicka för att styra med musen" line, #190);
  the next click runs the same `startMouse()`. A refused pointer lock is retried once while the click still counts as a
  gesture, else `#arm` — never the start screen again. Ignored for 0.7 s after Esc frees the
  mouse and while the install sheet, note, board or rotate overlay is up (`tools/esctest.html`).
- App name everywhere (title, manifest name/short_name, apple-mobile-web-app-title): "Kv. Lunden L1007".
- iPhone (Safari/Chrome) can't go fullscreen, and the browser bars shifted the tap targets of the
  bottom-right buttons; `src/install.js` asks to add the page to the home screen first (skippable
  per session). The page uses `viewport-fit=cover` with `--sl/--sr/--st/--sb` safe-area insets on
  every HUD element, and `body` is `position: fixed` so iOS never scrolls/zooms it.
- Phones/tablets: the Touch button goes fullscreen and calls `screen.orientation.lock('landscape')`
  (Android); in portrait with a coarse pointer (≤ 1100 px wide) a "rotate" overlay covers the page
  (iOS can't lock). Headless Chrome doesn't emulate `pointer: coarse` — test the overlay by hand.
- Sprint (#43, #546): Shift, or the touch stick pushed past `PLAYER.sprintStick`, runs at `PLAYER.run` —
  both indoors and outdoors, with continuous speed through doorways. The
  stick's knob turns green while sprinting; footsteps use a longer stride. Moves are sub-stepped (5 cm).
- Crouch (#70): hold Ctrl (or the 🧎 toggle on touch) → eye `PLAYER.crouchEye` 0.95 m at `crouchSpeed` (50 %),
  no sprint; you only stand up again where there is head room (`roomToStand`: not under the stair's
  upper flight). Released on blur / losing pointer lock so nobody gets stuck down.
  #274: the documented key is **C** (seated, C gets you up instead; its auto-repeats don't crouch), because Ctrl + W
  = the browser's close-tab, which a page cannot `preventDefault`. Ctrl still crouches, and while it is held other
  Ctrl shortcuts are prevented. In fullscreen made by the page (Touch start) `navigator.keyboard.lock(GAME_KEYS)`
  (Chromium) captures them, Ctrl+W too; released on leaving fullscreen. Mouse & keyboard is not forced fullscreen.
  Fallback: a `beforeunload` guard while visiting (not on the start screen); the page's own reloads (autoReload,
  "Ladda om") set `reloading` and pass.
- Never stuck (#314): `player.isFree(x, z, level)` = clear of every segment (walls, doors, furniture, moving parts) by the
  radius + a margin, inside no `obstacles()` (furniture footprints + `world.movingPolys`: the parked car, the hoop's base) and
  not in the stair hole. Collision is segments only, so a visitor put inside an obstacle (F putting the furniture back, the car
  parking on you, the hoop rising, a resume record) could never leave: `unstick()` (first thing in `Player.update`) glides
  them at `PLAYER.unstick` to `nearestFree` (spiral search, not through a wall or door); a resume does it at once. `&debug`
  logs each one. The gap at the foot of the double bed (past RÅGRUND) to the window side is only ~8 cm wider than the
  visitor: passable, but aim for it.
- Sit / lie (#71/#72, `src/rest.js`, `REST`): builders put `userData.rest = { kind: 'sit'|'lie', name, verb,
  spots }` (local x, seat/mattress y, z, optional dir); buildFurniture turns them into E targets
  (`world.furnitureTargets`). E picks the spot nearest the look ray (not one the cat sits on), the camera
  glides there (lying: looking at the ceiling), walking is off and looking is clamped; E / "Res dig" puts
  you back where you stood (including upstairs: `spawn()` alone would drop you to Entréplan), looking the way you looked while
  seated (lying: level); if your old spot is behind you, on a free spot in front (`standSpot`, #202); a spot counts as free only outside every furniture
  footprint (`levels[i].footprints`) and reached from the seat through no wall, window or other piece (`standFree`, #302: not on / over
  the dining table), else the old spot, else the nearest free one all round, else the nearest free floor; out of a bed the old
  spot whenever it is free (#314). While sitting / lying (#184) the
  focus works as standing but within `REST.reach` of the eye (not the seat itself, nothing to sit on): take the remote
  from the sofa, the book from the armchair, put things down within reach; E with nothing in reach, Space / C or the
  touch "Res dig" button (#stand-btn) get you up, keeping what is in the hand. Seats: the
  sofa (3 + the chaise), armchair, 4 dining chairs, the lounge sofa (3), RÅGRUND; beds: the double bed (2
  sides), both bunks (lower/upper), the daybed. F stands you up first.
- Left click as E (#443, #568, main.js `click`, the only place it is decided; touch keeps its buttons): reading the book, the
  next page; in another panel nothing. Holding a weapon or the ball (`clickIsUse` on the class: the rifle, blasters, the
  saber, wands, the basketball) a click always fires / throws. Otherwise, with something in focus a click is E on it (open,
  take, put down where the ghost shows, pour, sit, pet, greet, the menu's marked row) — a blocked target: nothing (spilling
  is E's only); with nothing in focus it uses what you hold (eat, drink, hug, read, light), empty-handed or seated nothing
  (E / Space / C get you up). The jetpack's "stand it down" fallback is E's only. Right click = the held thing's `useAlt`
  (the remote's power, the ball's dribble) if it has one, else its use (eat, drink …). The prompt says "Klicka för att
  …" when a click does it (+ " · högerklick: ät" from `useLabel`), "Tryck E …" while a weapon is held (#568: utan "(E)" i
  musprompten, medan menyinstruktionerna anger "E eller vänsterklick"). The mousedown that
  takes the pointer lock (#arm, a click on the page) does nothing else: `locked` is still false then (tools/clicktest.html).
- GNOME's "disable touchpad while typing" (on by default) blocks touchpad look while a WASD key
  is held — not a bug in the app. Arrow keys ← → turn as a keyboard-only fallback.


HUD compass (#528): src/compass.js derives geographic bearing from camera world direction, clockwise from true north. DAY.planNorth=58 is the existing solar calibration from the north arrows in docs/peab/situationsplan.png and overview plans; positive YXZ yaw turns left so bearing=58−yaw. Red north arrow and N/Ö/S/V positions rotate, while letters counter-rotate to stay upright. Looking vertically keeps the last useful bearing. A small neutral glass surface uses safe-area insets; <=600 px screens place it on a second row, and centered update/reload/countdown messages hide it temporarily. No input capture, scene meshes, render passes, timers or persisted compass state. compasstest verifies cardinal directions, two turns, vertical view, movement/reload, phone/desktop, safe areas, control overlap and message priority.

Compass notifications (#541): Compass.update hides the compass whenever #badges has an event badge, including simultaneous badges and their fade-out. It returns after the last badge is removed by stats.js; bearing continues to update while hidden. Existing update/reload/countdown blockers still take precedence. compasstest uses actual stats.badge output for multiple desktop/touch widths, last-badge removal and real timed expiry.

Basement HUD (#549): main.js selects the garage/core label and room-statistics key before testing the apartment footprint. Storage directly beneath the kitchen therefore displays Förråd and records g:Förråd, while the kitchen above remains an Entréplan room. tools/basementhudtest.html covers both basement halves, the bike corridor, lift lobby, stairwell, apartment and street.

Console cheats (#514): `src/cheats.js` is the shared command catalogue for execution, help and bike-room writing. All nine public commands (`spiderman` since #597) list code and Swedish meaning; the two original goat codes are marked secret and excluded from both public lists. The existing console form stays available in the rearrangement menu. `src/cheatnote.js` renders one transparent marker-text plane on bikeNE's back west wall, added to the existing garage area/targets. A bundled 22 kB Kalam Bold Latin font (SIL OFL 1.1, attribution in data/fonts) loads with a two-second bound; no runtime third-party font request. CHEAT_NOTE dimensions/placement are explicit visual assumptions. The normal ray/read action opens a scrollable 17 px text dialog for phone/desktop, with E/Esc and a close button.

Commands use existing controllers: Lights.setAll, DayCycle.hour/update, Jetpack.putOn, SpiderSuit.putOn (`spiderman`, #597: anywhere, climbing still outdoors only) and original holdable paths. Jetpack refuses the flat interior with feedback, keeps roof restrictions and does not reset an already-worn pack's heat. Handsfree keeps the same item, uses valid original life storage/last placement or a grounded fallback, places ordinary holdables on a real surface, restores drawings through their existing desk path and parks paper in an existing toilet without flushing/hiding it. tools/cheattest.html covers the actual console, both secrets/public exclusion, repeated shortcuts, genuine ray reading and normal-home reload; rearrangeuitest still covers keyboard/touch console and edit controls.

Console catalogue cleanup (#565): `home` and its handler are removed; no restart/reset aliases exist. The retained commands provide cleanup, jetpack, time/lighting and hands-free shortcuts, plus help and the two secret rearrangement unlocks. Console opening, help and command responses never reveal the note location. The ordinary start/reset menu actions remain available. `tools/cheattest.html` rejects removed names (including case/whitespace variants) without changing player/inventory state and checks spoiler-free console output alongside the existing shortcuts and readable world note.

Mobile viewport sizing (#567): the fixed `#game-canvas` uses dynamic viewport CSS dimensions (percentage fallback). `bindGameViewport` starts immediately after renderer/camera creation, before fetching the plan or other scene data. It observes the canvas CSS box, updates only the drawing buffer with `setSize(w, h, false)` and derives the camera aspect from the same box. ResizeObserver catches late layout changes; window/visual-viewport resize, orientation, fullscreen, pageshow and visibility events coalesce through requestAnimationFrame. Zero-size layouts retain the last valid projection and unchanged sizes do not allocate buffers. Adaptive pixel ratio stays under the existing controller. HUD safe-area rules and other canvases retain their own sizing. `tools/viewporttest.cjs` blocks the real plan request to exercise startup rotation, then verifies delayed CSS layout, repeated portrait/landscape transitions, buffer/aspect, adaptive resolution and real touch taps. Physical Safari/Chrome device verification is still required; desktop touch emulation does not certify phone/PWA compositor behavior.
