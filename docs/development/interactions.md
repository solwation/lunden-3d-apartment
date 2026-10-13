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
                       the jump (#636): Space / the touch #jump-btn (always on touch, suit or not) = a *press* (`spaceDown` / `jumpPress`) off
                       anything you stand on, not with the jetpack, not in the stairwell / lift (`inCore`), only with room to stand; `PLAYER.jump`
                       m/s (#696: ~0.7 m, *guess*: just over a seat's ~0.45 m, not onto anything taller) or with the suit `SPIDER.jump` (2.5 m); `ceilingAt(x, z, y)` stops the head under the room's
                       ceiling (RH, `SOFFITS`, the stair's underside, a visited flat's levels, the garage's, outdoors roofs.js `above`) so
                       nobody jumps through the building; a collision segment with a fifth number (its top y: the boxwood hedge,
                       streetlife.js; since #693 also a sofa / armchair / ottoman footprint and the courtyard benches' seats) stops holding
                       once the feet are within `PLAYER.hurdle` of it (`pushOut` skips it by the live feet height, so you can walk about on
                       top too; `unstick` does not count standing on one as being stuck); a footprint polygon with a `top` (furniture.js /
                       rearrange.js `refresh` from `STAND_ON[type]`, courtyard.js `solid(…, SEAT_Y)`) is a platform in `world.platforms`
                       (world.js `setFurniture`, AABB + polygon) that `groundAt` offers as floor for feet already within `hurdle` of its top
                       (the jump snaps up onto it, standing is stable, walking off falls with ordinary gravity, a high drop onto it hurts via
                       fall.js; you cannot climb it by walking: the step stays held below `top − hurdle`; tools/jumpontest.html); the fall of a plain jump counts from where it left the ground (no thud, `fall.jump` / `low`) and
                       `restY()` is what a reload record keeps mid-jump (resume.js refuses a record in the air);
                       `isFree` / `obstacles` / `nearestFree` / `unstick` (#314, see Input notes); up on the roofs (#360): `aloft`
                       (outdoors > ROOFS.aloft m over the ground, over our flat above UNIT_TOP − 0.3) = `outdoors`, level 0, the
                       roofs' walls instead of a level's segments, no obstacles; `groundAt` takes the highest roof ≤ feet + stepUp
src/fall.js            falling (#361, FALL): player.js keeps `fall` (the highest feet since leaving the ground + the deepest free gap
                       under them) and calls `onLand(drop, gap)`; only a gap at least FALL.free counts (the stair's risers, the ramp never).
                       Over FALL.hurt (3 m) without the suit: request shared Combat damage; only a confirmed result calls the
                       existing fall penalty + stats once. A survivor gets sfx.landing/ouch, red and a jolt in place, can walk,
                       and never blacks out or invokes onWake. A confirmed death alone runs red/black/hold/wake/fade; the shared
                       checked outdoor respawn keeps the home intact and retains existing onWake hooks (jetpack home).
                       FALL.soft: a soft thud/knee-bend, including every suit landing. Off a roof/jetpack edge uses the real
                       drop (jetpack: landing speed v² / 2g); `&fall=h` drops from h m. No life counter or recovery timer in Fall.
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
                       #891: actual `suit.worn` is the optional `sp:true` in the existing Ghosts state. Avatar.setSuit overlays the existing red/blue
                       colours and own folded-suit canvas artwork on the original skinned figure: red mask/white eyes, chest spider/webs, gloves/boots.
                       The base look/colour attribute, skeleton, head silhouette, crouch and held props are untouched; removal restores the existing
                       solid/outline appearance. A suited unarmed figure is visually solid, while Ghost.solid/HP/combat eligibility keeps its armed rule.
                       The same temporary outfit appears in the local mirror; powers/fall/combat mechanics do not change.
                       #600: with it on fall.js never hurts (a soft landing). Space / the touch jump button (#jump-btn, directly left of 🧎, #657; the jetpack ⬆⬇ one step further left, 🕸 above it or above ⤒,
                       on touch always, #636) is a *press* (`player.spaceDown` / `jumpPress`): standing it jumps at `jump` m/s (indoors
                       too, the ceiling stops it, `player.ceilingAt`); without the suit it is the low jump `PLAYER.jump`; on a wall it
                       lets go. A strand that sticks outdoors calls `player.attach`:
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
src/rearrange.js       furniture cheat (#465): § / Enter (#596; not from a focused field/button nor in rearrange mode) / >_ inside the touch score badge opens the console; either private input unlocks rearrangement through the shared synchronous verifier (#856).
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
                       Bounds sampling restores world matrices with the parent and pose (#846), so detail culling
                       sees the actual held position instead of the temporary origin used to measure the shape.
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
                       E (main.js `use`) reaches towards the target and back with the fingers opening. #636: with the Spider-Man suit on
                       (`hand.suit`, set each frame by spidersuit.js `feedHand`; HAND.suit, all *guess*) both arms show it: climbing, both hands
                       flat on the wall (mode 'wall': fingers up, palm forward, drawn without depth test: the eyes are closer to the façade
                       than the hands' reach) alternate along the way you move (`cDir`, from how far you moved) at the pace you move
                       (`climbStride` m per cycle, `cPhase`), reaching loose and gripping on the pull, resting gripped when still; a shot web
                       (`webShot()`, `webHold` s) = the right hand in the classic web pose (4th morph target `web`: palm up, index and little
                       finger out, middle and ring finger folded in; the strand leaves its palm, `webAt`), the left stays down; swinging
                       that hand points at the anchor (`swingReach`) and the left one opens beside it. The left arm is the hug's mirrored
                       frame; no new meshes or lights, one more morph target. The detail culler (#189) looks again whenever the held thing changes (`refresh()`)
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
src/bow.js             the bow (#690, BOW): our own recurve bow (one vertex-coloured mesh, a Line string, a nocked arrow while
                       drawing), with explicit BOW.grip at the modeled leather grip centre (#910), + a quiver in the cushion box at the NW stair (patio.js `dynbox` inside 'bow'); seen / takeable only
                       while the lid is open, E on the box puts it back. `trigger(true/false)` (mouse button / touch action button,
                       main.js as the rifle) draws to full in BOW.drawTime and looses; under BOW.minDraw nothing; a click / tap
                       without a hold (`use`) looses at BOW.tap. Arrows (one pool `Arrows`, BOW.arrows) fly under gravity, point
                       along their path and stick in the first solid mesh (not moving things, skinned figures: the cats and Olof
                       are never hit) for BOW.stick s. In a fight it is weapon 'bow': each arrow is one shot message with its
                       speed; combat.js `aimArc` judges a hit along the arc, the others see the arrow in the same pool.
                       tools/bowtest.cjs (one page; frames driven by hand), combattest's bow step
src/ghosts.js #673     greeting another player: each ghost has an invisible pick box (`Ghost.pick`, door { kind: 'ghost', verb
                       'hälsa på', name }) that main.js adds to what the look ray tries (`ghosts.targets()`, connected only, within
                       HOLD.reach like everything else); E / a tap → `greetPlayer`: `ghosts.greet(g)` picks a line from GHOSTS.hello
                       ({n} = their name; at most one every GHOSTS.greetEvery s), greet.js `sayMine` shows it at the bottom (speech
                       as for Olof), and one message { t: 'g', to, k } (k: the phrase's index, never text) goes through the outbox.
                       Everybody else sees the greeter's avatar wave (`Ghost.wave`: the right hand to avatar.js `armTarget.up` for
                       GHOSTS.wave s, no extra mesh or draw call) with the line in a bubble over it (greet.js `say`, `Ghost.head`). Points:
                       bump('greets', 1, 'player:<name>') once per player and session (SCORE.first / again.greets). tools/ghosttest.cjs
src/combat.js          fights between players (#667, on the ghosts of #666): only two players who BOTH hold a weapon (COMBAT.weapons:
                       saber, nerf, wand, rifle, ball, web = the suit with empty hands, jetpack = worn; main.js `weaponKey`, in that
                       order; remove a key to leave it out) are drawn solid for each other (ghosts.js `setSolid`, + a small prop in the
                       avatar's hand), the unarmed stay outlines (#705) and cannot be hit. main.js wraps each weapon's use (onUse / rifle.onShot /
                       suit.onShot) → `combat.fire(key)`: the nearest armed player along the view within the room's range (the
                       saber: in front within reach, `saberCone`; a vertical capsule COMBAT.body, `hitRadius`), not behind a wall
                       (a raycast; ghosts, see-through and `userData.moving` things ignored); the jetpack hits whoever is under it
                       while thrusting (`jetBelow`, `jetAcross`). ONE small message per shot, misses too ({ t: 'a', w, o, d, s?, to? }:
                       start, unit direction, speed for things on an arc — a dart from the blasters' pool, the ball; eye + view
                       otherwise; `to` = the id hit), sharing the 5 Hz budget with the states and sent first (ghosts.js `fire`, an
                       outbox of GHOSTS.outbox, a miss dropped before a hit); the room passes it on to the armed others, who draw it
                       (combat.js `remote`, only while both armed): a dart in the blasters' own pool (toys.js Darts `remote`: drawn
                       only, no paint / score / count, stops at a wall, gone after `shotLife`), a ball on its arc (COMBAT.balls),
                       streaks in one LineSegments (COMBAT.lines: rifle tracer, wand + toys.sparkles burst, the web from the
                       avatar's hand, the jetpack's flames down), the saber as a swing of the avatar's prop (ghosts.js `swing`).
                       The room checks a hit (cloudflare/players.js COMBAT: armed both, distance ≤ range +
                       slack, `every`, ≤ perMinute points a minute) and tells both: hit → bump('pvpHits') (unchanged SCORE.each.pvpHits base),
                       plus the confirmed shared distance bonus (#873), a splat, the badge; hurt → penalize('pvpHurt'), a red edge flash, sfx.ouch, checked life damage;
                       out of lives → main.js goToStart (#665: only the place) with all lives again, badge. #lives (made by
                       combat.js, top centre) shows ❤ n/10 while a fight is on or the local player is injured, including unarmed play. tools/combattest.cjs (three pages)
src/nerf.js            shared Nerf analytic step: configured gravity/speed/range, clipped floor contact and travel cap.
                       Travel is the sum of segment chords; different time steps agree within numerical tolerance.
src/combatworld.js     combat solid-hit acceleration (#715/#714): fresh semantic filtering, private 32³ occupancy bits,
                       bounded 64-bucket reordered native triangle views and per-shot native instanced candidate selection.
                       Native hit metadata, authored bounds, layers/custom propagation and unsafe fallbacks are preserved.
                       Buffer/index changes invalidate entries; disposal releases reservations. Removal without disposal
                       can consume lifetime quota and safely fall back. Bounds/index views never mutate render geometry.
                       Bitmap accounting 1 MiB and spatial typed arrays 16 MiB/max 1024 entries are caps, not measured JS heap.
                       Nerf obstacle validation is asynchronous: current-world segment traversal yields after ~2 ms work,
                       relevant cache jobs are prioritized, and a 2 s deadline conservatively sends a normal miss. Initial
                       legitimate cold hits can therefore miss. Queue 8, captured muzzle, cancel on reset/disconnect/unarmed;
                       one existing shot message, no additional protocol. Sync prediction remains for focused fixtures.
src/combatworld.js     combat solid-hit broad phase (#715): fresh filtered traversal keeps visibility, layers, moving/ghost roots,
                       custom raycast propagation and nearest-hit semantics. Native static Mesh geometry may use a private 32³-bit
                       conservative triangle-AABB occupancy grid; it only rejects an entirely empty finite query segment AABB,
                       then Three's native raycast remains authoritative. Instanced/skinned/morphed/custom meshes bypass the grid.
                       Combat constructor queues large geometries first; private bounds scan and cell fill advance in short idle
                       slices (timeout ensures progress), with native fallback until ready or after buffer/index version changes.
                       No geometry.boundingBox changes. Disposal releases pending jobs/accounting; removal without disposal can
                       consume the lifetime admission quota and safely fall back. COMBAT.collision caps bitsets plus reserved
                       bookkeeping, not measured JavaScript heap. No transforms or world membership are cached.
src/avatar.js          the players' avatars (#705): a neutral human figure on Olof's skeleton and IK (src/olof.js exports `attachSkeleton`, `poseOlof`, `bindAt`,
                       `lathe`; his look is untouched): a face (eyes, brows, nose, mouth, ears), hands with fingers, a T-shirt / long-sleeved top with
                       collar, hem and belt, trousers, shoes, one of four hair styles (short, long, bun, beanie). `look(seed)` (the player's id, ours
                       `me:<name>`) picks skin, hair, top, trousers, shoes, sleeves, hair style, build and height, so players differ. ONE SkinnedMesh
                       (one draw call) per avatar, no texture, ≈ 3.6–3.8 k triangles (`avatarTriangles(variant)`; 8 shared base geometries, built lazily;
                       an avatar owns only a colour attribute, a 13-bone skeleton and a material). The material is a MeshLambertMaterial patched with a
                       fresnel term, one program for all: `setSolid(false)` = an outline (alpha AVATAR.fill inside, up to AVATAR.rim at the silhouette,
                       a light edge colour per player, depth-tested, nothing written to depth, no extra pass), `setSolid(true)` = lit and opaque.
                       `update(dt, { speed, turn, hands, crouch })`: legs walk above AVATAR.walkSpeed (the phase follows the distance), arms swing,
                       a little breathing, the head turns `turn` rad against the body. **The arm surface for animations (#673 wave):**
                       `hands: { L, R }` = `{ at, pole }` targets in the figure's frame (`armTarget.rest / .forward / .up(side, phase)`), set per side,
                       replacing the swing; ghosts.js passes `Ghost.hands` through. ghosts.js `Ghost.animate`: the speed from the interpolated snapshots,
                       the body turns towards where it goes (not when that is behind / beside the look), the head to the look (`AVATAR.bodyTurn`),
                       a weapon is held out in the right hand and its prop follows that hand (the jetpack sits on the back). Not sent / not done: head
                       pitch (the room's state has only position and yaw), a shadow (the shadow map is redrawn rarely). Numbers: AVATAR in config.js
                       (*guess*, by eye). Posed only within AVATAR.poseFar m.
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
                       Before a cold TriGrid is built, private conservative position bounds reject distant static meshes (#715);
                       furniture invalidation clears both that bound and the triangle grid. Authored geometry boxes stay intact.
                       Physical rays include DetailCuller's shared hidden-render layer (#805); semantic ancestor visibility,
                       held/protected breakability and normal renderer/focus layers retain their existing policies.
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
                       (#604: on top of the fuse box in the hall's EL/C cabinet; one always-present SpotLight), all Holdables (TOYS)
src/power.js           the power cut (#604, POWER): the fuse box in the open EL/C cabinet (an invisible pick box, kind 'fusebox')
                       buzzes, flickers the lamps, bangs; Kv. Lunden dark until the action button is held on it POWER.repair s
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
                       FIXED_DRAWINGS (#618, config): the home's own drawings ("Till mamma" under the kitchen clock,
                       textures/teckning-till-mamma.jpg) are built by `load()` with `fixed`: no Släng / Ta ner, `remove`
                       refuses them, never saved or synced (cloud.js skips them); `posters.own` = the visitors' ones (tests)
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
src/statspanel.js      interactive statistics (#886): Tab opens while held; releasing it closes. T pins the panel;
                       Tab/Shift-Tab then move focus inside it. Wheel, touch drag, arrows, PageUp/Down and Home/End
                       scroll the vertically constrained contents; existing ✕ and Escape close. Opening releases
                       pointer lock, held trigger/joystick and gameplay keys. It pauses movement/focus actions,
                       without opening the pause menu or disconnecting the room. Mouse return requires the existing
                       return affordance (click or Enter/Space); touch resumes its existing mode.
src/stats.js           visitor statistics (localStorage), "+1" badges per event, the HUD panel
                       (hidden; Tab held / T / 📊 shows it; touch, #245: narrower than the right-hand controls, scrolls with a
                       finger — touch.js ignores #stats — ⤢ full screen in columns, ✕ closes; rows go into #stats-body)
                       The score (#197/#198): `totalScore()` from SCORE in config shows top left (#score, `renderScore` after
                       every count) with a "+N" when it grows. Balanced (the user): you can grind for ever, but easy repeats give
                       little and rare / hard things a lot — `each` = points per event, `first` = per distinct thing the first
                       time (`bump(key, n, id)`, main.js `idOf(thing)` = name + position; doors, lamps, seats, taps, fronts,
                       songs, rooms, new cat coats) and `again` (fractions) every time after, `breeds` = per cat by how rare
                       its breed is, `secrets` = per surprise kind (+ rare kinds); `rawScore()` unrounded. Repeats show no badge
                       Reset (#712) deletes old own keys before restoring fresh defaults in the same exported stats object,
                       so dynamic/obsolete counters cannot retain points. It renders zero and saves immediately.
                       tools/statsresettest.html checks actual stats/score modules, object identity, dynamic counters,
                       repeated reset, persisted snapshot and actual reload without the apartment bootstrap.
                       Deductions (#288, SCORE.penalties, `penalize(key, sub)`): the fridge/freezer door alarm (and more while it
                       beeps), food burnt, the smoke alarm, a spill (E on a full glass/cup with a pourer: it runs over, a splash),
                       a cat shot / cut / hit (by weapon); a red "−N reason" by the score, `stats.penalties` counts, the "Avdrag"
                       row; a deduction takes at most what the score has (`penaltyPoints`): never below 0, no debt. The
                       leaderboard gets the net score (the Worker keeps each row's best; anonymous players have a row too, #677: see storage.md)
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
tools/tostarttest.html headless test of the menu's "Gå till startplatsen" (#665, `goToStart` in main.js): only the place changes —
                       up from a seat / bed / the car (`standUp`), off a wall / strand, a web on its way sticks to nothing, out of
                       a lift (it rides on alone), the basement, a visited flat, the air (jetpack / suit) — to START on the ground;
                       the clock, the date, what you hold, the jetpack / suit and crouching carry on. The start screen's
                       "Börja från start" (#restart) still sets the clock to now (`realNow`)
tools/esctest.html     headless test of Esc on the start screen (click-to-start cover, ignored over the note)
tools/crouchtest.html  headless test: C crouches (Ctrl too, other Ctrl shortcuts prevented), seated C stands up, leaving mid-visit
                       asks (beforeunload), not on the start screen nor on a new-version reload (#274)
tools/papertest.html   headless test: each toilet's paper holder — pull sheets out (the roll turns, max 4), tear the strip into the hand
                       (pulling blocked), throw it in the toilet (the lid opens, it flushes, counted, swirls away), F refills (#426)
tools/resttest.html    headless test (#900: Olof is car-only, with no indoor seat reservations): sit on every seat and lie in every bed (spot, no walking, up again looking the same way;
                       head turned, old spot behind: up in front, #202; every spot ahead / turned, from behind: free floor, #302; in every bed the eye clear of the bedding, #308; no two bedding surfaces within 1.5 mm, #335)
tools/stucktest.html   headless test (#314): a 5 cm scan of both floors (doors open; the free floor in one piece, pockets out of
                       reach listed), getting up from every seat / bed with the old spot inside it, F putting the sofa / bed back
                       round you, the car parking on you, the hoop rising under you, a door shut on you, a resume record in the bed
tools/falltest.html    headless test (#361): a 2.5 m drop is soft, a 5 m drop hurts (red, black, no walking, awake at checked outdoor ground,
                       counted + a deduction); the stair up / down (also crouched), the ramp,

tools/falltest.html    actual app/World fall regression (#869): 2.5 m soft, first lower fall survives in place with half shared lives,
                       second lower fall dies/red/black/no walking/safe wake, high fall dies from full; existing penalty/jolt/fade;
                       the stair up / down (also crouched), the ramp,
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
                       web on the street pulls you there; the jump button by 🕸 jumps; without the suit 8 m hurts;
                       #636: both hands climb (direction, tempo, resting grip), the web pose after a shot at the sky, both arms swinging;
                       the jump button stays without the suit; the low jump (#696: ~0.7 m, plain landing) with Space and the button, no web / no
                       climbing without the suit; the hedge holds a walker (z −3.64) and is cleared by Space from its edge with the suit
                       (walking) and without it at a sprint (Shift); indoors on both levels the head stays under the ceiling (suit or not), lower under the soffit,
                       back on the tread on flight A, `restY()` mid-jump, no jump in the stairwell
tools/sabertest.html   headless test: take the lightsaber, swing it, hang it back
tools/toystest.html    headless test: blaster (dart lands), wand (sparkles), flashlight (in the EL/C cabinet, beam follows the view)
tools/powertest.html   headless test (#604): the fuse box only with its cabinet open, buzz + flicker, bang, what goes dark and what
                       stays lit, the TV refused, touch hold to mend (paused on release / looking away), lamps back, a reload has power
tools/wandtest.html    headless test: a wand's magic on the wall (stars + butterflies), none in the sky, gone after a while
tools/nerfcombattest.html scoped Nerf range/trajectory/confirmed-audio and deferred-shot lifecycle fixture (#714)
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

Interaction target highlight (#513, corrected by #531): src/interactionoutline.js keeps the existing target/owner API but now raises only the active physical target's outgoing linear light by INTERACTION_OUTLINE.brightness (1.12). No edge geometry, topology cache, contour lines or extra draws remain. Temporary private shader materials forward live appearance properties to the originals, preserving lamp/appliance changes through stored references or mesh.material, textures and existing onBeforeCompile hooks (including lamp washes); #548 delegates periodic lamp shader discovery to the original source rather than decorating the focus wrapper twice; target change, blocked focus or clear restores the exact original material and disposes temporary clones. Original meshes and ordinary depth testing handle occlusion and animated leaves/drawers. Instanced figure shaders select gl_InstanceID so focusing one instance never highlights every one (the greetable neighbours it was made for are gone since #670; the mechanism stays generic). Invisible pick boxes use their existing physical outlineRoot/outlineOwner; selected allowed action rows, desktop/touch focus and rearrangement remain synchronized. tools/interactionoutlinetest.html checks actual utensil/leaf/drawer targets, exact restoration, stable allocation, contrasting background pixels, smooth detailed geometry, shared neighbours, wall occlusion, zero extra draws and actual selected-instance shader pixels; returnmarkerstest guards the separate placement/return preview outlines.

HUD controls (#525): src/hudicons.js supplies own 24 px/1.7-stroke SVGs and idempotent setIcon/setPressed helpers. initHudIcons inventories fixed HUD shortcuts, relevant panel controls/close icons and jet/vacuum indicator symbols. main.js keeps text actions and maps the held basketball alternate action separately; Sonos/ClockPanel/BlindPanel render current state/direction icons; BoardPanel uses neutral labelled pin/trash SVGs and dynamic calendar/task buttons share the same surfaces. CSS vars in src/hudicons.css control neutral glass/edge/2 px blur; text/icon opacity stays 1, >=48 px icon targets, distinct pressed/active/disabled/focus states, @supports and hud-no-blur fallback. SVGs never intercept pointers. No renderer passes or icon library. Drawing palette represents real ink colors. docs/validation/issue-525/README.md inventories controls and day/night/snow/mobile/desktop before/after. hudiconstest checks accessibility, touch area, real button/alternate actions, state icons and fallback draw counts; touchtest/clocktest/blindtest/sonostest/boardtest/calendartest/taskstest guard existing behavior.

Top-right segmented badge (#582, unified by #707): index.html groups furniture, stats, mute and pause in `#hud-top`, in that order. src/hudicons.css gives touch and desktop the same fixed shell and square transparent segments, dividers and pressed/active/focus states. touch.js ignores look drags starting on the group. Shared badge variables and responsive layout are described under #707 below; hudiconstest covers actual button handlers, and hudlayouttest checks layout without the game renderer.

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
- Jump (#600, #636): Space / the touch ⤒ button (#jump-btn; hud icon 'jump', 48 px, safe-area placed directly left of 🧎 (#657: right 178 px, bottom 100 px; ⬆⬇ at right 234, 🕸 at 178/160, or 234/220 with the jetpack on), not part of the
  suit any more: it shows on touch always). A press, not a hold. Outdoors and indoors, off the floor, a stair tread, a roof; never with
  the jetpack (its own ⬆), in the stairwell / lift, not while kneeling to pet the cat, not without room to stand. The head stops under the ceiling
  (`ceilingAt`), so an indoor jump with the suit is at most ~1.1 m on Entréplan (RH 3.0), 0.95 m on Övreplan (2.8), 0.65 m under the 2.5 m soffits; the plain jump (#696, `PLAYER.jump` 3.7 m/s ≈ 0.70 m, *guess*) is under every ceiling, so it is never stopped by one (tools/spidersuittest.html measures both apexes).
  The clipped entrance hedge is a low collision obstacle (0.58 m, `SITE.life.strip.hedge`) that the plain jump clears at a sprint
  (#696 lowered it: at 3.7 m/s the feet stay above `top − hurdle` (hurdle 0.22) for ~0.5 s, ≈ 0.84 m of walk against the hedge's 0.88 m of
  path, so a walk just fails, a sprint (3.2 m/s) clears it; the suit's jump walks over it. The path is the
  body's radius on both sides + its 0.44 m depth). Space is always `preventDefault`ed in play (it never scrolls
  or presses a focused button) and the Space that stands you up from a seat is no jump.
  #693, #699: landing on low things (`STAND_ON` in config.js: sofa, armchair, ottoman and the BYÅS TV bench at 0.45 m, the IDANÄS bed 0.64 m (+ a rug's few cm), Tilly's daybed 0.59 m; the courtyard's benches 0.46 m; #701 the patio lounge's seat cushions 0.42 m and its slatted table 0.40 m, the courtyard's four raised beds 0.5 m; #702 the living room's coffee table 0.47 m): the plain
  jump reaches them, the suit's jump goes far above; tables (0.75 m), shelves, walls and fences are no platforms (a wall keeps its
  plain collision). Only a footprint rectangle without `solid: true` is standable (#699): the builders mark the sofa's / armchair's
  backrest strip and arms (`seatRects`), the bed's headboard and the daybed's back and ends `solid` (walls as before; the daybed is
  entered from its open front, the bed from the sides / foot; rearrange.js `refresh` honours the flag too). The TV on the TV
  bench has no footprint of its own, so it never blocks the bench top (you walk through its picture, *guess*). The bed and daybed
  heights follow the models' mattress tops (*guess*, 0.45 m step + 0.7 m apex + 0.22 hurdle reach ≈ 0.9 m at most). Left out on
  purpose: the MYDAL bunks (the lower mattress top 0.32 m is under the top bunk's 1.1 m base: no head room). The 1.8 m fence
  behind the bench (bench 0.46 + jump 0.7 does not clear it) is the user's call (#699), untouched.
  #701, #702 (outdoors and the rest of indoors): the patio's Verona lounge (patio.js `veronasofa`: its backs and arm strips are
  `solid`, the seats and the backless divans are standable), the slatted table, the coffee table and the courtyard's raised beds
  (courtyard.js `BED_Y`, `solid(…, BED_Y)`: they had no collision at all, you walked through the timber box) are platforms. No
  new per-frame cost: the platform list is built once in `setFurniture` and `groundAt` tests the bounding box first. Deliberately
  not platforms, with the reason: **kerbs** (granite 10 cm proud, the car park's concrete edges 5 cm) are under `PLAYER.stepUp`
  (0.45 m), you simply walk up on them and they have no collision; the street has no other low fixed object (the bus stop is a
  sign, cars / bike racks are > 1 m, the bollards Ø 14 cm caps at 0.8 m); the neighbours' hedges (1.1 m) and screen walls, the
  dining table (0.72–0.76 m, cups stand on it) and the patio's planters / cushion box (its lid moves) stay walls / obstacles;
  indoors the kitchen worktops are 0.9 m + a 3 cm counter = 0.93 m (just over the ~0.92 m reach) and the plinth is recessed under
  the carcass (no surface), the bedside tables are 40 cm tops with a lamp on them, the chairs have backs. Reconsider these only
  with a taller jump or measured plinths.
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


HUD compass (#528): src/compass.js derives geographic bearing from camera world direction, clockwise from true north. DAY.planNorth=58 is the existing solar calibration from the north arrows in docs/peab/situationsplan.png and overview plans; positive YXZ yaw turns left so bearing=58−yaw. Red north arrow and N/Ö/S/V positions rotate, while letters counter-rotate to stay upright. Looking vertically keeps the last useful bearing. A small neutral glass surface uses safe-area insets. #767 puts it directly left of the right shortcut badge in `#hud-right`, with a 4 px gap and the shared `--badge-height` (50 px, 46 px at <=600 px). Cardinal text stays 10 px and uses the shared diameter for its radius. A ResizeObserver follows the grid/viewport and keeps the fixed lives centered below its measured compass position, including hidden-HUD startup. Centered update/reload/countdown messages hide it temporarily. No input capture, scene meshes, render passes, timers or persisted compass state. compasstest verifies cardinal directions, two turns, vertical view, movement/reload, phone/desktop, safe areas, control overlap and message priority.

Compass notifications (#541): Compass.update hides the compass whenever #badges has an event badge, including simultaneous badges and their fade-out. It returns after the last badge is removed by stats.js; bearing continues to update while hidden. Existing update/reload/countdown blockers still take precedence. compasstest uses actual stats.badge output for multiple desktop/touch widths, last-badge removal and real timed expiry.

Basement HUD (#549): main.js selects the garage/core label and room-statistics key before testing the apartment footprint. Storage directly beneath the kitchen therefore displays Förråd and records g:Förråd, while the kitchen above remains an Entréplan room. tools/basementhudtest.html covers both basement halves, the bike corridor, lift lobby, stairwell, apartment and street.

Console cheats (#514): `src/cheats.js` is the shared command catalogue for execution and bike-room writing. All eight public commands (`spiderman` since #597) list code and Swedish meaning; the two private inputs are verified by `src/privatecodes.js` and excluded from the public catalogue/list (#856). #724: nothing in the player-facing UI hints that codes exist (control row, console label "Kommando", empty message line; no word "fusk" in shown text). The graffiti (`cheatList()` / `publicCheats()`, one source) is the only place listing the public codes. `help` is not a code: in the chat it lists only the ordinary commands (`COMMANDS` in `src/chat.js`: `/tysta`, `/prata`); every refused line, secret or not, gets the same `UNKNOWN` ("Okänt kommando."). The graffiti is drawn at 82 % ink and titled "psst..."; the note is read as "klottret". The existing console form stays available in the rearrangement menu. `src/cheatnote.js` renders one transparent marker-text plane on bikeNE's back west wall, added to the existing garage area/targets. A bundled 22 kB Kalam Bold Latin font (SIL OFL 1.1, attribution in data/fonts) loads with a two-second bound; no runtime third-party font request. CHEAT_NOTE dimensions/placement are explicit visual assumptions. The normal ray/read action opens a scrollable 17 px text dialog for phone/desktop, with E/Esc and a close button.

Commands use existing controllers: Lights.setAll, DayCycle.hour/update, Jetpack.putOn, SpiderSuit.putOn (`spiderman`, #597: anywhere, climbing still outdoors only) and original holdable paths. Jetpack refuses the flat interior with feedback, keeps roof restrictions and does not reset an already-worn pack's heat. Handsfree keeps the same item, uses valid original life storage/last placement or a grounded fallback, places ordinary holdables on a real surface, restores drawings through their existing desk path and parks paper in an existing toilet without flushing/hiding it. tools/cheattest.html covers the actual console, both secrets/public exclusion, repeated shortcuts, genuine ray reading and normal-home reload; rearrangeuitest still covers keyboard/touch console and edit controls.

Console catalogue cleanup (#565): `home` and its handler are removed; no restart/reset aliases exist. The retained commands provide cleanup, jetpack, time/lighting and hands-free shortcuts, plus the two secret rearrangement unlocks. Console opening, help and command responses never reveal the note location. The ordinary start/reset menu actions remain available. `tools/cheattest.html` rejects removed names (including case/whitespace variants) without changing player/inventory state and checks spoiler-free console output alongside the existing shortcuts and readable world note.

Chat (#675, `src/chat.js`): while the players' room is on (`ghosts.on` and not capped this month — the cloud is set, GHOSTS.enabled, no `?mp=0`) and not in rearrange mode, the same console (>_, § / Enter) opens as a slim bar at the top (`#terminal.chat`: no dark backdrop, title "Chatt", "Skicka"; a tap beside it closes). Decision on cheats: a line that is a code (exact, any case/spacing, the secret ones included) or starts with `/` (`/day`) is a command — `cheats.js isCommand`, run locally with its answer in the bar, never sent and never shown in the column; `/unknown` gets "Okänt kommando."; anything else is a chat line. the bike-room graffiti says "(i chatten: /kod)"; `/unknown` gets "Okänt kommando." (#724). A sent line closes the bar (Enter on an empty field just closes); a refused one keeps the text and says why (not connected, the client's rate limit = the room's: a burst of CHAT.burst then one per CHAT.everyMs). Text is cleaned like the room does (`cleanText`: control/zero-width/bidi out, whitespace folded, CHAT.max 140 characters, the JSON kept under the room's 256) and always shown with textContent; names as the room cleans them, "Anonym" without. The column `#chat-box` (left, under the badge and heat bars, z-index over the bar's transparent backdrop, `pointer-events: none`) shows as many complete messages as fit its actual available height, newest at the bottom, trimming the oldest when short of room (#765), each line ≤ 3 lines of text, fading over the last CHAT.fade s of CHAT.ttl (60 seconds since #765, previously 30); on touch it stops 150 px above the bottom (the stick's corner) and stays within 44 vw (the buttons are on the right). Main menu → Inställningar → `#menu-chat-setting` ("Visa chat: PÅ / AV") hides/shows both the log and ghost speech/typing bubbles immediately, retaining localStorage CHAT.hiddenKey (`lunden.chat.hidden`, '1' = AV) from older visits. It preserves messages, bubble TTL and outgoing typing state. The former HUD toggle is removed. Chat starts 4 CSS px inside the left safe area, with no toggle taking up row width. Actual wrapped row heights and gaps are remeasured on resize/orientation, visualViewport changes and container ResizeObserver callbacks; even while AV the retained log is trimmed to the current height. Without the room nothing of it shows and the console is the old cheat console. DOM only: no draw calls or textures. Tests: `cloudflare/players.test.mjs` (room limits, cleaning, cap) and `tools/chattest.cjs` (two pages against `cloudflare/dev.mjs`: send/receive as plain text, cheats stay local, rate limit, max lines, TTL, hide + count, phone layout clear of the buttons, screenshots).

Chat bubbles (#676, `src/chat.js`): while someone types in the chat bar, "skriver…" with three animated dots floats over their ghost for the others; their sent line replaces it as a bubble for CHAT.ttl s (a new line replaces the old: one bubble element per player). Only a flag goes to the room ({ t: 'k', on }, never the letters): on at the first key (`input` on the field, chat mode only), repeated every CHAT.typingAgain ms while still typing, off when sent (the room ends it with the line), when the bar closes, after CHAT.typingMs without a key or when the connection drops; someone else's goes off by itself after CHAT.typingStale ms without word and with their ghost (left, disconnected). The room passes a change (off always, on no sooner than 0.5 s, a refresh no sooner than 5 s). Bubbles reuse greet.js's `.say` bubble in the `#speech` layer (DOM, no draw calls or textures), placed CHAT.bubbleGap m over the name tag, full size within CHAT.bubbleNear m and smaller further away (down to CHAT.bubbleMin), hidden with the tag (far away, off screen) and behind walls (main.js `behindWall`). There is no own body in first person, so your own lines are in the column; the column holds only lines, never a "Du skriver…" row (#735: it used to stay after sending, because `send` cleared the flag without redrawing it, and the row is gone for good). The main-menu chat setting hides the bubbles together with the column (#765). Tests: `cloudflare/players.test.mjs` (typing flag limits) and `tools/chattest.cjs` (typing on/off, pause, closing, replacement, TTL, wall, leave, no extra 3D objects, screenshots).

Own mirror typing (#743): Chat supplies the existing Ghosts mirror hook with a predicate for an open, visible chat, a live room connection and a key within CHAT.typingMs. Only the own mirrored avatar gets a “Skriver” sprite; other players' bubbles remain DOM. Sending, closing, timeout, disconnect/reset or the menu's chat-hidden setting stops its visibility immediately. Reset uses Chat.stopTyping after room identity is cleared, so reconnecting cannot restore an old typing flag or queue an old-room off event. No own typing row is added to the chat column.

Chat filter and muting (#719): a short list of coarse words (`ROUGH` in `cloudflare/players.js` and `src/chatfilter.js`, kept equal by hand; `cloudflare/chat.test.mjs` compares them) becomes `***` as whole words in any case ("kukeliku", "horisont" stay): the room filters every line for everybody, the client shows its own line the same way and filters received ones once more. Muting is local and lasts until the page is reloaded (ghost ids change with every connection): in the chat bar `/tysta namn` hides that name's lines, "skriver…" and bubbles here ("Anonym" mutes every nameless player; not yourself), `/tysta` lists, `/prata namn` / `/prata` undoes one / all; `/help` in the chat adds these to the cheat list. Nothing is sent or stored; no report button (not needed now). `src/chat.js` `command` / `isMuted`, main.js handles them before cheats. Tests: `cloudflare/chat.test.mjs`, `tools/chattest.cjs`.

Mobile viewport sizing (#567): the fixed `#game-canvas` uses plain `inset:0` + 100% CSS dimensions (no dvw/dvh: iOS WebKit can keep stale dynamic units after rotation). `bindGameViewport` starts immediately after renderer/camera creation, before fetching the plan or other scene data. It observes the canvas CSS box, updates only the drawing buffer with `setSize(w, h, false)` and derives the camera aspect from the same box. ResizeObserver catches late layout changes, and orientation events re-measure again after 120/350/800 ms; window/visual-viewport resize, orientation, fullscreen, pageshow and visibility events coalesce through requestAnimationFrame. Zero-size layouts retain the last valid projection and unchanged sizes do not allocate buffers. Adaptive pixel ratio stays under the existing controller. HUD safe-area rules and other canvases retain their own sizing. `tools/viewporttest.cjs` blocks the real plan request to exercise startup rotation, then verifies delayed CSS layout, repeated portrait/landscape transitions, buffer/aspect, adaptive resolution and real touch taps. Screen-space HUD code (joystick zone in `src/touch.js`, speech bubbles in `src/greet.js`/`src/nest.js`, `measure.update` in `src/main.js`) reads the exported `gameView` {w,h} from `src/viewport.js` (the canvas's real CSS size) and never `window.innerWidth/innerHeight`, which iOS leaves stale after rotation; `#stats` has no 100vh/100dvh height. Audited and left unchanged: `html, body {background:#bfd8ea}` (sky blue, never white), `body {position:fixed; inset:0}`, `viewport-fit=cover` + `--s*` safe-area vars, `100vh`/`100dvh` caps on cards/notes/panels (max-height only), `manifest.webmanifest` (`display:fullscreen`, `orientation:landscape`; iOS ignores both and uses `apple-mobile-web-app-capable` + `black-translucent`). A white area can only be the WKWebView's own backdrop outside the layout viewport (e.g. a stale layout width after rotation: left half game, right half white), which page CSS cannot colour; unproven without a device. `tools/viewporttest.cjs` also overrides `innerWidth/innerHeight` with stale values (startup and after loading) and checks the joystick zone. Physical Safari/Chrome device verification is still required; desktop touch emulation does not certify phone/PWA compositor behavior.

Power cut (#604): `src/power.js` `Power` is a small state machine on the EL/C cabinet's `fuse` (interior.js: the fuse box's plan points, the router's LED material). `on` → E / click / the action button "Pilla på elcentralen" → `buzz` (POWER.buzz s: sfx.mainsBuzz, `supply` jumps between dark and lit, small sparks; the target is blocked) → `off` (sfx.fuseBang, a big spark sprite, the router's LEDs dark). Mending is a hold, not a click: keydown E (not its auto-repeats, so the press that tripped it never mends), mousedown or the touch button's pointerdown start it; keyup E, mouseup, pointerup / cancel / leave and blur stop it; the touch `click` after pointerup is ignored for the fuse box. Progress counts only while the fuse box is in focus and **pauses** when let go (never lost: 30 s of holding is a lot on a phone); the prompt (shown on touch too while holding) has the % and a green bar (inline background). At POWER.repair s: sfx.breakerOn, power back. main.js carries the cut out: `lights.setSupply(power.supply)` each frame, `patio.supply`, `world.windowLights.update(…, power.on)`; `onCut` switches off TVs / the PC / laptops / Sonos / hob / hood, darkens the smart speakers (`nests.powered`), the TV's standby LED (`mains`), the stairwell (`core.setPower`, POWER.emergency) and the garage's sensors (`garage.powerOff`); `onRestore` undoes the device lights only (screens and music stay off). While it is out, E targets of the kinds in main.js `POWERED` (TV, PC, laptop, speakers, smart speakers, hob, hood, coffee maker, lift, garage door) say "Strömmen är borta" and the remote finds no TV. Nothing is saved: a reload always has power, and the switches / small lamps keep their own state through the cut (lights.js), so what was lit comes back lit. Appliances (#612): `onCut` / `onRestore` also call `mains(on)` on every `world.lids` entry that has one and on the dishwasher / washer / dryer programmes. The fridge and freezer (fridge.js: the lamp and the liner's glow dark, no door alarm) and the oven and microwave (ovens.js: no lamp) still open. A running Moccamaster (coffee.js), dishwasher (dishwasher.js) or washer / dryer (laundryprogramme.js: the panel dark) **pauses** with its switch still on and carries on with the time left when the power is back; none can be started without power ("Strömmen är borta"). The lift (core.js `Lift.mains`, via `core.setPower`) forgets its call, a moving car creeps down on its rescue drive (CORE.lift.rescue, *guess*) to the stop below and opens its doors there, so nobody is shut in; its light, display and buttons are dark.

Unified HUD badges (#707): `src/hudicons.css` owns both top shells: the same safe-area-aware top, height, radius, edge, shadow and single 2 px blur. The badges sit 4 px inside each safe-area edge (#766). The shared cell is 48 px (44 px at <=600 px), with a half-cell width module on wider views: weather ½ cell + temperature 1 cell without a divider, clock 1, prominent points 2, visitors 1, and the touch console 1. At <=600 px, the noninteractive data columns compact to fit a 568 px landscape viewport with two 44 px safe areas; content stays visible and every interactive shortcut/console remains 44 px. Gain/deduction feedback temporarily fills the points cell (long red reasons wrap); the existing stats timer restores its score/label. Every right shortcut is one cell, including on desktop; existing IDs/listeners and SVG conventions stay unchanged. `#level` still contains only the clock and keeps its place in `data-place`; weather remains outdoor weather in every room. main.js prepends weather/temperature/clock after stats.js builds the score, then appends the existing console button. Heat bars and minimap use `--hud-badge-bottom`; the desktop QR sits below the heat row. The compass stays in the top right row at every size. During combat, touch suit/measure/jump/crouch controls use two rows below the lives, including wide landscape views. `tools/hudlayouttest.cjs` checks real index DOM/CSS and icon initialization at five landscape sizes and three safe-area cases, with game bootstrap suppressed; it does not certify gameplay or a physical phone compositor.

Privacy page (#723): the menu button `#menu-privacy` ("Integritet och cookies") opens `#privacy-dialog` (same card style as the leaderboard dialog; Escape / "Stäng" closes; listed in main.js `otherOverlay`). It describes in Swedish what is verified in the code: no cookies; localStorage `lunden.*` keys, IndexedDB `lunden` (cat photos, drawings), CacheStorage (beer shelf); sent to the Worker: leaderboard name/score + random player id, presence every 30 s, players' room (position, yaw, weapon, chat, not stored), shared drawings/furniture, anonymised crash reports; Open-Meteo (rounded coordinates + dates only); how to delete (Återställ keeps name, score and shared drawings, `RESET_KEEP`; clearing site data removes everything local; server rows stay). Keep it in step when a new key or request is added. The page opens with the section "Vad andra spelare ser" (#730: everyone playing at the same time in the one room sees you online, your avatar with name/"Anonym" + score + position/heading/weapon/typing, your chat lines; name + score stay on the leaderboard; no opt-out except no cloud; checked against ghosts.js / presence.js / chat.js / players.js). The start screen shows the note `#share-note` ("Andra spelare ser att du är online och ser din avatar…") when the cloud is on; there is no opt-out checkbox. `tools/anontest.cjs` checks both.

`tools/chatsettingtest.cjs` (#765) exercises the actual Chat module and production index DOM/CSS in Chrome with bootstrap suppressed: persisted PÅ/AV across real reloads, immediate existing/incoming speech and typing bubble visibility without altering outgoing typing flags, no own typing row (#735), 60-second expiry, and complete newest-message bounds after resizing/rotation at desktop and phone sizes with safe-area overrides and wrapped long names/text. This is DOM/module verification without apartment construction, rendering or live room networking. Run `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/chatsettingtest.cjs http://localhost:8765 /tmp/lunden-chat765`.


#767 verification: 15 actual HUD DOM/CSS cases passed across five landscape/desktop sizes and three safe-area cases,
including hidden-HUD startup/reveal and resizing the same live Compass instance. Reviewed HUD-only screenshots cover
568×320 with 44 px left/right safe areas, 844×390 and 1280×720. The actual apartment `compasstest` then passed all
45 rows in 158.664 s, including original bearing/rotation/movement/notifications and a real reload, without `&test`.
Logs: `/tmp/lunden-hud767-lifecycle.txt`, `/tmp/lunden-hud767-lifecycle/layout-results.json`,
`/tmp/runtests-242392/compasstest.log` and `summary.json`. No pageerrors were recorded; no physical-phone/FPS claim.


Private command hashing (#856): `src/cheats.js` contains exactly the eight public entries; `isCommand`/`runCheat` remain synchronous and retain the console's trim → remove one leading slash → trim → lowercase → collapse whitespace normalization. A matching private hash calls the existing unlock handler with canonical normalized input. Unknown/near-match input retains the same neutral `UNKNOWN` response. `Rearrange.unlock` separately applies only `code.trim()` before exact verification; accepted input synchronously sets/persists the boolean and calls the real `enable`, including when busy refuses activation. No input is stored, re-requested or made async. `Rearrange.write` sends the public version-1 fixed default credential through the unchanged authoritative revision/conflict/reset/pose paths; restored boolean state needs no original input. These replayable hashes are the existing game mechanic, not authentication. [Protocol and native integration](storage.md#versioned-layout-credentials-853).


Opponent life badges (#865): the existing ghost name/score sprite gains a compact `❤ n` row above both rows only while local and remote players hold recognized combat weapons. Name/score text keeps its original world placement; `Chat` anchors above the sprite's actual height so the bubble gap stays intact. Authoritative `l` comes from PlayerRoom state/welcome, not local COMBAT defaults or client-reported health. Stationary damage/death reset updates immediately; leaving releases the badge, and reconnecting starts with the server rule count. Unknown/invalid legacy life values hide the row. Immutable badge materials are cached per live name/score/displayed-life combination and released on replacement/disposal; toggling weapons creates no extra sprite and unchanged frames allocate no badge. Later #866/#867 may update the same authoritative attachment/publication path; this slice adds no fall damage or life timer.

Shared outdoor death spawns (#863): `src/respawn.js` exports synchronous `chooseRespawn`, `safeRespawnPoint` and `respawnOutdoors`. `Fall.wake` and main's `Combat.onDie` use the same checked random destination; the ordinary menu's `Gå till startplatsen` still uses START. Regions in `RESPAWN` derive from the front parking lot, A/B green gap and behind-house side toward the river, within unchanged OUTDOOR bounds. Insets and search counts are explicit gameplay guesses, not surveyed safe anchors. Each candidate uses its own actual Player ground/collision/headroom context, configured house/river exclusion, closed collision outlines and conservative current instance geometry bounds; private bounds never overwrite authored geometry boxes. Bounded random sampling falls back to checked grid candidates, never an unchecked fixed point. A completely obstructed search returns null and leaves the pose unchanged. Destination selection adds no damage, protection time or penalty; existing death life/score rules and wake hooks remain, including the jetpack going home on a fall. No private input, new persistence or room protocol is introduced.

#863 verification (2026-10-13): the inactive helper step `3f69bc2` passed 17 actual Chromium checks on a small controlled Three fixture without apartment bootstrap/WebGL. The subsequent caller integration passed 19 checks, including real Fall hurt/wake and Combat lethal-hurt callbacks, region membership, life refill, one existing deduction and retained equipment. One actual apartment then passed 45 focused checks: 36 distinct seeded destination queries covered all three regions and used its current ground/collision/instance data; real `Fall.land`/update and main Combat death callbacks preserved home state, door state and held equipment, with the existing jetpack hook behavior. Combat used synthetic death input, not a two-player network fight. Both actual-world images were reviewed (`/tmp/lunden-priority-863/app/fall.png`, `combat.png`); result JSON records no pageerrors after readiness. The finite owned harness exited 0 with no signal/timeout; its 150-second monitor wall time includes 15-second polling and is not a performance benchmark. Artifacts: `/tmp/lunden-priority-863/integration-native/`, `app/result.json`, `world.log`, `world-exit.json` and `world-source-hashes.json`. Existing fall/jetpack/combat drivers retain their actions and unrelated assertions; only the fixed death destination expectation now checks current safety and region membership. Their entire suites were not rerun for this change. No physical-phone, recovery-timer or live PvP claim.

Final rebase incorporated #864 startup guarding and #867 life-recovery messaging. Of 527 pre-run tracked non-documentation/non-changelog files, 518 remained byte-identical; the nine changed paths are recorded in `/tmp/lunden-priority-863/final-source-proof.json`. Main/Fall/player/world/helper and all three updated death drivers were unchanged. Combat gained a separate authoritative-life notification callback and Ghosts its dispatch; the hurt/death path was unchanged. No room network was enabled in the actual-world probe. The later `91c19ac` offline-recovery methods/update/reset addition was also preserved; it leaves the hurt/death path unchanged. The 19-case controlled native regression passed again after both rebases, including the changed Combat class (`/tmp/lunden-priority-863/final-native-91c19ac/`), exit 0 and no pageerrors. This is specific execution-path preservation, not a claim that every runtime file stayed identical.


Shared own health channel (#868): `Combat.lives` is the existing local replica, with PlayerRoom attachment `l` authoritative online; weapon pickup/drop does not reset either value (this was already a server invariant). Own welcome carries `l`; passive `{t:'life',l}` clamps integer values to the current rule without hurt, score, audio or death callbacks. New connections still start full; there is no cross-connection health persistence. `Combat.fall(drop,gap)` returns a Promise of `{l,dead}` or null, without invoking the landing/respawn or PvP-hurt paths. `src/falldamage.js` shares the configured free-gap/drop rule: small/no-free-gap falls cost zero, a harmful lower fall costs ceil(max/2), and a drop above FALL.fatal costs max. Fatal 6 m and max-report 100 m are explicit gameplay assumptions; the actual Fall.land/suit/penalty/visual hookup is a separate #869 slice. Offline damage uses the same replica and #867 recovery methods, never a second life counter.

Ghosts queues one `{t:'fall',id,drop,gap}` in its existing 5 Hz budget; the server accepts bounded finite measurements, never client HP. Results match the current request id. Disconnect resolves null and clears queued work; unmatched/duplicate late results are ignored. FALL.ackMs bounds a missing acknowledgement, including rate rejection; null applies no guessed offline damage. The server owns damage arithmetic, not authoritative physics or anti-cheat validation of the client-reported geometry. `tools/combatstepstest.cjs` preserves its existing readiness/cleanup checks and exercises actual Ghosts/Combat/local PlayerRoom, unarmed own HUD, weapon transitions, death/reset, passive updates and request cancellation without apartment bootstrap or WebGL. Its HUD-only screenshot is not a full-world or physical-device certificate.


#868 native acceptance (2026-10-13): `tools/combatstepstest.cjs` against local PlayerRoom on 8861/8862 completed 31 PASS, zero FAIL/pageerrors, ALL PASS and process exit 0 on source dc6eab7 (same tested runtime/driver bytes after final rebase). Node PlayerRoom/recovery suites completed 21 PASS (15+6). Reviewed `/tmp/lunden-priority-868/native.png` shows injured unarmed ❤5/10 in real index HUD DOM; bootstrap was deliberately suppressed and no WebGL renderer or actual-world fall was run. The original readiness/lifecycle checks remain, with explicit own-health, weapon-transition, passive update, offline damage and pending-request/disconnect/late-result checks added. Logs and post-run source hashes are retained in `/tmp/lunden-priority-868/` and `~/.local/state/lunden-orkester/20261013-priority/868-native-proof.json`. Earlier own harness mistakes remain separate from the final green run. This completes only the bounded shared-life slice; #869 owns real landing/penalty/suit/death visual integration, and #866 remains open.


Armed greeting/action priority (#872): main.js only offers ghost greeting pick boxes when the current `weaponKey()` is empty. `use(ghost)` rechecks the current weapon for an old focus and uses the same single held-item use/suit-web path as E or touch click; it never latches the automatic trigger. `greetPlayer` independently rejects armed calls, while `clickTarget` excludes a stale armed ghost target and touch pointerdown still reaches a held rifle trigger. Existing pointerup/cancel/leave and mouseup stop that trigger. Ordinary objects/NPCs and unarmed greeting stay on their original interaction paths. `tools/armedgreettest.cjs` executes complete verbatim production use/focus/click/greet/current-weapon functions and action, pointer, mouse and keyboard listener bodies in actual index DOM with real THREE raycasts/Ghosts. It checks weapon swaps, old focus, touch down/up/click and E/keyup release, suit/jetpack eligibility, unarmed greet packets and an ordinary door interaction. World collaborators/weapon effects are controlled stand-ins, without apartment bootstrap, renderer or projectile/hit acceptance.


#872 native verification (2026-10-13): final complete driver 22 PASS/zero FAIL/pageerrors, ALL PASS, actual exit0; original c25c564 main against the same driver 13 FAIL/exit1. Reviewed844×390 `/tmp/lunden-priority-872/armed-touch.png` shows “Skjut”, with no greeting label. Earlier22PASS before explicit latched-trigger checks is superseded by native5/final, which test pointerdown→pointerup→click and E→keyup firing state. Original/fixed source snapshots, raw logs and verbatim source-span hashes are retained under `/tmp/lunden-priority-872`, with final proof in `~/.local/state/lunden-orkester/20261013-priority/872-final-proof.json`. Final rebase preserved Surface's fall/recovery block and matched the tested complete main source; no actual-world/projectile or physical-phone result is claimed.

Defeated-player statistics (#871): the existing Ghosts server-hit delivery reaches `Combat.hit`; `recordPlayerKill` consumes only the server-generated lethal-hit UUID for another player. The original hit/score callback, victim death/wake, fall and recovery behavior are unchanged. The existing statistics panel gains “Dödade spelare”, with persistent count and receipt metadata; resetting visible statistics gives zero while old receipts remain consumed. [Persistence/protocol](storage.md) remains local statistics, not authentication or a new server fight log.
#872 native verification (2026-10-13): final complete driver 22 PASS/zero FAIL/pageerrors, ALL PASS, actual exit 0; original c25c564 main against the same driver 13 FAIL/exit1. Reviewed844×390 `/tmp/lunden-priority-872/armed-touch.png` shows “Skjut”, with no greeting label. Earlier22PASS before explicit latched-trigger checks is superseded by native5/final, which test pointerdown→pointerup→click and E→keyup firing state. Original/fixed source snapshots, raw logs and verbatim source-span hashes are retained under `/tmp/lunden-priority-872`, with final proof in `~/.local/state/lunden-orkester/20261013-priority/872-final-proof.json`. Final rebase preserved Surface's fall/recovery block and matched the tested complete main source; no actual-world/projectile or physical-phone result is claimed.
## Confirmed-hit marker (#875)

`src/hitmarker.js` owns the brief Swedish text above the crosshair, attached only to `Combat.hit` (the
Ghosts server-receipt callback), never local firing/prediction/remote projectile rendering. Every confirmation
renews a wall-clock timer; `Combat.update` also checks expiry, and welcome/reset clears it. Timers therefore
expire with paused logic. `COMBAT.hitMarker` sets the 700 ms duration and 20 px offset (UX assumptions).
Missing/unknown `m.head` gives “Träff!”; strict server `m.head === true` gives “Huvudträff!” for the future
head-contact protocol. Score, damage and existing Nerf `sfx.playerHit` callbacks remain on their existing path.
The pointer-transparent fixed marker leaves the aim dot, prompt, HUD and shooting controls clear. Its polite
status region does not rewrite unchanged labels for quick repeated confirmations.
#904: on a confirmed receipt or actual viewport/HUD/lives resize, placement first restores the centered lane,
then checks real marker/lives rectangles. Only an overlap shifts it left by the required distance plus
`COMBAT.hitMarker.livesGapPx` (6 px, UI choice). The original 20 px above-reticle gap remains. ResizeObserver
accounts for the compass publishing its center after row layout; placement is coalesced and absent from
the Combat frame loop. Clear/reset cancel pending placement and restore the centered state.

`tools/hitmarkertest.cjs` uses actual index DOM/styles, actual Ghosts/Combat and a local PlayerRoom via native
WebSockets, with bootstrap suppressed and no WebGL. Accepted receipts, actual misses and rejected weapon
mismatches test the confirmation boundary; explicit optional head-receipt tests do not assert server head
classification. Phone 844×390/667×375/568×320 and desktop 1280×720 layout captures, real action-button clicks,
renewal/expiry and paused-logic/reset are covered.

Native #875 verification at `69c5d64` plus marker: 16 PASS, driver exit 0, no page errors. Real accepted-body
receipt 844×390 and optional-head layout 568×320/667×375/1280×720 captures were inspected; they are HUD-only,
not apartment/gameplay/physical-phone pictures. Local artifacts: `/tmp/lunden-hit875-surface/final/`.
The driver derives rapid-hit pacing from the actual Worker welcome cadence; it does not relax server limits.

#878 shared crouch: `Player.crouched` is the actual physics/input result sent by the
main Ghosts state callback as optional literal-true `c`; requested `Player.crouch` alone
never determines the remote pose. The existing Avatar crouch solver now receives the
interpolated remote pose, or the actual local pose in a mirror. Lowered head/torso,
bent knees, held hand/weapon and walking use the production skeleton and skinning.
Standing/legacy clients, name/score/life badge anchors and greeting anchors retain
their existing behavior. `tools/crouchposetest.cjs` uses actual Player/Ghosts/Avatar
modules to exercise stationary input, headroom release, moving crouch and native
welcome; the controlled-world native fixture does not boot the apartment.


Distance rewards for confirmed player hits (#873): `PVP_SCORE` and pure `pvpHitPoints(distance)` in the already Worker-watched `src/config.js` are shared by PlayerRoom and Combat. The balance values are *guess*: the existing 5-point base is retained, with one extra point for each complete 2 m beyond 5 m, capped at 15 extra (7 m → 6, 15 m → 10, ≥35 m → 20). Geometry is the room's already accepted last-known shooter-feet→target-feet distance in 3D, the same distance used for the existing range/slack check; projectile origin/trajectory and obstacle predicates are not changed. Requests cannot supply reward points or award sequence. Actual awarded points consume the existing 60/minute cap; a hit above the remaining budget is refused rather than clipped. Existing per-weapon rates, participation, misses and damage rules remain.

The server appends `award:{i,seq,distance,points}` to its existing hit acknowledgement. `i` identifies the shooting connection and `seq` increases only for accepted hits in its hibernating attachment. Combat validates the shared formula and current `Ghosts.me`, then checks a scalar high-watermark before base callback, range bonus, hit counter, hit-marker restart or sounds. Ordered same-socket replay and late acknowledgements from an old socket add nothing. The independent #871 `kill` UUID receipt remains first and persistently idempotent, including when an unseen kill receipt arrives with an already-consumed score acknowledgement. A reconnect starts a new server sequence; an old connection cannot replay after reload. Cached old Workers without `award` keep the previous base-only callback. This is current-connection score dedup, not persisted hit receipt history or an authentication claim.

`stats.pvpHits` remains an integer hit count with its existing base contribution; `pvpRangePoints` is the separately saved extra amount added once by `rawScore`. Legacy saves retain already-earned base points, and reset clears both counts/extra points while #871's kill receipt replay protection stays intact. The original statistics panel adds “Träffar på spelare”, showing the hit count and a separate “avståndspoäng” subline. `tools/pvppointstest.cjs` checks the actual Worker/Ghosts/Combat/statistics DOM without apartment bootstrap/WebGL, including a real native raycast obstacle miss, confirmed short/middle/long shots, exact budget/refusal, controlled receipt replay, reconnect, reload and the visible original panel.

Shared fall integration (#869): `Fall.land` requests damage only for harmful unsuited free fall. `Fall.resolve(null)` releases a cancelled request without speculative injury; a confirmed response clears pending before starting the reaction, so duplicate completion cannot trigger a second penalty/wake. Main awaits `Combat.fall(drop,gap)` and passes its result/null to Fall.resolve. The Combat/Ghosts channel owns response matching, health and recovery. Survival red fades without stopping movement or changing pose/home/held weapon; only death runs the existing fatal sequence and #863 shared outdoor wake. `fallintegrationtest.cjs` separates native actual Player/Fall response/reaction checks from real Combat/Worker channel checks; `falltest.html` keeps the full-world route, stairs, rest and resume coverage.

#869 validation: actual Player/Fall/Ghosts/Combat/Worker native probe passed34; authored actual app/World fall fixture passed38; changed native respawn fixture passed19. All actual CLI exits0, no page errors. Reviewed full-render checkpoints show the same5/10 life HUD without a weapon and with the held blaster, death-only black and one safe outdoor wake; unchanged stairs/rest/resume and no extra PvP penalty also pass. Same health/recovery holder is used throughout; see [scope and source proof](verification.md).


### Always-visible frame rate (#884)

The existing top-left presence cell has two stacked rows: online visitors above FPS, separated by the badge divider. Presence updates only its count child, so successful/failed heartbeats preserve the FPS node. `FrameRate` counts completed ordinary main-camera draws against elapsed `performance.now()` time, publishing rounded half-second windows. Logic callbacks and separate warm-up/reflection/shadow renderer calls are excluded. Reading retains the reduced actual draw rate; pause, hidden document, portrait cover and incomplete startup clear the value to a dash. Visibility/pause transitions reset the baseline before resuming. No extra network message, timer or per-frame allocation is introduced. The optional developer perf panel retains its separate diagnostic semantics.


HUD layout fixture health contract (#896): `tools/hudlayouttest.cjs` uses actual Combat updates and a mutable weapon input to distinguish full unarmed (hidden) from injured unarmed/offline (visible) and full armed combat (visible). Its original 15 viewport/safe-area geometry checks remain strict. The life-only correction passes its checks, but the complete native suite still exits 1 on nine pre-existing compact-cell clipping failures tracked in #902; no HUD runtime or geometry was altered by #896.
Spider avatar verification (#891): `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/spideravatartest.cjs BASE WORKER OUTPUT [--render]`.
Default uses actual SpiderSuit/Player/Ghosts/Avatar and two real local PlayerRoom sockets without apartment startup or WebGL. It checks on/off,
equipped-before-connect, late welcome, reconnect, genuine reload through existing suit save/load, crouch/prop/name/health/base-colour preservation,
strict Worker booleans and shared atlas lifecycle. `--render` requires the graphics slot and adds four completed 640×420 actual remote-avatar images
(unarmed on/off, armed crouching on/off), saving raw facts before each capture and completing GL explicitly. This is component evidence, not
whole-apartment/live-FPS or a physical-phone claim.

#891 final bounded acceptance:20 native checks and21 checks including actual shader/render PASS, CLI0, zero page/console errors or context loss.
Four actual-peer pictures in `/tmp/lunden-suit891-surface/final-render/` were inspected: stable red mask/white eyes, spider/web chest, blue
limbs/red gloves/boots; removal restores the original purple beanie/top/trousers, outline when unarmed, held prop/HP10/name when armed.
The same peer/base-colour hash and3746 body triangles are retained in all four: two completed view calls unarmed (body+badge), three armed
(body+badge+prop); total3748/3760 triangles respectively, no outfit mesh/pass. Renderer programs2→3→4→4 include original outline/solid and prop
variants; do not infer one GPU program or live FPS. Actual GL/capture phase1300ms, hard20s browser-close bound. The initial accepted state checks
had a raster-only speckling error from exact comparison of interpolated float bone IDs; final floor(id+0.5) uses actual single-bone-per-triangle
data and corrected all four reviewed pictures. Original #892 canonical look, geometry-parts and pose functions remain byte-identical.

Compact HUD data (#902): at <=600px, noninteractive columns are 18/39/40/72/26px,
with the console still 44px. The weather glyph is 18px, clock 12px, score 15.4px; temperature 14px.
Online/FPS remain two divided logical rows; compact FPS number/unit occupy two lines within its
existing lower row, with 1px separation. The wider modular columns and all touch targets remain unchanged.
See [native evidence](../validation/issue-902/README.md); the independent marker/lives overlap is #904.

### Restricted standing rifle head contact (#897)

Rifle checks the nearest actual posed `SkinnedMesh` face of each settled standing
armed ghost. The world-obstacle ray ends at that exact contact, with no capsule's
old 0.3m clearance gap. Moving/crouched ghosts keep the earlier body capsule path;
other weapons keep their existing paths. Only canonical short hair (`style:0`)
and a central FRONT skull face qualify for v1: the whole r3 rounding cell must
fit the canonical feet/world frame x within±0.008m, y1.53+0.148–0.158m
(unscaled; avatar width/height and heading are applied), positive z, with the
actual internal `rifleSkull` vertex identity. This world-frame core replaces the
failed bone-local patch plus inflated pose extent. Boundary cells stay body1.
That original core remains unchanged; #920 adds the separately bounded frontal nose core described below. Hair, hats, ears and other unsupported surfaces retain body1.
`PVP_RIFLE_HEAD.skull` supplies the unchanged radius/segments/scale/centre to Avatar
and the pure Worker triangle profile. The added byte vertex attribute is shared
with the geometry, does not change normals/colours/materials or add a draw call.

`Combat.rifleContact` rounds origin to r2 and raw direction to r3 BEFORE its native
raycast, then sends that same ray with optional `hc:[1,x,y,z]` (world contact r3).
Head markers remain receipts: only the room's validated `head:true` creates
“Huvudträff!”. A predicted/forged head flag never changes the marker or damage.
The existing score/kill/replay gate and one-hit sound/marker effects are retained.
No draw, apartment-FPS or physical-phone acceptance follows from the native tests.

`tools/rifleheadtest.cjs gameURL workerURL artifactDir` runs real Avatar/Ghosts/
Combat and the local Worker without bootstrap/WebGL. It verifies the restricted
geometry profile and actual acknowledged head2/body1, nearest face, a real wall
within the old 0.3m gap, miss, forged point/version, crouch fallback, overkill from
1HP, shared reset, one kill/award and idempotent effects. Its PNG shows the actual
receipt marker/HUD and bounded measured protocol rows, not a rendered avatar.
Parents #892/#879/#874 remain open for #898/#899 and their other weapon/pose parts.

## First NW bicycle (#903)

Only the existing `yard-0-2` bicycle can be ridden: its four original instanced
components move together; the other eight NW bicycles and rack collision stay fixed.
Aim at it and use E, the ordinary left-click action or the touch action button.
WASD/arrows or the existing touch joystick steer and drive; E/Space/C or the
existing stand button safely dismount. Repeated E is ignored for this bicycle
interaction only. Cycling has a saddle/handlebar camera and an explicit prompt,
without borrowing the crouch pose.

`BICYCLE` handling values are game-value guesses, not survey measurements. The
full wheelbase capsule and swept turn/travel substeps use actual Player collision,
reachable ground and headroom. Uneven wheel support is conservatively refused.
Only initial physical extraction can ignore the selected rack's four edges;
subsequent riding ignores no rack/wall/door. Unsafe mount or dismount is refused.
Pause/zero dt preserves the bicycle pose.

`tools/bicycletest.cjs <base> <external-output>` runs the original index DOM,
actual StreetLife/Player, complete original input/save handlers and real touch
pointer gestures without WebGL. Controlled world/focus/lock collaborators are
explicit; it does not prove pointer lock, full World graphics or remote bike pose.
The initial source/native stage passed29 checks (actual exit0). Final source/native
passed34 checks on `6f35db5`: original control/save paths plus mounted target
exclusion, exit labels and original CSS geometry at900×600,568×320,390×844.
Portrait keeps the existing rotate curtain; its check is underlying DOM geometry,
not interactive portrait gameplay. The short stand caption remains at least44px
and clear of measure/jump/crouch/action controls; the short touch prompt is also
clear. Full accessible exit text remains “Kliv av cykeln”.

`--app` is a separately coordinated, bounded heavy run: one real World,240s
readiness/300s driver guard and an external320s finite wrapper. Final actual
World passed22 checks with Node/wrapper exit0, no page errors: real ray focus,
touch action mount, visible original handlebars, supported6m in one simulated
second, actual pause button, safe touch stand exit and all other eight matrices
unchanged. Four guarded images are separate480×320 actual scene/camera renders
and900×600 DOM captures with the canvas explicitly `display:none`; they are
not composites. Existing four batches retain nine instances each; the invisible
interaction pick helper adds no rendered bike model.

Two earlier app attempts exited1: Touch→E was a fixture mode mismatch, then
calling showOverlay directly missed the actual pause handler's touch shutdown.
Their logs/images remain under `/tmp/lunden-priority-903`; early “hud” images
still included the canvas because the hidden attribute was overridden by CSS.
The final World HUD still used the longer stand/prompt captions; their measured
overlap was subsequently corrected and verified by the final DOM-only native
images. No extra World run followed those two text-only changes. Reversing exactly
those caption edits restores the tested main.js hash; Player/StreetLife/World
bytes match, while config additionally received unrelated #920 rifle nose/head
validation (BICYCLE unchanged, final native repeated). No blanket source parity,
measured hardware FPS, physical phone, remote cycling pose or all69-bike claim.
The real door-location rejection can also involve adjacent walls; the pause
probe adds controlled KeyW after a real pause tap, not a held joystick gesture.


### Bounded frontal nose contact (#920)

`PVP_RIFLE_HEAD.nose` supplies the exact existing8×6 sphere radius/scale/centre to
Avatar and cached `rifleNoseProfile`. Shared `rifleSphereProfile(shape)` and
`rifleProfileEntry(triangles,seed,state,o,d)` retain the original skull Float32
operations and front-triangle entry. An additive byte `rifleNose` identifies the
actual nearest production face without changing positions/normals/colours/bones
or suit shaders. Only a whole quantized cell in the small canonical front core
x±.005, y1.53+.083–.101, z≥.13 (width/height/heading applied) can qualify.
A frontal direction gate limits horizontal/vertical normalized components to.2;
side/back and covered boundaries stay body1. These are conservative *guess* policy
guards validated on the actual sampled model, not anatomical measurements.
The nose alone uses a6mm surface guard; the earlier skull15mm guard is unchanged.
No client pose/state/version/channel or new damage/life counter is introduced.
The same authoritative receipt controls marker, life, award and one fatal UUID.
#916 extends only the exposed central rifle skull core to canonical styles1/2/3.
Long hair and bun use the unchanged short-hair core; beanie uses a lower measured
core and a named guess vertical-ray bound0.08. Combat passes the original r2
origin/raw r3 direction to Avatar's classifier; the backend uses the same ray
with its existing range/origin/profile guards. Beanie shots without that ray or
on steeper angles stay body1, even if a client supplies a hidden-skull contact.
The internal tag and actual nearest posed face still reject nearer hair/hat.
Nothing changes weapon participation, wall/nearest-hit selection, score budget,
one lethal UUID, life recovery, or authoritative hit-marker receipts.
`tools/rifleheadtest.cjs` now includes all60 canonical variants, rounded nearest
unsupported/hidden-contact grids, a dense beanie oblique regression and actual
Worker/Ghosts/Combat new-style head2/covered-beanie-body1/steep-forgery-body1.
The DOM screenshot verifies the real head marker and measured protocol rows,
without WebGL, apartment rendering or a physical-phone claim. #898/#892/#879/
#874 remain open for independently assigned other surfaces and weapon/pose parts.


### Exposed lower rear skull (#933)

The original actual skull mesh/profile is reused without geometry/material/bone
changes. `rifleHeadRearRegion(seed,state,point,origin,direction)` adds two bounded
whole-cell rear patches: canonical short hair/bun styles0/2 x±.008, y1.53+.020–.024,
z−.09..−.05; beanie style3 x±.012, y1.53+.04–.055, z−.105..−.065. Width/height and
heading use canonical server-ID appearance. Long hair style1 has no rear bonus;
its actual hair remains present and first. These narrow guards are conservative
*guess* policy choices measured on sampled native contacts, not anatomical facts.
A rear approach must start at least.25 canonical metres behind the head, travel
forward with normalized lateral/vertical components≤.05, and include the exact
snapped `origin:r2`/`direction:r3` arrays. Missing ray, side/front/steep/interior
approaches and region boundaries fail closed. `Avatar.rifleHeadContact` accepts
optional origin/direction arguments; Combat supplies the SAME ray used for the
actual first SkinnedMesh contact and wire. Legacy core/nose calls remain compatible.
Rear uses unchanged original skull first-entry and15mm guard; nose retains6mm.
No new damage/recovery/scoring/kill mechanics or wire fields are introduced.
#928 adds only the measured lower-FRONT jaw core to settled standing rifle
contacts. Avatar's exact existing jaw receives its own `rifleJaw` byte identity;
raycast surfaces, vertex positions/normals/materials/head bones remain unchanged.
The shared helper applies whole r3-cell/actual frontal-ray guards, then the room
validates the FIRST canonical jaw triangle on the same o:r2/d:r3 ray. Side/back,
steep, covered and ambiguous jaw points keep body1; independently supported nose
and skull branches keep their own profile/region dispatch. Head2 still subtracts
from the single authoritative lives counter and only accepted receipts show the
existing “Huvudträff!” marker. Score budget, kill UUID, recovery and replay are
unchanged. `tools/riflejawtest.cjs` verifies actual skinned contact/ray/Worker/
Ghosts/Combat and HUD DOM without game bootstrap/WebGL; its screenshot is
receipt/HUD evidence rather than a rendered-avatar or physical-phone claim.
### Extra exposed frontal skull (#931)

Rifle head damage also admits two narrow exposed skull strips beside the frontal face, using `PVP_RIFLE_HEAD.front` and `rifleHeadFrontRegion`. This additive branch requires the actual serialized origin/direction and a finite frontal cone; missing rays fail closed. The entire rounded contact cell must fit the canonical strip. Hair, nose/face, body, crouch and oblique hidden-skull contacts remain body-only in this branch. It shares the unchanged v1/range/first-skull-entry guards and two-HP authoritative receipt; no client damage/model/head flag is trusted. Existing central-core and frontal-nose branches remain separate. Bounds/cone are game-policy guesses validated against the stated actual production-model inventory, not an all-pose physics guarantee.

Current corrective restriction: the Worker admits this Front branch only with known fresh connection history, no accepted greeting and no later accepted heading change. A first valid heading establishes the new connection pose; later changed heading makes this branch body-only permanently for that connection, even after returning, death or recovery. Older hibernated attachments with unknown history are also body-only here. This restriction prevents a paused replica's rotated nose from preceding the deeper canonical skull; wall time does not prove animation completion. Other surface branches keep their separate policies. Full post-turn/greeting support remains open in #939; #931 is not complete.

### Exposed side temples (#932)

Stationary standing rifle contacts additionally support both exposed lateral skull temples across the four existing canonical hairstyles. The existing physical skull, hair/beanie, ear/face meshes, bones and materials stay unchanged. `Avatar.rifleHeadContact(hit,state,seed,origin?,direction?)` receives the SAME origin:r2/direction:r3 used for the native nearest skinned face; original core/nose callers remain compatible, but lateral calls without the ray fail closed. No client-selected damage/head/model/pose enters the wire.

The conservative support patch is a policy guess, not a physical measurement: canonical |x|0.075–0.105, y0.085–0.112 above existing headY1.53, z0.036–0.09, with the existing0.001m whole-cell margin after width/height/heading. Side approach must point inward from the matching side at canonical |origin.x|≥0.3, normalized |direction.z|≤0.18 and |direction.y|≤0.05. Unsupported sides/angles, hair/beanie/ear/face-first contacts, moving/crouched ghosts and old contact-less clients remain body1. Other head surface families remain in their own issues. Server confirmation still owns head2/body1, lives, award, lethal UUID and marker; no extra network budget, timer or scene ray is added.

The delivered lateral subset is restricted to target sockets that have NEVER sent an accepted greeting on their current attachment. PlayerRoom derives `allowLateral` from the absence of its existing authoritative `gt`; no client field, timer, animation anchor or elapsed-wave estimate is used. A paused/delayed right-arm wave can otherwise stand before the skull. After any greeting BOTH lateral sides remain body1 for that connection, including after death/hibernation; core/nose/rear remain independent. A fresh target socket starts without gt. Safe lateral re-enabling is tracked in #935; #932 stays open.

### Exposed frontal nose side cells (#934)

An additive `noseExtraPatch`/`rifleNoseExtraRegion` admits whole wire cells in
canonical x±.011, keeping the original y1.53+.083–.101, z≥.13, frontal direction
limit.2 and6mm exact first-Nose entry guard. These are fail-closed game-policy
*guesses*, not new geometry or an anatomical measurement. The original nose
core/profile/entry and physical nose/bones/material remain unchanged; Avatar
requires the actual nearest Nose-tagged skinned face and Combat's full obstacle
ray, while the Worker independently checks the same version1 serialized ray.
Upper/lower bands, wider lateral surfaces and animated phases without a whole
supported wire cell stay body1; this is not universal nose/pose coverage.

The initial wider y/front proposal failed640 exact-entry checks (13.33mm maximum),
so it was rejected without increasing tolerance. The narrowed actual60-appearance,
four-heading/four bind/standing-pose inventory admitted2,968 native contacts,
888 outside the old core. All23,744 independent cell-corner contacts stayed Nose;
207,643 unsupported nearest contacts gave no bonus and144 actually translated
near-limit contacts passed. Original position/normal/color/skin/skull arrays match
an independently loaded historical Avatar. Maximum admitted pose/wire residual
is4.789mm. The full attempt's CLI1 is retained: its taxonomy initially lacked a
Jaw-first route, followed by a coarse live-aim fixture failure. Supplementary
focused native proof covers3,940 earlier actual hair/skull/eye/jaw/neck/torso
contacts with no forged deeper-Nose bonus (CLI0).

Real Ghosts/Combat and a fresh owned local Worker passed21 protocol checks/CLI0:
new outside-core2HP, public/local health, body1, nearest body/obstacle/miss, legacy
client/invalid/crouch fallback, one low-HP kill UUID/award/reset and replay
idempotence on all four server-generated hairstyles. Fixture aiming reads actual
current skinned Nose triangles and waits at most12s for an admissible natural
standing phase; it overrides no bones/pose or policy. The inspected PNG is real
marker/HUD DOM with measured receipt rows, not a rendered avatar or apartment.

After integration with published Jaw/Rear/Front dispatch, a separate actual
Ghost push/draw/wave/swing probe sampled60 canonical appearances, r2 headings
0/.8/3.14/−1.6, armed/saber/wave phases and16/600ms first-draw delays. Its
40,320 rays contained7,784 outside-core actual Nose positives,29,976 Nose-first
contacts, no nearer-other/hidden-extra contact and no mismatch; CLI0/errors0.
This is not an observed arm-forgery case. The independent3940 hidden-contact
negative inventory remains the observed occlusion evidence. Earlier controlled
Avatar-pose runs are separate diagnostics: the first CLI1 required a hidden
contact it never found; neither is actual Ghost paused-wave acceptance.

The bounded safe family landed in bee59bb; further exposed band/pose surfaces
are tracked independently in #937 (inherited medium), rather than being marked
covered or silently accepted. #920/#918/#898/#892/#879/#874 remain open.


### Rear arm-first safety (#936, restoration #941)
The actual paused Ghost.draw greeting pose can put elbowR before a deeper pureSkull
entry. A serialized96-byte r2-origin/r3-direction/r3-hc rifle proof previously
received head:true and2HP despite that first arm surface. The existing Avatar
classifier already rejects that actual arm face; no Ghost animation or model changes
are needed. The Worker independently disables only the rear region after the
target attachment has an accepted private gt. This lasts for that attachment,
including pause, hibernation and observers joining after the greeting. Wall time
does not prove that replica draws completed the wave. Invalid/self/absent/rate-
rejected greetings do not set gt; a genuinely new socket starts fresh. Core/nose/jaw
remain independent. Safe rear2HP after an accepted greeting remains #941, so the
full #936 parent stays open. This is a bounded safety fix, not full animated-world
intersection validation.

### Left temple after a greeting with immutable standing pose (#938)

A narrow left temple can additionally be confirmed after greeting only when the target's first valid state was standing and its normalized position, yaw and crouch state have never changed on that socket. The left (positive model-x) subregion stays inside the existing lateral ray, shape and 15mm entry guards; its named `greetingLeftPatch` vertical/front bounds are conservative game-policy guesses, tested against the actual unchanged Avatar/Ghosts family. The ordinary nearest-skinned-face client path still rejects a nearer arm, hair or face. The waving right side and any changed/crouched/legacy target retain #932's permanent post-greeting lateral fallback. Other head regions are independent.

This does not infer when a wave ends: paused and repeated waves remain possible. Held-weapon/suit/score changes alone preserve the history because they do not move the standing body/head; actual held-rifle and saber-swing poses are in the native verification. #935 remains open for the remaining after-greeting lateral family. There is no new geometry, animation clock, wire field, damage counter or rendering work.
