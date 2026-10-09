# Animals, audio and smart devices

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [interactions](interactions.md), [graphics](graphics.md).
## Module and test map

```text
src/cat.js             the cat: random coat, washing animation, appears/moves/vanishes behind doors
src/miele.js           Miele (#328): `HeartFireworks` (heart shells that pop into small hearts) and `MieleHeld` (a Holdable with no
                       home: the cat object rides in it, hand.js 'hug'; click / "Krama" hugs; put down she walks off)
src/olof.js            Olof (#586, OLOF): a figure with a beer can in the sofa / armchair now and then; one SkinnedMesh (rigid
                       13-bone skeleton, vertex colours, one material), posed by two-bone IK each frame (`poseOlof`, `seatedPose`)
tools/oloftest.html    headless test (#586): ?olof=0 seats him, seated pose, seat taken for visitor and cat, never turns up in
                       sight, "Vinka till Olof" scores, he answers, waves, gets up and is gone, the seat free again
tools/olofcartest.html headless test (#599): the key brings the car with Olof at the wheel (seat, hands on the wheel), "Hälsa på
                       Olof" → a dad joke, then gone; the driver's door and seat work after; back with the next call; gone when you sit in
src/audio.js           synthesised positional sound effects (Web Audio): doors, slides, meow, steps
src/pingping.js        Pingping (#269, PINGPING): the penguin cushion between the pillows in the Sovrum 1 bed, a Thing (kind 'pingping'):
                       held in both arms (hand.js `handPose: 'hug'`, `hugGrips`; the left arm = the right one mirrored); click /
                       "Krama" hugs (pulled in + squashed, sfx.squeak, rising hearts, stats pingpingHugs); `soft` = may go down on
                       the bed's / sofa's `soft` surfaces too (furniture surfaces with `soft: true`: not for cups, not cat tables)
src/catboard.js        cork board in the kitchen (under the wall clock): a real-size Polaroid (offscreen render, #225; the board's
                       size follows from CAT_BOARD.polaroid / cols / rows / gap) of every petted cat,
                       CAT_BOARD.max of them in IndexedDB 'lunden'/'catPhotos', captioned with name + time; E opens
                       #board-view (BoardPanel, #170: keep 📌 = red pin, never pushed off; throw away 🗑 asks twice;
                       arrows/S/Delete; frees the mouse like drawing); a full board drops its oldest unkept photo
src/laptop.js          Tilly's laptop on the vanity (#283, LAPTOP): an unbranded rose-gold laptop with stickers; `Feed` draws "Klipp",
                       an invented short-video app (no real brand / people) on a canvas — eight canvas clips (`CLIPS`) in a phone
                       column, user, caption, likes, progress bar — swiping up every `swipe` s; two E targets (kind 'laptop'): the
                       screen (on, then the next clip) and the keyboard (on / off); a quiet beat per clip (sfx.beat), the Sonos
                       ducked within `near` m; each clip kind counts once (stats `clips`); F / toggleFurniture switches it off
src/nest.js            smart speakers (#325, NEST): a smart display (screen + fabric base) on the kitchen window board and two round
                       ones in wall mounts (living room by the patio door, the upstairs hall), our own plain look (no logo); builders
                       `nesthub` / `nestmini`, E target kind 'nest'. `Nests` (main.js): E wakes one (four white dots / the screen),
                       sfx.nest chime, then a random answer never the same twice in a row (`choose`): the game's time (`timePhrase`),
                       date, weather, the coffee, jokes, Lund / Höje å / cat facts, pep, silliness, or a sound (fanfare, drum roll,
                       boop); speech = Web Speech sv-SE (silent when muted), a bubble over a round one, a caption card on the display;
                       the display idles with a clock + weather icon, Miele's photo now and then, dimmed by night (canvas redrawn on
                       change); the Sonos ducked while one talks near; stats `nest` (first per speaker); F hushes / hides them
src/sonos.js           music in the SYMFONISK speakers (#187, SONOS): six CC BY 4.0 channels, two recordings each, one mix
                       → a panner per speaker (walls / the other floor muffle), #sonos-panel (⏮ ⏭ ⏯ volume, reading mode);
                       `Composer` (channel sub-mix + scheduling) is shared with the car's `CarRadio` (#268).
                       Real music (#416): a channel's `tracks` (files in music/, licences in music/CREDITS.md) stream through
                       an <audio> + MediaElementAudioSourceNode into its sub-mix, fetched only when it plays (`trackSrc`
                       picks .ogg / .mp3 by canPlayType); failed formats try the alternative and then the other channel track; all failed = silent status; the
                       panel / car screen show "title – artist". Twelve studio recordings (84.62 MB combined alternatives, 96 kbps Opus / 128 kbps MP3 stereo, all full length),
                       checked/downloaded 2026-10-08. Titles/artists/source links/licences/edits in music/CREDITS.md and
                       music/index.html ("Om musiken" in the start/pause menu); original hashes in music/sources.json.
src/music.js           shared lazy MusicFile transport: format fallback, 8 s stall timeout, release media on stop;
                       MusicLoop for the positional PC/laptop and non-positional Kaffeturbo (faster near the end).
                       MUSIC in config selects tracks; the original sound effects stay synthesised. PC game/film gets
                       game/ambient music; TVs have no programme audio and remain silent. tools/musictest.html checks
                       every real Opus/MP3, audible samples, lazy loading, failed formats, mute and loop cleanup;
                       tools/musicintegrationtest.html covers appliance playback, radio rotation, shutdown and fallback
                       (click its Starta musiktest button with a real browser/Playwright click to activate iframe media); musicreloadtest checks actual saved-channel/volume reload
tools/cattest.html     headless test of cat placement behind every door/wardrobe; up on seats, beds and tables (#200)
tools/pettest.html     headless test of petting the cat (eyes, hand, stats counter, the photo; then it walks off and is gone)
tools/mieletest.html   headless test of Miele (#328, &miele): her coat, first sight (fireworks, +1000, once), taken up (both hands, not
                       hit by a shot), the board photo "Miele", a hug, not on a table, down on the floor → walks off, found again
                       (+100), F while held, the rarity (seeded draws, ~1 in 180) and the lock
tools/sonostest.html   headless test: music in all three speakers, songs, volume, panel, pause, upstairs, F; each channel
                       rendered offline (only outside --virtual-time-budget; there it says SKIP)
tools/laptoptest.html  headless test: Tilly's laptop (#283) on with E on the screen, swipes by itself and with E, every clip kind
                       counted once, off with the keyboard, not through the wall from Sovrum 2, F
tools/nesttest.html    headless test (#325): aim at the display and both round speakers, press: an answer, the wake light, the
                       caption / bubble, the (mocked) speech call, counted, the Sonos ducked, quiet after; 300 presses never repeat;
                       the time answer follows the game clock; the weather; muted = no speech; not through a wall; F hides them
tools/kittentest.html  headless test of kittens (#363): the seeded draw (~KITTEN.chance, never Miele), found (stats, points, badge), smaller
                       with paws on the floor, plays on the spot, a pat (kittenPets, more points, the photo marked), a pounce then a
                       fast scamper, a cup on the floor batted over (no deduction), hurt: faster and a bigger deduction
```

