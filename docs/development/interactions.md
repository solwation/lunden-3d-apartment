# Interactions, controls and HUD

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [life](life.md), [storage](storage.md), [verification](verification.md).

Clubhouse devices (#1365): `playroomDevice` targets use the existing focus,
keyboard E and touch action path. The cinema screen opens Bion with film
suggestions and search (#1475); the armrest remote is removed. The screen can
be selected from either seat row within BIO; hall and billiards-room positions
never gain the longer screen-only reach. The four computer screens open the shared
app selector (#1488). Cinema and computer chairs use normal rest reach and stand-up handling. The idle screen (#1570, `PlayroomDevices.drawIdle`) is a cinema vignette with no instruction line: the ordinary aim/action prompt says how to choose a film. While a film runs (`cinema.state.video`, read by main.js into `Playroom.setFilm`) the BIO's wall sconces and the room's ambient dim softly and the disco spots rest; switching the disco light on overrides the dimming until the film changes, while switching it off keeps (or restores) it and, dimmed, the ambient is the same with or without the disco (#1610), and the 7.1/height speakers and sconces live in `src/playroomcinema.js` (PLAYROOM.cinemaAudio / sconces, *guess*). [Device lifecycle and tests](furniture.md#clubhouse-tv-and-computer-1365).

Cinema search (#1472 first slice): the Bion dialog queries the Worker's
`/youtube-search?q=…` endpoint and renders returned titles/channels as text.
The Worker keeps `YOUTUBE_API_KEY` server-side and returns only validated video
IDs and bounded display strings. Requests require `videoEmbeddable=true` and
`videoSyndicated=true`, following the [YouTube search filters](https://developers.google.com/youtube/v3/docs/search/list#videoEmbeddable).
Opening the chooser loads short-film suggestions, with thumbnail cards and category
buttons. A request counter prevents late suggestions from replacing a newer search.
YouTube may still restrict a film for a particular account, network or region; its
player remains authoritative and reports an actionable error (including restriction151). Search is limited by the existing per-IP
Worker request limiter. Film choice, play and pause are synchronized by the Worker (#1476/#1477).
The chooser acquires exclusive control. Selecting a film immediately closes it,
restores world input and queues release after selection (#1490). The physical
screen shows a CSS loading spinner before the API/iframe is ready, until actual
PLAYING (not merely onReady); buffering restores it, errors/timeouts replace it
with a message, and stale callbacks cannot touch a replacement film. Normal
playback hides the film HUD; a local audio/autoplay activation prompt remains
available only when needed. Manual close also releases control while the film
continues on the physical screen. Viewers enable local audio separately. Tests: `node --test cloudflare/youtubesearch.test.mjs`;
two-client world playback is covered by `tools/cinemapeertest.cjs` with an isolated
local Worker and live YouTube access.

BIO film posters (#1575, `src/cinemaposters.js`): six framed posters on the BIO's north wall, south partition and east wall
(PLAYROOM.cinemaPosters, *guess*: clear of the screen, curtains, passage, signs and #1570's sconces/speakers) show the day's
*trailers* (#1591: only short videos titled "trailer" from allow-listed channels, at most two per channel; #1663: half children's films, half current cinema films from Swedish distributor/cinema channels, a new deterministic pick every day) from the Worker's `GET /cinema/posters` ([cloudflare/README.md](../../cloudflare/README.md#bions-affischer-1575)).
Each shows the video's own `i.ytimg.com/vi/<id>/hqdefault.jpg` thumbnail (that host answers `Access-Control-Allow-Origin: *`, so
no image proxy is needed) and its title, painted on one canvas atlas; the frames join the room's furniture batch and the faces are
one extra MeshBasic draw inside (none outside), dimmed with the sconces while a film runs. The atlas is repainted only when the list
changes. The fetch starts when the visitor enters the playhouse (8 s deadline; once a day after a success, a failure waits 5 minutes);
start-up never waits for it. Fallback: the last good list in localStorage `lunden.cinemaPosters` (`v: 3`), else generic "Snart på bion"
posters whose pick boxes are hidden (not clickable). E / click / the touch action button on a poster (prompt "visa trailer", button "Visa trailer") calls
`CinemaPlayer.playPoster(id)`: claim if the screen is free, the ordinary `choose` → `select`, release: the same `RoomCinema`
ownership and sync rules as the dialog; a refusal shows the dialog's wording as a badge (`cinema.onNotice`). Ids are
pattern-checked again in the client; titles/channels are drawn on the canvas or shown as `textContent` only. Test:
`tools/cinemapostertest.cjs` (fallback, live list, desktop E, touch, refusal, saved list, draws).

Clubhouse music (#1664): speakers have no target. The DJ booth's separate `djControl`
targets use E/click or a direct short touch tap on the surface. `DJInput` owns only
these new key/tap handlers; main supplies focus, readiness, wall checks and ordinary `use`. ←/→ on a record changes
only its track; on a fader/master it adjusts the value. Each record also has physical
previous/next buttons for touch. Crossfader/channel rail taps choose the tapped position.
A drag remains camera look, and secondary/cancelled touches do nothing. All controls
are labelled on the table, with track displays and concise prompts; there is no DJ HUD
choice menu. See [audio](animals-audio.md#dj-bench-physical-two-deck-controls-1664).

Cats (#1061): free-hand E / touch action takes adults and kittens into both arms; click / Krama cuddles, E on floor/bed/sofa puts them down. Occupied-hand E still pets. The shared `MieleHeld` preserves cat scale and adjusts hug grips; carry purrs cancel on release/hide/bicycle stow. See [animal behavior and verification](animals-audio.md#cat-and-sound).
## Two-point measurement (#1069)

`Measure.active` is an explicit mode, including before the first point. Q and
Mät avstånd toggle it; two locked crosshair clicks or canvas taps choose actual
visible mesh surfaces. Another pick starts a new pair; disabling clears both.
Visible glass is included; hidden ancestors and invisible face materials are
excluded. Core/garage targets accompany the apartment. The approximate-model HUD
retains Swedish metres and the original horizontal/vertical breakdown. Movement
and look stay available; primary mouse/touch actions, right-click and E/choices
cannot also use a door or held item. Touch drag/cancel does not pick a point.

`tools/measureinputtest.cjs` exercises actual main/World with native pointer lock
and mobile touch. `tools/measurecomponenttest.cjs` checks ray visibility and exact
known geometry in WebGL. [Evidence and limits](../validation/issue-1069/README.md).
The public viewer already supplies this interaction; no downstream import applies.

## Touch action layout (#1057)

`#touch-controls` in the native index groups gameplay controls at the lower right
(current slot layout: [thumb-arc placement (#1089)](#thumb-arc-placement-1089-part-3-of-1082)).
The primary contextual action has a reserved corner band; jump/crouch stay just above it.
Equipment uses named slots, so enabling lives or a jetpack never relocates buttons below
the top badges. Action choices replace the primary action with two columns and bounded
vertical scrolling, retaining full labels and every choice. Grid gaps pass through to the existing right-side look
input; buttons retain their original IDs/listeners. Desktop choice placement is unchanged.

[Apple Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls)
recommends thumb-reachable frequent actions, safe areas, meaningful symbols and
contextual visibility; it also describes left movement, direct right-side camera
panning and a floating thumbstick. Those existing input conventions remain.
[Android accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)
recommends at least 48dp touch targets. Our web layout uses 56 CSS px icons, or
48 CSS px below 376px viewport height, with 8px separation and safe-area offsets.
These are practical CSS layout choices, not measured physical dp/pt equivalence
or a claim of platform compliance. Existing pressed/toggled feedback remains.
No handedness setting existed in #1057; the own layout (#1090, below) adds mirroring for left-handers.

`tools/touchlayouttest.cjs` checks native DOM masks, safe areas and CDP multi-touch
using actual `setupTouch`; complete main action/jump listeners retain press,
release/cancel/leave semantics with recorded collaborators. `hudlayouttest.cjs`
also checks real Combat lives against the controls. Neither is a physical-device
comfort test or a performance benchmark. The report's original image shows the
street without controls; placement decisions are based on the implementation and
guidance, not inferred from that image.

### Touch look and scale (#1087, part 1 of #1082)

The stick and the cluster share one calm glass family in `src/hudicons.css` (`.stick-face`, `#stick`, `#stick-hint`,
`#touch-controls`): a translucent dark disc with a light rim and four quiet chevrons, a frosted light knob, and round
glass buttons (scaled symbols, soft press scale, toggled = light face with a dark symbol). The primary action stays
neutral glass (#525) as a full pill with a brighter edge. The rim lights up toward the push (`--stick-a`/`--stick-m`
from `touch.js`, a masked conic gradient) and is full and bright while sprinting (`.sprint` from main.js).
Sizes follow the layout's short side: `TOUCH` in `src/config.js` (*guess* fractions/clamps tuned by eye; 48 px floor
from #1057) → `touchSizes()` in `touch.js` → `--stick-travel`, `--touch-button`, `--touch-gap` on `<html>`, re-measured
on resize/rotation and each stick touch (root `clientWidth/Height`, since iOS can leave `innerWidth` stale, #567).
At 844×390 the knob travels 58 px and buttons are 57 px; 667×375 → 56/54; tablets cap at 84/64. CSS fallbacks keep the
old 56/48 px when `setupTouch` never runs. `#stick-hint` is a faint resting stick at the lower left whenever touch play
is on and no walking thumb is down; the real stick still floats to where the thumb lands. The touch chat reserves room
above the hint. Physical-phone comfort remains unmeasured.

### Stick feel and eased look (#1088, part 2 of #1082)

`TOUCH.stick` (*guess*, tuned by eye): deflection r = distance / travel; `stickResponse(r)` in `touch.js` gives 0 inside
`deadZone` (0.1: a resting thumb's 3–5 px wobble no longer walks), then `t^curve` (1.5) up to `full` (0.9), and 1 beyond,
so the outer tenth reliably passes `PLAYER.sprintStick` (0.95, unchanged; player.js still compares the analog length).
The direction is kept; the knob and rim glow show the clamped thumb, the glow strength the output. `follow`: a thumb
dragged past the rim moves the base after it (`#stick` left/top), so pulling back slows down at once instead of first
travelling through a dead overshoot. Drag-to-look accumulates CSS px in `touch.js`; main.js `step` calls
`touch.update(dt)`, which hands on `1 − e^(−dt/TOUCH.look.smooth)` of it per frame (30 ms: ≈ 43 % per 60 Hz frame,
≈ 94 % after 5 frames, the last 0.01 px at once), and `onLook` scales by `TOUCH.look.sens` (0.005 rad/px, the old value).
The total turn equals the finger's travel; `smooth: 0` restores raw deltas. The own layout (#1090) covers placement, size and opacity, not look sensitivity.
`tools/touchlayouttest.cjs` checks dead zone, half-push output, follow and pull-back with native CDP touches.

### Thumb-arc placement (#1089, part 3 of #1082)

The cluster is laid out around a landscape right thumb resting near the lower-right corner (`src/hudicons.css`,
absolute named slots in a zero-size anchor at `16px + safe area` from the corner, 12 px on short landscape). The primary
action is a right-anchored pill (`2.5 × button + gap` wide, one row high, 15 px text that wraps) directly under the
resting thumb. Ring 1 is a short flick up: jump straight above the pill's rounded right end, crouch beside it, and
seated Stand just left of the pill, raised half a row. Ring 2 continues the arc outwards and down to the left: measure
above jump, the held item's alternate action (power/ball) above crouch, place-turn above Stand, and a fourth column for
equipment with jetpack down/up stacked from the bottom and the web shooter above them. Every button keeps its own slot
whatever else is visible (all 32 equipment masks × seated × choices). Neighbours keep at least the `TOUCH.gap` spacing;
the space between slots still passes through to look. Action choices take the corner band from the right edge to the
Stand column (two columns; two rows when there are three or more choices, height-clamped with bounded scrolling, one row
on short landscape). Choice labels wrap only between words (#1116, `fitChoiceLabels` in `src/hudicons.js`, `TOUCH.choiceFit`):
a word that does not fit its column first shrinks the font up to 2 px, then the row spans both columns, and only below
11 px may the word be split; while they show, the slots above the band and Stand/turn move up by its height, and the equipment
column stays. At 844×390 the cluster reaches 289 px in from the right edge (66 % across) and 211 px up; on 568×320 with
44 px insets it stays right of 45 % of the width. `tools/touchlayouttest.cjs` also checks the corner band, the 8 px
neighbour spacing and the distance order from the resting thumb (jump, then crouch, then the rest). The slot geometry is
a layout choice from common mobile-FPS practice and the guidance above, not a measured reach study; physical-phone comfort
remains the acceptance test.

### Own layout (#1090, part 4 of #1082)

The CoD Mobile model: *Anpassa touchknappar* in the pause menu's settings (shown only in touch mode: `activeMode`
touch or a phone) opens an editor over the paused HUD (`src/touchlayout.js`; CSS `body.touch-editing` in
`src/hudicons.css`). The menu stays logically open (`overlay.hidden` false, so the game remains paused) while CSS hides
it and shows the HUD; every cluster button and `#stick-hint` shows with a dashed outline, the rest of the HUD keeps its
boxes but is invisible, and a full-screen `#touch-edit` layer takes all touches, so no game listener fires. Drag a
control to move it; pinch with two fingers or use the bar's *Storlek* slider to resize the selected one; *Opacitet*,
*Spegla för vänsterhänta*, *Återställ standard*, *✕ Avbryt* (also Escape) and *Spara*. Only *Spara* stores; reset
and every change before it stay a draft.

Storage: `localStorage` `lunden.touchLayout` = `{ mirror, c: { id: { x, y, s, o } } }` per device, only non-default
controls; the default removes the key. Reads/writes are wrapped (blocked storage keeps the layout for the visit).
`normalizeLayout` drops unknown ids and clamps to `TOUCH.custom` (*guess*: buttons ×0.8–1.6, so a 57 px phone button
never goes below about 46 px; stick ×0.7–1.5; opacity 0.3–1; offsets ≤ 3 short sides; 4 px margin). Each control keeps
its #1089 CSS slot, IDs and listeners: `applyTouchLayout` measures the slot centre, adds the offset (× the short side,
so it scales with the screen), mirrors about the safe area's centre line, clamps the scaled box inside the safe area
and below `#score`/`#hud-top`, and writes inline `translate`/`scale`/`opacity` (reads first, then writes). It runs on
resize/rotation (also a frame and 450 ms later), when a control's `hidden` really changes (main.js writes the same value
every frame; old/new values are compared), when the choices are rebuilt, and when the HUD shows. The default layout
writes no inline styles at all. Choices follow the primary action's offset and mirror (not its size/opacity). The
stick: `touch.js` scales `--stick-travel` by the stick's size factor, applies its opacity to `#stick`/`#stick-hint`
(the hint × `TOUCH.hintOpacity`) and, when mirrored, takes the right 45 % of the screen for the floating stick instead
of the left. `tools/touchcustomtest.cjs` checks drag, clamp, slider/pinch size, opacity, mirror (stick side and choices),
save/reload, Esc, reset, a resize to 568×320 with notch insets, late-appearing equipment and blocked storage at 844×390
and 1180×820. Physical-phone comfort remains the acceptance test.

## Current shared head contract (#974, #893, #894, #979)

Version 2 uses three shared logical head boxes from `PVP_HEAD_BOXES` in `src/config.js`:
lower, middle and a smaller crown. Dimensions are gameplay approximations, not exact
mesh anatomy. `rifleBoxHeadContact` transforms the rounded shot by heading, existing
build/height scale and a simple crouch hip/lean transform, then finds the first slab
intersection. It has no hair, eye, greeting, idle-phase or standing-history gates.
Client `Combat.rifleContact` compares the boxes with actual skinned body contacts below
`rifleHeadBaseY`; the old capsule must not swallow head hits. World obstacles still
stop the nearest contact. Contacts above the neck outside the boxes, including
cosmetic hair, are misses rather than separate damage regions.

The client sends `hc:[2,x,y,z]`. `PlayerRoom` recomputes the head intersection from its
accepted target state and rounded shot; the coordinates in `hc` do not award damage.
Confirmed head/body damage stays 2/1; range, rate, points, marker, life recovery and
kill receipts are unchanged. Interpolated client poses can differ from the server's
latest snapshot, so a predicted head hit may still receive body damage. This does
not promise exact mesh contact or lag compensation.

#893 reuses the same boxes for wand/web rays. `Combat.straightContact` preserves
existing capsule body targets and saber swing/cone eligibility; a saber receives
head damage only if its actual aim ray also reaches the selected head before a
native body surface or world obstacle. The jetpack retains its old vertical flame
footprint and target order. It may add a head contact only along its actual downward
ray, from the existing feet+1m origin, before native body/world obstruction. Offset
flame contacts remain body damage. The shared `straightBoxHeadContact` validates the
weapon/ray/range and original jet footprint; PlayerRoom recomputes the intersection.
Cached packets without a v2 contact remain body damage. The jetpack's volume-based body fallback now checks solid world obstacles (#978)
from the actual rounded flame origin to the nearest surface of its existing body
capsule, including side-offset targets inside the unchanged flame volume. The full
finite ray reaches that contact without `clear()`'s .3 m shortening. A blocked body
fallback sends no target packet and retains the existing attempt cooldown, avoiding
a repeated wall query every frame. New straight head contacts retain their separate
body/world checks; range, cooldown, damage, points and recovery stay unchanged.
Transparent and moving props keep the existing combat-world exclusion policy;
there is no new Worker world map or persistence.

Nerf (#894) reuses the same boxes along its existing falling muzzle path. `src/nerf.js`
shares the 20 ms `stepNerf` segments, floor clip and travel limit with the Worker;
the client rounds the captured launch to the existing wire precision before prediction.
For each segment it compares the head boxes with the existing body capsule clipped
above the logical neck. Body contacts outside the cosmetic mesh stay valid; an earlier
body contact prevents a later head bonus on both client and Worker. The nearest armed player
wins; the existing asynchronous obstacle check still rejects walls, including its
unchanged conservative deadline/miss behavior. A version-2 Nerf `hc` requests server
recomputation from the accepted target pose and rounded launch, not trust in the
reported contact coordinates. Cached unversioned Nerf packets retain one-heart
damage. This adds no extra message, animation-history gate or anatomical classifier.


Bow (#979) reuses these same volumes along actual arrow-tip segments. `bowflight.js`
shares gravity-before-translation with `Arrows.update(dt)`, keeping its existing
variable-frame physics, draw speeds and world-contact policy. Combat and Worker
predict with the existing20ms resolution and BOW.len tip offset, bounded by the
original range and visible flight lifetime. The nearest existing body capsule
(clipped above the logical neck) or head wins; the client tests the full finite
world ray before accepting each prospective contact, including floors. PlayerRoom
recomputes the FIRST player contact from accepted pose and rounded launch when
v2 hc is present, so an earlier body or forged body-ray contact cannot award head.
It still has no World map: real obstacle rejection belongs to the client, as for
other weapon paths. Cached bow packets without v2 retain body1. Ball is a separate
functional slice (#980). The20ms predictor is not an exact claim for every variable
frame time; representative16.7/20ms native Arrows updates retain pre-change physics.

Version 1 and its historical helpers remain only for cached older clients. The
per-polygon notes below describe that legacy contract; their refinement requirements
are superseded by version 2. Deploy the compatible Worker before publishing a v2
client. Verify with `node tools/headboxestest.cjs`, `node --test cloudflare/headboxes.test.mjs
cloudflare/players.test.mjs` and `tools/headboxesbrowsertest.cjs` (two actual native
Ghosts/Combat peers and local Worker, plus a rendered Avatar/box debug view; no full
apartment or physical-phone performance claim).

## Module and test map

```text
src/interactionoutline.js  subtle target-only material brightness, normal depth testing, no edge geometry (#531)
src/compass.js         camera-relative geographic compass; shares DAY.planNorth calibration (#528)
src/hudicons.js        shared neutral SVG icons, pressed states and accessible labels (#525); `[data-help-icon]` spans in the touch help get the same SVGs (#1612: no Unicode 12 🧎 there); `setLabelIcon` gives the remote/cinema 10 s seek buttons (`[data-remote-seek]`, `[data-cinema-seek]`) rewind/forward SVGs beside their label, keeping their aria-label (#1616)
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
src/jetpack.js         (#1250: `JETPACK.ceiling` 320 m *guess*, above the cloud deck of graphics.md; one tank of heat takes you to ~230 m)
                       (#1282: thin air, `JETPACK.thin` + `jetThin(h)` in config, *guess*: climb cap ×3, flying speed ×2.5, gravity ×0.6 between 10 and 200 m over the ground, smoothstep; ground to above the clouds 37.7 s -> 21.6 s, measured in tools/jetpacktest.html)
                       the jetpack (#359, JETPACK): our own unbranded pack (one vertex-coloured mesh) on the east wall of the portik's small room
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
                       #1241: Spider-Man mask improved with classic expressive white lenses with black frames, radial webbing from the nose bridge,
                       skull bounding box projection fix, and collapsing hair, beard, ears, and facial features under the cowl.
                       The base look/colour attribute, skeleton, head silhouette, crouch and held props are untouched; removal restores the existing
                       solid/outline appearance. A suited unarmed figure is visually solid, while Ghost.solid/HP/combat eligibility keeps its armed rule.
                       The same temporary outfit appears in the local mirror; powers/fall/combat mechanics do not change.
                       #600: with it on fall.js never hurts (a soft landing). Space / the touch jump button (#jump-btn, directly right of 🧎 in the #1089 thumb-arc touch cluster;
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
src/touchlayout.js     own touch layout (#1090): pause-menu editor, per-device localStorage, offsets/scale/opacity/mirror, clamping
src/viewport.js        early CSS-surface observer: keeps canvas buffer/camera in sync through startup rotation (#567)
src/main.js            renderer, lights, input modes, door raycast prompt/button, loop (step)
                       shortButtonLabel uses exact target-owned verbs for structural fronts, seats, taps, wiping, speakers and generic placement (#502).
                       Touch buttons/choice rows shorten only known unambiguous actions; small item/package names, specific transfer destinations and blocked reasons remain.
                       Desktop prompts keep their full context. tools/actionlabeltest.html covers actual utensils/package/transfer buttons; opentest checks all front labels.
src/rearrange.js       furniture cheat (#465): § / Enter (#596; not from a focused field/button nor in rearrange mode) / >_ inside the touch score badge opens the console; either private input unlocks rearrangement through the shared synchronous verifier (#856).
                       buildFurniture exposes stable movable ids and separates framed pictures before per-frame merging.
                       E/click selects and confirms, R/turn rotates, X/cancel abandons the local 35%-opacity ghost. Rugs never
                       carry things above them; support surfaces identify carried furniture and local Holdables/life items.
                       #1563: the laptop uses a separate rearrangement target on Tilly's vanity. After the 5 cm grid
                       and rotation, its base and open lid must fit the free top ahead of the mirror. The ordinary
                       narrow cup surface stays unchanged; the laptop also follows the vanity when it is moved.
                       Confirmed world poses update footprints, seat targets, surface heights, light anchors/washes, rug data
                       and Marks caches. Local cached authoritative layout is lunden.furniture.layout; unlock is a convenience.
                       GET/PUT /furniture uses DrawingRoom's serialized durable storage, revision-checked atomic batches;
                       conflicts cancel and pull the winning layout, previews never sync. Decorative mirrors (LINDBYN, both NISSEDAL, SKOGSGRÄNSEN, pineapple, vanity and closet) are independent
                       wall pieces with their reflectors; furniture builders expose wallMirrors, detached before layout restoration.
                       Bathroom mirrors/cabinets remain fixed. tools/rearrangemirrortest.html and tools/loosemirrorstest.html verify
                       independent movement, reflection, restoration, reload and fixed-mirror exclusion.
                       #1110: every mirror offers "byt utseende vid spegeln" (customizer.js `mirrorChoice`/`mirrorTarget`, kind
                       'mirror'): the hall wall's LINDBYN, both NISSEDAL (the entrance one via its night-light pick box: E still
                       switches the lamp, the mirror choice is row 2), SKOGSGRÄNSEN and pineapple (world.furnitureTargets, hidden with F); the
                       vanity, closet and bathroom LED/cabinet mirrors through their lamp/door options; each house's lift car
                       (liftpanel.js pick box, Hus A/B/C/L); and the visited flats' bathroom mirrors (standardinterior.js
                       `mirrorPick`, L1004/L1201; main.js `use` skips visitUse for them). The key cabinet has no glass.
                       #1141: the editor dialog (#avatar-customizer, CSS in index.html) is full-screen inside the safe area when
                       `max-height: 500px` or `max-width: 600px`: one-line header with a 44 px ✕, 44 px footer buttons, only
                       .customizer-controls scrolls; landscape puts the whole preview beside a grid of choice sections, portrait a
                       smaller preview above them. New controls (#1140) are added as further .customizer-section blocks. Desktop is unchanged.
                       #1201: the phone rotate overlay (#rotate) is hidden while #avatar-customizer is open (via :has and .avatar-customizer-open),
                       so the portrait layout is usable on phones without the rotate banner blocking the editor; closing returns the overlay.
                       #1136: the first section is a height slider (`#avatar-height`, whole cm within config.js `AVATAR_HEIGHT`, *guess*
                       100–200): it sets `look.height` (shown: the seed's own base × tall until chosen) and applies live. Avatar scales the
                       whole figure by `avatarProportions(cm).body` and a child's head bone by `.head` (larger below `adult` cm; one
                       SkinnedMesh still). main.js `setMyLook` sets `PLAYER.eye = avatarEyeHeight(look)` (settleEye eases the camera;
                       old looks keep 1.62). `tools/avatarheighttest.cjs GAME WORKER` (local `node cloudflare/dev.mjs PORT`): 120/165/195 cm
                       mirror image, a peer through the Worker and the eye height, plus old codes unchanged.
                       #1137: the body follows too. main.js `applyBody` copies config.js `avatarBody(look)` into PLAYER (`eye`,
                       `crouchEye`, `headroom` in today's adult proportions of the eye height; `radius` scaled within `AVATAR_BODY.radius`,
                       *guess*); `stepUp`/jump stay the adult's so stairs and kerbs work. `Rest.scale` lowers a seated eye
                       (`Rest.eyeAt`: sitEye shrinks with the body; lying keeps the head on the mattress) and remote-pose `restState`
                       seats a chosen-height figure by its body scale. `rifleBoxPose` scales the three shared head boxes by the body scale
                       and a child's head around `AVATAR_HEIGHT.pivot`, so hits, the body/head boundary, crouch and rest follow; no
                       chosen height = unchanged. Tests: `node --test tools/avatarbodytest.mjs` (body values, head boxes at 120/165/195 cm,
                       crouched/seated/lying) and `tools/avatarbodytest.cjs GAME` (real Player: eye/crouch, wall radius, the stair
                       standing and crouched, the sofa, a door at handle height and the coffee jar on the worktop).
                       #1138: face sections (customizer.js `addFaceSections`, built from config.js `EYES` / `AVATAR_SHAPE`): eye-colour swatches
                       and 0–8 sliders (middle = the plain face) for eye size/opening, head width/length/jaw, nose size/width, ears and brow
                       thickness/height; the 2D preview follows them and stays sticky on desktop. The look code keeps its digits (nine, or
                       twelve with #1136's height) and appends tagged fields `[a-z]` + 1–3 digits, only non-default ones (`c` eye colour,
                       `e o w l j n b r t y`); unknown tags are skipped. On the wire the digits stay `av` (older clients) and the rest goes as
                       `ax` (ghosts.js `avatarWire`; Worker `cleanAvatarExt` checks only the form, ≤ 60 chars, and only beside a valid `av`).
                       #1139: "Kroppsbyggnad" slider (index.html `#avatar-build`, config.js `AVATAR_BUILD`, `avatarBuildStep`/`avatarBuildWidth`):
                       steps 0–8 scale the figure's x/z (Avatar object scale, no new draw call) 0.86 … 1 … 1.16; the seed's old build 0/1/2
                       is steps 2/4/6 (0.93/1/1.08 exact), so codes without the field draw as before. A chosen step (`look.bodyBuild`) is
                       the `k<step>` tag; the wire also sends the nearest old `d` for older clients; rifleBoxPose's head boxes use the same width.
                       #1156: TOPS[10] is Olof's burgundy hoodie (OLOF.colors.hoodie). Tops past 9 write a fallback digit (TOPS_DIGIT: 10 → red,
                       what older clients show) plus a `u<index>` tag; seeded looks still pick among the first ten (TOPS_SEEDED).
                       § / Meny opens clickable rearrangement controls with a free cursor; Esc exits the mode and cancels the preview,
                       including native pointer-unlock events. Touch keeps its input mode when leaving the menu.
                       The compact edit panel shows selection/placement steps, selected-only Rotate/Cancel, Menu and Done.
                       Reset controls sit in a collapsible menu section and retain both confirmations; Enter inside the console only submits the code.
                       #1601: the admin menu's Möblera button stands a seated player up and shows hidden furniture (F) before starting;
                       when the mode still cannot start (something held, a drawing open) the console stays open with the specific reason
                       from main.js `busy` (rearrange.js `enable`), since the mode's own status line is hidden while the mode is off.
                       tools/rearrangeuitest.html covers the touch badge hit area, § and Enter (opens in play; submits inside; ignored in other fields, focused buttons and rearrange mode), panel states, cancellation and menu scrolling.
                       Original-position reset (button / Home) asks for confirmation and uses the same atomic move; detached Thing supports and the fruit bowl follow
                       furniture, including layouts saved before #475.
                       Whole-layout reset also asks for confirmation, writes every registered home pose atomically, and rejects a changed global revision (#481).
                       tools/rearrangeresettest.html covers both confirmations, cancellation, followers and all-room reset.
                       Physical bounds ignore Ambilight; the TV targets support surfaces and follows BYÅS in the same saved batch, repairing legacy sunk TV poses on load (#478, tools/rearrangetvtest.html). Browser tests: tools/rearrangetest.html, tools/rearrangefollowtest.html;
                       Pendants (#1106, src/pendants.js): `piece.place` moves them along their own room's ceiling (aim at the
                       ceiling or the floor below; walls, other rooms and the stair opening refused), Höj/Sänk, the wheel or
                       PgUp/PgDn change the height within LIGHTING.pendantMove (lowest point ≥ 1.4 m, *guess*); the pose's y is the
                       hanging part's height, so older layouts need no new field. tools/pendanttest.html.
                       Wine racks use wall placement with their detached bottles; SYMFONISK lamps/speakers use support surfaces like the TV (#482).
                       tools/rearrangeplacementtest.html verifies wall rotation, bottle followers, sill/table placement and reload.
                       #1569: a piece with `userData.variant` (only Olof's desk) gets a shape button, "Gör till hörnskrivbord" /
                       "Gör till rakt skrivbord", in the menu (§ / Meny, for the aimed or selected piece) and in the edit panel while it
                       is selected (touch). `toggleVariant` cancels a preview, refuses a shape whose footprint would cross a wall where
                       the piece stands, and writes the choice as one revision-checked `materials` patch (surface `variant`); both
                       resets put the default shape back in the same write. tools/tillydeskvarianttest.cjs.
                       #1582: V toggles the selected/aimed piece's shape via `toggleVariant` (main.js keydown, only when the piece has a variant); each
                       `#rearrange-help` button has `data-key` shown as a CSS `::after` label, hidden under `body.touch`; V is added to the keyboard hint.
                       #1568: Tilly's basketball holder (`ball.holder`, src/basket.js `basketHolderFrame`) is a wall piece (`picture: true`, id
                       `f-basketholder-1-0.2-0-0`, pushed to `world.furniture.movable` in src/main.js before `new Rearrange`, type `basketholder`) placed
                       like a poster: origin on the wall, local +z out. The ball's home is local to the holder (`homeParent`/`local`, `Basketball.goHome`
                       adds the model to the holder), so a ball at rest moves with it and "lägga tillbaka" lands at the new place. A ball out of the
                       holder (hand, flight, floor) stays where it is: Möblera om needs an empty hand (`busy()`), and the ball goes home to the holder's
                       new place on its next return. Default place above the daybed = the piece's home pose (restore/reset). Saved in the ordinary
                       `pieces` layout format (no migration). Ball/holder dimensions are unchanged (BASKET.ball); no new draw calls.
                       #1611: the ball's save key (src/keep.js `holdKey`) uses `keepPos`, fixed to the pre-#1568 world home (west wall above the
                       daybed), not the holder-local `local.pos`, so saves from before the movable holder still find the ball; the key is only an
                       identity, the saved place is a world position, so a moved holder does not change it.
                       tools/rearrangebaskettest.html: move, reload, take/put back at the new place, a hand-built pre-#1568 save and a new save
                       restoring the ball on the court, restore.
                       #1586 (phones, best guess without a physical device): with lowMemory, Möblera om shows no brightness highlight on the
                       aimed piece or the preview (main.js updateFocus). Those first-focus variants are not warmed (warmCompiler covers
                       ordinary interaction targets only), so a newly aimed piece could compile new shader programs mid-game, the work iOS
                       kills the page for (#669). The action button/prompt still name the target; desktop keeps the highlight. The preview's
                       own `ghostMat` shares a program the warmed scene already has (measured: 0 new on pick). tools/rearrangephonetest.cjs:
                       iPhone profile, touch taps on >_ and Möblera, 0 new programs while aiming/picking/following, desktop highlight unchanged.
                       The Christmas tree (#571) is an ordinary piece ('julgranen') while it stands; out of season it is hidden and
                       not selectable. Pieces it hides (`userData.seasonHidden`, src/christmas.js) are not selectable either and
                       keep their poses; `apply` reveals them while poses change, `refresh` skips them; tools/christmastest.html.
                       Worker tests: cloudflare/layout.test.mjs. Development: cloudflare/dev.mjs and ?cloud=http://localhost:8145.
src/minimap.js         plan view with the visitor's arrow, current room highlighted (top right, under the HUD buttons); hidden, shown with the
                       stats (Tab / T / 📊, #85), K shows it alone
src/measure.js         tape measure mode (Q / 📏), two surface clicks/taps, distance label
src/rest.js            sitting / lying down (REST): seat & bed spots from furniture userData.rest, look clamp
src/playroom.js        eight individual cinema seats use the same `restTarget` / E / touch / stand-up flow, with a clear walk-up aisle
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
                       both wrists stay near camera-local rest targets (`swingAt`, `swingLeftAt`), with small anchor-direction follow
                       (`swingFollow`, `swingLeftFollow`); the right keeps its web fingers and the left curls loosely. These visual
                       offsets are guesses, not body measurements. Only swing arm poses change: actual palm/strand origins,
                       shooting, attachment, movement, climbing and held-item priority remain unchanged. The left arm is the hug's mirrored
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
src/saber.js           the lightsaber in Sovrum 2 (SABER), a Holdable; the blade burns marks where it cuts in (#96), explicit SABER.grip along ridged hilt (#913)
src/rifle.js           the AK-47 (#196, RIFLE): a folding-stock AKMS lying in NORDLI's wide bottom drawer (a Trinket, KINDS.rifle,
                       rides with the drawer), explicit RIFLE.grip at wooden pistol grip (#913); click = a shot, held (`trigger`: mouse button / the touch button) = automatic;
                       hitscan from the eye → a 'hole' mark (marks.js), the lawn target scores, the cat meows; after RIFLE.mag
                       the empty magazine drops to the floor and a full one clicks in; F clears the dropped magazines
src/target.js          the existing Nerf target on the east landing between ramp and stairs (TARGET, #1017): rings × distance bonus, "+N" badge,
                       back toward the east fence, face toward the courtyard; TARGET.rot rotates model and hit face together.
                       A score board beside it (localStorage 'lunden.target'), E clears it; it rises out of the ground
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
                       order; remove a key to leave it out) can damage each other (+ a small prop in the
                       avatar's hand; #1025: avatars always display their normal chosen appearance without ghost outline), the unarmed cannot be hit. main.js wraps each weapon's use (onUse / rifle.onShot /
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
                       The prop is the held weapon's own model (#1126, src/ghostprops.js `ghostProp`: rifleModel, the first
                       blaster in `blasterModel(…, lite)`, buildSaber's hilt + an unshaded blade, the first wand, bowGeometry; baked
                       lazily, grip at the hand, −z forward); the state's `h` carries no variant, so one blaster / wand stands for all.
                       Check: `node tools/ghostpropstest.cjs BASE OUT` (tools/ghostprops.html, one Ghost per weapon).
                       Bicycle bell (#1302): B while riding / the touch 🔔 button (hudicons `bell`, touchlayout 'Ringklocka', slot of the turn button) rings it; see animals-audio.md.
                       Jetpack on others (#1286): the wire field `jp` (1 worn, 2 thrusting; Worker `cleanState` validates, old clients ignore it; an older client's `h: 'jetpack'` counts as 1) puts the real pack (jetpack.js `packGeometry`, 0.8 scale) on the ghost's torso bone, `Ghost.setJetpack` / ghostprops.js `ghostJetpack`, plus the flames child at jp 2. Checks: `node tools/ghostattachtest.cjs BASE OUT` (tools/ghostattach.html), `node tools/ghostjetpackpeertest.cjs GAME WORKER` (two real Ghosts via a local Worker).
                       Bicycle (#1286): wire field `bk` (the bike's heading in camera-yaw convention, only while `player.riding`; Worker: finite |bk| ≤ 100, rounded) → `Ghost.setBike` / `bikeAt` / `poseBike`: ghostprops.js `ghostBike` (streetlife.js bikeGeometry baked, 1 draw call), the body faces the bike's heading, the head the look, hands on the handlebar, feet on the pedals. `node tools/ghostbiketest.cjs GAME WORKER` mounts a real bike in the app and checks a peer sees it. Held items other than weapons: #1297.
                       Held things on others (#1297, part of #1286): wire field `hi`, a category key from the whitelist `HELD_CATEGORIES` (src/heldcategory.js: cup, plate, food, bottle, book, paper, tool, plant, box — never a name, photo or drawing content). `heldCategory(heldItem())` (pure, by class name / life-item tags, unknown held things = `box`, weapons / the cat = none) is sent by main.js's state callback (not while riding); weapons keep `h`. Worker `cleanState` drops anything not on the whitelist. `Ghost.setItem` → `ghostItem(key)` (ghostprops.js: flat-colour merged proxy, 12–96 triangles, one draw call, shared material, no textures) at the right hand like the weapon props; shown only within AVATAR.poseFar (the posed avatar), never with a weapon prop or on the bike; the mirror self-ghost shows our own. Tests: `node --test src/heldcategory.test.mjs cloudflare/players.test.mjs`, tools/ghostitemtest.cjs (component page tools/ghostitem.html), tools/ghostitempeertest.cjs (real app + Worker).
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
                       `lathe`; his look is untouched): a face (#1101, `addFace` / `faceWarp`, tunables `AVATAR_FACE`, *guess* by eye: eyeballs with
                       iris, pupil and upper/lower lids in a shaded socket under a brow ridge, arched brows, a bridge-to-tip nose with wings, two
                       lips in a skin-derived lip colour (region 6) with a seam, a chin; the whole head 7 % narrower and the jaw narrowing toward
                       the chin, applied to every head-bone part so the beard shell stays on the skin; skull and jaw rounder, their normals
                       blended at the seam), ears, the body (#1103, `bodyParts`: a torso with chest/bust,
                       shoulder blades and sloping shoulders, deltoid caps, wrists reaching flat hands with the palm to the thigh, fingers and a thumb,
                       a T-shirt with sleeve hems / long-sleeved top with elbow folds and cuffs, collar, hem, belt (no buckle, #1189), trousers with seat,
                       fly seam and hems, low trainers with a sole), trouser models (`legs` 0 straight / 1 shorts / 2 wide, tag `p`) and top models (`cut` 0 T-shirt-or-long per `sleeves` / 1 tank / 2 hoodie, tag `m`; #1244, `AVATAR_CLOTHES`, part of the shared geometry cache key, component screenshots `tools/avatarclothestest.cjs BASE OUT` on `tools/avatarclothes.html`), one of five hair styles (short, long, bun, beanie, curly #1244/#1377 = style 4: scalp shell with continuous winding locks (`AVATAR_HAIR.curly`), plus body-cleared wavy curtain and connected side/back ringlets #1268 that scale with `hairLength`; the 2D preview also uses connected waves, look digit 5 may be 4, older clients reject such a code and fall back to a seeded look; #1102 `hairParts`, tunables
                       `AVATAR_HAIR`: shells projected onto the skull ∪ jaw above a real hairline — forehead, temples, sideburns, over the
                       ears, nape — feathered at the edge, with per-column strand shading via a `shade` vertex attribute; long hair adds a
                       two-sided curtain kept off ears/neck/torso in the bind pose with a middle parting; the beanie is ribbed with a rolled cuff
                       above the brows; component screenshots: `tools/avatarhairtest.cjs BASE OUT [prefix]` on `tools/avatarhair.html`). Facial hair (`facial`): 1 / 3 =
                       one continuous full-beard shell (#1097, `beardShell`, tunables `AVATAR_BEARD`) projected onto the skull ∪ jaw ellipsoids,
                       fullest at the chin and tapering to the skin at its edges, a lips patch showing through the mouth notch / opening (3 adds
                       the upper-lip moustache band); 2 = two moustache boxes; +≈ 0.35 k triangles. It is cosmetic only (head hits use the
                       shared three-box collider). Skin and material shading (#1104, tunables `AVATAR_SKIN`): clothes and hair are
                       baked darker in folds per vertex (`clothShade`: armpits, crotch, behind the knee, hair underneath); bare skin
                       (shared `bare` attribute) gets warm cheeks / nose tip / lip surround, darker eye sockets, the shadow under the
                       jaw and in the ears and a reddish grazing edge in the same fragment shader (`skinShading`, off under the suit).
                       `look(seed)` (the player's id, ours
                       `me:<name>`) picks skin, hair, top, trousers, shoes, sleeves, hair style, build and height, so players differ. ONE SkinnedMesh
                       (one draw call) per avatar, no texture, ≈ 5.1–5.9 k triangles (#1101 face +≈ 1.0 k; `avatarTriangles(variant)`; 8 shared base geometries, built lazily;
                       an avatar owns only a colour attribute, a 13-bone skeleton and a material; #1138: the face sliders are uniforms on that material,
                       applied in the vertex shader via the shared `facePart` / `faceAnchor` attributes (avatar.js `faceShape`), the irises a
                       palette region; #1165/#1268: hair length (`hairLength` slider field, tag `h`: hair parts `facePart` 7 stretch below the crown, scaling straight long hair and curly hair in 3D and 2D customizer preview) and glasses (#1340: the beard and moustache are `facePart` 11 (`cowlHide`), not 7: they follow the head/neck warp but not the hair-length stretch, which squashed them into a band across the face at short hair) (look field `glasses` 0/1/2, tag `g`: frames in the shared head geometry as `facePart` 8/9/10, collapsed to a point in the shader unless chosen, ~360 extra triangles, still one draw call; #1220: the brows' own colour (look field `brows`, a HAIR colour or null = like the hair, tag `v` + HAIR index; the brows are colour region 9 in the per-player colour attribute, no extra draw call; editor row "Som håret" + hair swatches under Ögonbryn; the extension allows up to 24 tags); #1322 (#1318, headphones): look field `phones` 0 none / 1 on the ears / 2 round the neck, tag `f`, `AVATAR_PHONES` in `src/config.js`; `addPhones` in `src/avatar.js` puts both kinds in the shared geometry (face parts 18 band, 19 ear cups on the head bone; 20 round-neck band and chest cups on the torso bone, which the head warp and the neck slider skip) and the vertex shader keeps the chosen one (`uPhones`; collapse to the anchor otherwise, no extra draw call, ≈ +850 triangles); over headwear the band is lifted (`hatLift`) and a knitted hat pushes the cups out (`hatOut`); customizer section "Hörlurar" and a 2D preview; #1321 (#1318, accessories, parts #1322 headphones / #1323 necklaces / #1324 rings / #1325 more follow the same pattern): headwear (look field `hat` 0 none / 1 cap peak forwards / 2 cap peak backwards / 3 knitted hat / 4 brimmed hat, tag `q`, `AVATAR_HAT` in `src/config.js`; `addHats` in `src/avatar.js`: domes on the lifted skull ellipsoid in the top's colour as `facePart` 12–17, collapsed to a point in the shader unless chosen (`uHat`), ~1.2k extra triangles (all hats are in every avatar; see perfcount), one draw call; hair above the ears (bun, curls) is drawn in under a hat with a skull-surface limit (#1513); lined shells and closed rims stay opaque from below; the headshot collider is untouched; customizer section "Huvudbonad" via `addAccessorySection`, not part of Slumpa); component screenshots `tools/avataraccessoriestest.cjs BASE OUT` on `tools/avataraccessories.html` (every hairstyle × every hat), game test `tools/avataraccessorygametest.cjs GAME WORKER`); #1323 (#1318): necklaces (look field `necklace` 0 none / 1 thin chain / 2 pearls / 3 pendant / 4 thick gold chain, tag `x`, `AVATAR_NECKLACE` in `src/config.js`; `addNecklaces` in `src/avatar.js`: a path round the neck that hangs down the chest (on the torso profile) swept into tubes / strung with beads, on the torso bone as `facePart` 30–33, not warped with the head and not lengthened by the neck slider, collapsed in the shader unless chosen (`uNecklace`; the Spider-Man suit collapses all), ~800 extra triangles, one draw call; customizer section "Halsband" via `addNecklaceSection`, 2D preview in `drawAvatarPreview`, not part of Slumpa; the same screenshot tools with `FIELD=necklace`); #1324 (#1318, rings): look fields `ring` (0 none, 1-5 left hand thumb, index, middle, ring finger, little finger, 6-10 the right hand) and `metal` (0 gold, 1 silver, 2 copper, 3 black titanium), tags `i` and `z` (`z` only written with a ring and when not gold; the extension now allows 28 tags / 60 characters), `AVATAR_RING` in `src/config.js` (one ring per avatar, the simplest option that covers every finger + metal); `addRings` in `src/avatar.js` puts a small torus round each of the ten fingers in the shared geometry (`facePart` 40-49, mirrors `bodyParts`' hand; +~0.5 k triangles), the vertex shader collapses all but the chosen one (`uRingFinger`; the Spider-Man suit collapses it with everything else on the hands) and the fragment shader tints it with `uRingColor` plus a small emissive lift (no reflections), so no extra draw call; the customizer's "Ring" section (none, left / right hand rows of five fingers, metal row) and the 2D preview ring in `drawAvatarPreview`; the first-person hand (`src/hand.js`, #1227) draws it on its own morphing mesh (`ringGeometry` / `buildRing`: a thin torus round the first free joint in the four hand poses, a child of the right hand or the mirrored left one; `Hand.applyRing`, material `ringMat`, set by `handLook`); screenshot tools `FIELD=ring` in `tools/avataraccessoriestest.cjs` and `tools/handringtest.cjs` (on `tools/handring.html`); #1325 (#1318): earrings (look field `earrings` 0 none / 1 studs / 2 hoops / 3 drops / 4 pearl studs, `AVATAR_EARRINGS`; every lowercase extension tag is taken, so they share the glasses' `g` tag as `glasses + 10 * earrings`: `g1` unchanged, `g20` hoops, `g33` drops + sunglasses; `addEarrings` in `src/avatar.js`: parts on the head bone around the ear as `facePart` 21–24, scaled with the ear slider (`uEarrings`, `uEar`), hidden by long hair; the vertex shader's `torsoPart` test (id 20 and ≥ 30) replaced the old `< 20` test) and sunglasses (glasses kind 3: the square frames plus dark lenses as `facePart` 25, shown for `uGlasses` 3), customizer section "Örhängen" and a 2D preview, `FIELD=earrings` / `FIELD=glasses` screenshots; #1334 (#1318): bracelets and wristwatches (look fields `bracelet` / `watch`, 0 none, 1-3 the model on the left wrist, 4-6 on the right; bracelets thin / braided / wide cuff, watches classic / square / sport; they share the metal's `z` tag, `z` = `metal + 4 * (bracelet + 7 * watch)`, a ring-only code is the old `z<metal>` and older clients ignore the larger values; `AVATAR_WRIST`, `wristValue`; `addWrist` in `src/avatar.js`: parts on the elbow bone just below the cuff as `facePart` 50-55 bracelets and 60-95 watches (case / strap / dial / mark), collapsed by `uBracelet` / `uWatch`, metal parts (< 70) tinted by `uRingColor`, ~+650 triangles, no draw call; the Worker's extension limit was raised from 48 to the clients' 60 characters); customizer section "Armband och klocka" with a 2D preview; the first-person hand draws them as static parts on the hand meshes (`wristParts`, `Hand.applyWrist`); `FIELD=wrist` screenshots and `tools/handringtest.cjs`'s wrist cases; component screenshots `tools/avatarfacetest.cjs BASE OUT [prefix] [codes]` on `tools/avatarface.html`). The material is a MeshLambertMaterial patched with a
                       lit and opaque (#1025: players always see normal visible avatar appearance; ghost outline removed).
                       `update(dt, { speed, turn, hands, crouch })`: legs walk above AVATAR.walkSpeed (the phase follows the distance), arms swing,
                       a little breathing, the head turns `turn` rad against the body. **The arm surface for animations (#673 wave):**
                       `hands: { L, R }` = `{ at, pole }` targets in the figure's frame (`armTarget.rest / .forward / .up(side, phase)`), set per side,
                       replacing the swing; ghosts.js passes `Ghost.hands` through. ghosts.js `Ghost.animate`: the speed from the interpolated snapshots,
                       the body turns towards where it goes (not when that is behind / beside the look), the head to the look (`AVATAR.bodyTurn`),
                       a weapon is held out in the right hand and its prop follows that hand (the jetpack sits on the back). Not sent / not done: head
                       pitch (the room's state has only position and yaw), a shadow (the shadow map is redrawn rarely). Numbers: AVATAR in config.js
                       (*guess*, by eye). Posed only within AVATAR.poseFar m.
                       **Talking mouth (#1122, tunables `AVATAR_MOUTH`, *guess*):** `talk(text, secs)` walks the line's letters at
                       MOUTH.rate (vowels open wide, consonants a little, spaces nearly shut, punctuation shut for MOUTH.pause slots), for the
                       text's length capped at `secs` and MOUTH.maxSecs, eased by MOUTH.follow, shut at the end; `speechStart / speechBoundary /
                       speechEnd` follow a Web Speech voice (greet.js `speak(text, voice, avatar)`: onstart restarts the rhythm, each word
                       boundary jumps to that word and waits shut at its end, onend / onerror shuts; MOUTH.liveMax as a safety). No new mesh,
                       draw call or traffic: a shared per-vertex `mouth` weight (`mouthWeight`: lower lip whole, the dark lip seam's lower
                       half, chin / jaw front / lower beard fading to the corners and under the chin; with beard + moustache only below the
                       opening's lower edge) and one `uMouth` uniform move vertices down by up to MOUTH.drop in the vertex shader before
                       skinning. Hit regions and the three-box collider keep the closed bind pose. Driven by chat.js `bubble` (a received
                       line; never for "skriver…", stopped with the bubble), ghosts.js `selfTalk` (our sent line, the mirror image),
                       greet.js `sayMine` (our spoken lines → the mirror image, `greet.mineAvatar`) and `onGreet` (a greeting player's avatar).
                       Component screenshots: `tools/avatarmouthtest.cjs BASE OUT` on `tools/avatarmouth.html` (four facial-hair variants
                       shut / open, a talked line's rhythm and caps); in the app: `tools/avatarmouthgametest.cjs GAME WORKER` (a module
                       peer's line, "skriver…", the hall mirror).
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
                       (`breaker.add(item, kind)`); Marks.hit with `{ weapon }` (rifle / dart / saber / wand; `glass: true`)
                       passes through ordinary transparent props. Production window panes registered with
                       `userData.projectileBarrier` stop weapon hits, including rifle and dart impacts. An open sash
                       moves with its pane, leaving the opening clear. Non-weapon physical queries keep their prior
                       glass policy. Regression coverage: `tools/combatworldtest.html` and
                       `tools/marksphysicstest.html`. Breakable kinds: `item.shatter()` (Holdable: hidden, no E target; a cup goes 'spare'), shards in two pooled
                       InstancedMeshes (glass / china) that bounce once and fade, a 'splash' of what it held, sfx.shatter,
                       a cat near meows; `mend()` after BREAK.back s or F. Stats shattered (first per kind) + shatterRange
                       (`Breaker.points`: distance × weapon)
src/trigrid.js         world-space triangle grid per big static mesh, so short segment hits skip three's full raycast
                       #1593: fine 0.5 m cells are refined lazily per 8 m tile (TILE = 16 cells), so a whole-site mesh (terrain,
                       south land, facades) whose bounds contain the flat no longer gets millions of cell arrays on the first short
                       indoor segment. Möblera om's per-frame wall check (`marks.hit`) retained ~410 MB that way on the phone profile.
                       Cell membership/order and hit visit order are unchanged (tools/trigridcopytest.cjs: exact hit parity with a336e30).
src/remote.js          the TV remote on the coffee table (REMOTE), a Holdable: click opens shared film choice;
                       right click / ⏻ = ordinary power or shared-film controls, with the existing wall/reach ray
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
                       HOME_DRAWINGS (#618, #1099, config): the home's own drawings ("Till mamma" under the kitchen clock,
                       textures/teckning-till-mamma.jpg) are ordinary drawings (`p.home`): Släng / Ta ner / tape elsewhere,
                       count towards maxPosted; local only (never onPut/onDelete, addRemote refuses them, cloud.js sync
                       skips them, so the 24 h expiry cannot touch them); a moved one is stored in IndexedDB under its fixed
                       id with its config picture/date; one not stored (never moved, thrown, or pre-#1099 saves) goes up at
                       its default spot on `load()`; put back from the hand it is rehung, never the desk sheet;
                       `posters.own` = the visitors' ones (tests); tools/homedrawingtest.html
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
                       web on the street pulls you there; the jump button (right of 🧎) jumps; without the suit 8 m hurts;
                       #636: both hands climb (direction, tempo, resting grip), the web pose after a shot at the sky, both arms swinging;
                       (#1471: landing on / climbing onto the Å-husen's upper loggias, and the climb held under a loggia slab
                       overhead, are tools/loggia1471test.cjs)
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

HUD controls (#525): src/hudicons.js supplies own 24 px/1.7-stroke SVGs and idempotent setIcon/setPressed helpers. initHudIcons inventories fixed HUD shortcuts, relevant panel controls/close icons and jet/vacuum indicator symbols. main.js keeps text actions and maps the held basketball alternate action separately; Sonos/ClockPanel/BlindPanel render current state/direction icons; the cat binder panel (#1255, was BoardPanel; photo menu with Spara / Kasta / enlarged view #1257) uses plain labelled text buttons and dynamic calendar/task buttons share the same surfaces. CSS vars in src/hudicons.css control neutral glass/edge/2 px blur; text/icon opacity stays 1, >=48 px icon targets, distinct pressed/active/disabled/focus states, @supports and hud-no-blur fallback. SVGs never intercept pointers. No renderer passes or icon library. Drawing palette represents real ink colors. docs/validation/issue-525/README.md inventories controls and day/night/snow/mobile/desktop before/after. hudiconstest checks accessibility, touch area, real button/alternate actions, state icons and fallback draw counts; touchtest/clocktest/blindtest/sonostest/bindertest/calendartest/taskstest guard existing behavior.

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
- Jump (#600, #636): Space / the touch ⤒ button (#jump-btn; hud icon 'jump'), always visible on touch.
  It sits straight above the primary pill, right of crouch, nearest the resting thumb; see [thumb-arc placement (#1089)](#thumb-arc-placement-1089-part-3-of-1082)
  for current target sizes, safe-area placement and equipment cells. A press, not a hold. Outdoors and indoors, off the floor, a stair tread, a roof; never with
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
- Courtyard swings (#1413): both existing seats are individual `restTarget` sit spots. `courtyard.updateSwings` rotates only their rubber seats and chains around the fixed beam while updating each pick box and rest eye/aim position. The moving vertices occupy fixed ranges in the existing toy/metal batches, preserving their materials and draw-call count; their positions and normals remain writable in phone low-memory mode. `Rest.update` follows the moving eye after the normal entry glide; `restState` reads that same spot for the avatar pose. E, Space, C and touch use the ordinary stand path, with its free-ground check. Menu teleport, death/respawn and another rest end the active swing through the existing rest path. The stand, foot collision and playground routes remain fixed; sitting on a swing does not grant the generic first-seat score. `COURTYARD.swing.angle/period/returnRate` are gameplay *guesses*.
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

Console cheats (#514): `src/cheats.js` is the shared command catalogue for execution and bike-room writing. All nine public commands (`spiderman` since #597, `städa` since #1564) list code and Swedish meaning; the two private inputs are verified by `src/privatecodes.js` and excluded from the public catalogue/list (#856). #724: nothing in the player-facing UI hints that codes exist (control row, console label "Kommando", empty message line; no word "fusk" in shown text). The graffiti (`cheatList()` / `publicCheats()`, one source) is the only place listing the public codes. `help` is not a code: in the chat it lists only the ordinary commands (`COMMANDS` in `src/chat.js`: `/tysta`, `/prata`); every refused line, secret or not, gets the same `UNKNOWN` ("Okänt kommando."). The graffiti is drawn at 82 % ink and titled "psst..."; the note is read as "klottret". The existing console form stays available in the rearrangement menu. `src/cheatnote.js` renders one transparent marker-text plane on bikeNE's back west wall, added to the existing garage area/targets. A bundled 22 kB Kalam Bold Latin font (SIL OFL 1.1, attribution in data/fonts) loads with a two-second bound; no runtime third-party font request. CHEAT_NOTE dimensions/placement are explicit visual assumptions. The normal ray/read action opens a scrollable 17 px text dialog for phone/desktop, with E/Esc and a close button.

Commands use existing controllers: Lights.setAll, DayCycle.hour/update, Jetpack.putOn, SpiderSuit.putOn (`spiderman`, #597: anywhere, climbing still outdoors only) and original holdable paths. Jetpack refuses the flat interior with feedback, keeps roof restrictions and does not reset an already-worn pack's heat. Handsfree keeps the same item, uses valid original life storage/last placement or a grounded fallback, places ordinary holdables on a real surface, restores drawings through their existing desk path and parks paper in an existing toilet without flushing/hiding it. tools/cheattest.html covers the actual console, both secrets/public exclusion, repeated shortcuts, genuine ray reading and normal-home reload; rearrangeuitest still covers keyboard/touch console and edit controls.

Console catalogue cleanup (#565): `home` and its handler are removed; no restart/reset aliases exist. The retained commands provide cleanup, jetpack, time/lighting and hands-free shortcuts, plus the two secret rearrangement unlocks. Console opening, help and command responses never reveal the note location. The ordinary start/reset menu actions remain available. `tools/cheattest.html` rejects removed names (including case/whitespace variants) without changing player/inventory state and checks spoiler-free console output alongside the existing shortcuts and readable world note.

Chat (#675, `src/chat.js`): while the players' room is on (`ghosts.on` and not capped this month — the cloud is set, GHOSTS.enabled, no `?mp=0`) and not in rearrange mode, the same console (>_, § / Enter) opens as a slim bar at the top (`#terminal.chat`: no dark backdrop, title "Chatt", "Skicka"; a tap beside it closes). Decision on cheats: a line that is a code (exact, any case/spacing, the secret ones included) or starts with `/` (`/day`) is a command — `cheats.js isCommand`, run locally with its answer in the bar, never sent and never shown in the column; `/unknown` gets "Okänt kommando."; anything else is a chat line. the bike-room graffiti says "(i chatten: /kod)"; `/unknown` gets "Okänt kommando." (#724). A sent line closes the bar (Enter on an empty field just closes); a refused one keeps the text and says why (not connected, the client's rate limit = the room's: a burst of CHAT.burst then one per CHAT.everyMs). Text is cleaned like the room does (`cleanText`: control/zero-width/bidi out, whitespace folded, CHAT.max 140 characters, the JSON kept under the room's 256) and always shown with textContent; names as the room cleans them, "Anonym" without. The column `#chat-box` (left, under the badge and heat bars, z-index over the bar's transparent backdrop, `pointer-events: none`) shows as many complete messages as fit its actual available height, newest at the bottom, trimming the oldest when short of room (#765), each line ≤ 3 lines of text, fading over the last CHAT.fade s of CHAT.ttl (60 seconds); monotonic expiry is independent of capped render dt (#966); on touch it stops 150 px above the bottom (the stick's corner) and stays within 44 vw (the buttons are on the right). Main menu → Inställningar → `#menu-chat-setting` ("Visa chat: PÅ / AV") hides/shows both the log and ghost speech/typing bubbles immediately, retaining localStorage CHAT.hiddenKey (`lunden.chat.hidden`, '1' = AV) from older visits. It preserves messages, bubble TTL and outgoing typing state. The former HUD toggle is removed. Chat starts 4 CSS px inside the left safe area, with no toggle taking up row width. Actual wrapped row heights and gaps are remeasured on resize/orientation, visualViewport changes and container ResizeObserver callbacks; even while AV the retained log is trimmed to the current height. #966 preserves unexpired messages when height is temporarily zero, caps a wrapped row to usable space before trimming, and always retains the newest row even when the available pixels are less than its padding. If even one wrapped row exceeds the available space, its visible beginning is clipped to that space rather than discarding the new message; restoring height remeasures it. Server minute-limit refusals explicitly ask the player to wait up to a minute; the existing limits and reconnection protocol are unchanged. Without the room nothing of it shows and the console is the old cheat console. DOM only: no draw calls or textures. Tests: `cloudflare/players.test.mjs` (room limits, cleaning, cap) and `tools/chattest.cjs` (two pages against `cloudflare/dev.mjs`: send/receive as plain text, cheats stay local, rate limit, max lines, TTL, hide + count, phone layout clear of the buttons, screenshots).

Chat bubbles (#676, `src/chat.js`): while someone types in the chat bar, "skriver…" with three animated dots floats over their ghost for the others; their sent line replaces it as a bubble for the separate CHAT.bubbleTtl (10 seconds; #966), using monotonic elapsed time (a new line replaces the old: one bubble element per player). Only a flag goes to the room ({ t: 'k', on }, never the letters): on at the first key (`input` on the field, chat mode only), repeated every CHAT.typingAgain ms while still typing, off when sent (the room ends it with the line), when the bar closes, after CHAT.typingMs without a key or when the connection drops; someone else's goes off by itself after CHAT.typingStale ms without word and with their ghost (left, disconnected). The room passes a change (off always, on no sooner than 0.5 s, a refresh no sooner than 5 s). Bubbles reuse greet.js's `.say` bubble in the `#speech` layer (DOM, no draw calls or textures), placed CHAT.bubbleGap m over the name tag, full size within CHAT.bubbleNear m and smaller further away (down to CHAT.bubbleMin), hidden with the tag (far away, off screen) and behind walls (main.js `behindWall`). There is no own body in first person, so your own lines are in the column; the column holds only lines, never a "Du skriver…" row (#735: it used to stay after sending, because `send` cleared the flag without redrawing it, and the row is gone for good). The main-menu chat setting hides the bubbles together with the column (#765). Tests: `cloudflare/players.test.mjs` (typing flag limits) and `tools/chattest.cjs` (typing on/off, pause, closing, replacement, TTL, wall, leave, no extra 3D objects, screenshots).

Own mirror typing (#743): Chat supplies the existing Ghosts mirror hook with a predicate for an open, visible chat, a live room connection and a key within CHAT.typingMs. Only the own mirrored avatar gets a “Skriver” sprite; other players' bubbles remain DOM. Sending, closing, timeout, disconnect/reset or the menu's chat-hidden setting stops its visibility immediately. Reset uses Chat.stopTyping after room identity is cleared, so reconnecting cannot restore an old typing flag or queue an old-room off event. No own typing row is added to the chat column.

Chat filter and muting (#719): a short list of coarse words (`ROUGH` in `cloudflare/players.js` and `src/chatfilter.js`, kept equal by hand; `cloudflare/chat.test.mjs` compares them) becomes `***` as whole words in any case ("kukeliku", "horisont" stay): the room filters every line for everybody, the client shows its own line the same way and filters received ones once more. Muting is local and lasts until the page is reloaded (ghost ids change with every connection): in the chat bar `/tysta namn` hides that name's lines, "skriver…" and bubbles here ("Anonym" mutes every nameless player; not yourself), `/tysta` lists, `/prata namn` / `/prata` undoes one / all; `/help` in the chat adds these to the cheat list. Nothing is sent or stored; no report button (not needed now). `src/chat.js` `command` / `isMuted`, main.js handles them before cheats. Tests: `cloudflare/chat.test.mjs`, `tools/chattest.cjs`.

Mobile viewport sizing (#567): the fixed `#game-canvas` uses plain `inset:0` + 100% CSS dimensions (no dvw/dvh: iOS WebKit can keep stale dynamic units after rotation). `bindGameViewport` starts immediately after renderer/camera creation, before fetching the plan or other scene data. It observes the canvas CSS box, updates only the drawing buffer with `setSize(w, h, false)` and derives the camera aspect from the same box. ResizeObserver catches late layout changes, and orientation events re-measure again after 120/350/800 ms; window/visual-viewport resize, orientation, fullscreen, pageshow and visibility events coalesce through requestAnimationFrame. Zero-size layouts retain the last valid projection and unchanged sizes do not allocate buffers. Adaptive pixel ratio stays under the existing controller. HUD safe-area rules and other canvases retain their own sizing. `tools/viewporttest.cjs` blocks the real plan request to exercise startup rotation, then verifies delayed CSS layout, repeated portrait/landscape transitions, buffer/aspect, adaptive resolution and real touch taps. Screen-space HUD code (joystick zone in `src/touch.js`, speech bubbles in `src/greet.js`/`src/nest.js`, `measure.update` in `src/main.js`) reads the exported `gameView` {w,h} from `src/viewport.js` (the canvas's real CSS size) and never `window.innerWidth/innerHeight`, which iOS leaves stale after rotation; `#stats` has no 100vh/100dvh height. Audited and left unchanged: `html, body {background:#bfd8ea}` (sky blue, never white), `body {position:fixed; inset:0}`, `viewport-fit=cover` + `--s*` safe-area vars, `100vh`/`100dvh` caps on cards/notes/panels (max-height only), `manifest.webmanifest` (`display:fullscreen`, `orientation:landscape`; iOS ignores both and uses `apple-mobile-web-app-capable` + `black-translucent`). A white area can only be the WKWebView's own backdrop outside the layout viewport (e.g. a stale layout width after rotation: left half game, right half white), which page CSS cannot colour; unproven without a device. `tools/viewporttest.cjs` also overrides `innerWidth/innerHeight` with stale values (startup and after loading) and checks the joystick zone. Physical Safari/Chrome device verification is still required; desktop touch emulation does not certify phone/PWA compositor behavior.

Power cut (#604): `src/power.js` `Power` is a small state machine on the EL/C cabinet's `fuse` (interior.js: the fuse box's plan points, the router's LED material). `on` → E / click / the action button "Pilla på elcentralen" → `buzz` (POWER.buzz s: sfx.mainsBuzz, `supply` jumps between dark and lit, small sparks; the target is blocked) → `off` (sfx.fuseBang, a big spark sprite, the router's LEDs dark). Mending is a hold, not a click: keydown E (not its auto-repeats, so the press that tripped it never mends), mousedown or the touch button's pointerdown start it; keyup E, mouseup, pointerup / cancel / leave and blur stop it; the touch `click` after pointerup is ignored for the fuse box. Progress counts only while the fuse box is in focus and **pauses** when let go (never lost: 30 s of holding is a lot on a phone); the prompt (shown on touch too while holding) has the % and a green bar (inline background). At POWER.repair s: sfx.breakerOn, power back. main.js carries the cut out: `lights.setSupply(power.supply)` each frame, `patio.supply`, `world.windowLights.update(…, power.on)`; `onCut` switches off TVs / the PC / laptops / Sonos / hob / hood, darkens the smart speakers (`nests.powered`), the TV's standby LED (`mains`), the stairwell (`core.setPower`, POWER.emergency) and the garage's sensors (`garage.powerOff`); `onRestore` undoes the device lights only (screens and music stay off). While it is out, E targets of the kinds in main.js `POWERED` (TV, PC, laptop, speakers, smart speakers, hob, hood, coffee maker, lift, garage door) say "Strömmen är borta" and the remote finds no TV. Nothing is saved: a reload always has power, and the switches / small lamps keep their own state through the cut (lights.js), so what was lit comes back lit. Appliances (#612): `onCut` / `onRestore` also call `mains(on)` on every `world.lids` entry that has one and on the dishwasher / washer / dryer programmes. The fridge and freezer (fridge.js: the lamp and the liner's glow dark, no door alarm) and the oven and microwave (ovens.js: no lamp) still open. A running Moccamaster (coffee.js), dishwasher (dishwasher.js) or washer / dryer (laundryprogramme.js: the panel dark) **pauses** with its switch still on and carries on with the time left when the power is back; none can be started without power ("Strömmen är borta"). The lift (core.js `Lift.mains`, via `core.setPower`) forgets its call, a moving car creeps down on its rescue drive (CORE.lift.rescue, *guess*) to the stop below and opens its doors there, so nobody is shut in; its light, display and buttons are dark.

Unified HUD badges (#707): `src/hudicons.css` owns both top shells: the same safe-area-aware top, height, radius, edge, shadow and single 2 px blur. The badges sit 4 px inside each safe-area edge (#766). The shared cell is 48 px (44 px at <=600 px), with prominent points spanning 2 cells, visitors 1, and the touch console 1. Time/weather (#970) share one column: the clock spans the upper half-height row, with the undivided weather icon + temperature below a continuous horizontal divider. Its width is 80 px on desktop and wider touch views, and 66 px at <=600 px (previous combined widths 120/97 px). Temperature keeps its existing 16/14 px type and accommodates −123° without clipping. Independent main.js updates and all three element IDs are unchanged. At <=600 px, the noninteractive data columns compact to fit a 568 px landscape viewport with two 44 px safe areas; content stays visible and every interactive shortcut/console remains 44 px. Gain/deduction feedback temporarily fills the points cell (long red reasons wrap); the existing stats timer restores its score/label. Every right shortcut is one cell, including on desktop; existing IDs/listeners and SVG conventions stay unchanged. `#level` still contains only the clock and keeps its place in `data-place`; weather remains outdoor weather in every room. main.js prepends weather/temperature/clock after stats.js builds the score, then appends the existing console button. Heat bars and minimap use `--hud-badge-bottom`; the desktop QR sits below the heat row. The compass stays in the top right row at every size. Touch gameplay controls retain their lower-right #1057 cluster during combat, clear of the lives. `tools/hudlayouttest.cjs` checks real index DOM/CSS and icon initialization at five landscape sizes and three safe-area cases, with game bootstrap suppressed; it does not certify gameplay or a physical phone compositor.

Privacy page (#723): the menu button `#menu-privacy` ("Integritet och cookies") opens `#privacy-dialog` (same card style as the leaderboard dialog; Escape / "Stäng" closes; listed in main.js `otherOverlay`). It describes in Swedish what is verified in the code: no cookies; localStorage `lunden.*` keys, IndexedDB `lunden` (cat photos, drawings), CacheStorage (beer shelf); sent to the Worker: leaderboard name/score + random player id, presence every 30 s, players' room (position, yaw, weapon, chat, not stored), shared drawings/furniture, anonymised crash reports; Open-Meteo (rounded coordinates + dates only); how to delete (Återställ keeps name, score and shared drawings, `RESET_KEEP`; clearing site data removes everything local; server rows stay). Keep it in step when a new key or request is added. The page opens with the section "Vad andra spelare ser" (#730: everyone playing at the same time in the one room sees you online, your avatar with name/"Anonym" + score + position/heading/weapon/typing, your chat lines; name + score stay on the leaderboard; no opt-out except no cloud; checked against ghosts.js / presence.js / chat.js / players.js). The start screen shows the note `#share-note` ("Andra spelare ser att du är online och ser din avatar…") when the cloud is on; there is no opt-out checkbox. `tools/anontest.cjs` checks both.

`tools/chatsettingtest.cjs` (#765) exercises the actual Chat module and production index DOM/CSS in Chrome with bootstrap suppressed: persisted PÅ/AV across real reloads, immediate existing/incoming speech and typing bubble visibility without altering outgoing typing flags, no own typing row (#735), 60-second expiry, and complete newest-message bounds after resizing/rotation at desktop and phone sizes with safe-area overrides and wrapped long names/text. This is DOM/module verification without apartment construction, rendering or live room networking. Run `PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/chatsettingtest.cjs http://localhost:8765 /tmp/lunden-chat765`.


#767 verification: 15 actual HUD DOM/CSS cases passed across five landscape/desktop sizes and three safe-area cases,
including hidden-HUD startup/reveal and resizing the same live Compass instance. Reviewed HUD-only screenshots cover
568×320 with 44 px left/right safe areas, 844×390 and 1280×720. The actual apartment `compasstest` then passed all
45 rows in 158.664 s, including original bearing/rotation/movement/notifications and a real reload, without `&test`.
Logs: `/tmp/lunden-hud767-lifecycle.txt`, `/tmp/lunden-hud767-lifecycle/layout-results.json`,
`/tmp/runtests-242392/compasstest.log` and `summary.json`. No pageerrors were recorded; no physical-phone/FPS claim.


Private command hashing (#856): `src/cheats.js` contains exactly the public entries (nine since #1564); `isCommand`/`runCheat` remain synchronous and retain the console's NFC → trim → remove one leading slash → trim → lowercase → collapse whitespace normalization (NFC since #1564, so a decomposed `ä` in `städa` matches). A matching private hash calls the existing unlock handler with canonical normalized input. Unknown/near-match input retains the same neutral `UNKNOWN` response. `Rearrange.unlock` separately applies only `code.trim()` before exact verification; accepted input synchronously sets/persists the boolean and calls the real `enable`, including when busy refuses activation. No input is stored, re-requested or made async. `Rearrange.write` sends the public version-1 fixed default credential through the unchanged authoritative revision/conflict/reset/pose paths; restored boolean state needs no original input. These replayable hashes are the existing game mechanic, not authentication. [Protocol and native integration](storage.md#versioned-layout-credentials-853).


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
### Exposed front-side Jaw strips (#959)

A narrow pair of front-side strips extends the existing rigid lower-Jaw hit region. It
uses the unchanged Jaw mesh, first-profile entry, 8 mm Jaw residual, .08 front cone
and 1 mm whole-wire-cell margin. The added canonical patch is *guess* policy
(x .023–.030 m, y 1.53+.037–.040 m, front z≥.100 m). Only a strict named
`allowJawFrontSide` option opens it; PlayerRoom supplies that permission only while
its private `headPoseFixed` flag is literally true. The flag is created from the first
valid standing state and becomes permanently false after normalized position,
heading or crouch changes. It survives hibernation but is absent from public state and
late welcome. Existing Jaw core, other head regions and legacy options remain
independent; changed, crouched, unknown-history and old-client cases keep body damage.

`tools/riflejawstriptest.cjs` proves nearest actual Jaw triangles and whole-cell
corners for all60 canonical looks under bounded standing breath/pitch phases. Its
fresh-source-frozen Worker room covers a real body1 shot, four 2-HP Jaw receipts,
legacy fallback, lethal reset/UUID/replay, wall and miss, and wire budget. It uses no
apartment World or WebGL and does not establish full scene physics or phone behavior.

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

#1149 realistic crouch: the pose is a deep squat set by `AVATAR_CROUCH` (`src/config.js`), every term
linear in crouch 0 … 1: hips down to about knee height and back behind the heels, the torso leaning
forward (the old pose leaned it back), knees forward and a little apart, the forearms over the knees,
and feet flat on the floor with the toes turned out. The shoes sit on new ankle bones (`footL`/`footR`
in `src/olof.js`; Olof is an Avatar too since #1156) that `poseOlof({ flat, toes, knee })` turns level;
no extra draw call. Hands held out (weapon, wave) move with the shoulder. `PVP_HEAD_BOXES` reads
`hipDrop`/`hipForward`/`crouchLean` from `AVATAR_CROUCH`, so the three shared head boxes, the Worker and
the drawn head stay together. Our mirror image eases down/up over `AVATAR_CROUCH.time`; other players
follow their interpolated states. The name tag stays at its standing height.


Distance rewards for confirmed player hits (#873): `PVP_SCORE` and pure `pvpHitPoints(distance)` in the already Worker-watched `src/config.js` are shared by PlayerRoom and Combat. The balance values are *guess*: the existing 5-point base is retained, with one extra point for each complete 2 m beyond 5 m, capped at 15 extra (7 m → 6, 15 m → 10, ≥35 m → 20). Geometry is the room's already accepted last-known shooter-feet→target-feet distance in 3D, the same distance used for the existing range/slack check; projectile origin/trajectory and obstacle predicates are not changed. Requests cannot supply reward points or award sequence. Actual awarded points consume the existing 60/minute cap; a hit above the remaining budget is refused rather than clipped. Existing per-weapon rates, participation, misses and damage rules remain.

The server appends `award:{i,seq,distance,points}` to its existing hit acknowledgement. `i` identifies the shooting connection and `seq` increases only for accepted hits in its hibernating attachment. Combat validates the shared formula and current `Ghosts.me`, then checks a scalar high-watermark before base callback, range bonus, hit counter, hit-marker restart or sounds. Ordered same-socket replay and late acknowledgements from an old socket add nothing. The independent #871 `kill` UUID receipt remains first and persistently idempotent, including when an unseen kill receipt arrives with an already-consumed score acknowledgement. A reconnect starts a new server sequence; an old connection cannot replay after reload. Cached old Workers without `award` keep the previous base-only callback. This is current-connection score dedup, not persisted hit receipt history or an authentication claim.

`stats.pvpHits` remains an integer hit count with its existing base contribution; `pvpRangePoints` is the separately saved extra amount added once by `rawScore`. Legacy saves retain already-earned base points, and reset clears both counts/extra points while #871's kill receipt replay protection stays intact. The original statistics panel adds “Träffar på spelare”, showing the hit count and a separate “avståndspoäng” subline. `tools/pvppointstest.cjs` checks the actual Worker/Ghosts/Combat/statistics DOM without apartment bootstrap/WebGL, including a real native raycast obstacle miss, confirmed short/middle/long shots, exact budget/refusal, controlled receipt replay, reconnect, reload and the visible original panel.

Shared fall integration (#869): `Fall.land` requests damage only for harmful unsuited free fall. `Fall.resolve(null)` releases a cancelled request without speculative injury; a confirmed response clears pending before starting the reaction, so duplicate completion cannot trigger a second penalty/wake. Main awaits `Combat.fall(drop,gap)` and passes its result/null to Fall.resolve. The Combat/Ghosts channel owns response matching, health and recovery. Survival red fades without stopping movement or changing pose/home/held weapon; only death runs the existing fatal sequence and #863 shared outdoor wake. `fallintegrationtest.cjs` separates native actual Player/Fall response/reaction checks from real Combat/Worker channel checks; `falltest.html` keeps the full-world route, stairs, rest and resume coverage.

#869 validation: actual Player/Fall/Ghosts/Combat/Worker native probe passed34; authored actual app/World fall fixture passed38; changed native respawn fixture passed19. All actual CLI exits0, no page errors. Reviewed full-render checkpoints show the same5/10 life HUD without a weapon and with the held blaster, death-only black and one safe outdoor wake; unchanged stairs/rest/resume and no extra PvP penalty also pass. Same health/recovery holder is used throughout; see [scope and source proof](verification.md).


### Always-visible frame rate (#884)

The existing top-left presence cell has two stacked rows: online visitors above FPS, separated by the badge divider. Presence updates only its count child, so successful/failed heartbeats preserve the FPS node. `FrameRate` counts completed ordinary main-camera draws against elapsed `performance.now()` time, publishing rounded half-second windows. Logic callbacks and separate warm-up/reflection/shadow renderer calls are excluded. Reading retains the reduced actual draw rate; pause, hidden document, portrait cover and incomplete startup clear the value to a dash. Visibility/pause transitions reset the baseline before resuming. Spurious and redundant overlay transitions during gameplay are ignored without wiping the active frame rate (#1660), and state transitions/resets are recorded in a rolling ring `__app.fpsDiag.events` (with query-parameter debug logging `?debugfps`) and reported in crash heartbeats. No extra network message, timer or per-frame allocation is introduced. The optional developer perf panel retains its separate diagnostic semantics.


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

Compact HUD data (#902, original layout before #970): at <=600px, noninteractive columns were 18/39/40/72/26px,
with the console still 44px. The weather glyph is 18px, clock 12px, score 15.4px; temperature 14px.
Online/FPS remain two divided logical rows; compact FPS number/unit occupy two lines within its
existing lower row, with 1px separation. #970 subsequently stacks clock over weather/temperature (18/48 px), removing the separate 40 px clock column; points/visitors/touch targets retain their widths.
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

## NW bicycles (#903, #905)

All nine existing NW-yard bicycles can be ridden (#905). The register follows
the actual seeded source order and occupied stall IDs, not the 18 rack positions.
Each uses its original matrix yaw (including the opposite-facing second rack).
Only the selected index moves in the same four instanced component batches;
the other eight matrices/colors, parking RNG and rack collision remain unchanged.
Interaction helpers share one invisible geometry/material and add no rendered model.
Aim at it and use E, the ordinary left-click action or the touch action button.
WASD/arrows or the existing touch joystick steer and drive; E/Space/C or the
existing stand button safely dismount. Repeated E is ignored for this bicycle
interaction only. Cycling has a saddle/handlebar camera and an explicit prompt,
without borrowing the crouch pose.

`BICYCLE` handling values are game-value guesses, not survey measurements. The
full wheelbase capsule and swept turn/travel substeps use actual Player collision,
reachable ground and headroom. #983 replaces the former flat-only support rule with wheel/terrain contact and a canonical local-Z pitch; both actual adapters expose the complete local-to-world `bike.matrix`.
Only initial physical extraction can ignore the selected rack's four edges;
subsequent riding ignores no rack/wall/door. Unsafe mount or dismount is refused.
Pause/zero dt preserves the bicycle pose.

`tools/bicycletest.cjs <base> <external-output>` runs the original index DOM,
actual StreetLife/Player, complete original input/save handlers and real touch
pointer gestures without WebGL. Controlled world/focus/lock collaborators are
explicit; it does not prove pointer lock, full World graphics or remote bike pose.
#905 extends the native driver to every NW identity: ordinary E mount, swept
turn and six-metre forward route, steering, pause, touch stand, safe reload and
exact snapshots of all eight other bicycles. `BICYCLE_BASELINE=/path/to/original/streetlife.js`
optionally compares the original visible geometry, all instance matrices/colors and
collision. `--small` adds an explicitly isolated StreetLife/Player render, requiring
the shared graphics slot; it does not build World.

The original #903 source/native stage passed29 checks (actual exit0). Final source/native
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
are needed. The initial #936 Worker independently disabled only the rear region after the
target attachment had an accepted private gt. #951 now restores only the verified
immutable first-standing exception; changed or unknown history retains that
fallback through pause, hibernation and observers joining after the greeting. Wall time
does not prove that replica draws completed the wave. Invalid/self/absent/rate-
rejected greetings do not set gt; a genuinely new socket starts fresh. Core/nose/jaw
remain independent. Immutable standing rear support is now delivered by #951; changed-history support remains #941, so the
full #936 parent stays open. This is a bounded safety fix, not full animated-world
intersection validation.

### Left temple after a greeting with immutable standing pose (#938)

A narrow left temple can additionally be confirmed after greeting only when the target's first valid state was standing and its normalized position, yaw and crouch state have never changed on that socket. The left (positive model-x) subregion stays inside the existing lateral ray, shape and 15mm entry guards; its named `greetingLeftPatch` vertical/front bounds are conservative game-policy guesses, tested against the actual unchanged Avatar/Ghosts family. The ordinary nearest-skinned-face client path still rejects a nearer arm, hair or face. The waving right side and any changed/crouched/legacy target retain #932's permanent post-greeting lateral fallback. Other head regions are independent.

This does not infer when a wave ends: paused and repeated waves remain possible. Held-weapon/suit/score changes alone preserve the history because they do not move the standing body/head; actual held-rifle and saber-swing poses are in the native verification. #935 remains open for the remaining after-greeting lateral family. There is no new geometry, animation clock, wire field, damage counter or rendering work.

### Lower central standing nose band (#937)

`noseBandPatch`/`rifleNoseBandRegion` adds canonical x±.005, y1.53+.080–.084 and z≥.132. Bounds are conservative game-policy *guesses*: every entire r3 wire cell must fit, and the original frontal direction and6mm FIRST Nose entry guards still apply. Avatar additionally requires its actual nearest Nose-tagged skinned triangle; the full Combat obstacle ray is unchanged. No geometry, profile, seed, bone, material, damage value or pose authority changes. Original core/nose-side/jaw/front/rear/lateral branches remain independent.

The read-only candidate survey found660 actual standing cells outside both published nose regions, with5280 correct corners and≤5.0284mm residual. The broader frozen native geometry stage measured720 new contacts over60 appearances/four headings/bind+three standing samples,5760 correct corners and71552 unsupported nearest contacts with0false bonus; its CLI1 retains an obsolete bind-only high-coordinate fixture expectation. The band has no measured bind support. A separate actual Ghost.push/draw/wave/held/saber/body-turn/paused-firstdraw grid measured8520 supported nearest Nose contacts/68160 correct corners over21600 rays,≤3.2714mm residual, no observed nearer-other arm case. Corrected moving/crouch samples4320 had0band cells and observed moving speed.5/gait.8; moving/crouching retain existing body-only gates. These are sampled poses, not all-animation/World/phone acceptance.

Remaining unsupported upper/lower/lateral cells stay body1; the broader nose parent #920 remains open. Native stage outcomes, exact packet/receipt proofs and source provenance are documented in verification/storage.


### Immutable after-greeting Front band (#943)

A separate `rifleHeadGreetingFrontRegion`/`greetingFrontPatch` reopens only a
narrow subset of the original Front strips after greeting. Canonical absx
.065–.071, y.086–.094 above headY, and frontal lateral/vertical cone.04 are
conservative *guess* policy values. Existing Front/profile/entry/wire padding
and all other surface branches are unchanged; no geometry, bone or draw changes.
The actual snapped origin/direction and entire r3 contact cell must fit.

PlayerRoom enables named `allowGreetingFront` only with accepted gt, existing
`headPoseFixed === true` and known fresh `turned === false`. This reuses938's
first REAL standing snapshot/immutable normalized p/r/c history, never competing
history or a client flag. No earlier visible default/no-snap pose is trusted.
Later movement/heading/crouch change stays body1 here even after returning,
hibernation, death or healing; legacy unknown history also stays body1. The old
pre-greeting Front policy remains intact and after-turn support is #944.

`tools/riflefrontgreetingtest.cjs GAME WORKER OUTPUT [GRID_PHASE_PROOF]` measures
actual Ghost push/draw/animate/wave/swing, repeated/delayed wave and capped first
draw, nearest surface/hidden pureSkull/cell corners, then real Combat/2WS Worker
receipts and HUD. Default always measures; explicit clean-grid reuse is strictly
bound to the complete producer function and every imported production hash.
This is bounded native geometry/DOM evidence, not rendered World/phone/allpose.


### Immutable after-greeting right/back temple (#946)

`rifleHeadGreetingRightRegion`/`greetingRightPatch` adds a separate right-only
subset of the original lateral policy: canonical x<0, y.098–.102 above headY,
z.038–.042, normalized side-ray depth≤.05/vertical≤.025. These are conservative
*guess* game-policy values based on actual sampled exposed rearward temple, not
anatomical measurements or a mirror of the broader left band. Original inward
side/range/origin/profile/whole-cell padding remains unchanged. The covered
z.055/.070 wave-elbow strip does not reopen. Geometry/animation/draws are intact.

PlayerRoom supplies named `allowGreetingRight` only for accepted gt, existing
`headPoseFixed === true` and known fresh `turned === false`. First real standing
snapshot/no-snap visibility and permanent normalized p/r/c history are unchanged.
Unknown legacy, moved/turned/crouched and returned targets stay body1 here; death,
healing and hibernation do not reset eligibility. Other named and legacy options
remain independent. Bigger changed families remain in935/947, not declared solved.

`tools/riflerighttest.cjs GAME WORKER OUTPUT [CLEAN_GRID_PROOF]` measures actual
Ghost held/wave/repeat/delayed/saber/suit/first-state/late-welcome poses, independent
nearest/hidden/corner negatives, then fresh owned actual Combat/2WS Worker/HUD.
Default measures; explicit grid reuse is strict function/runtime/complete-matrix
bound. `... OUTPUT --old-worker /absolute/older-config.js` intentionally boots
a fresh owned older-config validator for separate body-fallback compatibility;
it is not a stale external Worker or evidence of an actual cached live client.
Near-max positive/corner proof records240 finite cases at0.6m side origins; it
does not promise every distance/coordinate/continuous pose. No WebGL/World/phone.

### Narrow LEFT tiny-yaw family (#947)

The existing #938 left-temple patch can now retain its two-heart rifle receipt
when a greeted target changes only its normalized heading within 0.01 rad of its
first standing heading. This corridor is a conservative *guess*, verified for the
sampled ordinary Ghosts poses; the patch, surface entry and wire tolerances stay
unchanged. Coordinates and crouch state must remain exactly fixed. Leaving the
corridor, moving or crouching permanently closes this separate permission until
a fresh socket; returning, greeting again or waiting does not reopen it. Original
immutable LEFT, RIGHT, Front and Rear permissions remain independent.

A yaw-only 0.01 change is below the unchanged normal Ghosts publication threshold.
The supported server state can arrive with an ordinary score, held-weapon or suit
publication; no forced send or new message is introduced. Unknown legacy history
and clients without the optional head contact keep ordinary body damage. This
bounded slice does not establish larger-turn, moving or crouching lateral support;
#935 retains those remaining families.

### Narrow after-turn Front family (#944)
A separate measured subset of the old front skull patch can give rifle2HP after
a genuinely accepted small yaw change. `afterTurnFrontPatch` x .065–.071,
y .086–.094, cone .04 and first-yaw corridor .02rad are conservative *guesses*,
not physical measurements. The entire rounded hc cell must fit the old Front
shape and these smaller limits; original first-triangle/ray/range guards apply.
Avatar/Combat still requires the actual nearest Skull-tagged skinned surface and
the full obstacle ray. No bones, shape, material, motion or wire tolerance changes.

Eligibility requires a known private first-standing p/r anchor, unchanged normalized
p/c, every accepted heading inside ±.02rad of that first heading, at least one
accepted yaw change, and no accepted greeting on that attachment. An excursion,
movement or crouch permanently breaks the family; returning and waiting do not
restore it. This does not restore arbitrary body/head turns. Existing core/nose/jaw,
rear/lateral and greeting-Front permissions remain independent. A yaw-only change
this small does not cross the unchanged client .03rad send threshold; an ordinary
weapon/suit/score publication can carry the new yaw. The native protocol explicitly
uses a real saber→rifle switch, never forced previous state or an altered budget.

### Greeting combined with a tiny standing turn (#955)

The separate default-false named `allowGreetingAfterTurnFront` reuses exactly
`rifleHeadAfterTurnFrontRegion`: the whole rounded cell, original triangles/ray
entry and the existing guessed x/y/cone limits remain unchanged. This selects
the bounded Front band after an accepted greeting AND an accepted small yaw
change, while preserving the independent immutable-greeting943 and ungreeted
turn944 branches. No model, bone, animation, phase or wire changes are introduced.

The same known first-standing `frontTurn` anchor must remain valid. Position and
crouch cannot change; every accepted heading remains inside the existing guessed
±.02rad corridor. Movement/crouch/escape and return never restore it. Ordinary
yaw-only publication still requires the original .03 threshold; a normal held
weapon/suit/score update can carry a smaller accepted yaw without forced state.
Larger turns and unsupported poses retain body1; this is a finite support family,
not arbitrary-turn or all-pose restoration.

### Declared Front support and safety fallback (#939 / #931 audit)

All families use the unchanged actual nearest skinned Skull face, full obstacle
ray, shared triangles and whole rounded hc cell. The initial931 policy box was a
*guess* candidate, not a promise that every exposed point or pose gives head2.

| Target's accepted history | Front family | Bounded support |
| --- | --- | --- |
| Fresh, no gt, never turned | Original931 Front | Existing x.061–.075/y.078–.105/z.036–.11, cone.08 and complete-cell/profile guards |
| Accepted gt, immutable first standing p/r/c, known never-turned |943 greeting-Front | Narrow x.065–.071/y.086–.094/cone.04 |
| No gt, known first-standing anchor, accepted turn |944 turn-Front | Same narrow band; every accepted yaw within first±.02, fixed normalized p/c |
| Accepted gt AND accepted turn, same valid anchor |955 combined Front | Same narrow band/corridor; independent named permission |

Every value remains a conservative policy *guess* backed by the recorded finite
actual model/pose/cell matrix, not anatomical accuracy or continuous all-animation
validation. Moving/crouching, unknown/malformed history, leaving the corridor
and returning, wider unsupported cells/rays and arbitrary larger turns retain
body1 for these extra Front branches. This preserves the observed paused3.14
Nose-before-deeperSkull safety case; quiet time never proves rendering completed.
Normal tiny yaw-only publication still needs the original .03 threshold; ordinary
weapon/suit/score publication can carry the accepted smaller yaw. Other surface
families remain independent. Moving/crouch/other weapons belong893–895.

939's stated useful turn/greeting requirement includes the combined case;955
now supplies it. Parent closure is an explicit criterion audit, not a claim that
every initially proposed surface/turn must be positive.956 tracks possible larger
standing-turn support without becoming an automatic new parent requirement.

### Larger standing LEFT turns after greeting (#953)

A separate private first-standing history permits the existing narrow LEFT leaf
within a guessed ±0.30-rad accepted heading corridor (about 17 degrees). Its
normalized first p and standing c must remain fixed. Movement, crouching or
leaving the corridor permanently closes this additional permission; returning,
waiting or greeting again cannot restore it. The existing 0.01 tiny history and
fixed RIGHT/Front/Rear rules remain independent. This changes permission only,
with no geometry, animation, packet or entry/wire tolerance change.

The larger yaw naturally exceeds the unchanged ordinary Ghosts publication
threshold. Missing/malformed legacy history and unsupported contacts keep body 1.
An original tiny history can be permanently false while the independent larger
history remains valid, so the old .02-and-return room scenario now receives 2 HP;
.31 escape-and-return remains body 1. Larger turns outside the corridor, general
translation/crouching and RIGHT changed-pose support remain in #935/#954.

### Immutable Rear after greeting (#951)

The two existing bounded Rear patches can confirm rifle head damage after an
accepted greeting if normalized p/r/c never changed from the first valid standing
state on that connection. This uses the original `headPoseFixed === true`, not a
client pose flag or elapsed wave time. Actual held-item, greeting, repeated wave,
paused draw and late-welcome sampling supports this narrow permission. Changed
position, heading or stance permanently retains body-only Rear damage even after
return, healing, life reset or hibernation. The known 0 → 3.14 paused elbow-first
forgery remains body-only. Long hair and unsupported cells are unchanged.

`tools/riflereargreetingtest.cjs` checks actual first-surface/corner geometry and
ordinary Ghosts/Combat/Worker receipts without WebGL. It introduces no Avatar,
Ghosts, wire or Contact API changes. Other Front/LEFT/RIGHT/Nose/Jaw permissions
remain independent; #941/#936 retain the remaining changed-history scope.

### Small-yaw Rear after greeting (#952)

A separate named `allowGreetingAfterTurnRear === true` can select the existing
Rear leaf after a greeting and an accepted small heading change. It uses the
unchanged skull first-entry, 15 mm surface guard and rounded-cell bounds. No
anatomy, animation, wire or client hit authority changes. The existing ±.02 rad
first-standing corridor remains a **guess**, now sampled independently for Rear;
Front's physical proof is not reused as a Rear proof. Late observers initialized
at the opposite endpoint are sampled across the resulting .04 rad visible span.
Larger turns and position/stance changes remain outside this family (#941).
The historical #951 results describe its immutable permission at that revision;
a small turn can now qualify through this additional independent branch.

### Immutable central Nose depth (#950)

`noseDepthPatch` / `rifleNoseDepthRegion` describe a *guess* conservative central contact family: canonical x±.005, y.087–.092 relative to headY, z.127–.132, with the entire existing wire error margin inside each bound. Avatar only tags the actual nearest original Nose triangle. The shared validator admits this additive family only with strict `allowImmutableNoseDepth: true`; PlayerRoom derives that option from existing private `headPoseFixed === true`. First standing p/r/c must remain unchanged; any accepted change and return, crouching, or missing legacy history keeps this new family body-only. No new client state, animation authority, phase timer, geometry, triangles, cone, damage or tolerance is introduced. Original NoseCore/Extra/Band, Skull and Jaw dispatch remain independent. The finite native matrix includes all60 canonical appearances, initial/late states, wave/repeat/capped pause, held/saber and idle; it does not establish all continuous poses. Broader Nose coverage remains #920.

### First ordinary-turn Rear (#962)

Strict `allowGreetingFirstTurnRear === true` selects the same Rear surface after
a greeting and exactly one serialized r2 heading change of ±.04 rad. This
**guess** is the first standalone publication above Ghosts' existing .03 trigger;
no equip change, animation, geometry, ray/entry/cell tolerance or wire changes.
The private server history then requires the same endpoint and standing position.
Further accepted heading/p/c changes permanently disable this branch, including
a return. Existing #951/#952 branches retain their independent contracts.
Normalized r2 headings may be unwrapped (3.14 → 3.18); a rounded ±π alias
(3.14 → −3.10, wrapped difference ≈.043185) exceeds the studied exact family
and remains body1. Larger/repeated turns and stationary return remain #941.

### Immutable Nose prism (#971)

`noseSidePrism` / `rifleNoseSideRegion` is an additive ray-query policy generated by
`tools/riflenosesideproof.py` (removed in #1331, see verification.md) from actual native Float32 Nose geometry. It changes no
mesh or pose. The back plane z=.119 lies inside the intersection of every allowed
standing/bind Nose pose; the front plane z=1 is beyond the whole source-bounded
avatar. Every non-Nose head triangle is excluded from that segment by continuous
pose boxes (subdividing five triangles per style); source IK envelopes separately
exclude arms, torso and legs. At both planes, the rounded direction and all eight
WORLD r3-cell corner rays must lie inside the generated convex polygon. With a
fixed-sign denominator, line/plane coordinates are linear-fractional in the cell;
corner extrema and convexity cover intervening rays. The existing wire tube,
frontal cone and original6mm first-entry checks still apply independently.

`allowImmutableNoseSide === true` comes solely from the already private
`headPoseFixed === true`. Unknown/changed/returned p/r/c history stays body-only;
greeting and elapsed time establish no new authority. Avatar additionally requires
an actual nearest Nose-tagged native face. Core/Extra/Band/Depth and every other
surface permission remain independent. Source-derived continuous enclosures are
CPU geometric evidence, not a formal engine/libm/GPU proof or a World/phone claim.

This useful conservative family adds cells around canonical |x|=.0065–.0075;
it does not satisfy #971's original outer-shoulder inventory |x|>.011. That residual
remains open, alongside #920's other upper/lower, changed-heading and standing-return
scope. Active movement #893 does not circularly block a later standing return.

## Courtyard bicycles (#906)

All five existing courtyard bicycles use the same E/action, joystick/WASD, explicit cycling prompt, saddle camera and safe dismount as the NW bicycles. Their `courtyard-0` through `courtyard-4` identities keep the original rack coordinates. The shared world register now contains both groups; its collision polygons include every extracted bicycle. No new save key or mounted resume is introduced: reload returns bicycles to their original rack and restores the rider safely standing.


## Basketball PvP launch (#980)

`Combat` receives the actual `Basketball` object. `main.js` keeps its existing
`onUse` wrapper and captures `shotFrom` plus the original release velocity; the
ball-only branch rounds that launch to the ordinary WS precision. `ballflight.js`
predicts free flight using 20 ms outer slices and Basket.idle's existing gravity-before-
move / at-most-4-cm substep law. Actual visual dt can differ; this is a finite gameplay
prediction, not exact equality for every frame cadence. Basket.js and its bounce,
roll, catch, hoop and scoring behavior are unchanged.

The same three simple logical head boxes are padded by the ball's configured radius
(projected through appearance/crouch scale); the existing logical body capsule uses
that radius too. These padded boxes are a gameplay approximation, not exact sphere-
versus-anatomy geometry. The first head/body contact wins. Before awarding it, actual
`Basketball.cast` checks the forward radius and resting floor, and actual hoop
collision ends prediction. Glass and doors retain Basket.cast's original policy.
There are no additional PvP contacts after a bounce or obstacle. The Worker has no
world map; it recomputes the first head/body intersection from accepted target pose
and rounded launch. A v2 claim may become ordinary body damage if poses differ;
cached packets without the new contact remain body1. Rates, points, health/recovery,
marker and kill/replay rules use their existing paths.

`tools/ballheadtest.cjs GAME WORKER OUT` combines CPU trajectory/radius/body-first
checks, actual Basketball.onUse/release and representative idle16.7/20ms comparisons,
with native Combat and two real local Worker WS peers. No World/WebGL/phone/FPS
verification is implied by its DOM image or selected finite trajectories.

Final #980 native after the #979 merge passed 39/39 with actual CLI 0, including
cached body1, a forged head claim on a real product body path, authoritative rate,
first-body/later-head, and lethal/replay controls. Actual Basket.idle endpoint
errors in the selected free-flight inputs were 0.436 mm at16.7ms and 0 mm at20ms;
6 cm is the fixture acceptance threshold, not a measured error or an all-dt bound.
The unchanged Basket.js preserves bounce/roll/catch/hoop scoring. Focused existing
v2/Nerf/bow Node tests passed 11/11. The broad earlier suite remains 52/53 / CLI1
on the old v1 randomized lateral-greeting assertion (players.test.mjs:657/#945);
that failure and the first incomplete ball-fire integration/fixture attempt (37 checks/9 failures) are retained,
not counted as green. Native ack PNG verifies the ordinary Huvudträff HUD only.

Runtime `9da8c9e` actually deployed via Wrangler run38544206471/job115786107866
(uploaded/deployed, version `fa8f3f5c-dc3e-4057-8884-8853c71d6a68`) and Pages
run38544206428/job115786108544 (correct source deployment, reported success).
All51 frozen executable/producer files matched the publication; the ordinary main
basket injection was inspected separately, not executed as a full World test.
Raw provenance, exits and native images are retained in `/tmp/lunden-priority-980/`.


## Representative one-hand grip audit (#912)

`tools/onehandgriptest.cjs GAME OUT` runs the actual Hand with five production
representatives: Cup with its explicit handle grip, FishPack/FishFinger with its
existing0.62 pinch, the first wine bottle with Bottle's generic fallback, the
source-bound BESTÅ wine-glass geometry with Glass's fallback, and CoffeeJar's actual
Scoop handle. It checks rest, drink/bite/pour/fill, and moved/turned camera states.
Glass geometry/material are extracted verbatim from the existing BESTÅ builder;
fixture supports/counters/freezer collaborators are minimal, not the apartment.

All15 native states preserve the whole item world matrix, parent, contents and
action state through Hand.update, with the modeled hand-contact point following
the existing grip. Bottle and wine-glass model root scales are1 throughout; the
suspected double-scale fallback problem is not established for these actual models.
Their cached local grips remain stable through the tested poses. This does not
certify arbitrary scaled models or every other holdable.

The original runtime remains unchanged: the five representative grips show no
confirmed small correction that warrants replacing an existing pose with a guess.
The bottle's coarse enclosing hand overlaps its body/label in the images; this is
not treated as proof of an incorrect coordinate basis or an exact surface-contact
measurement. Cup handle, fish pinch and scoop handle remain recognizable during
use; the glass follows its original close drinking pose. No anthropometric claim
follows from the pictures or the modeled contact coordinates.

Native audit passed36/36 / CLI0 with zero WebGL. `--render` requires the orchestrator's
exclusive graphics grant: one640×400/FOV72/DPR1 component renderer, simple lighting,
15 actual product/hand views, raw result/source and per-view JSON before PNG.
The accepted original run passed50/50 / CLI0 in4.277s, no page errors, with all46
frozen source/producer hashes unchanged. All15 images were inspected. The recorded
owned Node/Chrome processes exited, and their exact temporary profile was absent
after browser.close. Artifacts are retained under `/tmp/lunden-priority-912/` and
the orchestrator run archive. This is component/native evidence, not World,
physical-phone, saved-session reload or a general natural-grip guarantee. No gameplay
or changelog change was needed for this audit.

## Bicycle terrain (#983)

All currently registered NW/courtyard bicycles use the same Player rule; future garage adapters inherit it without creating new rideable models here. Named `BICYCLE.maxRise=.12` (#1300; was .075) and `maxDrop=.35` are gameplay guesses: the existing 5 cm yard concrete edging and the 10 cm street granite curb can be ridden up over; ordinary stair risers (15.5 cm) still stop upward travel, so `maxRise` must stay below them. Downward steps and ordinary ramps follow actual wheel support. A larger unsupported descent uses gravity and the existing single `onLand(drop,gap)` fall-damage request; safely supported pivoting before release is not counted as free fall. Airborne dismount is refused and the existing supported standing/save fallback is retained. `standDrop=.15` preserves the previous dismount height limit.

`bikeGround` adds bicycle-only tops from the exact rendered street curb boxes and the existing StreetLife concrete edging, spatially indexed in 2 m cells. Walking `groundY` is unchanged. Two round tyre profiles, a bounded pitch solve and the raised frame envelope follow nosings without moving through the tread. Both existing model adapters apply yaw then local-Z pitch to the original geometry; only the selected instance/ranges move, with original batches, other models, transformed normals and refreshed bounds preserved. Hull/headroom, closed doors, walls and rack exclusion rules remain active.

Relevant house routes use their existing data: Hus L/A east-gable ramp and east stair, Hus C NW stair, and the B/C south stair. They share Player terrain handling but do not share copied dimensions. Native route tests cover all three stairs in both directions, both ramp directions, reverse riding, the actual two curb types, and wall/door/headroom/fall/dismount boundaries. This is not a claim about basement entry routes or the unimplemented 44 garage bicycles (#907/#986–#989).

## Representative weapon first-person grip audit (#913)

`tools/weapongriptest.cjs GAME OUT` exercises actual Hand with four production
weapon representatives: AKMS (`Rifle`), Nerf blasters (`Blaster`: pistol, drum, long),
magic wand (`Wand`), and lightsaber (`Saber`). It verifies rest, firing/recoil/wave/swing,
and moved/turned camera poses without the full apartment.

The audit established that without explicit model-local grips, Rifle, Wand and Saber
used bounding-box fallback in `Hand.gripOf`:
- Rifle fallback placed hand contact ~37.6 cm forward on the barrel/handguard instead of the modeled wooden pistol grip, with 0.75 curl.
- Nerf blasters had hardcoded `[0.025, -0.075, 0.07]` in `Blaster`, placing hand contact 2.5 cm offset and forward of the modeled grip panels.
- Wand fallback offset the hand ~2.9 cm to the side of the vertical shaft with 0.75 curl.
- Saber fallback offset the hand ~3.5 cm from the ridged hilt segment with 0.75 curl.

Explicit centralized grips were added:
- `RIFLE.grip`: `[0, -0.062, 0.088]` at the wooden pistol grip center (*guess*, #913).
- `TOYS.nerf.grip`: `[0, -0.088, 0.092]` centered across blaster models (*guess*, #913).
- `TOYS.wands.grip`: `[0, 0.08, 0]` along the lower shaft (*guess*, #913).
- `SABER.grip`: `[0, 0.11, 0]` along the ridged hilt segment (*guess*, #913).

All held-item model matrices remain byte-exact between baseline and candidate across all
phases; projectile/hit origins (Rifle hitscan eye ray, Nerf origin `where() + dir * 0.3`,
Wand star world position and eye ray, Saber tip segment `localToWorld(0, hilt+blade, 0)`)
Native audit: 54/54 PASS / CLI 0. WebGL `--render`: 66/66 PASS / CLI 0 at 480×300/FOV72/DPR1.

## Representative palm and two-hand grip audit (#914)

`tools/palmhuggriptest.cjs GAME OUT` exercises actual Hand with three production representatives:
Tilly's basketball (`Basketball`, `handPose: 'palm'`), Pingping penguin cushion (`Pingping`, `handPose: 'hug'`),
and Miele the family cat (`MieleHeld`, `handPose: 'hug'`). It verifies rest, throw/hug actions,
and camera translation/rotation without the full apartment.

The audit established that:
- Basketball on palm used `grip: [b.r * 0.45, -b.r * 0.85, 0.02]` with an unpitched forearm-aligned hand pose, resulting in the palm resting inside the ball and fingers penetrating up to 3.4 cm into the sphere (6,707 vertices inside).
- In `Hand.pose`, `mode === 'palm'` only rotated roll around local Z without leveling the hand at the wrist, leaving fingers tilted upward by ~18° into the sphere.
- Pingping's hug grips were set at `P.h * 0.60`, placing the hands on Pingping's cheeks/face mask instead of around the flippers and mid-body.
- Miele's hug grips were placed at `[0.095, 0.16, 0.02]`, pinching the front paws and white bib rather than resting on the flanks of the ribcage.

Corrections:
- `HAND.palmPitch`: `-0.32` rad (*guess*, #914) leveling the open palm and fingers under the carried basketball.
- `HAND.palmCurl`: `0.14` (*guess*, #914) cupping the underside of the sphere naturally.
- `Basketball.grip`: `[b.r * 0.25, -b.r - 0.002, 0.015]` in `src/basket.js`, eliminating penetration (0 vertices inside, 0 cm max penetration) while keeping ball support within ~5 mm.
- `PINGPING.grips`: `[[0.188, 0.182, 0.03], [-0.188, 0.182, 0.03]]` (*guess*, #914, `P.h * 0.48`), placing hands on sides around the flippers.
- `MIELE.grips`: `[[0.108, 0.16, -0.005], [-0.108, 0.16, -0.005]]` (*guess*, #914), situating hands naturally on the flanks of her ribcage while keeping bib and paws clear.
- All held model matrices, softness, place, home, save, basketball throw origin (`hand()`), aim parabolas, FIBA scoring, and hug counters remain 100% preserved. Wrist/arm angles stay natural (<5° deviation).
Native audit: 18/18 PASS / CLI 0. WebGL `--render`: 17/17 PASS / CLI 0 at 640×400/FOV72/DPR1.


## Shared rug material library (#995)

While Möblera om is enabled, aim at a rug (or select it for moving), open Meny
and choose “Välj mattans tyg och mönster”. The existing terminal lists Original,
Sand, Blågrå, Olivgrön, Blågrå ränder and Sandrutor. A choice returns to the
uncovered scene for local preview; “Bekräfta material” or the normal E/action
commits it. Avbryt/X, leaving the mode, or cancelling restores accepted material
without a PUT. A pending remote choice wins on cancel. Original restores only
the surface, preserving placement; the separate furniture reset keeps its
existing positional meaning. Both keyboard buttons and touch use this flow.
The existing coarse-pointer portrait rotation gate is unchanged.

All six real rug roots register one stable `textile` surface before their normal
per-piece merge. `src/materialcatalog.js` shares compact preset IDs and exact
existing furniture identities with the Worker. Each surface retains its original
material pointer and a bounded map of variants; deterministic preset maps share
by choice and UV dimensions. Only that rug's material binding changes, retaining
its original roughness/bump, geometry, UV, height and support. Both existing lamp
washes patch newly chosen materials before rendering, and focus decoration keeps
the chosen material when cleared. No long-pile geometry is introduced: #996 owns
the separately requested fuller silhouette and changed rug/support height.

`tools/materiallibrarytest.cjs GAME LOCAL_WORKER OUT` requires the same mandatory
external `LUNDEN_SECRET_TEST_INPUTS` as layout tests. It imports real rug builders,
merge, Rearrange and source-bound main terminal controls, using two real local
HTTP peers. Native forbids WebGL; `--render` requires the shared graphics slot
and draws one actual rug component at a time. Controlled World/light collaborators
do not certify a full apartment, physical phone, long pile or hardware FPS.

The Worker-first slice `fc5800c` passed all11 real-room schema tests and actually
deployed through Worker run38548786983/job115801355607 at10:20:10Z2026-10-14,
version fe336f1c-250f-4bc9-bf26-a5fad9d5714d. Native7 passed28/28 actualCLI0
in10.03s, including600 preview switches reusing the same preset materials/maps,
real focus identity and the source-bound X cancel. A single granted640×400/FOV72
component renderer produced eight inspected real-rug pictures (all six rugs),
14/14 actualCLI0 in15.33s, one draw per view. Its254 frozen paths matched through
capture. The later native-only target-piece/X adjustment does not change rug
builders/maps/geometry or that picture branch; final publication parity records
the exact remaining source differences. No apartment, long-pile or phone result
is implied. Original CLI1 attempts remain archived: missing fixture collaborator,
a stopped local service, the existing coarse-pointer portrait rotation gate,
and a shader assertion missing the existing `highp` qualifier.

After integrating the other agents' bicycle/daily-task commits, native8 passed
29/29 actualCLI0 in10.56s, adding a genuine ordinary begin/ghost/confirm move
that retains accepted cloth; the Worker schema suite again passed11/11CLI0.
All254 final native source bytes are archived. All254 original render bytes
were also recovered exactly against their pre-run SHA256; ten whole-file
differences are enumerated, with actual rug builder/geometry/map/image code
unchanged and FURNITURE/MATERIAL_LIBRARY/LEVELS/LIGHTING data compared equal.

Final integration also retains the incoming #913 weapon grips and #994 daily
bonus: native9 passed29/29 actualCLI0 in10.02s and schema11/11CLI0. The final
publication manifest enumerates 16 render-to-publication whole-path differences;
the same eight inspected image views remain evidence for unchanged rug
builder/map/geometry/image code, not for the unrelated whole-World changes.

The complete rug-library runtime is published as
`e21f65f697f82f5d85cde9c3080cffb6943f9f01`, changelog789. Actual
Worker38551245721/job115809448091 executed wrangler deploy at10:41:09Z and
Uploaded/Deployed at10:41:12/13Z2026-10-14, version
41c5eb9a-a3f5-4041-a35f-1707568680d8. Pages38551245708/job115809448639
created the deployment for that exact SHA and reported success at10:41:11Z.
Publication's260 hashes match the commit; all255 final executable/native paths
match the last native test. Earlier changelog bytes and publication times are
unchanged. This closes only the six-rug color/pattern family; #996–#1001 and
parent #991 retain long-pile and other textile acceptance.

### Rug pile choice (#1086)

Rugs show two surfaces in the material library: Mattans tyg (colour/pattern) and Lugg (`category: 'lugg'`, choices
Kort lugg = Original and Lång lugg = `pile-long`, `PILE_CHOICES` in `src/materialcatalog.js`). Each is saved as its own
`materials[id].pile` entry through the usual revision-checked material write; `validMaterialChoice` accepts `pile`
only for the six `RUG_MATERIAL_IDS`, so the Worker validates it from the shared catalogue
(`cloudflare/materialcatalog.test.mjs`). Saved layouts without `pile` keep the short look. The library's status line
names the surface-specific choice (e.g. Kort lugg). Rendering: [graphics](graphics.md#shortlong-pile-on-every-rug-1086).

### Neutral textile shades (#1070)

`src/materialcatalog.js` `NEUTRAL_SHADES` appends nine plain neutral colours to each of the three textile families
(rug `rug-*`, curtain `curtain-*`, upholstery/linen/cushion/towel/shade `upholstery-*`): Vit, Gräddvit, Ljusbeige
(curtains: Sandbeige, as Linnebeige already exists), Gråbeige, Taupe, Ljusgrå, Mellangrå, Antracit and Svart. The hex
values are chosen design tones, not measured products. Existing IDs and order are unchanged, so saved choices still
resolve; the Worker validates the new IDs through the same shared catalogue (`cloudflare/materialcatalog.test.mjs`).
The terminal palette wraps (flex-wrap) and scrolls with the terminal on phone widths.

### Curtain material library (#997)

All six existing Curtain sets are fixed `materialOnly` targets: editing focus opens the same library as rugs, with category `gardin`; they never enter movable pieces, pose ghosts or position-reset writes. The library previews locally, confirms through the existing material revision endpoint, and cancels without PUT. Original restores the exact original cloth material/map, independently of legacy blind position. Existing BlindPanel keyboard/touch controls remain unchanged; the living-room three-panel set uses the same controls and saved blind ID.

### Interior surface selector (#1014)

In the same material library, a small “Yta” selector lists Klädsel plus the sofa's
four cushions/folded throw, or Klädsel plus the armchair's two cushions/draped
throw. Selection starts a preview for only that named surface; changing surface
restores its previous unconfirmed preview first. Choosing a preset returns to the
existing unobstructed edit view. Confirm/ordinary action, cancel/X, touch,
keyboard, exiting mode and pending-remote behavior keep the existing lifecycle.
Original restores only the chosen surface and preserves furniture placement.

`beginMaterial(piece,surfaceId)` has an optional ID; old one-argument consumers
still get the first textile surface. Invalid IDs return false without discarding
an active edit. Reopening the menu retains the active surface. Generic color/
pattern choices reuse the existing `klädsel` family rather than duplicating map
logic. Local real-browser checks cover a cushion preview with zero PUT, a throw
confirmation visible to an ordinary peer, independent concurrent cushion edits,
new visitors/reload, legacy move/material concurrency, stale conflicts, offline
accepted-cache retention and actual keyboard/touch controls. Controlled scene
collaborators do not certify apartment geometry or physical phones.
### Long-pile preview and supported objects (#1009)

The living-room rug library adds Blågrå långlugg through the existing local preview/confirm/cancel controls. `applyMaterialSurface` brackets height-affecting local previews and cancellation with actual snapshotRugSupport/reconcileRugSupport and refresh/changed hooks; accepted remote applies use #1008’s existing boundary. Derived furniture/stack/loose/rest/lamp heights need no extra PUT or revision. The floor-loose detector compares against current rugLift, so repeated pile previews/cancellation find items already standing on the taller rug. Original keeps the accepted rug pose. Main step synchronizes visible non-held/non-released floor cats immediately before existing cat.update; followRug’s null rugY leaves furniture-supported cats alone. The normal step runs while the library is reading; no new cat physics or held/release policy is added.

### Existing hanging-towel materials (#1029)

Seven existing towels reuse the shared library/surface selector and klädsel presets. `towelhooks` owns independent `towel-{seed}` surfaces; RÅGRUND owns `towel`. The existing `HandWash.kitchen` child uses the explicitly NEW `KITCHEN_TOWEL_MATERIAL` identity as a material-only target, without a second object or movable pose. Ordinary locked visitors receive shared choices without edit access. Preview/cancel stay local; confirm uses existing per-surface revisions.

Builder-owned private body/band/loop handles retain distinct Original colors/maps, UV0 and folds. `towelTarget`, keep/targets, six actual drying interactions, hand wetness/timing/swing, the oven-door child and chair rest/footprint remain unchanged; RÅGRUND gains no drying interaction. No garments, stored towels or cleaning cloths are added.

### Bicycle hands and temporary stow (#984, first useful vertical)

`BICYCLE_GRIP` names the existing bikeGeometry rubber-cylinder centres/radius/length without changing geometry. `Hand.bikeArms` maps those contacts through the actual bicycle and camera matrices, including the existing mirrored left arm and supported pitch; it reuses the six hand/sleeve/cuff meshes. Riding has priority over held/suit/reach poses and preserves the separate ordinary/suit branches.

Successful Player mount reserves both hands through `stowBicycleHand`: current use becomes empty, the same model is detached, and its held pose/contents/owner place stay intact without onPut/onTake. Trigger cancellation happens after held=false, so a drawn bow does not fire. Denied mount/exit changes nothing; successful exit/spawn restores once. Busy-hand checks, Life action/view-sync and stale main menu/click paths cannot take/use the stowed item. The weapon/appearance key is empty while riding. Owner-reset/removal/shatter guards prevent resurrecting invalidated objects. Existing safe furniture reset first exits the bike.

The full parent remains open for explicit stow-only reload bridges #1034 (food) and #1035 (unique objects) for older transient owners; no general inventory model is introduced here.

### Admin choices below the console input (#1051)

The ordinary chat/command field remains `terminal-code`. Only after a valid
private code creates a session does `terminal-admin-menu` show the two choices
Rapportera and Möblera below it. The production `changed` callback grants
`rearrange.unlocked` without enabling editing. Möblera explicitly enables it and
closes chat; the existing Klart, Escape and X controls still exit editing.
Logout/expiry hides both choices and disables editing.

Rapportera opens a separate native `dialog` outside the terminal form. Its own
textarea, form submission and live status keep report prose separate from chat.
The native modal makes the rest of the page inert and contains keyboard focus;
production terminal keyboard routing defers to it, and the modal stops bubbling
keydown/keyup to gameplay. Escape or Stäng closes only the popup and returns focus
to Rapportera while leaving the unsent ordinary chat text unchanged. Expiry closes
the popup, hides the choices and preserves its draft for the next login.
Screenshot capture, pending UUID/image retries and in-flight draft preservation
use the existing report pipeline. Legacy slash aliases remain compatible but
are not advertised in public help or action rows.
The optional masked login field owns Enter (including numpad Enter): the document
capture handler lets that key reach the field, which prevents ordinary console
submission and starts one login request. Escape retains terminal close behavior (#1054).

### Photo in the report popup (#1181)

The report popup has a camera button backed by `#admin-report-file`
(`<input type="file" accept="image/*">`, without `capture="environment"` so mobile browsers offer
both photo album and camera choice, #1269); on a computer an image can
also be dropped anywhere on the popup. `src/reportphoto.js` decodes with the browser's own
codecs (`createImageBitmap(..., {imageOrientation:'from-image'})`, so EXIF orientation is
applied; HEIC only where the browser decodes it, otherwise a clear Swedish error), scales to
`REPORTS.imageEdge` and re-encodes through the shared `encodeReportJpeg` (also used by
`ReportCapture`) under `REPORTS.imageBytes`. Canvas re-encoding writes no EXIF, so GPS/device
metadata never leaves the browser. A preview offers Byt/Ta bort. The screenshot is still
captured and sent as `image`; the photo goes beside it as the optional `photo` field (#1182).
Legacy chat `/rapport` sends only the screenshot. A changed photo gets a new report UUID,
and a successful send clears it. Layout: full screen inside the safe area with a compact
one-line header on phones (`max-width: 600px` or `max-height: 500px`, as #1141), text and
photo side by side in landscape, and a large two-column modal on desktops of at least 1100×720.
Probe used: real index DOM + AdminReports with stubbed Worker routes, 4032×3024 EXIF-rotated
GPS-tagged JPEG via `setInputFiles` at 390×844, 844×390 and 1920×1080, sent photo checked
with `validReportImage` and the PUT body against `REPORTS.putBytes`.

### Shared dialog close corners (#1059)

`src/dialogclose.css` positions `.dialog-close` controls at the actual surface's
top-right corner, with a 48px target, Swedish `aria-label="Stäng"`, shared close
SVG and visible keyboard focus. `.dialog-card` marks cards/papers rather than
backdrops; compact tool panels and the native report dialog reserve their own
corner space. Book/poster close controls move above their content; the console
keeps its X while editing instead of replacing it with a text action.

Existing IDs, listeners, Escape routing and report focus/draft behavior remain
the dismissal authority. Four additional corners use `data-close-target` through
`initHudIcons`: install → browser-play skip, player name → anonymous skip, reset
→ cancel, drawing → finish drawing. Explicit cancel, destructive and drawing
actions retain their labels and behaviors. Statistics and existing note/tool/
avatar close controls use the same treatment. The update notice remains a status
notification with its existing dismiss button.

`tools/dialogclosetest.cjs` covers all 20 dialog/statistics surfaces in native
index DOM and the production safe dismiss routes; `tools/adminreportstest.cjs`
covers the actual console/document routing and native report modal.

Typed clock time (#1242): `src/clockinput.js` (`parseClockInput`: "14:30", "14.30", "1430", "930", "9"; 00:00–23:59 only, else null; `previewDigits`) feeds `ClockPanel.setTyped` in `src/wallclock.js`, which sets only the time of day (date, pause state and the real-time offset keep working: `realAt` reset, `day.update(0)`; saved by keep.js as before, the New Year countdown reads `day.hour`). With the mouse locked the digit keys (also numpad) fill a HH:MM preview in the strip's big time, Backspace deletes, Enter applies, Esc clears. On touch / a free pointer "Skriv tid" opens a numeric field (`inputmode=numeric`, auto colon, OK / Enter applies, Avbryt / Esc cancels, invalid shows "Ogiltig tid – skriv 00:00–23:59"); its key events stop at the form, so typing never walks or spools. Tests: `node --test tools/clockinputtest.mjs`, `tools/clockinputgametest.cjs GAME OUT` (real app, desktop + phone viewport), `tools/clocktest.html` unchanged.

Cat binder photo menu (#1257/#1379): four fixed collection pockets per page retain `CAT_CARD.breeds` order; undiscovered pockets show silhouettes. Found cards use an existing photograph as an uncropped portrait, with breed/name/rarity/points. Click/touch opens that variant's album, retaining weight/facts/counters and all photo actions; legacy pictures retain their extra page. `binderPanel.back()` (main.js capture keydown) closes the confirmation, then enlarged photo, then album, then panel. While a photo is enlarged ← → / A D / swipe browse photos instead of pages; paging never changes the hidden collection behind the album. Save/unsave keeps focus inside the enlarged view, and returning from the album focuses the selected collection card. All controls are >=44px; the collection works in portrait while its panel is open (the rotate cover returns on closing). Normal capacity is eight (#1399); at capacity the oldest unsaved photo rotates, all-saved slots reject finds. Older archives above eight show all photos with a distinct protected-archive message and reject incoming finds without automatic deletion. Test: tools/bindertest.cjs.

## Mutual Sarah/Olof kiss (#1398; replaces #1343)

`src/kiss.js` checks both names together: NFKC, case-insensitive substrings, exactly one Sarah category and one Olof category. A name containing both words matches neither. `Ghosts.canKiss` controls the existing E/touch target and the Worker independently checks both cleaned names, finite 3D positions and both weapons. Client range is 1.35m, server margin 1.6m (guesses). Other pairs retain normal greetings.

The reserved greeting index `KISS.phrase` is still never randomly chosen. New requests add a positive monotonic `q`; PlayerRoom persists the last accepted request per connection to reject replay even after cooldown. Both partners have a short busy window. Only accepted kisses are echoed to the initiator and broadcast with stable server `id` and `at`. Normal greetings retain their old non-echo protocol. New clients ignore legacy kiss packets without a receipt, so they cannot reward an old server's unconfirmed interaction.

`Ghosts.startKiss` validates participants and deduplicates a bounded receipt set. Both remote ghosts and the own mirror receive the same smooth approach/hold/return envelope. The pose faces the partner, adapts reach and hip height, and suppresses the wave. Player feet and camera are not teleported. `Avatar.update` applies the lean through the existing rig; the lip/muzzle shader attribute and `uKiss` narrow and extend the mouth within the existing SkinnedMesh. Adjacent skin follows the lips. Idle talking and normal pose reset the uniform; no new mesh, light or per-frame network state is added.

At approach end the ordinary positional/muted audio path makes a closed-lip hum then a smack. Hearts burst at contact through one reused pool (one extra draw only while visible). Initiator-only `onLove` calls `stats.awardLove(id)` at contact; a departure, weapon change or separation before contact cancels the event without reward. `SCORE.each.love` is exactly 100 (user); no greeting points are added. The HUD badge says “Kärlek +100”, the statistics panel shows kisses and love points, and bounded receipt ids are saved in the existing statistics record. Reset/disconnect clears pending poses; stale/duplicate events cannot run twice.

This is personal gameplay, excluded from the public downstream. Tests: `tools/kisstest.mjs`, `cloudflare/players.test.mjs`, `tools/kisspeertest.cjs`, `tools/kissapptest.cjs` and the unchanged talking-mouth regression `tools/avatarmouthtest.cjs`. All new tunable timings, reach, lip and audio parameters live in `KISS` (guesses except the requested score).

## Greet, hug or kiss another player (#1405)

Aiming at another player opens the existing choice menu (`showChoices`, the same rows as life-sim things and lamps): `Ghost.door.options()` asks `Ghosts.choices(g)`, which lists `playerChoices(me, them)` from `src/hug.js`: **Hälsa** and **Krama** for every pair, plus **Pussa** for a complementary Sarah/Olof pair (the unchanged `kissPair` rule from #1398: Sarah/Sarah, Olof/Olof and names containing both words get no kiss row). The menu always starts on Hälsa, so E / a click without moving the mark greets; 1–3, the wheel and the touch buttons (short labels Hälsa/Krama/Pussa, `shortButtonLabel`) pick the others. A row that is out of range stays listed with the reason “gå närmare”, so rows never shift under the mark. `Ghosts.greet(g, kind)` sends only the chosen kind; nothing upgrades a greeting automatically. Kiss/hug rows set `noReach` (the hand does not reach out; the embrace waits for the room).

A hug uses the reserved greeting index `HUG.phrase` (14; never chosen at random, below the Worker's `greetPhrases`). The Worker (`cloudflare/players.js`) accepts it for any two connected unarmed players whose last known feet are within `HUG.serverRange` (3D, so another floor is refused), under the ordinary greeting budget, the kiss's monotonic `q` replay check and one busy window per partner that kisses and hugs share (no overlapping embraces). Accepted hugs are echoed to everybody, initiator included, with a stable `id`/`at`; old servers' unconfirmed packets are ignored. `Ghosts.startHug` checks participants and range, shares the kiss receipt set and gives both avatars (remote ghosts and the own mirror image) `hug = { start, toward }`. `Ghost.poseHug` turns the drawn figure to the partner, moves it half the remaining distance in (to `HUG.gap` between body centres; the feet's network positions and the camera stay) and blends both arms from rest to `HUG.hands` round the partner (one over the shoulder, one round the waist) with the `hugAmount` envelope; the head tips down a little. `updateHugs` ends the event after `HUG.duration` or at once when a partner leaves, draws a weapon or the pair is out of range, and `reset()` (disconnect) clears it; `animate` puts the figure back at its feet whenever no hug is running. The hugger's line “Kram på dig, {n}!” shows as their bubble (ours at the bottom). No score, sound or hearts for hugs; greetings and kisses keep their points, love, audio and hearts. No mesh, light or draw call is added.

Tests: `tools/hugtest.mjs` (menu rows by name pair, range, envelope), the hug case in `cloudflare/players.test.mjs`, `tools/hugpeertest.cjs` (three real Ghosts clients through the local Worker) and `tools/playerchoiceapptest.cjs` (the real World with E/1–3 or 844×390 touch buttons). Personal gameplay, excluded from the public downstream.

Cat encounter photos (#1400): E/Touch Klappa and held Krama share the physical cat's one photo
attempt; pickup alone does not take a photograph. Repeated pet/hug actions still animate and score
normally. Move/drop/pickup/stow retains the guard; a genuinely new appearance can add another photo
under the existing eight/full/archive policy. Kept Miele retains true or false across reload.

## Courtyard slide (#1414)

Aim at the existing ladder or top platform and use E / the touch action to climb,
sit, slide along the chute and step onto checked free ground. E, Space, C or the
primary touch action abort; the touch jump button also aborts without jumping.
`src/slidemovement.js` owns this transient movement, separate from Rest and swings.
Occupied hands, sitting, bicycle, flight, suit and other active movement modes
prevent entry. Normal walking resumes after completion or abort; an external
respawn always keeps its new position. A session saved during a ride uses checked
ground, including when starting on the top platform. Ride state is not saved, and riding awards no points. `COURTYARD.slide.ride` holds timing, eye and clearance guesses; the existing
visible slide and collision footprint remain unchanged.

## Home TV film controls (#1483)

All three TVs open a shared film chooser through nearby E/touch or the held remote
click/action button. The existing remote ray retains wall rejection and9m reach.
Each screen has independent exclusive control; other viewers see its controller
and disabled editing. Closing releases control and keeps the film playing.
There are no separate activation buttons. If the browser requires a sound/playback gesture, the next interaction with the physical screen activates that viewer locally before opening any chooser; TV, cinema and computer routes check this before unlocking the pointer. “Vanliga TV-kanaler”
returns to existing programmes. During a shared film the remote's power action
opens the same shared controls, preserving the exclusive owner rule.
Unique dialog/input/title IDs and shared CSS replace the earlier cinema-only
selectors; `showNote(false)` also closes an open TV chooser.

## Shared computers (#1488)

`ComputerHub` opens an independent YouTube/Spel app selector through ordinary
E/touch on each of the seven registered computers, within `COMPUTER_MEDIA.reach`.
Olof's desk corner in Sovrum 4 (#1566) is the seventh: its landscape monitor is the
app screen, and the Batman chair is the ordinary seat in front of it; its screens, case
RGB and LED strip follow the same power snapshot (#1576, `src/tillydesk.js` `deskPower`).
All start off: the first interaction requests shared power-on without opening a modal;
the next opens app selection. Walking near or sitting in a gaming/bunk chair never
powers a registered station on. The laptop keyboard toggles shared power, and every
app selector has a shutdown action. Power snapshots drive monitor darkness, hardware
lights/fans and laptop state; disconnect/room exit restores the dark off surface.
One RoomCinema lease controls each screen. Read-only visitors cannot change apps,
select films or join as that computer. YouTube uses the same official world-space
iframe and shared film clock as the TVs. Switching to a game stops that computer's
film; it does not change other computers, TVs or the cinema.

`snakeview.js` renders the server arena only on the physical monitor texture
(#1491). Selecting Spel changes the app dialog to a nonmodal bottom toolbar and
frames the actual screen without moving the avatar. Closing or switching apps
restores the saved camera pose. Esc/E and Lämna datorn leave; Startsida
and YouTube return to the modal app selector. Window capture isolates game keys
and mouse/touch from world input; steering raycasts the actual screen UVs and
accounts for the arena letterboxing. Snapshots interpolate at a capped20Hz; static
menu textures upload only when changed. Arrow/WASD headings, pointer/touch steering
and44px directional buttons never feed the avatar movement keys. A join/restart
is explicit. Food grows length/girth; larger head collisions win, equal heads
both die, and body collisions leave edible remains. Names/scores show actual peers.

Klossar and Meteoriter (#1577) are the picker's "Spel · Klossar" and "Spel · Meteoriter"
(server app ids `blocks`/`meteors`). They are single-player per computer: the controller's
client runs the pure rules (`src/blocks.js`: seven-piece bag, rotation with wall kicks, soft/hard
drop, line clears ×level, faster gravity every ten lines; `src/meteors.js`: turning/thrusting
ship with inertia and wrap-around, bullets, meteors that split large → medium → small, lives,
harder waves; tunables BLOCKS/METEORS in config, *guess*) only while its panel is open, and
`src/arcadeview.js` paints them on that monitor's existing canvas texture (no new meshes or
draw calls; idle/start/end screens upload only when they change). They use the same nonmodal
toolbar, screen framing, window input capture and Esc/E/Startsida exits as Ormstriden; the
toolbar has Starta/Spela igen and 44px touch pads (Meteoriter's pads act while held). Space
starts a round, then hard-drops or fires. Leaving, switching app or powering off ends a
running round. Other visitors see a cheap "<namn> spelar …" card with the top list instead
of a synced picture.

Top lists (#1577, `src/gameboards.js`, Worker `cloudflare/games.js`): each game's panel shows
its top 10 (names from the #198 leaderboard profile, `Anonym` without a name, always text), and
the monitor shows it between rounds (Ormstriden: no snakes, or ours is out). A finished
Klossar/Meteoriter round is POSTed with its time (and lines/wave); Ormstriden results are
computed by the server arena and written by the players' room when a snake dies or leaves,
keyed by the player UUID sent with `join` (never broadcast). #1585: every row shows a small
avatar thumbnail before the name (the panel list and the monitor's canvas list; a neutral
silhouette without a stored look), the own row is marked by the Worker's public row key, and
Ormstriden rows store the look the player had when joining. Without the cloud or on any
error the panel shows "Dina bästa omgångar (lokalt)" from `lunden.gameBest.<spel>`; requests
time out after GAME_BOARDS.timeoutMs and nothing waits on them. The computers themselves
still need the shared room (#1488) to be powered and controlled.
Tests: `node --test tools/arcadegamestest.mjs cloudflare/games.test.mjs` and
`node tools/computergamestest.cjs GAME LOCAL_WORKER OUT` ([verification](verification.md#computer-games-and-top-lists-1577)).

`Ghosts.snake` coalesces pending headings within the existing shared5Hz socket
budget, without extra sockets. App, lease and join/leave commands take precedence
over superseded inputs. Closing controls, changing apps, leaving reach/room,
hiding the page, power/furniture removal or disconnect removes the active snake.
The last departure removes the ephemeral arena; films retain the existing
last-room-viewer lifetime. Reconnection clears old ownership and requires a
fresh control claim/join. Rules/food/collisions are server-owned in `snakearena.js`;
clients never submit positions, lengths, food or kills. No game state is saved.

## Shared media transport (#1490)

Every CinemaPlayer chooser (TV/cinema/computer) includes ±10s buttons. The held
TV remote exposes matching touch buttons while aimed at a playing TV and J/L
keyboard shortcuts (bracket-key aliases retained). `Remote.seek` reuses the
existing click cooldown/LED feedback. `TVMedia.seek` calls `remoteSeek`; when
unowned it briefly claims the same exclusive lease, sends the bounded absolute
seek and releases it without opening a panel. Another controller cannot be
preempted. RoomCinema keeps the existing playing/paused flag and revision check,
so all viewers follow the same server-time anchor. No new sockets or timer tick.
The step size is a usability choice in `PLAYROOM.cinemaSync.seekSeconds`.

Lekstuga audio (#1330): the existing disco wall switch also gates a quiet local
synth rhythm. Manual speaker playback/pause takes precedence; billiard strokes
and contacts use positional, bounded effects. See [audio](animals-audio.md).

Biljard (#1495): a single wall screen on the left from the BILJARD entrance
replaces both rail controls. Its two E/touch targets select mode or start a new
round; group points, turns and the winner come from the shared table/rules.
Strokes still aim at the actual table. See [furniture](furniture.md#billiard-wall-control-and-points-1495).

## Christmas Eve guest and presents (#1406–#1410)

`src/santa.js` derives sitting (24 December 15:00–16:00), sleeping (16:00–21:00) and absence from DayCycle. Its merged figure, sipping tumbler and reused rising sleep sprite follow the actual sofa parent. Existing rest slots are reserved while present; an already occupied required seat makes Santa wait. E/touch works while sleeping too. Main routes one greeting, positional chuckle and delayed gift through the ordinary simulation step; leaving the visit cancels an unfinished interaction. Busy hands are preserved and concurrent clicks cannot create a second pending delivery.

`src/santagifts.js` reuses the existing car/crayons/crystal TRINKETS builders. Each package is an ordinary Holdable with its result chosen once at receipt. Opening changes that same model immediately, leaving no paper. `keep.js` restores the separate `christmasGifts` section after the existing hand owners, with stable IDs/results and real poses; generic things skip those items. Gifts already received survive the visitor's departure. Gameplay tuning is re-exported from `config.js` (`SANTA`, `SANTA_GIFTS`, `SANTA_TV`).

`src/santatv.js` uses the existing CinemaSurface/YouTube API on the living-room screen for the published Toy Tinkers excerpt `I0SW0f0ww84` (JoBlo Animated Videos), not the full Swedish Christmas broadcast. Automatic playback starts muted; a gesture activates sound subject to global mute. During the complete visit (15:00–21:00, including sleep), the living-room TV stays on Kalle in a loop: ordinary power/channel/chooser/seek commands cannot replace it. Shared TV playback pauses locally while Santa owns the screen. At 21:00 or loss of power/visible furniture the temporary player is destroyed; ordinary controls return. Playback needs the external YouTube source; vendor errors appear on the screen and interaction retries the same clip.

Original-only characters, gifts and seasonal gameplay: no downstream transfer. Verification is limited to `tools/santatest.mjs`, the real-browser component `tools/santagiftstest.cjs` and the integrated `tools/santaapptest.cjs` route.

Santa seating correction (#1499): the seated legs are built from the actual LANDSKRONA front edge and the selected rest spot, with lower legs entirely in front of the cushion and boot soles on the sofa-local floor. A separate cached folded-leg geometry is selected during sleep; no per-frame geometry rebuild. The face has eyes with irises, cheeks and ears, the beard has tapered locks, the hat bends and the coat/boots have fur and soles. These are visual anatomy guesses, not changes to furniture. `tools/santaseatingtest.cjs` checks every leg vertex below seat height against the actual sofa front, sole contact, the existing gift callback and the sleeping pose; only the affected sitting/sleeping images are reviewed. No public downstream transfer applies to this character.

## Santa visit follow-ups (#1500–#1502)

Santa's cheek vertex colours interpolate toward red after completed glögg sips, capped at ten. The dynamic colour attribute is retained after phone upload. Interrupted/partial sips and calendar jumps do not award drinks; blush persists while sleeping and the optional `santa` keep section retains it through reload for the same calendar date. A new visit date resets it.

Wrapped gifts provide `ChristmasGifts.stackHit` for ordinary main placement. A valid top hit centres and aligns the new equal-sized package, bypassing floor grid snapping. World-matrix yaw handles rotations over 90°. Support IDs/poses are saved; taking a lower parcel settles its column and returning it places it on top. Opened trinkets supply no package support.

`src/tvsound.js` computes scalar YouTube volume from full 3D distance and camera-forward angle for all home TVs, the clubhouse TV and Santa's clip. The inverse-distance attenuation follows the Sonos approach, with quieter rear/side listening. Global mute disables it immediately; ordinary changes are coalesced to 10 messages/s. This is the user-approved volume approximation, not stereo panning or a Web Audio stream from the iframe. Computers are outside the TV request.


### Seated player gaze (#1504)

`remote-pose.js` keeps `restState.r` aligned with the seat and adds `look: [relativeYaw, cameraPitch]`
for seated poses 1 and 3. `Ghosts` detects head-only movement within its existing 5 Hz budget;
`Ghost.draw` interpolates the angles and `applyRestPose` uses them on the shared head bone.
The body/legs keep their existing rest pose. The mirror tracks the same angles. Missing angles
are neutral for older clients; lying keeps existing behaviour. `PlayerRoom.cleanState`
accepts only two finite angles, rounds them and includes them in forwarding/late welcomes.
Seated limits follow `REST.sit` (plus .01 rounding slack). #1505 also sends `[0, cameraPitch]`
when standing, walking, crouching or cycling; standing yaw stays in `r`, elevation is bounded by
±π/2. `Avatar.update` adds pitch to its existing idle/kiss head pose; the bicycle pose retains
its posture offset and adds the same pitch. Head-only changes use the existing movement slot. No new gameplay hit regions.
Scoped check: `tools/seatedlooktest.cjs BASE LOCAL_WORKER OUT`, two browser clients using the
actual main.js state callback; proof in `docs/validation/issue-1504/`.

Headwear opacity (#1513): selected caps/knit/brimmed hats and the hairstyle beanie have
inward-facing lining and closed lower rims; cuffs also close at the top. Hair compression
is bounded by the analytic skull ellipsoid plus `AVATAR_HAT.hairGap`, preserving exposed
temple hair instead of pushing it through skin. All surfaces retain their original face part
and merged avatar material; no global DoubleSide or additional draw is used.
`tools/avatarhattest.cjs` adds genuine upward views, solid-interior rays and a GPU part-colour
check that adding a hat does not reveal skin where curly hair was visible.

## Saved player picker (#1515)

The start menu’s Byt spelare dialog lists local UUID profiles with the existing
Canvas2D avatar preview, choose buttons and confirmed local deletion. New names
create profiles; an existing name selects its profile without replacing data.
Avatar and persistence details: [local player profiles](storage.md#local-player-profiles-1515).

## Separate settings panel (#1518)

The start/pause menu exposes `#menu-settings`; `#settings-dialog` owns the existing
chat toggle, instructions, touch-layout entry, home reset, statistics reset and
privacy entry. IDs and action listeners are preserved. `MenuSettings` keeps the
background menu inert, traps Tab, consumes settings keys before gameplay and
restores focus on close. Existing reset/privacy dialogs remain above it and own
Escape until dismissed; focus returns to the action that opened the child.
The touch editor temporarily hides settings, then returns to its entry button.
Leaving the menu closes settings without moving focus back into the hidden menu.

The same dialog holds the Grafik / Bildmål choice (#1509, performance.md): plain buttons, so keyboard, mouse and touch all work.

The public project already keeps keyboard/mouse/touch help and its touch editor
entry in a separate native `#help-dialog`; it has no chat, player statistics or
personal home-reset sections. This original menu reorganization needs no public
code transfer or gameplay import.

## Courtyard pétanque (#1370)

`src/boule.js` adds a local pétanque game to the courtyard's boule court (`COURTYARD.boule`, *guess*). It is built in
`world.js` beside the courtyard (`world.boule`; the lectern's foot joins the outdoor collision) and wired in `main.js`
like the playroom billiards: standing in the throwing circle at the court's north end, the gravel is focusable across
the court (`BOULE.reach`, an extra raycast only when near the court) as kind `boule`; E / the touch action button throws
the jack or the next boule. A throw flies in a short arc to `BOULE.roll` m short of the aimed spot (with a small
distance-scaled scatter) and rolls on; E after a scored mène collects the boules. A lectern (pulpet) east of the court
carries one canvas scoreboard (sides, points, mène, whose turn, boules left, message, winner) with two real pickable
buttons, `bouleMene` ("Ny omgång": restart the mène, points kept) and `bouleGame` ("Nytt parti": 0–0). Three visible
draws (lectern + circle, seven instanced spheres, the board), no lights; hidden and frozen beyond `BOULE.near`.
Landings and impacts reuse `sfx.billiard`. Local only: no shared/multiplayer state.

`src/boulephysics.js` is renderer-free: constant gravel deceleration, mass-weighted boule/jack collisions, a weak timber
edge rebound and landing clamped into the court. `src/boulerules.js` is renderer-free pétanque for two sides of three
boules: the jack (valid `BOULE.jackMin`–`jackMax` m from the circle, shortened from the rules' 6–10 m to fit the court),
the side not holding the point plays, a side out of boules hands over, scoring per boule nearer than the opponent's
nearest, a tie scores nothing, the mène winner throws the next jack, first to 13 wins and a finished game blocks
throws. Sizes in `BOULE` follow the FIPJP ball/jack dimensions; the rest are playability guesses. Tests:
`tools/bouletest.mjs` (node) and `tools/bouletest.cjs` (real app, `MOBILE=1` for touch). Gameplay: never downstream.

Basketball flight visibility (#1655): only the ball mesh opts into `userData.noDistanceCull`;
`DetailCuller` keeps wall/opening occlusion, but no longer removes it by angular size or quality
distance. Boule uses one InstancedMesh, already excluded from DetailCuller. Paper balls are
created after its one-time collection and are not distance culled. This basketball gameplay
opt-in has no public downstream consumer. Checks: `tools/basketdistanceculltest.mjs` and
`tools/basketvisibilitytest.cjs`; saved app views in `docs/verification/1655/`.
