# Animals, audio and smart devices

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [interactions](interactions.md), [graphics](graphics.md).
## Module and test map

```text
src/cat.js             the cat: random coat, washing animation, appears/moves/vanishes behind doors
src/miele.js           Miele (#328): `HeartFireworks` (heart shells that pop into small hearts) and `MieleHeld` (a Holdable with no
                       home: the cat object rides in it, hand.js 'hug'; click / "Krama" hugs; put down she walks off)
src/fireworks.js       midnight fireworks over the block (#1200, FIREWORKS in config): `init`/`start()`/`update(dt)`; a pool of rockets that burst
                       into sparks (two additive Points = 2 draw calls; phone `?lowmem` uses fewer), each burst lifts the existing hemi/ambient
                       light for a moment (no new or shadow light; called after `day.update`), `sfx.firework` (launch / bang / crackle) plays at
                       a stand-in position ≤ `soundDistance` m away, delayed by distance/340. `?fireworks` starts it 4 s after load (add `&time=0`
                       for night); #1199's midnight trigger calls `showFireworks.start()`. Game feature: not carried to the public downstream.
src/olof.js            OlofDriver only (#900): existing car driver/greeting; the skeleton and pose/IK exports also serve Avatar.
                       #1156: `buildOlof` draws him with the players' Avatar in a fixed look (`olofLook`: OLOF.look + OLOF.colors;
                       top = TOPS[10], a grey beard via the look's `beard`), one SkinnedMesh/draw call like one player, no shadow;
                       his mouth follows the joke (main.js passes `olofDriver.avatar` to greet.say, `Avatar.updateMouth`).
                       No indoor Olof constructor or seat reservations.
tools/oloftest.html    car-only regression (#900): legacy ?olof=0 cannot spawn/reserve indoor seats; normal updates, driver geometry,
                       arrival, greeting/score and saved parked-car restoration; #1156 his Avatar look and the talking mouth.
                       Original car sequence stays in olofcartest.
tools/olofcartest.html headless test (#599): the key brings the car with Olof at the wheel (seat, hands on the wheel), "Hälsa på
                       Olof" → a dad joke, he sits on (again: new joke, no points); the car drives off with him; the driver's door and seat work after; back with the next call; he stays when a door opens and when you sit beside him (#663), a restored parked car has him, the driving seat is free only in the garage
tools/carsoundtest.html headless test (#664): rain level (AnalyserNode RMS) outdoors / in the car with a door open / all doors shut, gradual change, mute, no streaks in the cabin (needs `--autoplay-policy=no-user-gesture-required`)
src/audio.js           synthesised positional sound effects (Web Audio): doors, slides, meow, steps; #604: `mainsBuzz` (100 Hz buzz +
                       thickening crackles), `fuseBang`, `breakerOn`
src/pingping.js        Pingping (#269, PINGPING): the penguin cushion between the pillows in the Sovrum 1 bed, a Thing (kind 'pingping'):
                       held in both arms (hand.js `handPose: 'hug'`, `hugGrips`; the left arm = the right one mirrored); click /
                       "Krama" hugs (pulled in + squashed, sfx.squeak, rising hearts, stats pingpingHugs); `soft` = may go down on
                       the bed's / sofa's `soft` surfaces too (furniture surfaces with `soft: true`: not for cups, not cat tables)
src/catphoto.js        `snapshot` (the 4:3 offscreen render of a cat's head, a JPEG data URL) that main.js `cat.onPhoto` / `miePhoto` take for a card.
                       The kitchen cork board (src/catboard.js, CAT_BOARD, BoardPanel #170) was REMOVED in #1255 once the binder showed the migrated photos;
                       its IndexedDB 'catPhotos' is left untouched (read once by catcards.js `migrate`, never written any more).
src/catbinderprop.js   the binder as an object (#1255, `CAT_BINDER`): a small ring binder (cover, spine, sheets, a gold paw; three flat-colour
                       materials merged into three meshes, no texture, no light, no shadow caster) lying on the coffee table's slat shelf; built by
                       furniture.js `coffeetable`, so it is the table piece's child and moves with it (F rearranging, saved layouts). Target kind
                       'binder' (E / the action button); `occluded()` refuses a pick through the table top from above (the pick ray has no table in it).
src/catbinder.js       the browse UI `BinderPanel` (#binder-view, main.js `showBinder`, frees the mouse like the old board panel): one page per breed
                       (Miele last, an unfound breed is a "???" placeholder with "Plats n av 8"), then an "Äldre foton" page when old photos exist;
                       the card (name, tier text + points, weight, facts, found / pat / hug
                       counters; rarity visuals #1256: `fx-N` class + CSS layers by tier, see Graphics) and CAT_CARD.max photo places. ← → / A D / Home / End / dots / swipe / Nästa–Förra; E / Esc / × close. Test: `tools/bindertest.cjs`.
                       Photo menu (#1257, the last part of #1249; DOM + CSS only, perfcount unchanged): every photo has `Spara`/`Sparad` (aria-pressed toggle = the card's `saved` flag, a saved card is never rotated out;
                       persisted by the existing 'catCards' store) and `Kasta` (opens `.confirm`, the safe "Behåll" has focus; "Kasta" deletes the card). Tapping a photo or the card's "Visa foton (n av 5)" opens it enlarged
                       (`.viewer`, ‹ › / ← → / swipe browse the page's photos, same Spara / Kasta). `back()` (E / Esc, wired in main.js) closes the question, then the enlarged photo, then the panel. The card line `slotline`
                       says what the next find does ("byter ut det äldsta osparade fotot (X)", that photo is outlined + badged "Byts ut först"; all saved: red "Alla platser är sparade…"). `CatCards.onNotice` ({type:'rotated'|'full'})
                       drives the in-game toast `#cat-notice` (main.js `catNotice`, `CAT_CARD.noticeS` *guess*): "…det äldsta osparade fotot (X) byttes ut" / "alla fem kort … är sparade, det nya fotot lades inte till. Kasta eller avmarkera…".
                       Model helpers: `nextOut(breed)`, `isFull(breed)`, `savedCount(breed)`. The legacy page has the same buttons (no limit there). Buttons are ≥ 44 px; the viewer is a row (photo + buttons) at max-height 520 px.
                       Rarity visuals (#1256, UI only — no texture, light or draw call; perfcount unchanged: 507 calls max at 'park'): `CAT_CARD.fx` (level / ★ count / tilt per tier, *guess*) →
                       `decorate()` in catbinder.js adds `fx-0..4` (+ `miele` for the `star` breed) and aria-hidden layers (`.foil`, `.shine`, `.glitter`, `.holo`, `.star-fx`); the CSS is in index.html.
                       0 plain · 1 coloured border + glow · 2 foil + shine band + ★ · 3 glitter + holographic sheen + more ★ · 4 rainbow frame, gold foil, most ★ (Miele extra ★ and a ★ after the name).
                       Pointer / touch movement tilts the card and moves the sheen (CSS vars --rx --ry --mx --my); prefers-reduced-motion: no animation, no tilt, the still layers stay.
src/catcards.js        cat card binder data model (#1249, part 1 of 4 — #1254–#1257, all delivered: binder object + UI #1255, rarity #1256, photo menu #1257, all above). No DOM: one slot per BREED (`CAT_CARD.breeds`, Miele last;
                       a game cat is random — breed + coat + random name — so there are no fixed individuals), points from SCORE (breeds;
                       Miele `first.miele` 1000), rarity tier = highest `CAT_CARD.tiers` entry reached (common <30, ovanlig 30–99, sällsynt
                       100, episk 250, legendarisk = Miele). A card = a photo of a find; max `CAT_CARD.max` 5 per breed, a new one rotates
                       out the oldest unsaved, all saved → not added (`add` returns null). Counters: finds = `stats.byBreed` / `stats.miele`,
                       pats / hugs = new `stats.petsByBreed` / `stats.hugsByBreed` (main.js `cat.onPet`, `miele.onHug`). Cards in IndexedDB
                       'catCards' (idb.js version 3), written by main.js `cat.onPhoto` / `miePhoto`. The old
                       'catPhotos' are COPIED in once (`migrate`, flag `lunden.catCards.migrated` in RESET_KEEP, ids `legacy-<id>` so no
                       duplicates): kept → saved, 'Miele' → her slot, the rest (no breed was stored) → the legacy page (`CAT_CARD.legacy`),
                       none deleted. Weights / facts in CAT_CARD are typical breed figures, all *guess*. Test: `node --test tools/catcardstest.mjs`.
src/laptop.js          Tilly's laptop on the vanity (#283, LAPTOP): an unbranded rose-gold laptop with stickers; `Feed` draws "Klipp",
                       an invented short-video app (no real brand / people) on a canvas — eight canvas clips (`CLIPS`) in a phone
                       column, user, caption, likes, progress bar — swiping up every `swipe` s; two E targets (kind 'laptop'): the
                       screen (on, then the next clip) and the keyboard (on / off); a quiet beat per clip (sfx.beat), the Sonos
                       ducked within `near` m; each clip kind counts once (stats `clips`); F / toggleFurniture switches it off
src/nest.js            smart speakers (#325, NEST): a smart display (screen + fabric base) on the kitchen window board and two round
                       ones in wall mounts (the living room's west wall by the patio door corner, #689; the upstairs hall), our own plain look (no logo); builders
                       `nesthub` / `nestmini`, E target kind 'nest'. `Nests` (main.js): E wakes one (four white dots / the screen),
                       sfx.nest chime, then a random answer never the same twice in a row (`choose`): the game's time (`timePhrase`),
                       date, weather, the coffee, jokes, Lund / Höje å / cat facts, pep, silliness, or a sound (fanfare, drum roll,
                       boop); speech = Web Speech sv-SE (silent when muted), a bubble over a round one, a caption card on the display;
                       the display idles with a clock + weather icon, Miele's photo now and then, dimmed by night (canvas redrawn on
                       change); the Sonos ducked while one talks near; stats `nest` (first per speaker); F hushes / hides them
src/lightmodes.js      light modes from the speakers (#1176, LIGHT_MODES): E opens a menu (≤ 4 rows a page) — Prata (the random
                       answer), Ljuslägen … (allt på, extrabelysning, fönsterlampor), Myslägen … (mys, kvällsmys), Avsluta
                       ljusläget; Lights.preset switches the existing lamps (no new light) and holds the dusk; end = Lights.restore
                       (what the visitor switched meanwhile stays; dusk lamps catch up); power cut / F / reset release the mode.
                       Disco (#1177, Myslägen …, LIGHT_MODES.disco): extrabelysning + every small lamp a new colour each beat
                       (FloorLamp.tint: glow, pool light, wash; never `color`, so keep.js saves none; colorSnapshot/restoreColors
                       put them back except a lamp recoloured meanwhile, colorRev); quiet speakers play the `synth` channel and
                       Avsluta / another mode pause them and put the channel back only while Sonos.rev is still the disco's
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
tools/catignoretest.cjs headless test (#1154): ignored cat walks off at CAT_IGNORED.after, engagement resets, reload record
tools/pettest.html     headless test of petting the cat (eyes, hand, stats counter, the photo; then it walks off and is gone)
tools/mieletest.html   headless test of Miele (#328, &miele): her coat, first sight (fireworks, +1000, once), taken up (both hands, not
                       hit by a shot), the board photo "Miele", a hug, not on a table, down on the floor → walks off, found again
                       (+100), F while held, the rarity (seeded draws, ~1 in 68), the daily guarantee (#1134) and the lock
tools/sonostest.html   headless test: music in all three speakers, songs, volume, panel, pause, upstairs, F; each channel
                       rendered offline (only outside --virtual-time-budget; there it says SKIP)
tools/laptoptest.html  headless test: Tilly's laptop (#283) on with E on the screen, swipes by itself and with E, every clip kind
                       counted once, off with the keyboard, not through the wall from Sovrum 2, F
tools/nesttest.html    headless test (#325): aim at the display and both round speakers, press: an answer, the wake light, the
                       caption / bubble, the (mocked) speech call, counted, the Sonos ducked, quiet after; 300 presses never repeat;
                       the time answer follows the game clock; the weather; muted = no speech; not through a wall; F hides them
tools/lightmodestest.cjs headless (#1176): `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/lightmodestest.cjs BASE OUT` — the
                       menu by native E / number keys, every mode's lamps + a picture, manual change kept, dusk, power cut, F, phone;
                       the disco (#1177): colours per beat + wash, nothing saved, Hue Go choice kept, music start / restore /
                       the visitor's channel kept, another mode, power cut, F, two disco pictures (media/AudioContext state only)
tools/kittentest.html  headless test of kittens (#363): the seeded draw (~KITTEN.chance, never Miele), found (stats, points, badge), smaller
                       with paws on the floor, plays on the spot, a pat (kittenPets, more points, the photo marked), a pounce then a
                       fast scamper, a cup on the floor batted over (no deduction), hurt: faster and a bigger deduction
```

## Olof, car-only (#900)

- The indoor random actor, sofa/armchair reservation and forced `?olof[=i]` spawn are removed. Apartment seats are never
  occupied by Olof. The old constructor/appear/wave API is absent, including from the app diagnostic export.
- Shared `buildOlof`, skeleton, proportions, `poseOlof`, IK and pose helpers remain unchanged for OlofDriver and Avatar.
- At the wheel (#599, `OlofDriver`): the shared figure, a child of the car's group, shown when the key
  calls the car (car.js `call` → 'arriving'); `drivingPose` puts his hips on the driving seat's cushion, the feet at the
  pedals and both hands on the wheel (`OLOF.car`, placed by eye; the can's vertices collapsed into the fist). Parked,
  "Hälsa på Olof" (kind `olofcar`, a pick box out through the driver's window above the door handle so the door still
  opens): your hello, a dad joke from `OLOF.car.jokes` in a wrapping bubble (`.say.long`) and a wave, then he sits on at the
  wheel (#658; state back to `drive`, the hand comes down). Greeting again gives a new joke, but `claimScore()` lets only the
  first greeting per arrival count (stats `olof`, id `car`; *guess*, so it cannot be farmed). The key then sends the car off
  with him in it; `update` hides him when the car is in the garage or gone, so the next call (`show()`) brings him back with
  a fresh score. He is always in the car while it is out (#663): opening doors changes nothing, the visitor sitting down
  does not remove him (the driving seat is his: `car.driverTaken` keeps it out of `car.targets`, you sit beside him in the
  passenger seat; in the garage, where nobody is in the car, the driving seat is free), and a car restored arriving / parked /
  leaving gets him back (`update`: state `away` + `carOut` → `show()`). Only in its stall / gone is he away. Power cuts, night and light do not touch
  him. `&car&olofcar` still selects the driver for screenshots; old `&olof` has no effect.

## Carried cats on other players (#1147)

`src/ghostcat.js` reads the actual MieleHeld/cat state for the main Ghosts factory.
The optional `cat: [breedIndex, coatIndex, kittenBoolean]` state uses the existing
5 Hz movement channel, including changes while standing still. PlayerRoom bounds
both indices against the current eight-breed catalogue and forbids kitten Miele;
missing/invalid data clears the visual. Welcome snapshots include it. Older clients
ignore the field and old senders retain empty hands. No cat names, gameplay, saves
or ownership transfer are sent.

`createHeldCatVisual` in cat.js reuses the existing geometry, breed/coat and held
pose without spawning, audio or simulation. Its materials are cloned before the
shared local-cat materials are restored in `finally`. GhostCat batches visible
parts per material, shares snapshots with reference counts and releases geometry
and cloned materials on the last user's release/disconnect; shared tabby textures
remain owned by cat.js. Both arms cradle the natural-size cat. The visual follows
the final skinned hand midpoint and body heading, including crouching and the local
mirror pass. Bicycle stow removes it until the same holder is restored. It has no
interaction or combat raycasts.

Run `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/ghostcattest.cjs GAME WORKER OUT`
with `node cloudflare/dev.mjs PORT`, plus `node --test cloudflare/players.test.mjs`.
The bounded browser fixture uses actual CatSpawner/MieleHeld, the exact main state
factory, two Ghosts clients and local PlayerRoom. It renders ordinary cat, kitten
and Miele front/side, checks coat isolation, late welcome, real bicycle stow/restore,
mirror, crouched hand attachment and release/disconnect. It suppresses apartment
bootstrap; this is no full World, physical-phone or performance acceptance.
The existing catcarrytest covers the real main pickup options and local carry flow.
This personal-cat/gameplay feature does not apply to the public downstream.

## Cat put down outdoors (#1287)

A held cat goes down wherever the visitor stands outside the flat (ground, roofs, terraces, bridges: `outdoorSpot` in main.js, the
spot is level with the feet, no wall between, within reach; `cat.outdoorAt`). `cat.outdoor`: the cat sits there (`on = 'sit'`, no walk-off,
no height change), until picked up or, left alone `CAT_OUTDOOR.stay` s (600, *guess*), it fades where it sits. F in the air puts it on
the surface below (`miele.dropSpot`). Kept across a reload (keep.js `out: 1`, same spot, the count goes on). Test: `tools/catputdowntest.cjs`.

## Cat and sound

- Opening an interior door/wardrobe: 30 % chance a cat appears on the far side (random free
  floor spot visible from the doorway, or inside the wardrobe). Close + reopen that door:
  50 % it's gone, else it moved. A cat appearing from nowhere gets a new random coat.
- Breeds (`BREEDS` in cat.js) have a weight and a shape (size, fluff, ears, muzzle, tail); perser
  and sphynx are `rare` and count as "ovanliga katter". `&catb=i` picks a breed for screenshots.
  Rare breeds have a `voice` ('trill' perser, 'rasp' sphynx) passed to `sfx.meow`/`sfx.purr`, and
  stars (one additive `Points`, raycast disabled) rise around them while they are petted.
- With free hands, ordinary adult cats and kittens offer the existing action menu: Klappa first (E / click / 1), Ta upp second (2 / wheel then E / touch row), restoring direct petting (#1066). Miele keeps Ta upp first and Klappa second. Pickup uses the existing `MieleHeld` arms (#1061); occupied hands retain a single pet action. Click / Krama cuddles (ordinary `petted`/`kittenPets` plus one photo per appearance; Miele keeps her special counters). Its native cat scale and size-adjusted arm grips are preserved. Short cancellable, listener-relative purrs renew while held and stop on release, hide or bicycle stow; the same cat returns on dismount. E on the floor/bed/sofa puts it down, then it meows and walks off (on furniture it fades there). F also lets a carried cat finish leaving. Tables stay blocked. Ordinary cats remain transient, including reload during bicycle stow; the existing Miele-only bicycle save schema is unchanged. `tools/catcarrytest.cjs GAME OUT` verifies the actual cat/holder/hands/audio and exact main cat options factory in a bounded rendered scene, without full World or physical-phone acceptance.
- E / Klappa pets it (also with occupied hands): purring (`sfx.purr`), eyes shut, head rubs the visitor's hand
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
  and rings on the tail), the rest plain colours; amber eyes. Drawn by her BREEDS `weight` (~1 in 68 cats, plus the daily guarantee below), never through
  `&catb`; `mieleLock` keeps a second one out until she has walked off. Named "Miele" always. First seen (main.js
  `checkMiele`: within `see` m, on screen, not `behindWall`) once per time she turns up: heart fireworks, a trill + pling,
  stats `miele` (SCORE.first 1000, again 100), "💖 Du hittade Miele!"; not counted as a found cat / breed. E takes her up
  (`cat.pickUp` into `MieleHeld.model` in the camera; pet only with the hand busy): held she sits, paws forward, looking up,
  no fish fingers / leaving / tail-up, out of the E and weapon raycasts (`cat.held`); click / "Krama" hugs (stats
  `mieleHugs`); her board photo the first time she is held or hugged. E on the floor / a bed / a sofa (`softOnly`: a table
  says "Miele får inte vara på bordet") puts her down (`putDown`): she looks at you, meows, then `leave`s; F or another
  thing in the hand puts her down at your feet. Not kept across a reload while held / walking off.
- Every new cat gets a name (`CAT_NAMES`); petting it puts a card in the cat binder under the coffee table 0.7 s in
  (#1255; the kitchen cork board is gone, the calendar now hangs centred under the wall clock).
- Up on the furniture (#200, `CAT_FURNITURE`, `furnitureSpot` in cat.js): a cat turning up behind a door sits on a seat,
  bed or table top in that room `chance` of the time (one seen straight from the doorway within `reach`; the height from a
  ray down onto the furniture, so it sits on the cushion and never in something on a table; `cat.on` = 'sit'/'lie'/
  'table'). `chooseSpot` skips the seat it is on; after a pat it fades where it sits; it ignores fish fingers up there.
- Miele's daily guarantee (#1134, `MIELE.weight`/`MIELE.daily` in config, cat.js `MieleDaily`/`mieleExtra`/`localDay`): base
  weight 1.5 (~1 in 68 cats). Until she has been seen on the local date, the k-th new cat that day gets an extra chance
  clamp((k − grace)/(by − grace)) = 0, 0, 1/6 … 1 (grace 2, by 8, *guess*): median about the 5th cat, never later than the 8th.
  The record `{ day, seen, cats }` lives in the saved statistics (`stats.mieleDay`, `keepMieleDay`, try/catch storage); main.js
  wires it to the main cat and `checkMiele` marks her seen. A new date or a broken record re-arms it; resetting the statistics
  too. Spawners without `mieleDaily` (seeded tests) keep the pure weight draw and RNG sequence; `mieleLock`, &miele/&catb and
  "never a kitten" are unchanged. Scores unchanged: one 1000 first find, then SCORE.again.miele 100 about once a day (≈ a
  kitten's 120). Test: tools/mieletest.html (400 seeded fresh days, reset after seen, unseen-but-drawn, next day, broken record).
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
- Ignored (#1154, `CAT_IGNORED.after` 60 s *guess*, `countIgnored` in cat.js): a cat left alone that long walks off the
  same way (`leave`, away from the visitor's current position; on furniture it fades there) and is gone. Held, just put
  down, petted, after a fish finger or a kitten's cup, or already leaving resets the count; a found/moved cat starts at 0.
  The count is kept in the reload record (`keep.js` `cat.i`; older records start at 0). An unseen Miele who walks off
  frees `mieleLock` without spending the daily guarantee (#1134). There is no adoption in the game.
  `tools/catignoretest.cjs GAME OUT` (bounded scene, actual cat.js/keep.js) covers all of this.
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
  rotated into plan axes by `DAY.planNorth`. The wall clock in the kitchen (centred on the wall between the hall and the Badrum door, over the calendar) opens a strip at the bottom
  (`reading` mode, so no walking, but looking works): hold A D / ← → / ⏪ ⏩ to spool, Space / ⏸ pause. The
  date is picked on the cat calendar under the clock (`src/calendar.js`, `CALENDAR`): E opens
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


### Speaker fabric materials (#1027)

The two existing SYMFONISK bookshelf fronts, the lamp's black knitted speaker
base, both Nest mini fabric domes and the Nest hub fabric base each expose one
explicit `speaker-fabric` surface in the existing upholstery library. Six
canonical movable IDs are whitelisted in `SPEAKER_MATERIAL_IDS`; the shared
layout protocol remains version1. Each builder creates private material handles
and marks only its actual cloth part before the ordinary static merge. The
existing helper adds UV1 for metre-scaled patterns while preserving original
UV0, shape, color, map and finish for Original. There is no scene traversal or
shared/global recoloring.

Bookcase shells, control strips/buttons, IKEA tabs and status LEDs remain
separate. The lamp's smoke glass, inner glowing opal diffuser and collar keep
their materials; its independent FloorLamp still switches only the light. Nest
mounts, cords, shells, screens and animated dots keep their materials and
controller identities. The Sonos/Nests implementations and audio model are
unchanged. Saved materials use the ordinary shared UI, revisions and reload
path independently of furniture position.

### Cat carrying verification (#1061)

`PLAYWRIGHT_MODULE=/tmp/lunden-testdeps/node_modules/playwright node tools/catcarrytest.cjs http://localhost:8941 /tmp/lunden-cats1061/native3` passed 29/29 in actual Chrome 155.0.8059.39 (CLI 0, no browser exceptions). Actual cat, holder, both Hand models and Web Audio cover adults, kittens, maine coon and Miele: native scale/arm grips, continuing purr and nonzero sampled RMS, floor release with one meow and walking/fade, occupied hands, hurt flight, bicycle stow/restore, immediate hide cancellation, replacement item, ordinary-versus-Miele hug counts and Miele-only save. Original main cat-dispatch and F-hide condition are executed verbatim. Source SHA256, individual checks and raw result live in that output directory; raw CLI output is `/tmp/lunden-cats1061-run3.log`. Adult/kitten/large arms and released PNGs were opened and inspected (kitten is lifted into view without enlargement). The scene uses empty obstacle maps, so it does not certify whole-apartment navigation, complete E/touch/F event dispatch, furniture placement, physical phone comfort, production save writes or FPS. Existing obstacle-aware walking and floor/soft-only placement paths remain shared.

### Pet and pickup input regression (#1066)

`tools/catpetinputtest.cjs GAME OUT` runs complete verbatim main focus, use,
Choices, keyboard, mouse and touch listeners in Chromium with real CatSpawner,
MieleHeld and Hand. Native raycasts target each adult/kitten head; both pet and
pickup paths, occupied hands, Miele defaults and the riding guard are checked.
Screenshots show the actual desktop/touch menu. Obstacles and World collaborators
are controlled; photos are callbacks, not persisted board renders. No full World
or physical-phone claim follows from this fixture. Run catcarrytest alongside it
for rendered arms, size, purr audio, release and bicycle stow regression.

This is personal animal gameplay, excluded from the public downstream scope.

Ponies (#1280, #1293): Zoey (grey/white) and Princess (bay, black points, white star) live in the fenced paddock on the kidney-shaped meadow (environment.md, "Pony paddock"): one instanced mesh,
shader-animated legs/neck/head/ears/tail, grazing, standing and wandering, walking to the fence when the visitor is within 40 m. Not targets for rays and darts (like the gulls). **Klappa (#1293):** `Paddock.targets()` gives
one invisible pick box per pony (kept out of the scene, tested only by main.js's focus ray, `HOLD.reach`) with `userData.door` = {kind 'pony', verb 'klappa', pet()}; E / click runs `use()` → `pet()`: the arm reaches out (generic
`hand.reach`), the pony stops (`state 'pet'`, `PADDOCK.pony.pet` s), turns its head and body to the visitor, lowers its muzzle, flicks its ears, swishes its tail and (**#1320**) whinnies happily (`sfx.whinny`, synthesised; `sfx.nicker` stays for other uses), pink hearts rise from its head (`Hearts` from pingping.js, one per pony, `PADDOCK.pony.hearts/heartScale`) and `Paddock.onPet` → `bump('ponyPets')` scores 1 point (`SCORE.each.ponyPets`). Only a fresh pat counts: re-patting while it is still in `state 'pet'` renews the pose without a new whinny, hearts or point. Stats panel shows "Klappade hästar" once non-zero. **Weather (#1316):** in rain they go under the shelter's roof or a shade tree and stand there until it has been dry for a while; in the snow months they are in the stable (gone). See environment.md, "Pony paddock".
**Grazing and grass length (#1315):** the paddock's long grass is ONE instanced mesh (`paddock-grass`, `Paddock.grass`, ~3 300 crossed-blade tufts of 6 triangles on a jittered `PADDOCK.grass.spacing` grid inside the fence, no raycast, no shadows, +1 draw call, hidden with the ponies beyond `viewDist` and in `SEASON.snowMonths`). The vertex shader takes each tuft's height from a coarse grass-length mask (`Paddock.gm`, a `cell` m grid over the fence bbox, 0 grazed .. 1 long; a `DataTexture` R8, uploaded at most every `period` s) so a grazed area is flat and the rest `long` m tall. The mask starts per session with random grazed patches plus the places round the trough and shelter (`initGrass`; not saved or resumed), a pony with its head down (`state 'graze'`, neck over 1.1) crops `bite` m round its muzzle (`eatAt`), and the grass regrows `regrow`/s. `decide` makes a pony walk on to a longer place (`longPlace`: best of a few random waypoints) when the grass under its muzzle is below `hungry`, and wandering also prefers long grass; it grazes on arrival. All numbers *guess*, in `PADDOCK.grass`. Checked by `tools/grazetest.cjs` (verification.md).

Sounds from other players (#1302): the bicycle bell (B while riding, the touch button `#bell-btn` in the turn button's slot, `ringBell()` in main.js) plays `sfx.bell(null)` for us and sends
`ghosts.sound('bell')` (Worker relay: storage.md). Everything others make goes through `sfx.playAt(pos, kind, gain)` (audio.js; kinds 'bell' | 'step' | 'jet'): squared distance fade to nothing at
`SOUNDS.range[kind]` (spatialsound.js `distanceGain`), the panner's direction from the camera listener, at most `SOUNDS.maxVoices` (8) at once (`VoiceCap`), silent when muted / before the audio unlock.
Footsteps and the jetpack roar are derived in `Ghosts.soundTick` from each ghost's interpolated speed, crouch, pose, `bk` and `jp` (no extra traffic, no per-frame allocation): one step per stride within 25 m
while walking on the ground, a roar burst every 0.35 s from the 2 nearest thrusting ghosts. Shots already sound through `combat.remote` (`sfx.nerf`). Tests: `node --test cloudflare/spatialsound.test.mjs cloudflare/players.test.mjs`;
`node tools/playersoundpeertest.cjs GAME WORKER` (real Ghosts clients through `node cloudflare/dev.mjs PORT`) and `node tools/bellapptest.cjs GAME WORKER` (the whole app on a phone context: B / the button ring, not riding: nothing).