## Olof (#586)

- `Olof` (src/olof.js): every `OLOF.every` s (first after `OLOF.first`) with odds `OLOF.chance` he turns up in a free seat
  among the sofa's three (not the chaise) and the armchair — never one `canSee` reports (main.js: in the camera's view and
  not behind a wall, or within 1.5 m), the visitor's own or the cat's. Away again for at least `OLOF.away` s after leaving;
  F (furniture off) sends him away. All timings and odds are *guesses*.
- While he sits there his spot's `taken` is true (rest.js: the visitor cannot sit on him) and `cat.seatTaken` keeps the cat
  off it. He sips now and then (the can to the lips, the head back).
- Looking at him gives "Vinka till Olof" (kind `olof`, an invisible pick box round the seated figure; only while he sits):
  your line ("Hej Olof!") at the bottom, his goodbye in a bubble over his head (greet.js `sayMine` / `say`), stats `olof`
  (SCORE first 25, again 5), he waves back with the free hand, gets up, turns and steps off fading out.
- The figure: one SkinnedMesh, every vertex weighted to one bone, so one draw call (+ the shadow pass). `poseOlof` takes
  hip height / forward, lean, head pitch, ankle targets and wrist targets with a pole each; `seatedPose` builds those for
  a seat height (`OLOF.forward` per seat: the armchair's cushions push him forward). Reuse it for other seats (#599).
- `?olof[=i]` seats him at once (i: 0–2 the sofa, 3 the armchair), even in sight (tests, screenshots).
- At the wheel (#599, `OlofDriver`): a second instance of the same figure, a child of the car's group, shown when the key
  calls the car (car.js `call` → 'arriving'); `drivingPose` puts his hips on the driving seat's cushion, the feet at the
  pedals and both hands on the wheel (`OLOF.car`, placed by eye; the can's vertices collapsed into the fist). Parked,
  "Hälsa på Olof" (kind `olofcar`, a pick box out through the driver's window above the door handle so the door still
  opens): your hello, a dad joke from `OLOF.car.jokes` in a wrapping bubble (`.say.long`), a wave, then he fades out
  (stats `olof`, id `car`). He is also gone when the visitor sits down in the car and when it is back in the garage;
  the next call brings him again. The sofa Olof does not turn up meanwhile (`olof.busy`). `&car&olofcar` for screenshots.

## Cat and sound

- Opening an interior door/wardrobe: 30 % chance a cat appears on the far side (random free
  floor spot visible from the doorway, or inside the wardrobe). Close + reopen that door:
  50 % it's gone, else it moved. A cat appearing from nowhere gets a new random coat.
- Breeds (`BREEDS` in cat.js) have a weight and a shape (size, fluff, ears, muzzle, tail); perser
  and sphynx are `rare` and count as "ovanliga katter". `&catb=i` picks a breed for screenshots.
  Rare breeds have a `voice` ('trill' perser, 'rasp' sphynx) passed to `sfx.meow`/`sfx.purr`, and
  stars (one additive `Points`, raycast disabled) rise around them while they are petted.
- Look at a visible cat + E pets it: purring (`sfx.purr`), eyes shut, head rubs the visitor's hand
  (`PET_TIME` in cat.js). Raycasts ignore visibility, so main.js only adds the cat as a target
  while it is visible. Tests must call `updateMatrixWorld` on objects they move (no render runs).
- Room detection: labels come from the PDF plus `EXTRA_ROOMS` (WC/dusch upstairs, the passage by
  the stair = Hall); `ROOM_DIVIDERS` split open-plan areas (hall | kitchen | passage | living room).
- Walking (#224, `CAT_WALK`, `pose` in cat.js): the cat blends between two poses (`POSE.sit` / `POSE.stand`, size-1 local
  metres; the legs are turned, tapering `limb`s, #241): it rises in `rise` s before it walks (fish fingers, leaving after a pat) and sits down again when it stops;
  standing, the hips (hind legs on hip pivots: haunch + a hock pivot with shin and paw) are at shoulder height, the back
  level, the tail up. Behaviours set `wantStand`, call `stride(m)` for the diagonal-pair gait and put head offsets in
  `headOff`; `pose` runs after them every frame (the tail tube is rebuilt only while the pose changes). `&catwalk` (with
  `&cat=`) = walking on the spot.
- Tail up (#262, `CAT_TAIL_UP`, `updateTail` / `tailIdle` in cat.js): now and then (sooner while it is on its feet, and
  `leave` of the times it walks off after a pat) the cat gets up, raises its tail straight up (`TAIL_UP`, blended over either
  pose; the tube is rebuilt while `tailU` changes), turns round on the spot and a small dark X (`parts.butt`) shows under the
  tail root; sitting it never does, a pat lowers it. Seen from behind (`buttFacing`: within `cone`° and `dist` m, main.js
  `checkCatButt`: on screen, not `behindWall`) it counts once per tail-up (`tailPeriod`): stats `catButts`, SCORE.first per cat.
- Miele (#328, `MIELE` in config, `MIELE_COAT` + the BREEDS entry 'Miele' with `superRare` in cat.js, src/miele.js): the family's
  own cat (the photo on the Sovrum 1 window board, #322), a brown mackerel tabby and white (docs/miele-foto-ram.jpg): the tabby
  is painted on canvases (`tabbyTextures`: the coat material's map — white below the middle, stripes, a white V up the face —
  and rings on the tail), the rest plain colours; amber eyes. Drawn by her BREEDS `weight` (~1 in 180 cats), never through
  `&catb`; `mieleLock` keeps a second one out until she has walked off. Named "Miele" always. First seen (main.js
  `checkMiele`: within `see` m, on screen, not `behindWall`) once per time she turns up: heart fireworks, a trill + pling,
  stats `miele` (SCORE.first 1000, again 100), "💖 Du hittade Miele!"; not counted as a found cat / breed. E takes her up
  (`cat.pickUp` into `MieleHeld.model` in the camera; pet only with the hand busy): held she sits, paws forward, looking up,
  no fish fingers / leaving / tail-up, out of the E and weapon raycasts (`cat.held`); click / "Krama" hugs (stats
  `mieleHugs`); her board photo the first time she is held or hugged. E on the floor / a bed / a sofa (`softOnly`: a table
  says "Miele får inte vara på bordet") puts her down (`putDown`): she looks at you, meows, then `leave`s; F or another
  thing in the hand puts her down at your feet. Not kept across a reload while held / walking off.
- Every new cat gets a name (`CAT_NAMES`); petting it puts a photo on the kitchen board 0.7 s in
  (`CAT_BOARD` in config: under the wall clock on the Tvätt/Badrum wall, kitchen face; it and the calendar are
  positioned together, centred under the clock).
- Up on the furniture (#200, `CAT_FURNITURE`, `furnitureSpot` in cat.js): a cat turning up behind a door sits on a seat,
  bed or table top in that room `chance` of the time (one seen straight from the doorway within `reach`; the height from a
  ray down onto the furniture, so it sits on the cushion and never in something on a table; `cat.on` = 'sit'/'lie'/
  'table'). `chooseSpot` skips the seat it is on; after a pat it fades where it sits; it ignores fish fingers up there.
- Kittens (#363, `KITTEN` in config): a new cat (any breed and coat, never Miele) is a kitten with `KITTEN.chance` (~1 in 30,
  *guess*; `cat.kitten`, `setCat(breed, coat, kitten)`); the same parts and POSE re-proportioned by `shapeOf` (× KITTEN.shape:
  half size, bigger head / eyes / ears, short muzzle, short legs — `legs` lowers the body in `pose` — a thin short tail,
  fluffier); a squeaky 'kitten' voice (`sfx.meow` / `sfx.purr`); named from `KITTEN.names` or "Lilla …"; up on the furniture
  more often. It plays on the spot (`updatePlay`: pounce with `hopY`, tail chase, batting; never moves), after a pat may pounce
  at you (`leaving.pounce`) and runs `KITTEN.run` × faster (hurt too), and bats a cup standing on its floor over (`updateToy`,
  main.js `toySource` / `onTip`: emptied, a splash, no deduction). Stats `kittens` (SCORE.first / again) / `kittenPets`
  (SCORE.each, on top of `petted`), the "🐾 Kattunge!" badge, a "kattunge" tag on its board photo, `kittenShot` deductions.
- Hurt (#288, `hurt(weapon, from)`, CAT_HURT): a rifle bullet, a dart, the lightsaber or a wand's magic on the cat makes it
  hiss (`sfx.hiss`) and run off (`leave`, faster, no pat stops it), once per flight; no cat turns up behind a door for
  `away` s; `onHurt` → a deduction. Nothing graphic.
- After a pat (#206, `CAT_LEAVE`, `leave`/`updateLeaving` in cat.js) the cat turns, walks off away from the visitor along
  the clearest straight line (walls, doors, furniture) and fades out (its materials are transparent at opacity 1 all
  the time: no recompile); petted again on the way, it stays. The board photo is taken 0.7 s of game time into the pat
  (`cat.onPhoto`).
- Fish fingers (#163, `CAT_FISH`, `updateFish` in cat.js): a visible cat scans `cat.fishSource()` (the fish fingers
  lying out) for one on its own floor within `reach` with a straight, wall- and door-free path (= the same room),
  turns its head and meows, gets up and walks there, eats it (head down, it shrinks,
  `sfx.chew`, then a purr) and washes again; taken up first → it looks at the visitor. Petting, hide and a new spot
  cancel it. Counted as `catFish` in the stats.
- Interaction raycasts only test pickables, so `behindWall` in main.js rejects hits whose eye →
  hit line crosses a wall outline (`levels[i].wallSegments`) or a slab / ceiling outside the stair hole (`throughSlab`, #446) — no
  switching lamps through walls, no bed upstairs through the kitchen ceiling.
- Kitchen (#221): the under-cabinet LED ("bänkbelysningen", a rocker under the first wall cabinet after the cup cabinet)
  and the hood's light (a button on the hood's front) are lamps of their own in `world.lamps` (lights.js FloorLamp with
  `glows` = additive washes on the worktop/splashback, `light` = pool-light overrides), not the room's switch. #271: their pool lights sit under the cabinets / hood, weak and away from the tiles, the washes ease
  out and fade at the ends (`KITCHEN.underLights`), the splashback is matt (roughness 0.82) — no glare spots or hard edges.
  #285: the bench light is one continuous 1 cm strip behind the front edge of every wall cabinet (cup cabinet → sink →
  corner → the return over the corner unit), one even wash per run (ends at the hood cross-fade with the hood's wash, ends
  in the corner do not fade), and two weak pool-light anchors (FloorLamp `anchors`: [{ offset, height, light }], one
  candidate each), one over each run, so the sink is as lit as the hob end.
- Lights: switches are placed automatically by the latch side of each interior swing door (room
  side), snapped onto a wall outline segment that faces the room and covers the whole plate (`wallFace`,
  #76; lighttest checks every switch has a wall right behind it) plus `LIGHTING.manual` for open rooms and the downstairs Klk (door spans the whole wall).
  Lamp emissive parts use one material per room (`lampMaterials` in interior.js). Extra additive glows register
  with `addLampGlow` (switched by opacity); a material with `userData.lit` keeps its own lit colours (Sovrum 1's black
  string shade, `style: 'string'` in `LIGHTING.pendants`, #174). Never add
  per-lamp PointLights — reuse the pool (constant light count = no shader recompiles).
  Small lamps vs ceiling lamps (#234): everything in `world.lamps` (furniture `lights` + interior `mirrorLamps`: the floor
  lamp, the NYMÅNE work and bunk reading lamps, the SYMFONISK lamp, the BESTÅ spots with their washes — a lamp of their own
  now, E on a spot — the bench light, the bathroom mirror LED) is a `FloorLamp`; unless its spec has `auto: false` (the
  cooker hood's light) it goes on below `LIGHTING.auto.on` daylight and off above `.off` with a `fade` (also when the clock
  is spooled); an E toggle holds until that state next changes (`updateAuto`). None of that depends on where the visitor
  is, and since #276/#294 neither does how a lit lamp looks: its light in the shaders (`src/lampwash.js`) lights its room
  (furniture too) whether the visitor is near, in another room, on the other floor or outside (lit windows all night), and
  cross-fades with its pool light; the ceiling lamps have it too (#295: a room lit by its switch is lit from anywhere). A
  lamp spec's `wash` scales it. The lit parts of every lamp (materials tagged `userData.lamp` by lights.js) are never culled
  as small detail (#294). lighttest checks every room switch: glow, a pool light standing in the room, its wash on/off.
  The ceiling lamps start off and follow only their switches. The pool (`update`) gives the few lamps that matter real
  point lights (specular glints) instead of their shader light: candidates are scored by distance, × `poolPick.otherRoom` outside the visitor's room
  (rooms.js), × `hidden` behind a wall/door leaf (a lamp behind a wall in another room gets none: it would only shine
  through the wall), × `behind` for one behind the look direction (#276), ÷ `stick` for the lamp already held; a pool light that moves fades out and in over `poolFade`
  (the old nearest-4 jump made a lit room go dark as you walked out of it).
- Day cycle: `DAY` in config. Every visit starts at the browser's own time and date (#95; `&time` /
  `&month` / `&day` override, `&month` alone = the 15th); the date rolls over at midnight. The sun
  position is computed (declination, hour angle, equation of time, CEST in summer) for Lund and
  rotated into plan axes by `DAY.planNorth`. The wall clock in the kitchen (centred on the wall between the hall and the Badrum door, over the cat board + calendar) opens a strip at the bottom
  (`reading` mode, so no walking, but looking works): hold A D / ← → / ⏪ ⏩ to spool, Space / ⏸ pause. The
  date is picked on the cat calendar beside the cat board (`src/calendar.js`, `CALENDAR`): E opens
  #cal-panel, A D / ← → / ◀ ▶ months, W S / ↑ ↓ days (held keys repeat; a key already held while walking up is ignored), or click a day. The neighbours' windows are one instanced additive mesh with a
  random evening/morning routine per window (`buildWindowLights` in surroundings.js).
- Trees (#130): big old trees with several crown lobes by the school (`SITE.bigTrees`), slim young maples along our
  pavement (`treeAreas` `young`), a shrub row (`SITE.shrubs`); all lobes are one instanced mesh coloured by the season.
- Seasons (#73, `SEASON` + `src/seasons.js`): crowns get a colour per month (fresh, deep green, mixed autumn
  per tree, bare in Dec–Feb; some blossom in Apr–May) and in `SEASON.snowMonths` registered materials
  (`registerSnow`: lawn, park, roads, paving, hedges, roofs) turn white. Only colours/instance matrices
  change, once per month change (`applySeason` in the loop).
- Statistics (`src/stats.js`): cats found per coat, cats petted, doors, toilet lids, steps/metres,
  stair trips, time inside; reset on the start screen.
- Sound effects are synthesised and positional; music uses lazy licensed recordings; unavailable media stays quiet (#500). The AudioContext is started by the
  start-screen buttons (browser autoplay rules). M / the speaker button mutes.


Cat placement test (#542): chance.appear=1 guarantees an attempt, not a safe spot from roomSpot's bounded random search. tools/cattest.html checks every successful placement and requires each door side to receive a cat across the two fixed furniture seeds; a single exhausted search is reported with door coordinates, side and seed. A placement regression affecting both seeds still fails.

Closet cat floor (#542): roomSpot uses stairUnderside with CAT_FLOOR_HEADROOM (0.8 m assumed resting-cat clearance) for Entréplan floor below flight B/winders. It still excludes flight A's solid/low underside and the upper-storey stair footprint. Previously rejecting every stairHeight footprint left only a narrow west strip in the Klk; seed 4242 from west of the door (centre 3.3514,6.15435) missed it in all 120 attempts. cattest retains this regression and checks actual lowest/highest visible vertices against the floor/soffit, at least one cat below the high soffit, and no upper floor cat in the stair hole.

Miele fireworks verification (#547): mieletest observes spark colours over the first three seconds rather than sampling only at the end (the random 0.65–0.95 s pop times can leave no sparks then). Separate checks retain single counting and eventual expiry; deterministic random endpoints cover both extremes. ?only=fireworks scopes the browser test to coat/discovery/hearts without carrying/photo/rarity loops. Production effects/timing are unchanged.

Music refresh (#500): all twelve #416 recordings are retired; previous-sources-416.json preserves original source history. Josh Woodward instrumental pop/folk/rock, Kevin MacLeod bossa/jazz/ukulele and Scott Buckley piano/cello/strings replace them. Stable channel ids/order retain saved index meanings despite Lugn pop/Lätt och glatt/Pop och rock names. Full-length stereo and higher encoding rates are explicit changes, not re-encoding of the retired files. CREDITS.md, sources.json and the public credits page include CC BY 4.0 attribution, source/artist links, original hashes and processing notices; preview controls preload nothing. Composer removes generated CHANNELS and makes a bounded attempt at both channel recordings before a load status. PC/laptop/Turbo remove their generated fallback scheduling; their visual/game flows continue with unavailable audio. Browser tests cover all 24 formats, lazy requests, mute, channel rotation, touch controls, failed streams with zero generated oscillators, media shutdown and real saved-state reload. Human listening review remains outstanding; these technical checks do not establish subjective musical quality.
