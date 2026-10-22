# Saving, shared layouts and cloud

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [deployment](deployment.md), [life](life.md).

## Shared computer power (#1492)

Each computer's existing RoomCinema snapshot carries boolean `power`, initially
false. Near-only `power` commands use the current sequence and respect another
controller's lease; shutdown resets app, video, clock and ownership and removes
that computer's snake. Power is shared with other room viewers and uses the
existing socket, presence and persistence. The last room viewer still resets the
station. Legacy active snapshots migrate to on; idle ones migrate to off.
Cinema and TV power semantics are unchanged. This is personal gameplay/Cloudflare
state and is excluded from the public downstream.

## Shared cinema authority (#1477)

`cloudflare/cinema.js` owns one `cinema` snapshot in PlayerRoom storage:
revision, connection-owned controller/name, validated YouTube ID, playing flag,
position and server-time anchor. `t:cinema` requests support claim/release/get,
select/play/pause/seek/stop; transport writes require the current revision and owner.
Seek requires a finite bounded absolute position and preserves playing/paused
state (#1490); remote-only requests briefly claim and release the same lease.
Only room occupants receive snapshots. Position comes from existing server-
validated player presence. Leaving/disconnecting releases control while other
viewers retain the film; the last viewer clears the snapshot and storage.
Hibernation reconciles persisted ownership against live socket attachments.
This is event-driven, with no playback ticker or media/buffer transfer.

`cloudflare/cinema.test.mjs` covers racing claims, forged ownership, stale writes,
late entry, paused/running anchors, release/disconnect, empty room, hibernation
and outsiders. Existing Worker message/connection/monthly limits apply. The client follows server-time anchors locally and presents an official iframe
on the depth-occluded physical screen (#1476); audio activation is local and
does not acquire control. Original-only gameplay, no public import.

## Home TV authority (#1483)

The same RoomCinema implementation is instantiated per whitelisted TV ID, with
`screen` on `t:cinema` requests/replies and storage keys `cinema:lounge`,
`cinema:bedroom1`, `cinema:bedroom3`. Unknown IDs are rejected. No screen field
retains the original cinema protocol and storage key. Server position/floor
checks against `TV_MEDIA` viewing zones derive socket membership; clients cannot
assert an owner or subscriber flag. Each screen independently reconciles live
attachments after hibernation, releases a departed controller, preserves films
for remaining viewers and deletes storage when its last viewer leaves.
No additional playback ticker/media stream is introduced.

## Shared computer arena (#1487, part of #1486)

`COMPUTER_MEDIA` identifies six stations (home gaming PC/laptop and four
clubhouse desks) with room/floor viewer bounds and2.8m join reach. The existing
RoomCinema authority also serves these IDs; computer snapshots add
`app:menu|youtube|snake`. Owner/revision-checked app changes stop previous media;
selecting a movie sets the YouTube app. Original cinema/TV fields remain compatible.

`cloudflare/snake.js` validates `t:snake` get/join/input/leave. Join requires the
connection's actual screen ownership, snake app and nearby validated feet; input
contains only bounded heading/sequence, never position/length/score/food. One
SnakeArena (`src/snakearena.js`) serves all computer rooms. It advances bounded
30Hz substeps from the existing≤5Hz incoming slots; snapshots are at most5Hz,
with no background timer/storage writes when nobody plays. The client must
coalesce steering into the existing socket budget, not raise the connection cap.

Food grows length/girth; head/body hits and walls kill, unequal head-on collisions
allow the larger snake to eat the smaller; equal head-on collisions kill both.
Deaths drop food, credit a surviving opponent and have a respawn delay. Screen
release/app switch, departure and disconnect trim players; the last clears arena
memory. DO hibernation deliberately starts a fresh ephemeral arena; screen leases
still reconcile through the existing stored authority, and clients can rejoin.
This server slice exposes no unfinished UI; the physical six-computer app and
multiplayer controls are #1488. No public downstream counterpart.

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
Cached packets without a v2 contact remain body damage. Ball v2 contacts now use accepted-pose/radius-aware free-flight recomputation (#980);
cached ball packets remain body1. See the [basketball launch contract](interactions.md#basketball-pvp-launch-980).
The jetpack's volume-based body fallback now checks solid world obstacles (#978)
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

## Fruit remains (#1056)

`FruitBowl.initLife` registers `x.fruitRemains` with the existing Life extras. It
retains completed apple/banana slots, portion generations, placed position/yaw and
discarded tombstones; uneaten fruit retains its prior policy. Saves replace this
optional record atomically, and an explicit empty list clears older remains after
F. Loading emits no eating/recovery callbacks. Ordinary held remains return to the
bowl; an actual bicycle-hand receipt restores the same terminal portion to the
hand afterward, using canonical empty scoops. See [food](food.md#fruit-remains-1056)
and `tools/fruitremainstest.cjs` for the native reload checks and visual limits.

## Module and test map

Cat binder presentation (#1379): four stable collection pockets per page and
per-variant photo albums are DOM-only views over the existing `CatCards.slots()`
and `of()` records. `CAT_CARD.max=8` is the normal photo capacity (#1399);
`pageSize=4` and `albumSlots=8` control presentation. There is no new store/schema
or destructive migration. All old five-photo data, ids, JPEG bytes, saved flags,
discoveries/statistics and legacy-board photos remain intact. At exactly eight,
a new find replaces only the oldest unsaved photo; all saved rejects the find.
An older archive above eight rejects all incoming finds without deleting any
photo, including unsaved ones. `isArchive()` drives its explicit album/full notice;
`nextOut()` returns no automatic replacement there. Save/unsave does not unlock
archive rotation: only a player's explicit confirmed deletion can reduce it to
normal capacity. Migration/load never cap arrays. Blocked IndexedDB retains the
existing visit-only in-memory fallback; no persistence is promised there.
Overlapping additions are serialized through their persistence writes, preventing
a ninth normal photo or a late put restoring a rotated record.
The first-interaction guard is described below (#1400). Private photos
remain local and no peer schema changes.

```text
src/privatecodes.js     shared synchronous UTF-8 SHA-256 and exact private-code/layout-credential verifier (#853)
src/layoutmigrations.js  retire old grouped poster layout ids while preserving later individual moves (#493)
src/keep.js            the world's state across a page-made reload (#277): saveWorld / loadWorld, one part per module
                       (`clock` #1145: `{ h, y, m, d, p }` plus `o` = ms ahead of the real clock while running; a running record without `o`, from the 60-minute day, keeps the real time; a paused one its exact time)
src/realweather.js    the weather cache (#674): localStorage `lunden.weather.<YYYY-MM>` = `{ v:1, at, final, d:{ y, m, t, p, s, c } }` (hourly temperature, precipitation, snowfall, weather code of one month, ~15–20 KB); archive months (`final`) never expire, forecast months are used for 3 h and refreshed in the background; at most `WEATHER.real.keepMonths` (12) kept, the oldest dropped first, and all of them if the quota is full; a bad/short entry is ignored. Not in RESET_KEEP: "Återställ" clears it (it is only a cache)
src/reset.js           "Återställ" on the start screen (#303): clears every local 'lunden.*' key except RESET_KEEP (config)
src/idb.js             the shared IndexedDB 'lunden' (version 3: catPhotos + drawings + catCards, #1249) — every module opens it here
src/cloud.js           the shared world (#178, #119): inert unless CLOUD_URL (config) is set on the published site, or the
                       page has &cloud=<url>. Taped-up drawings (posters.onPut/onDelete) and the desk sheet (drawing.onSaved)
                       go into a queue (localStorage 'lunden.cloud.queue', kept offline)
                       sent in order; a pull at start (`cloud.ready`), every minute and on tab focus merges the server in
                       (newer `updated` wins; synced drawings missing on the server come down). Cat photos are personal and
                       never synced (#211). Silent; &sync=debug logs
src/leaderboard.js     the global leaderboard (#198), only with the cloud on: optional name on the start screen (#lb-name,
                       never blocks starting; localStorage 'lunden.name', a random 'lunden.playerId'), the top list there
                       (#lb-start) and under the stats (setStatsExtra); the score (stats.js totalScore, SCORE in config) is
                       POSTed as text/plain when changed, every LEADERBOARD.every s, sendBeacon when hidden; names escaped.
                       #677: without a name you are "Anonym": the row has name '' (one per 'lunden.playerId', created for everybody;
                       a name later renames the same row; the Worker never lets an anonymous post strip a name; equal points list
                       named first), anonymous players are online too (presence.js sends name '' + score; the Worker lists them
                       one by one and counts `anon`) and ghosts. Everybody is visible (#723 removed the opt-out box "Visa mig inte för andra"; an old
                       localStorage 'lunden.share' is deleted at start, no other effect); the start screen says so (`#share-note`: online + avatar, #730) and the privacy page opens with "Vad andra spelare ser".
                       `node --test cloudflare/scores.test.mjs`, `tools/anontest.cjs`
src/startuprecovery.js One bounded `lunden.startupFailure` sessionStorage record (#1065), also written by the dependency-free
                       index guard before imports. Name/message/stack/build/time plus the failed loading step and cause class (#1132) only, URL query/fragment values removed.
                       Enabled CrashLog consumes valid records no older than one hour once at next startup; no world or
                       resume record is read/cleared by this mechanism. Recovery still works when storage is blocked.
src/crashlog.js        crash reports (#629), inert without the cloud (same switch as cloud.js): a heartbeat every CRASHLOG.beatMs (outside the
                       render loop) writes place, quality level, fps, renderer.info, a GPU-memory ESTIMATE (canvas, shadow map,
                       mirror target, source texture images — walked in short slices; incomplete, not measured GPU usage), last keys/taps and console.error lines to localStorage
                       'lunden.crash.beat' (state run / bg on hidden, including the first hidden load / clean on pagehide). At the next start a beat still 'run' (and not
                       a live other tab) = the last run died → sent as typ 'död' (a hypothesis: memory); window error, unhandledrejection,
                       webglcontextlost/restored → typ 'fel'. POST /crash as text/plain (fetch, sendBeacon when hidden; unsent ones wait
                       in 'lunden.crash.out'); v2 keeps 12 heartbeat samples (~24 s) with frame progress, load phase and timer lag.
                       Since #669 each sample also has `warm` (the sliced warm-up's position, e.g. `compiling 12/113`) and `worst` = the slowest
                       frame since the last beat when it took 50 ms or more: [CPU ms, new shader programs, shadow-map redraw 0/1, warm-up state].
                       Since #1100 each sample has `sh` = shadow-map redraws since the last beat and `shHold` = how many of them were
                       held redraws after "Använd"/a choice (public numbers; older reports have null).
                       #669 also reads pending `worst` non-destructively in event snapshots, with `beatAgeMs` since the last
                       actual heartbeat (not a CPU/GPU loss-frame measurement). Loss/restore reports include current `layout`
                       measures and `context.surface` = last actual resize/orientation event `{kind, up}`; absent event is null.
                       These establish temporal observations, not a rotation/shader cause. Only heartbeat consumes frameDiag.
                       #930 validates buffer allocation using the exact renderer pixel ratio internally; public layout/snapshot/history
                       ratios and fault messages retain two decimals. Rounding 1.125 to 1.13 is never used for that comparison.
                       Buffer/aspect/viewport tolerances, pinch-zoom policy and report caps are unchanged.
                       #669 distinguishes `covered-projection` only when the actual opaque full-screen rotation cover,
                       a pending deferred viewport resize, and the retained camera/buffer pair all agree with the measured
                       CSS/document/visual viewport. Optional `covered`/`deferred` flags are 0/1 and `retained` is the cached
                       positive integer CSS size of that pair. Reports and messages remain; absent or contradictory metadata
                       stays strict. Main passes its actual viewport binding into CrashLog; no per-frame style reads are added.
                       WebGL loss/recovery pairs carry an episode number and recovery duration; each episode and abrupt ending has its
                       own dedup signature. Caps: 12 per page, 20 per day; ordinary errors still once per signature/day (CRASHLOG in config). Keys: lunden.crash.pid
                       (random id), .sent, .out kept by Återställ (RESET_KEEP), .beat dropped. main.js: the import (first) and one
                       `crashlog.attach({...})` line. A later GPU-memory counter (#628) should replace `gpuMB()` rather than duplicate it
src/ghosts.js          other players as ghosts with a name tag (#666), inert without the cloud, GHOSTS.enabled false or ?mp=0: a WebSocket
                       to `/players` while playing (overlay hidden, tab visible, moved within GHOSTS.idleMs); sends { p: feet, r: yaw, score }
                       at most GHOSTS.hz and only on a change, heartbeat 'p' (runtime auto-response 'q', never billed); draws each
                       other player GHOSTS.delay ms late, interpolated; one merged body mesh (vertex colours, opacity 0.25, no shadow,
                       depth-tested) + one name/score sprite (256 × 64 canvas shared per live name/score combination, "Anonym"). Close 4001 (month cap) →
                       localStorage 'lunden.mp.capMonth' = this month: no retry; 4003 (brake) / 4029 (full) wait; others back off.
                       No KV, nothing written per position (presence.js's KV counter #424 is untouched). `window.__ghosts` for tests
                       #673: a greeting { t: 'g', to, k } through the same outbox (to another player here, at most PLAYERS.greetEvery);
                       #1222: a toast { t: 'c', k, b? } (k an index into config.js TOAST_LINES below PLAYERS.toastPhrases, b = an answer
                       that is never answered) goes to the players within PLAYERS.toastRange m of the sender's last known position, at most
                       one per PLAYERS.toastEvery s per connection (GHOSTS.toast / ghosts.onToast; room test in players.test.mjs);
                       #1302: a sound event { t: 'snd', k } (k only a key of PLAYERS.sounds = config.js SOUNDS.kinds, today 'bell' = the bicycle
                       bell; `cleanSound`) goes as { t: 'snd', i, k } to the players within PLAYERS.soundRange (45 m) of the sender's last known
                       position, at most one per PLAYERS.soundEvery s (the client's SOUNDS.every is longer), never echoed, no text; an old Worker
                       drops the unknown type and an old client ignores it. Footsteps / jetpack roar of others are derived locally from their
                       state (no traffic). **Rollout order: deploy the Worker first (`cloudflare/`, by the owner), then Pages**; nothing is deployed from
                       the agent. Tests: players.test.mjs (valid / invalid / rate-limited / nearby-only), spatialsound.test.mjs.
                       #667: the state's `h` (weapon key or '') and one shot message per shot { t: 'a', w, o, d, s?, to? } go the
                       same way (outbox of GHOSTS.outbox, within the same 5 Hz); lives are
                       counted per connection in the room (a socket's attachment), nothing is stored about fights
                       #675: chat lines { t: 'm', m } (`talk`, a small talkbox sent first in the same 5 Hz budget; chatting keeps
                       the connection as moving does); the room's { t: 'm', i, n, m } / { t: 'mx' } go to `onTalk` (src/chat.js);
                       #676: the typing flag { t: 'k', on } the same way, the room's { t: 'k', i, on } to `onTalk` too
cloudflare/players.js  the PlayerRoom Durable Object (#666; binding PLAYERS, migration `player-room-v1`): one room 'world', hibernatable
                       sockets with attachments ({ i, n, s, rate window }), monthly billed-request counter 'bill:YYYY-MM' (requests +
                       messages/20, flushed every 100 messages) with the hard cap PLAYERS.monthlyCap, per-socket rate / size / idle limits,
                       max players, admin brake 'off' (DELETE/PUT/GET /admin/players, DELETE /admin/all); COMBAT (#667): the check of
                       a hit (both armed, range + slack, rate, points per minute), lives per socket; shots `cleanShot` (unit direction, speed ≤ 60,
                       start ≤ COMBAT.from m from the shooter) forwarded only from someone holding that weapon to the armed others;
                       CHAT (#675): `cleanTalk` / `cleanText` (plain text ≤ 140 characters) forwarded to the others with the
                       cleaned name, per socket a burst of 3 then 1/s and ≤ 12/min, the room ≤ 120/min, over that { t: 'mx' };
                       nothing stored, counted in the monthly cap like any message; #676 the typing flag { t: 'k', on } (a change
                       only: off always, on ≥ 0.5 s apart, a refresh ≥ 5 s; a line ends it); #719 `censor`: ROUGH words → ***
                       in every line (cloudflare/chat.test.mjs). Tests: cloudflare/players.test.mjs
                       (runtime stand-ins cloudflare/devws.mjs, also used by dev.mjs for real ws://), tools/ghosttest.cjs (two pages)
cloudflare/crash.js    POST /crash, admin GET /crash and /crash/<id>, DELETE /admin/crash: size cap 16 kB, plain-data cleaning, per-IP hour
                       limit, one report per browser+signature+day, 400 reports in all, KV TTL 14 days (test: cloudflare/crash.test.mjs)
                       #720 preserves snap/beat warm and history warm/worst through ingest and publicView, with a field-specific
                       exception for the four worst slots; generic depth4/30-array/40-key caps remain. Warm text accepts only
                       WarmUp.detail phases or compiling/drawing counters (six digits, optional mirror); final batches may
                       overshoot the item total. Worst is [finite CPU ms 0..600000, integer program delta −10000..10000,
                       shadow 0/1 (booleans normalized), technical warm detail]. Arbitrary text and malformed tuples are omitted.
                       Previously discarded worst cannot be recovered from old KV records; preservation applies to newly
                       submitted reports after Worker deployment. Already stored valid warm becomes visible in the public view.
                       #669 uses the same bounded worst grammar for snapshot/beat `worst`; public `beatAgeMs` is finite/nonnegative,
                       surface kinds are window-resize/viewport-resize/orientationchange/orientation-change with finite nonnegative up.
                       Additive v2 fields: older reports stay readable, missing worst omitted and age/surface null.
                       `tools/crashsnapshottest.cjs` tests production CrashLog with native browser DOM/events and synthetic renderer
                       counters/context events, without loading the apartment or WebGL; not a physical phone reproduction.
cloudflare/            the Worker (NOT published on Pages): worker.js (API, limits, CORS, admin emergency brake), `youtubesearch.js` (`GET /youtube-search`, server-only `YOUTUBE_API_KEY`), wrangler.toml,
                       setup.sh (the user's one-command setup: login, KV, deploy, ADMIN_TOKEN, CLOUD_URL into config),
                       dev.mjs (the same Worker on Node with an in-memory KV, for tests), README.md (Swedish, for the user);
                       .github/workflows/cloud.yml redeploys on cloudflare/** and shared schema/verifier changes when the repo has Cloudflare secrets
tools/glrestoretest.cjs  phone WebGL context loss (#628): a restored context makes the page reload once through the ordinary resume
                       (`reloadOnContextRestore`, src/lowmemory.js; same place and world, no "Ny version" note; max one per 60 s, sessionStorage `lunden.glReloadAt`;
                       a suppressed second reload shows the `#gl-lost` tap-to-reload notice, #1128)
tools/reloadtest.html  headless test: resume after "Ladda om", F5 starts at START, "Börja från start", bad record;
                       the world kept (#277): the car still arriving then parks, a cup of coffee in the hand, the fridge open, lamps,
                       sitting, a bottle put down, the TV, the cat, the game's clock; a new tab fresh at the real time
                       the life sim (#371): an opened butter with 185 g, a cut cucumber + slices on the board, a used plate with half a
                       slice, then that plate in the hand across a reload; a broken life part harms nothing; lunden.life is written
tools/resettest.html   headless test of "Återställ" (#303) against `node cloudflare/dev.mjs 8144`: Avbryt / Esc change nothing; the
                       home's keys and resume / F5 records go, the queue, drawings (wall, desk, server), score, name, avatar look
                       (`lunden.avatar` incl. the #1136 height, #1148) and cat photo stay, START at the real time with the notice; the queued drawing still goes out; a later reload fresh
                       Running the two Worker tests (cloudtest, resettest; #635): one test at a time against one Worker, each wipes it with the
                       admin token `testtoken` (the dev.mjs default; a 403 there now fails the test at once, since leftovers from an earlier
                       run fail checks later; the Worker also limits writes to 30 per minute per instance, one IP). Cloud session: Playwright Chromium as in verification.md; the page opens
                       it from a fresh `--user-data-dir`; allow ~10 min per test under SwiftShader (every iframe load is a ~3 min warm-up).
                       `cloud.sync()` is a no-op while a poll is under way (`pulling`): tests wait with `syncNow()`, and the offline step
                       `await cloud.flush()` before the address is restored. The offline reset step waits for the new drawing's
                       id in the queue (#1169), not just a nonempty queue: the first drawing can already be marked synced
                       while its IndexedDB save and queue removal are pending, and the next tape also saves before `onPut`.
                       Its persisted-queue assertion and three-second wait budget remain unchanged.
                       `http://localhost:9` fails at once as ERR_UNSAFE_PORT in Chromium.
                       Återställ from the menu closes the menu afterwards (#522): resettest checks the key, then the plain start screen
tools/crashheartbeattest.cjs Native Chromium tabs and production CrashLog/Worker with local-only HTTP/KV; no canvas context, apartment or GL.
                       Checks initially hidden start, real visibility transitions, synthetic pagehide, stale foreground/legacy hidden run,
                       fresh foreign tab, owned marks, existing dedup/session cap and POST/public projection. Timestamp ages are controlled fixtures.
tools/crashtest.cjs    Playwright test of the crash reports (#629) against dev.mjs with a token: off without the cloud, heartbeat content and
                       cost, Page.crash → 'död' at the next start, clean / backgrounded → none, thrown error / rejection / context loss,
                       two real WebGL loss/recovery cycles preserved through the public API, duplicates and a flood capped (`node cloudflare/dev.mjs 8144 tok`, see its header)
tools/cloudtest.html   headless test of the shared world against `node cloudflare/dev.mjs 8144` (start it first): PUT on
                       taping, someone else's drawing appears, DELETE on throwing, thrown elsewhere → gone here, offline
                       queue, desk sheet, cat photos neither sent nor fetched (#211), a fresh visitor gets them, the
                       leaderboard (name, score, escaped list, a capped cheat), off without &cloud
```


Laundry item state (#550): Items adds optional moisture ('wet'/'dry'/null) independently of clean and machine.folded. Version-2 serialization/load includes it when present; older records keep type defaults (ordinary items null, laundry dry), without a migration or change to existing cleanliness values. Laundry stores register before Life.restore and existing restock keeps original basket homes/ids. laundrytest performs a real page reload with clean wet clothes in machine slots, verifies empty hands/closed fronts and checks inventory audit.

Laundry programme persistence (#551): Life.keepPart('laundry') stores the washer's state, exact remaining game seconds and captured garment ids, loaded after the item record. Idle is explicit so a saved idle record resets an older active controller too. There are no timestamps or offline advances; laundrytest flushes during a running programme, reloads the actual page and checks the unchanged time/load before finishing. Door positions retain existing visit/reload semantics; a paused programme resumes once its door is fully shut.

Dryer/folded wardrobe state (#552): the existing laundry extra also includes the dryer's state/left/start ids. Older washer-only extras load an idle dryer. The ordinary item record keeps independent moisture, machine.folded, wardrobe slot and original basket home, so storing clothes never causes duplicate stock at a later visit. Normal visits start empty-handed with closed fronts and saved clothes in their slots; the normal home reset clears everything and creates three dirty dry basket garments with idle machines. laundrytest checks real page reloads at mid-drying and after all three clothes are folded/stored, then invokes the actual reset control and reloads fresh.

Beer shelf (#511): `src/beershelfdata.js` stores one complete JSON Response (metadata and all four original PNG/JPEG data URLs) in CacheStorage `lunden.beerShelf.v1`, key `./data/beer-shelf-cache` relative to the document. IndexedDB remains version 2. Schema validation and actual browser image decoding precede replacement; the previous complete response survives HTTP/network/timeout/metadata/image failures unchanged, including source and successful timestamp. Successful `fetchedAt`/`day` use Europe/Stockholm: repeated loads that day perform no source request. Failed updates do not advance the day and retry on another load. First offline startup uses the committed prepared snapshot (`fetchedAt: 0`, `day: null`, separate `preparedAt`). Cache is independent of home/furniture saving. The complete live refresh has an eight-second deadline, and the Worker source batch has a 6.5-second deadline. Since #711, decoding already-local cached/prepared labels has no live-refresh deadline: expensive synchronous scene construction can delay Image.onload, and must not discard a complete batch or abort app startup. The prepared file's request+JSON body remain bounded and aborted on timeout. Since #718, if both the prior complete cache and available sources fail, startup receives an empty runtime shelf instead of a rejected promise. No invented or partial labels are shown, and this empty result is never persisted or stamped as a successful day; later loads retry. Successful cache/prepared/live batches retain all four real labels. Failed or unused source promises are handled immediately. Cache open/match remain bounded. The cache test reproduces the old failure with delayed real image callbacks + CPU stall/late promise handoff, covers real prepared fetch/body before a stall, and preserves daily timeout/atomic cache/reload checks. `?life` uses only the prepared snapshot without reading/writing the visitor cache, unless an explicit `&beers=` endpoint requests a development fetch. `tools/beershelfcachetest.html` exercises real CacheStorage/image decoding and an actual page reload.

#841: main awaits this same optional-data promise before synchronous world construction, so heavy geometry work cannot starve pending request/body callbacks until their unchanged deadlines abort a complete local response. The bounded cache/refresh/prepared failure paths and uncached empty result are unchanged; an unavailable uncached refresh can defer world construction until its existing timeout.

Console cleanup (#514) writes the existing Life record immediately; Items/bin state and x.mess/x.pan/x.dishwasher use existing extras, with no schema migration or reset of layouts/settings. Legacy lounge glasses add optional `{used: true}` via their existing holdable keepState hook; old records default false. Ordinary page-made resume snapshots capture the already-cleaned cup/holdable state through saveWorld. Normal visits retain saved clean Life dishes, food, full glasses, empty bins and cleared mess; tools/cheattest performs an actual page reload to verify these results.

Pendant placement (#1106): each `LIGHTING.pendants` lamp is an ordinary layout entry `f-pendant-<level>-<x>-<z>` (its config spot); pos = where its hanging part's top is (x, height, z), quat = its yaw. No entry = config.js's spot and height, so layouts saved before #1106 need no migration; the Worker's pose rules are unchanged.

Christmas tree placement (#571): the tree is a normal entry in the shared furniture layout (`lunden.furniture.layout` / GET-PUT `/furniture`, id `f-xmastree-0-0.82-8.45-0-0` since #591; an entry under the #571 id `f-xmastree-0-1.08-11.5-0-0` carries over if it was moved off the old default, else it is dropped — rearrange.js `apply` `carryOld`), so a confirmed move survives reloads, later visits, dates out of season and the next season (the pose is applied while it is hidden too). What it hides is a pure visibility layer recomputed on load — nothing about the season or the hidden pieces is stored, and their own layout entries are never written. tools/christmastest.html reloads in December and October.

String shelf placement (#1298): the piece id comes from its x/z (`f-stringshelf-0-2.15-1.06-0-0` since #1298); `carryOld('stringshelf', [2.152, 4.55], [2.152, 4.16])` in rearrange.js `apply` drops entries under the #1272 and #1291 default ids (all stale ids, also when a full reset wrote both) so the new default applies, and carries over one that was moved away from every old default. tools/stringshelftest.html writes both old saves and reloads.

Visited flats (#574, src/visitunit.js): a flat you walk into (L1004) has no save of its own and writes none of L1007's keys:
its doors / windows / lids are not in `world.doors` / `world.lids` (so keep.js `open` never sees them), they start shut on
every visit, using them bumps no stat, and nothing can be put down there. Only the ordinary resume / session record (a place,
`feetY`) can point inside it; tools/visittest.html checks a resume upstairs in it and that the saved world is unchanged.

Ghost score badges (#672): `src/ghostbadge.js` draws name and score in the existing sprite, with 20% smaller world scale and text sizes set by `GHOSTS.tagWidth/tagHeight/tagNamePx/tagScorePx` (*guess*). The background fits both rows, including a short name with 10 000 000 points. Immutable materials are shared per live name/score; reference counts immediately dispose unused maps/materials when scores change or ghosts leave, so history cannot grow texture memory. Missing legacy scores display 0. Ghosts defaults to stats.totalScore and sends score-only changes within the existing shared 5 Hz state/shot budget; they do not extend movement idle time. PlayerRoom carries the score in state/welcome attachments, clamps it to the existing leaderboard's 0…1e7 range, and adds no requests, timers or message types. Scores are client-reported display data, not authoritative combat or leaderboard results. `ghostbadgetest.cjs` uses real Ghosts and the local PlayerRoom in a small controlled scene (no apartment bootstrap) to check anonymous/max scores, updates/rate/idle, shared materials, 50 updates without GPU texture growth, draws and departure; screenshots at desktop and iPhone landscape size. Physical phone rendering is not certified.

Task state (#993): `life.keepPart('tasks')` writes v3 with the real local YYYY-MM-DD day, selected stable ids, discovered
ids, per-task goals/completed/points/bird identity and pending renewal. The same compact record is persisted immediately
as `lunden.stats.taskDay`; first home restoration can migrate v1/v2, while ordinary restoration prefers the current daily
score record to an older home snapshot. Task score counts, paid day/id receipt and completed daily state share one atomic
localStorage write; partial goals/initial selection also save immediately without resetting the home. `taskRewardDays`
retains paid ids per real day to reject stale progress/dates; it is reset with normal explicit score reset. Rollover clears
only daily state, preserving total counters, seen ids and legacyTaskPoints. v1/v2 goals/discovery and completed tasks migrate
without reward; the former played-time deadlines no longer control selection. `SCORE.tasks[id].first/again` retain existing
lifetime reward amounts. Whole-set bonus (#994) adds `taskBonusDays` (paid day → actual awarded amount), cumulative `taskBonusPoints` and
`taskDay.bonusPoints` (null until earned). They are saved atomically with the third individual award. Score uses cumulative
awarded bonus points, so later `SCORE.taskDayBonus` tuning cannot rewrite earlier totals or the displayed earned amount.
Exactly three unique complete selected ids and today’s three individual receipts are required; v1/v2 and smaller pools
never retroactively earn a bonus. An already-paid #993 v3 set can reconcile one missing bonus atomically on load/update
without running individual awards again. Day rollover clears daily bonus display while retaining paid-day receipts and earned points.

#708: `Life.x.chicken` keeps raw/golden/burnt progress, off-grill pose or courtyard grate placement, missing/eaten parts and completion/penalty flags. The generic holdable snapshot still excludes chicken to avoid a second restore. `keep.js` restores grill heat before Life; saved grill relighting and chicken loading emit no task progress. F returns the existing bird rather than creating a fresh rewardable one.


## Versioned layout credentials (#853)

`src/privatecodes.js` provides synchronous `sha256(text)` (TextEncoder UTF-8, lowercase SHA-256 hex), exact `isPrivateCode(input)`, `privateCodeCredential(input)` and strict `isPrivateCredential(value)`. Version 1 hashes the bytes of public salt `lunden/private-layout/v1`, one NUL byte, then the exact input. The two public digests replace only the Worker's plaintext list in this slice. No normalization happens inside these helpers: the legacy Worker continues to require exact case/spacing; the direct unlock's existing trim-only behavior and console's separate slash/case/whitespace normalization remain client responsibilities. Invalid types/strings return false/null; SHA itself requires a string.

`PUT /furniture` accepts the original `{code, moves, ...}` or `{credential: {version: 1, digest: <accepted lowercase hex>}, moves, ...}`. Either valid path is sufficient. Credential version/type/digest and the two-field shape are checked before the existing reset/revision/pose/conflict/retired-id/atomic batch rules. `layoutWriteCredential()` returns a fresh default credential for the existing fixed layout writer's later migration. Public tokens are replayable; this is the existing game mechanism and **no authentication guarantee**. GET, storage schema, migrations and old-client writes are unchanged.

Deploy the compatible Worker before the credential-sending client (#856). `cloud.yml` watches the shared verifier as well as `cloudflare/**`; Pages and Worker jobs can finish independently. Keep legacy input support while older clients remain. This slice does not change the public command catalogue or any client unlock/console/save path.

Tests require an **external, untracked** UTF-8 JSON file `{ "codes": [<first canonical input>, <second canonical input>] }`, passed as `LUNDEN_SECRET_TEST_INPUTS=/absolute/path/inputs.json`; the first is the existing fixed writer's input. There is no committed default, production-source fallback or skip. Missing/unreadable/malformed input fails, and noncanonical input fails verifier checks. The shared test-only loader is `tools/secret-test-inputs.cjs` (#854). Run `LUNDEN_SECRET_TEST_INPUTS=/path/inputs.json node --test cloudflare/privatecodes.test.mjs cloudflare/layout.test.mjs` for known SHA/UTF-8 answers (including astral and lone-surrogate replacement), both real inputs and all existing serialization/reset/revision/conflict/migration/pose rules.

For a native browser and actual local Worker HTTP write/read/reload (no apartment/WebGL), start `python3 tools/devserve.py 8811 .` and `node cloudflare/dev.mjs 8821`, then run `LUNDEN_SECRET_TEST_INPUTS=/path/inputs.json PLAYWRIGHT_MODULE=/path/to/playwright node tools/privatecodetest.cjs http://localhost:8811 http://localhost:8821`. `PRIVATE_CODE_OUTPUT` selects artifacts (default `/tmp/lunden-private-codes`). The probe tests both real inputs via exact legacy and versioned credentials, rejection and persistence across a genuine browser reload. Outputs contain labels/results, never input values. Local development storage is in memory; this is not a live Cloudflare deployment or a measured physical-device test.

#853 verification: 12 targeted Node tests passed, preserving all original layout tests; a source-matched pre-change Worker comparison returned identical statuses for 20 cases across both real inputs (canonical 200, altered case/spacing/slash/types 403). Missing, unreadable, malformed and wrong-canonical external provisioning each exited nonzero. Native Chromium + local Worker HTTP probe passed all 16 checks, including both actual inputs through legacy and credential PUT, rejected version, GET persistence and actual browser reload; reviewed text-fixture image. Local artifacts: `/tmp/lunden-priority-853/result.json`, `fixture.png`, `legacy-parity.json` and provision logs. This certifies the shared verifier/Worker-first slice only; actual application console/direct unlock/client credential sending remain later #854–#856 work. No live Worker deployment, rendered gameplay or physical-phone result is claimed.


Client integration (#856): the later `src/cheats.js`/`src/rearrange.js` slice removes both plaintext inputs from published client sources while preserving the eight public commands, synchronous console normalization, direct trim-only unlock and remembered boolean. The fixed writer now sends `layoutWriteCredential()`; it does not retain or require the unlocking input after reload. The compatible Worker was published first (#853), keeping legacy writes for cached older clients. The expanded `tools/privatecodetest.cjs` imports the actual command helpers and real Rearrange class on a small controlled native Three scene (no apartment/WebGL), then tests both explicit real inputs through synchronous normalization/negative/busy contracts, actual credential PUT/read/revision/conflict/pose/reset, fresh-controller restoration and a genuine browser reload. Wire inspection records only credential shape, never plaintext input. Original full-app console/UI/chat fixtures remain separate, with their authored actions/query/modes and explicit external provisioning.

#856 validation on frozen `cbb7699`: the expanded native probe passed all 39 checks with both explicit external inputs and eight actual Rearrange PUTs carrying versioned credentials without plaintext fields. A source-matched comparison with the original `b5e66b3` command module passed 84 synchronous routing/handler-output cases across all public commands and both real private inputs (case/trim/tabs/spacing/one slash/two slashes/refusals). All four unchanged provisioned whole fixtures then completed: `cheattest`50, `rearrangetest`28, `rearrangeuitest`26 and two-client/Worker `chattest`47 PASS, each actual CLI exit0. Chat reached actual native fullscreen exit/667×375 phone steps, Anonym return and final peer-left/bubble removal, with all eight authored PNGs reviewed. The three HTML parent/iframe captures were also reviewed at their authored 480×300/844×390 sizes; the UI's last overlay does not certify a later post-disable paint. These are source-specific browser/room regressions, not pixel-equivalence, phone hardware, FPS or authentication evidence.

The first direct tool-session harness was interrupted with exit143 after writing the cheat terminal/image and did not record a child CLI exit; that attempt is **not** the green CLI result. One separately owned finite sequential harness repeated that fixture and completed all four tests, wrote actual exit files, then stopped its own server/Worker and cleared its owned-process manifest. Its 15-second heartbeat/poll wall times are monitoring observations, not benchmarks or comparison timings. Artifacts are `/tmp/lunden-priority-856/{native,cheat-final,rearrange,ui,chat}`, `console-parity.json`, `owned-monitor.json`, `*-exit.txt` and the retained interrupted log. All252 frozen executable/data/module hashes stayed identical through the full verification; the final publication changes documentation only. Inputs remained mandatory external JSON, without committed fallback, production overrides or altered assertions/query/modes.


Public combat lives (#865): PlayerRoom appends server-owned `l` to welcome snapshots, join and ordinary `t:'s'` state. `cleanState` ignores client `l`; values come from the same hibernating socket attachment used by `shot`, defaulting only on the server to its current COMBAT rule. `publishState(ws, attachment)` publishes position/weapon/score and actual remaining lives after an accepted hit or immediate death reset, so stationary targets and observers update without a new client message, timer or billed incoming request. Future server damage/recovery can serialize the same attachment and call this publication path; #865 implements neither fall damage nor a recovery timer. Leaving removes the connection; rejoining starts with the server rule count. This additive protocol is compatible with cached clients; deploy the Worker before the life-reading client. Older Workers omit `l`, so the new client hides unknown health rather than guessing a maximum.

## Shared life recovery (#867)

PlayerRoom's existing socket attachment `l` remains authoritative. `recoveryClock(a, now)`
starts `healAt` 60,000 ms after the first damage from full health. Further damage retains
the phase; full health or actual death/reset clears it. `recoverLife(ws, a, now)` settles
all due whole minutes up to max, including before a fresh shot if an alarm was delayed.
The room's server wall clock counts while the connection exists, including stationary
and unarmed play. One earliest-deadline Durable Object alarm serves all damaged sockets;
no interval timer keeps the object awake. Attachments and the alarm survive hibernation.
The handler commits the advanced timestamp before sending `{t:'life', l}` to the local
Combat replica and `publishState` to other players, so duplicate alarm delivery cannot
grant another life. Runtime delays can combine due minutes into one capped update.

Pause/background/idle that closes the existing Ghosts socket ends that connection's
health and recovery phase. Reconnection starts full, as before; there is no persisted
fight record or offline catch-up for an old socket. The local event changes health only,
without hurt flashes, scores or death callbacks. #868 provides the common fall-damage channel (`await Combat.fall(drop, gap)`);
#869 wires the actual landing caller. The channel settles due recovery, mutates the
same attachment, calls `recoveryClock`, serializes, and awaits `scheduleRecovery`.

No polling writes were added: unchanged phase reuses the cached alarm. Ordinary
position/chat traffic reads scheduling only once after hibernation or a failed storage
operation to repair missing scheduling; steady traffic does not read/write an alarm. Close/idle/no eligible player
clear it; the admin brake clears both storage and cache. Alarms consume one conservative
`bill.req`, obey the existing monthly cap and stop at the cap/off switch. Storage alarm
writes occur only when the earliest deadline changes. Billing semantics checked
2026-10-13 against [Cloudflare pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
(alarm invocations count as requests, setAlarm as a write);
[alarms](https://developers.cloudflare.com/durable-objects/api/alarms/) guarantee
at-least-once delivery, so recovery is timestamp-idempotent. No per-player timer or KV
fight persistence is introduced. `cloudflare/devws.mjs` supplies matching shared alarm
scheduling for local real WebSocket verification.

Offline recovery uses the existing `Combat.lives` replica, never another health counter.
`Combat.recoveryClock(now)` starts/preserves its first-damage phase;
`Combat.recoverOffline(now)` settles due whole real minutes before new offline damage
and from the existing update loop. No additional timer runs. Offline pause/background
wall-clock minutes are applied on the next update, capped at max. Connected clients
clear the local phase and receive health only from the server; the existing welcome
reset clears it on reconnect. Full/death reset clears it too. The common offline
fall-damage reducer settles before mutation and calls recoveryClock after mutation.


Own health and fall request protocol (#868): a newly accepted socket explicitly starts with the server COMBAT.lives and supplies own `l` in welcome. Passive `t:'life'` and fall result `t:'fall',id,l,dead` use the same attachment and local Combat replica as shots. Fall geometry is bounded finite client input; `src/falldamage.js` computes the damage, while client `l` remains ignored. The room settles due #867 recovery before damage, invokes recoveryClock after mutation, serializes the attachment before scheduling the alarm, and publishes stationary peer state. Actual death reports zero in the result while immediately resetting the shared attachment/replica to max, as shot death already does. Fall requests do not award shot points or emit hit/hurt. No new storage key, health counter, healing interval or authentication mechanism is added. Deployment must carry the additive Worker protocol before this client; a cached Worker without fall support produces a bounded null acknowledgement rather than locally applying guessed damage. Workflow dependency #870 tracks shared module/config changes. `cloudflare/players.test.mjs` checks real Worker damage, ignored client HP, preserved weapon-state health, own welcome and harmless/invalid measurements; the native browser contract test is `tools/combatstepstest.cjs`.


Server lethal-hit receipts (#871, protocol-first): PlayerRoom adds an opaque UUID `kill` only to the shooter's accepted `t:hit,dead:true` result (remaining `l` is nonpositive). Ordinary hits, victim hurt/death, passive health and fall results carry no kill receipt. Input receipts are ignored; rate/range/weapon/score rules and life reset remain unchanged. It is a local statistics deduplication token, not authentication or a persistent server fight history. Legacy clients ignore the additive field. The client statistics slice consumes it through the existing Ghosts/Combat path; receipt handling adds no messages, room storage, timers or scoring.


Kill statistics (#871): `Combat.hit` independently passes the server receipt to `stats.recordPlayerKill` before any hit-award handling. Only a true lethal hit with a valid server UUID, nonpositive finite remaining health and another target counts. Missing/legacy/malformed ids, ordinary hits, own deaths, falls and passive health add none. Existing hit callback/points remain unchanged; kills award no additional points. `pvpKills` and consumed `killReceipts` persist synchronously together in the existing `lunden.stats` JSON record. As for the other local statistics, blocked/full localStorage cannot promise durability. A visible-statistics reset clears `pvpKills` and ordinary counters but retains receipt metadata; replaying an old receipt after reset/reload/reconnect cannot restore the counter. The existing home-reset whitelist preserves that same statistics record. No new storage key, player identity, room history or network acknowledgement is added; interrupted delivery before the result reaches the client is not backfilled. Old saves start with zero kills rather than inferring deaths from hit counts. `statRows`/`renderStats` show “Dödade spelare” in the existing panel.

## Shared actual crouch pose (#878)

`main.js` reports `c: player.crouched`, the actual Player decision, rather than the
wanted `player.crouch` input. Low headroom or kneeling may keep the player down after
the key is released; jetpack flight suppresses actual crouch. Ghosts treats a pose change
as activity/state change even at unchanged feet/yaw and sends it in the existing 5 Hz
state slot. Only literal `c: true` is retained by `cleanState`; false, missing and all
invalid values are standing and omitted. Welcome retains the latest pose through the
existing attachment state; no additional connection, message type, counter or storage.
Weapon/score/lives and their authoritative rules are unchanged.

`Ghost.push` stores pose0/1 beside each position/rotation sample (including gap fill).
`Ghost.draw` interpolates it with the same delayed snapshot k, exposing render fraction
`Ghost.crouch`0…1. `Ghost.animate` gives that fraction to the existing
`Avatar.update(dt,{speed,turn,hands,crouch})`. Local mirror tracking applies the same
actual pose while retaining its existing hidden/render-pass lifecycle and arm/prop hooks.
For legacy v1 head contacts use the actual `avatar.bones.head` and skinned vertices;
`Ghost.head` remains the previous fixed greeting anchor and is not a headshot surface.
No hit classification/damage or head-height guesses are introduced here.


Confirmed distance reward state (#873): the server attachment adds only a monotonic `awardSeq` alongside the existing per-minute accepted-point counter. It survives room hibernation, increments only on an accepted hit and starts again with a new connection. Hit acknowledgements carry `award:{i,seq,distance,points}`; all values come from the server's accepted geometry and the shared config rule, not request fields. Neither shots nor bonuses introduce KV writes or timers.

The existing `lunden.stats` record gains `pvpRangePoints` (default0), containing extra distance points only. Existing `pvpHits` still stores integer events and yields its unchanged base reward, so old saves do not lose or double previously earned points. Both values follow the existing save/pagehide/reload/reset path. Combat's score high-watermark is per current connection; no growing or persisted score-receipt map is added. The separate #871 `killReceipts` map retains its existing persistence/reset semantics. The additive Worker protocol should deploy before the new client; a cached older Worker gives the existing base-only reward until updated.

### Canonical avatar appearance (#892 preparation)

Look code (#890/#1136, `encodeAvatarLook`/`decodeAvatarLook`/`avatarCodeValid` in config.js, Worker `cleanAvatar`): 7 or 9
digits as before, or 9 + three digits of a chosen height in cm within `AVATAR_HEIGHT` (12). The height is written only when
chosen, so old saved `lunden.avatar` values and codes stay byte-identical and decode to the seed's own `tall`. An
out-of-range or malformed height rejects the whole code (client and Worker alike). Older cached clients that receive a
12-digit code fall back to that player's seed look; deploy the Worker before the client.

#1173 keeps that local/save encoding unchanged. `encodeAvatarWireLook` adds only
an optional `s0`–`s4` tagged extension on the network for the exact existing seeded
vertical scale. Ghosts uses it both on startup and `setMyLook`. It never converts
old proportions into a rounded whole-cm height or rewrites `lunden.avatar`; the
local scale, head and eye height stay unchanged. Explicit chosen-cm codes retain
their existing encoding and take precedence over an `s` tag. Invalid scale indices
are ignored. Existing ax validation forwards the bounded tag, and older clients
ignore it safely. New clients receive it in states and welcome/reconnect snapshots.

#1175 additionally sends the existing `build` as wire-only `d0`–`d2`, including
looks with a chosen height. It preserves the local mesh/proportions and saved
codes; receivers stop deriving body width from their own unrelated player-id
seed. `b` remains the face's nose-width tag. Unknown/out-of-range `d` values
keep the legacy seed fallback. All current face fields plus `d`/`s` fit the
existing 48-character/16-tag extension contract; no Worker bound is widened.

Combat's rifle/straight, bow, Nerf, basketball, jetpack and body/cone proxy states
carry av/ax to the shared head/neck/rest-frame helpers; the same helpers use the
accepted state on the Worker. This follows the transmitted existing build and affected seeded vertical scale.
The pre-existing chosen-cm collision/movement/head-proportion scope remains in
[#1137](https://github.com/solwation/lunden-3d-apartment/issues/1137).
`tools/avatardefaultheighttest.cjs GAME WORKER OUT` uses native Ghosts/Avatar/Combat
and two actual local PlayerRoom clients, with an exact pre-change ghosts source
as a before control via `BASELINE_GHOSTS`. It checks constructor/setMyLook,
newcomer/reconnect/name changes, exact vertical body/head alignment and actual skinned horizontal width, explicit
120/165/195cm, old save codes, rest/crouch and ordinary authoritative head/body
2/1 damage. Its one rendered component scene is not a full World, physical-phone
or FPS claim. #1174 updates the existing avatarcustomizertest reset assertion: the saved look
is retained verbatim, transient home keys reset and other origin keys stay intact.

`config.js.avatarLook(seed)` is the single deterministic palette/style/sleeves/build/height
implementation. `avatar.js` reexports it as the existing `look` API and uses it directly.
The extraction preserves the original pick sequence, colours, physical scale and all
mesh attributes; it introduces no head classifier, contact field or damage change.
Visible stationary-rifle head damage remains pending #897 → #898 → #899, under #892.
The original 10,009-seed look outputs and native Avatar geometry/material/scale for
80 seeds across all eight geometry variants were compared exactly (400 attribute
arrays, zero WebGL calls/page errors); this is math/DOM evidence, not rendered
apartment or physical-phone acceptance.
Spider suit state (#891): Ghosts forwards actual `suit.worn` as optional `sp:true` within the existing change-only 5Hz state/shot budget.
On/off changes at unchanged feet count as equipment activity. PlayerRoom accepts only literal true, retains it in the existing socket state/attachment
and late welcome, and omits it when off/legacy/invalid. Reconnect republishes the actual current suit; existing SpiderSuit.saveState/loadState
restores worn equipment before connecting after reload. No new storage key, channel, timer, power or authoritative combat rule.
Avatar.setSuit uses one reference-counted 256×192 existing own artwork canvas shared among current wearers, with the existing SPIDER colours.
The original one SkinnedMesh/geometry/bones/head envelope/base-colour attribute remain, and one common shader handles on/off; the last wearer
releases the atlas. Its mask projection uses the actual existing head sphere bounds and the existing canvas eye band, not new body measurements.


### Restricted rifle contact receipt (#897)

An optional modern shot field `hc:[1,x,y,z]` is whitelisted only at version1 with
finite world coordinates within ±5002m, rounded to r3. Existing origin bounds
±5000m, direction r3/norm, incoming256bytes and shared5Hz/cost/rate/point limits
are unchanged. Wrong/missing contact versions are stripped and retain body1;
invalid ordinary shot geometry is still rejected. No client-selected damage,
head boolean, seed, style or model enters authoritative damage.

The room's existing connection attachment records `movedAt` on a changed feet
position or heading, not on health/score/weapon-only updates. Head acceptance
requires a known stable position/heading for500ms (*guess* conservative gate),
standing state and target's canonical server-id-derived short-hair look. It checks
origin near actual shooter feet, contact within the rifle's40m ray, ≤0.001m wire
residual (sqrt(3)/2000: r3 contact on the ALREADY snapped r2/r3 ray). The complete
r3 rounding cell must fit the canonical feet/world-frame core x±0.008m,
y1.53+0.148–0.158m after width/height/heading. This is the explicitly supported
actual central skull region, not a broad head-bone-local band plus pose expansion.
No client animation anchor/pitch is accepted. The first positive FRONT triangle
entry uses the same skull radius/segments/scale/centre as Avatar. Its anchor1.53m
is midway between actual bind1.54 and settled1.52; a separate0.015m *guess* surface
guard covers the sampled breathing/head pitch and wire residual. Physical mesh
parameters remain unchanged. The support/temporal/surface guards are policy
choices, not measured anatomy or guaranteed anti-cheat physics.

Native actual checks covered2160 eligible central front contacts over all15
style0 build/height combinations, four headings and bind/three updated standing
poses. Pure triangles differed from production vertices by at most5.32e-8m;
first-surface/wire residual was at most0.010830m. The same actual nearest-surface
grid tested7138 unsupported jaw/face/brow/hair/outside-core contacts with zero
false head acceptance. Quantization-boundary cells fail closed; other head areas,
styles, moving/crouched poses and older contact-less clients retain body1. These
are sampled restricted-model checks, not a server scene/wall/body-occlusion or
complete anti-cheat simulation, nor allvariant/phone/rendered-apartment evidence.
The earlier wider patch failed1273/7198 negatives and was discarded before any
publication; its evidence is separate from the green canonical-core result.

An accepted head subtracts2 from the SAME server lives after `recoverLife`; body
subtracts1. Recovery scheduling/public state and the existing one `award`/fatal
UUID remain unchanged. Both `hit` and `hurt` add `head:true` only on validated
heads; existing clients still understand l/dead, and cached older Workers simply
return body1. The additive Worker must deploy before head-capable clients for live
benefit. No new timer/KV write or persisted contact history is added. Older room
attachments without `movedAt` conservatively stay body-only until a position or
heading state change provides an observed timestamp.

#897 delivery acceptance: runtime `18f8fd0` passed20 actual Worker Node tests and
19 native checks after integrating #891's suit, with zero errors/WebGL and the
reviewed authoritative-marker/HUD PNG. All250 frozen runtime/server/index/fixture
paths remained byte-identical through the final rebase (incoming only other docs
and #902 PNG). The genuine Worker deployment run38417835953/job115366906831,
including `Run cloudflare/wrangler-action@v3`, completed successfully; Pages
run38417835821 also succeeded. This verifies publication of the additive server
contract, not a new physical-device gameplay test. #897 closes only this restricted
central style0 slice; #892/#879/#874 and #898/#899's remaining head surfaces stay open.

## Bicycle resume policy (#903, #905)

Cycling is transient Player state and introduces no storage key or mounted resume.
The existing place/session writers save an actually supported, collision-clear
standing exit, otherwise the still-clear original standing mount place. If neither
is safe, they retain the earlier session rather than write bicycle saddle feet.
A genuine reload rebuilds the original bicycle matrices and resumes the player
standing. Existing home/world data, life and worn equipment rules remain unchanged.
The native bicycle driver checks the real resume module across browser reload,
blocked-exit/session retention and real spawn releasing the cycling mode. These
checks pass in the final34-check native run; the separate actual World run uses
one World construction and does not claim another whole-app reload or remote
bicycle pose. #905 repeats safe standing reload for all nine NW-yard identities;
all nine rebuild their source placements with no new storage key. #877 remains
open for the other existing bicycle populations.

### Additive nose region (#920)

The same bounded `hc:[1,x,y,z]` may prove the separately supported frontal nose
core on canonical appearances. Matching nose entry uses shared exact physical
sphere parameters and a6mm guard; central skull validation remains independent.
Stationary/crouch/origin/range/wire/cost/score/recovery gates and shared health
remain unchanged. Cached clients without nose contact keep body1; a cached old
Worker also returns body1 for the additive nose proof. New clients accept that
ordinary receipt without a predicted head marker. Actual nearer unsupported
surfaces, rear/side approaches, walls and invalid proofs cannot create nose2HP.
This bounded validation does not replicate the authoritative animated scene.
### #916: central cores for the remaining canonical hair styles

`rifleHeadCoreRegion` now selects the actual server-seeded look across all60
style/build/height combinations. Styles0/1/2 retain #897's exact central rounding
cell and tolerances; style3's measured exposed lower core is y1.53+0.132–0.140m
with the same ±0.008m width. Its named `maxVertical:0.08` is a *guess* policy
limit on abs(normalized wire direction.y), not a physical head dimension.
Missing actual direction and steeper beanie rays stay body1: a nearer brim/nose
can otherwise hide a first primary-skull entry. The same actual rounded ray is
passed through Combat → Avatar and through the Worker to the shared core helper.
No new contact fields, presentation pose, sphere inflation or damage model is
introduced. The OR-dispatch helper leaves other regions to their own slices.

Measured actual mesh checks cover8624 eligible nearest contacts with zero failed
proofs,28726 unsupported nearest contacts and16821 hidden-skull forgeries with
zero false heads across all60 variants, four headings and four standing/bind
poses. The248 separately supported actual nose contacts introduced by #920 are
excluded only by its explicit internal surface tag and shared nose-region check. A separate actual oblique grid covers8505 rays across all15 beanie
build/heights and seven standing phases;400 nearer unsupported contacts hiding
a primary-skull entry receive no head bonus. These are sampled restricted-core
checks; they do not establish full server scene occlusion or all animation/angle
anti-cheat coverage. An earlier unguarded oblique trial accepted28 hidden skull
forgeries and was discarded before publication. Its failed evidence is retained
separately. Hair/hat, face outside the separately delivered #920 nose core, ears, remaining
skull regions, boundary/ambiguous cells,
moving/crouching and other weapons continue body1. Actual local Worker receipts
verify new-style head2, covered beanie body1 and a forged steep beanie ray body1
with unchanged awards, kills, marker replay and recovery.

#916 delivery acceptance: runtime `7d27292` passed21 actual Worker Node tests
and26 native checks against owned fresh Worker PID1751542 (started after the
server/config freeze at2026-10-13T16:03:27Z), with zero errors/WebGL. Root reviewed
the actual HUD/receipt PNG and the corrected15 unique canonical beanie seeds,
seven phases,8505 oblique rays/400 hidden contacts/zero false heads. The final
native fixture selects an actual exposed bounded-core contact before ONE real
shot; it retains covered-beanie and forged-steep-ray body1 assertions. An earlier
fixed-middle-aim run timed out and is not accepted evidence; likewise the obsolete
oblique height list's seed fallback/counts are discarded. All failed logs remain
separate from the definitive green run. After final rebase249/250 frozen paths
match exactly; only `src/main.js` changed for bicycle captions and is not loaded
by the native bootstrap-free harness. All actual server/client/helper/fixture
imports match the executed bytes. Genuine Worker run38428499817/job115404135281
and its `Run cloudflare/wrangler-action@v3` step succeeded; Pages38428499888 also
succeeded. This confirms deployment of the additive core contract, without a
physical-phone or rendered-apartment claim. #916 closes this central-core slice;
#898/#892/#879/#874 and independently assigned remaining surface slices stay open.


### Bounded rear skull receipt (#933)

The same optional v1 contact proof can support a separately measured exposed
lower-rear skull region on styles0/2/3. The server applies its own canonical
appearance, whole-cell patch and snapped-ray approach guard before matching the
original first skull profile entry; the unchanged15mm guard is used. Long hair
style1, hair/hat/neck/body-first, missing/invalid proofs and other approaches keep
body1. No target animation phase, client head/damage/model or new pose parameter
is trusted. The room's stationary/crouch/origin/range/wire/rate/score/recovery and
single-life/fatal/award handling stay unchanged. Cached contact-less clients and
cached older Workers retain body1 for the additive rear surface. Actual native
contact/full-obstacle checks on the modern client remain necessary: the server
does not reproduce the whole animated scene or provide full anti-cheat physics.
### Restricted lower-front rifle jaw contact (#928)

`PVP_RIFLE_HEAD.jaw` shares the unchanged production radius0.088,8×6 sphere
segments, scale[1,0.8,1], centre[0,0.052,0.03] with Avatar. Its rigid head bone,
material/shade0.97 and normals remain unchanged. The separate byte `rifleJaw`
marks ONLY those vertices; sixty old/new canonical appearances matched420
position/normal/skin/color/skull/nose arrays byte-for-byte.
`rifleJawProfile` reuses the already shared Float32 sphere math; `rifleJawEntry`
reuses the existing finite first-front-triangle math, with no Three/DOM in Worker.

The named `jawPatch` bounds are *guess* policy guards selected from actual native
positive/negative contacts: canonical x within±0.008m, y1.53+0.032–0.048m,
front z≥0.107m (width/height/heading applied). The WHOLE r3 contact cell must fit
these bounds with the existing0.001m wire guard. Both lateral and vertical ray
components must be≤0.08 times its front component. Missing/side/back/steep rays
stay body1. Jaw surface residual is bounded by0.008m, below the unchanged skull
0.015m limit; no existing tolerance is raised. Actual Combat o:r2/d:r3 is passed
through Avatar and the server as before; hc-v1,256-byte cap and origin/range
checks remain unchanged. The common validator selects the matching jaw profile
only for that supported core, preserving separate nose and skull branches.
Hair, mouth, neck, side/back jaw and ambiguous cells cannot supply a jaw bonus.
This is a sampled restricted-profile contract, not complete scene/pose anti-cheat.

The native CPU grid covers all60 actual canonical appearances, seven bind/standing
breath/head-pitch samples and four headings:16352 admitted nearest jaw contacts
with zero lost proofs;119568 unsupported nearest contacts and56624 forged FIRST
pure-jaw entries behind unsupported actual surfaces with zero false jaw heads;
160 actual misses with zero false jaw heads.13440 sampled full r3-cell corner rays
across every model/pose/heading stay on the actual jaw. Pure vertex error is at
most3.73e-8m and admitted entry residual at most0.006933m. A canonical profile
entry deeper than a supported actual JAW contact is normal pose tolerance, not
an unsupported-surface forgery; the negative grid distinguishes those cases.

One actual Ghosts/Combat→fresh local Worker shot confirms head2/public+local8HP
for every canonical style; existing body1/wall/miss/invalid/legacy receipts, one
low-HP death/reset/kill UUID/award and marker replay stay intact. Existing Node
rate/recovery/score-cap cases stay green. Geometry CPU runs before fresh actual
gameplay attachments via real page reload; no heartbeat, idle clock, health or
server budget is overridden. An earlier180s partial grid and its misclassified
supported-jaw negative counter/idle-disconnect attempt are retained as failed
investigation, not acceptance. No WebGL/apartment/physical-phone/FPS claim follows.

#928 delivery acceptance: runtime `599c9f5` passed22 actual Worker Node tests
and26 native checks after the incoming #933 rear-region integration. The owned
Worker PID1776381 started at2026-10-13T16:46:04Z AFTER the250-path backend/client/
fixture freeze; all250 paths stayed byte-identical through test and final rebase.
The actual marker/HUD PNG and complete60-model/first-contact/hidden-forgery/cell
proof were reviewed by root, with zero page errors/WebGL and actual CLI0. Older
partial/misclassified-supported-jaw/idle attempts remain separate FAILED evidence.
The genuine Worker run38434568930/job115425087460 completed successfully, including
the actual `Run cloudflare/wrangler-action@v3` step; Pages38434568942 also succeeded.
This confirms deployment of the additive lower-front core, not physical-phone,
apartment/FPS, all jaw surfaces or full server-physics acceptance. #928 closes
only this measured lower-front slice; #921/#929 and the other head parents remain
open until their independently assigned surfaces are completed.
#931 adds no saved key or packet field. Its corrective Front permission uses private attachment `turned`: only a freshly created socket initializes false; a subsequent accepted normalized heading change sets true monotonically. Hibernation preserves it, rejected/invalid state does not change it, and old missing history stays unknown. The room passes strict `gt === undefined && turned === false` as a separate Front permission; neither field is broadcast or trusted from a client. Death/heal does not clear history. First valid heading alone does not mark a fresh socket turned. Existing core/nose/jaw/rear/lateral permissions remain independent. Existing rifle `hc:[1,x,y,z]`, r2 origin, r3 direction/contact and the 256-byte maximum remain unchanged. `front` is an additive server/client canonical contact policy; server-assigned appearance and actual target state determine acceptance. A newly owned local Worker must start after a runtime source freeze; the native driver verifies its PID owns its listening socket and checks the frozen bytes again before capture. Existing server-authoritative lives, one lethal UUID/award and recovery clock are reused.

### Bounded lateral skull proof (#932)

The unchanged hc-v1 shot schema now also accepts the explicitly supported exposed left/right temple patch and side approach described in [interactions](interactions.md). Canonical look still comes from the actual server socket id; no model/animation override is accepted. The lateral region uses the existing first FRONT skull triangle entry and15mm surface bound; the separate nose entry retains its6mm bound, and original core/range/origin/stationary/crouch/version/wire/rate/award/recovery gates remain unchanged. Missing optional native-client ray fails closed only for the new branch. Actual serialized shots still use origin:r2/direction:r3/contact:r3 within256bytes. Cached old clients/workers retain body1 for this additional surface. Source publication is distinct from genuine Worker deployment; no live benefit is claimed until its Wrangler step is confirmed.

#932's final first slice adds a server-only optional `allowLateral` argument to shared contact/region dispatch, supplied as `b.gt === undefined` from the existing attachment. Only the new lateral predicate is skipped when false; original core/nose/rear guards remain. No extra persisted field, KV write, wire property, timer or billable request. An accepted greeting already stores gt; hibernation and life reset retain it. Delayed/clamped/frozen remote waves cannot be inferred complete after2.5s, so the fallback lasts that socket. #935 tracks safe support after greeting; this Refs932 slice does not close its parent.

### Extra nose validator compatibility (#934)

No new wire/profile version or client-trusted head flag is introduced. Extra
frontal side cells use existing `hc:[1,x,y,z]`, o:r2/d:r3/contact:r3,256-byte cap,
origin/range/stationary/crouch, ordinary damage/award and shared recovery rules.
The backend PlayerRoom/worker/dev bytes match6f35db5; the additive validator
changes only config and Avatar's internal surface classification. A fresh local
Worker intentionally loading the published6f35db5 config (hash recorded before
boot) returned body1/local+public9HP to the new actual client, an ordinary marker
and one replay-safe hit:6 native checks/CLI0. It used a test-only external Node
loader, not a stale module cache or external service. No live old-Worker or
physical-device claim follows. Existing player/recovery Node suites plus the
new outside-core room case passed28 checks/CLI0. An earlier guessed packet
failed on a random appearance; the fixture now selects a bounded serialized ray
on that actual seed's unchanged physical profile. Runtime guards were unchanged.

The integrated Jaw/Rear/Front version retains their dispatch and exact original
NoseRegion/Profile/Entry, sphere/profile entry functions and nose/nosePatch
bytes. Fresh own current Worker PID1788249 booted after the recorded backend
freeze; its real module protocol passed21 native checks/CLI0, and Node
PlayerRoom/recovery passed29/29/CLI0. The previous28-check result predates the
additional published jaw case. This local evidence is distinct from deployment
and from the intentionally older validator's6-check compatibility result.

The final publication integrates the later lateral target-greeting contract
and cache changes while preserving the separate Nose path. Fresh current
protocol21/21, hidden-contact3/3 (3940/0 false) and players/recovery32/32 have
actualCLI0 on bee59bb. Worker run38437605050/job115435582084 completed success,
including the actual `Run cloudflare/wrangler-action@v3` step; it was not skipped.
This is genuine deployment evidence, not a live-client write/phone/World test.


### Private rear permission (#936)
No new message or public pose/state field is added. The existing accepted greeting
attachment timestamp gt is used only as presence evidence: rifleHeadContact's
optional permissions are lateral7/front8/rear9, and rifleHeadRegion's are6/7/8
(after its five original arguments). The original rear permission was b.gt===undefined; #951 also permits explicit
private headPoseFixed===true after a greeting;
default true preserves older pure-classifier call signatures. Worker attachments
serialize accepted gt through hibernation, whereas state cleaning ignores client
gt and welcome/public snapshots omit it. Core/nose/jaw proofs ignore these branch
permissions. Existing r2/r3/v1/256-byte bounds, shot rate, health/recovery, score
and kill receipts remain unchanged. No elapsed-time or client animation-phase assumption
is introduced. Immutable standing restoration is delivered by #951; the
changed-history remainder stays in #941.

### Immutable standing history for the narrow greeting-left receipt (#938)

PlayerRoom records private `headPoseFixed` in its existing hibernating socket attachment. Only `s === null` followed by a first valid standing `cleanState` can initialize true. Every later strict difference in normalized p/r/c permanently sets it false; returning to the earlier pose, greeting again, life reset or hibernation cannot restore it. Existing attachments with a state but no history flag fail closed and are never initialized retroactively. A new socket starts its own history. The field is never accepted from client state and never sent in snapshots; h/sp/score changes do not count as body changes.

The existing `allowLateral` argument is preserved. Shared contact/region dispatch accepts named `allowFront`/`allowRear`/`allowGreetingLeft` options while preserving published positional front/rear callers, including default/undefined front with explicit rear=false and falsy null front; only `allowGreetingLeft === true` can select the narrow left leaf. PlayerRoom supplies that key only for a greeted target with explicit true immutable history. It introduces no wire, KV write, timer or billed message. Join has no default p, welcome omits p for `s:null`, and `Ghost.draw` cannot pose an avatar before a valid snapshot: its first actual visible state initializes body=gaze. Legacy clients remain compatible.

### Layout fault categories (#940)

Layout reports retain their existing `typ`, `kind`, message, measurements,
confirmation/deduplication/caps, pinch exemption and numerical tolerances.
`layout.faultClass` adds only a bounded diagnostic category: `surface-css`
(canvas/window disagreement), `surface-vv` (canvas/visualViewport disagreement),
`foreground-projection` or `background-projection` (aspect/buffer disagreement
when the surface sizes agree). Surface checks have priority EVEN while hidden;
the iPhone report's CSS852×852 versus window393×852 is not reclassified as an
expected projection transition. These names describe the observed state, not
Safari, GPU, process-death or WebGL-loss causes. No report is suppressed.

CrashLog derives the category and legacy message from one exact-ratio core
measurement, then reuses those SAME canvas/window/buffer/aspect values in the
report. A separate safe-inset probe changes no core sample; the public pixel
ratio retains its previous rounded precision. Worker public output permits only
the four exact class strings; missing/unknown/malformed legacy values are omitted
without discarding the report or exposing additional private layout fields.
No saved-home field, rendering timer, viewport behavior or game rule changes.

The baseline real native Chromium145 tab test observed30s hidden rotation with
CSS/inner/vv393×852 consistent but the preceding landscape639×294 buffer and
2.168 aspect unchanged while rAF stood still. Its actual local CrashLog report
was a projection mismatch; first visible measurement and landscape return
recovered correctly. The iPhone/PWA's square CSS fault was not reproduced.
#669 remains open for the physical landscape-return question; this diagnostic
slice does not resolve the reported iPhone crash.

The additive classification runtime landed in ffd0886. Genuine Worker
run38444479768/job115459174790 completed successfully, including the actual
`Run cloudflare/wrangler-action@v3` step (not skipped); Pages38444479778 also
succeeded. This establishes publication of the optional public enum contract,
not a physical iPhone viewport/crash fix or a live-client crash reproduction.
Older reports without the field keep their previous public representation.

### Lower central nose band compatibility (#937)

The additive band uses existing version1 hc:[1,x,y,z], o:r2/d:r3/contact:r3 and256-byte input cap. It reuses the exact original Nose profile/front-entry/direction/6mm guard, canonical appearance and shared life/recovery/award/kill receipt handling. No PlayerRoom runtime, wire field, state/history/storage key, message, alarm or cost rule is added. Unknown/absent contact, moving/crouched targets, unsupported regions and an older validator keep authoritative body1. Client classification requires the actual closest original Nose surface; the server validates the reported profile/ray within its existing responsibilities, not full authoritative avatar physics.

The new PlayerRoom case exercises a bounded quantized packet within the original entry guard, both legacy fallbacks, crouch, one low-life kill UUID/award, immediate public life reset, hibernation and duplicate suppression. Its3mm profile offset is explicitly a room-only guard control; independent actual browser skin/closest-surface proof establishes physical support. A fixed origin first failed to find a narrow whole cell for a randomly assigned height, so the fixture now searches bounded legal r2 origins rather than widening policy.

Fresh old023f4ca validation returned actual new-client body1/local-public9HP and an ordinary replay-safe marker (7 native checks/CLI0); an external loader supplies its recorded original pure config, never a stale module cache. Final fresh current Worker/native protocol24/CLI0 and Worker/recovery36/CLI0 preserve published front/rear history and named allowFront/allowRear/allowGreetingLeft options. They do not globally gate the independent Nose band. Own runtime changes are only the new canonical constant/region and existing internal Nose surface dispatch; no message or periodic work is added.

Runtime e385c6cc was genuinely deployed by Worker run38444878563/job115460536183: actualwrangler-action step success, not skipped. Final byte-frozen native24/CLI0 and Node36/CLI0 precede this deployment; documentation-only completion adds no runtime or changelog entry. The narrow band completes #937; the broader #920 nose request remains open for unsupported surfaces/poses.


### Private immutable greeting-Front eligibility (#943)

No wire/storage key, HP counter or animation clock is added. The existing938
`headPoseFixed` and931 `turned` attachments are reused without initialization or
migration edits. Accepted gt presence AND strict fixed/false history permits
only the new narrow greeting-Front branch; named `allowGreetingFront` is appended
to existing options while lateral7 and legacy bool Front8/Rear9 compatibility
remain. Unknown already-posed legacy history never retroactively reopens it.
Public welcome/state omit all three private fields; rejected/client-claimed
values cannot establish eligibility. A fresh socket/first standing snapshot
can reopen its own family, whereas reset/recovery does not reset history.

Actual native Combat/Ghosts shots use unchanged r2 origin/r3 direction/contact,
hc-v1 and256-byte cap. One real low-HP death/killUUID/award/reset and replay-safe
marker are retained; focused real room tests cover hibernate/latejoin/invalid
states and9→10 one-per-minute recovery after a two-HP injury. Genuine deployment
is recorded separately from publication and local owned Worker evidence.


### Private immutable right/back eligibility (#946)

Only named `allowGreetingRight` and its separate canonical subset are added to
existing option dispatch. Attachment headPoseFixed/turned/gt are REUSED exactly,
not initialized, reset or migrated differently. Eligibility requires strict
fixed=true/turned=false/gt-present; public welcome/state still omit these fields
and client claims cannot restore them. Other surfaces and bool Front8/Rear9
compatibility remain unchanged. No new wire/key/counter/timer/billing write.

Actual hc-v1 origin:r2/direction:r3/contact:r3 packets stay within256bytes.
Contact-less/unknown-version clients keep body1, as does the intentionally
older5eab20e-config validator after greeting while the current client supplies
the actual hc. The owned test Worker imports that explicitly hashed external
config through a test loader; all other code remains frozen/current. This is
a finite compatibility control, not a production old-Worker/live-phone claim.
One actual lethal UUID/award/reset and replay-safe receipt marker remain; real
room Node tests exercise rate rejection, history/hibernate/latewelcome/legacy/
fresh identity and9→10 recovery in two controlled minute-alarm steps after2HP.
Genuine deployment is recorded separately before a live publication claim.

### Private LEFT tiny-yaw history (#947)

A new socket starts with `leftTinyTurn:null`; only its first accepted standing
state initializes private `{p,r}` from existing r2 normalization. Every later p/c
change or wrapped yaw outside the guessed 0.01 corridor permanently changes it
to `false`. A missing field on an older resumed attachment never initializes
retroactively. Null, boolean, malformed, non-r2, out-of-range coordinate (>5000)
or heading (>100) anchors cannot grant permission. This metadata survives ordinary
Durable Object hibernation, is absent from welcome/state publications, and adds no
KV key, timer, public field or message.

`allowGreetingLeftTinyTurn` selects the existing LEFT leaf only for a greeted
eligible attachment. It does not modify `headPoseFixed`, `turned` or other named
families. Direct one-quantum arithmetic avoids floating subtraction rejecting
valid r2 endpoints; wrapped comparisons cover the ±π crossing. Zero yaw is
intentionally eligible too, redundantly with the independent original immutable
LEFT rule; it cannot restore invalidated metadata. Damage, recovery, one lethal
UUID, award sequencing and life reset remain the existing authoritative paths.

### Private bounded after-turn anchor (#944)
New socket attachments start with `frontTurn:null`. Only that known fresh sentinel
with s:null followed by first accepted standing cleanState establishes immutable
`{p:[x,y,z],r}`. Accepted normalized p/c changes or wrapped yaw outside the guessed
.02rad corridor permanently replace the anchor with false. Missing legacy history
is not reconstructed; null with an existing state and malformed history fail closed.
`knownFrontTurn` explicitly requires a p[3]/r object inside the existing state
numerical bounds. Client fields cannot overwrite it and public/join/welcome state
never includes it. Existing headPoseFixed/turned histories are preserved exactly.

The independent named `allowAfterTurnFront` requires known anchor, turned===true
and gt absence. It never changes the older bool/default options or other named
greeting/region guards. Normal hibernate serializes the anchor; accepted movement,
life reset or elapsed quiet time cannot silently recreate broken history. No new
message, public model/phase, health counter, timer or KV write is added.
Number.EPSILON×128 only guards floating subtraction/trigonometric wrap at equal
r2 corridor endpoints (under the unchanged finite r≤100 bound); it does not change
normalized state, hc/ray precision or model/wire/surface tolerances.

### Combined greeting/turn permission (#955)

PlayerRoom adds only `allowGreetingAfterTurnFront`, derived from private accepted
`gt` presence, `turned === true` and the existing `knownFrontTurn(frontTurn)`
object contract. No new attachment field, initialization, migration, public
property, KV write, timer or message is added. Existing first-standing anchor and
permanent normalized p/c/heading invalidation survive hibernation, healing and
death unchanged; missing/null/malformed legacy anchors do not grant permission.
Rejected/invalid greetings and states do not manufacture a new history. Other
named and legacy positional/bool/default/null options keep their original rules.

### Independent larger LEFT standing corridor (#953)

Fresh sockets add private `leftStandingTurn:null`. Only the first accepted
standing cleanState initializes `{p,r}`; every accepted p/c change or wrapped
heading escape from the guessed 0.30 corridor permanently changes it to false.
Missing legacy metadata never initializes retroactively. Strict finite normalized
r2 coordinates within ±5000 and headings within ±100 are required; null, booleans,
malformed or out-of-range anchors cannot grant permission. Existing
`leftTinyTurn`, `headPoseFixed`, `turned`, `frontTurn` and all named independent
surface permissions remain unchanged. No new KV, public field, wire or timer.

Strict default-false `allowGreetingLeftTurn` selects the exact existing LEFT leaf
only for a greeted eligible socket. It does not widen the surface or precision
policy. Node tests traverse all 61 normalized offsets in both directions, including
wrapped aliases, hibernation, permanent escape/return, missing legacy and hidden
metadata in welcome. The old-client missing-hc path, one lethal UUID/award/reset,
replay and recovery retain the existing authority. Simulated pre-feature legacy
fixtures omit both newer LEFT histories; no private history is restored for a
successful assertion.

### Existing immutable history for Rear (#951)

PlayerRoom changes only its existing named `allowRear` value to
`gt === undefined || headPoseFixed === true`. The original first real standing
state is the sole initializer; normalized p/r/c changes permanently invalidate
the same private attachment flag. Neither h/sp/score nor accepted greetings
invalidate it. Missing/unknown legacy history does not become eligible after
state receipt, hibernation or reset. Healing/death do not reconstruct history.
Fresh real sockets establish independent histories. The field remains absent
from public/welcome state and ignored in client input. There is no new state,
KV write, timer, request or animation authority. Positional/named/default/null
Contact calls and all other named region gates are unchanged. Old clients without
hc and new clients against the archived pre-951 Worker retain body-only fallback.

The native matrix uses actual Ghost first snapshots, not a visible default pose;
a fresh actual late observer also receives the immutable heading without private
metadata. Protocol and failed-run provenance are recorded in the
[verification section](verification.md#immutable-rear-after-greeting-951).

### Existing bounded history for Rear (#952)

PlayerRoom supplies only the additional named `allowGreetingAfterTurnRear` when
`gt` exists, `turned === true` and `knownFrontTurn(frontTurn)` holds. The existing
first-standing `frontTurn` initializer and permanent normalized position, stance
and ±.02 rad heading checks are unchanged. Missing/malformed legacy history
cannot be reconstructed. Hibernation, healing, death, return to the first heading
and client-supplied flags cannot restore an invalidated corridor. No extra
attachment, message, timer, storage write or billed operation is introduced.
Legacy bool/default/null Front/Rear arguments and all other named permissions
retain their behavior; the new option defaults false and selects the same Rear
leaf. The immutable #951 branch remains separate.

### Immutable central Nose depth compatibility (#950)

The new strict named option `allowImmutableNoseDepth` reads only the already private permanent `headPoseFixed === true`. It adds no attachment field, message, persistence key, alarm or periodic work. Missing/malformed legacy history is never initialized retroactively; accepted p/r/c changes and returns remain ineligible across hibernation, recovery and death. Shared state snapshots omit private eligibility. Existing null/bool/positional option behavior, other named permissions, old Nose families, life/recovery/award/kill handling, v1 contact precision and256byte cap remain unchanged. A cached older validator gives ordinary body1 for this newly recognized contact; the new client follows its authoritative ordinary marker and health receipt.


### Exposed front-side Jaw strips (#959)

The new Jaw strip shares #938's private `headPoseFixed` connection history. Only
`headPoseFixed === true` permits the additional strict named `allowJawFrontSide`
branch, before or after greeting. It is established by the first valid standing state;
any normalized position/heading/crouch change permanently clears eligibility. The
flag is retained in the Durable Object attachment across hibernation but never sent in
state, greeting or late welcome. Missing legacy history remains ineligible; reset,
healing and death do not recreate it. No new message, client-controlled permission,
timer or saved health rule was added. Original Jaw and unrelated region guards stay
separate.

### Separate first-turn Rear history (#962)

Fresh connections initialize private `rearFirstTurn: null`. Only their first
real standing state starts `{p,r,next:null}`. The first changed accepted heading
must equal `r2(r ± PVP_RIFLE_HEAD.rearFirstTurn)` (.04); it stores that endpoint.
Any other first change, later different heading, accepted position/crouch change
or malformed/null legacy history invalidates it permanently. Missing legacy
history never initializes. Only a valid endpoint matching current state plus an
accepted greeting enables strict `allowGreetingFirstTurnRear`. Healing, death,
hibernation, return, client fields and public late welcome cannot restore it.
Neither #951 immutable nor #952 Front-corridor history changes. r2 is ordinary
wire rounding, not an added modulo-2π tolerance: ±π aliases outside exact ±.04
remain body1, while unwrapped headings are allowed. No new public fields.


### First standing RIGHT turn with a whole contact cell (#967)

A separate default-false `allowGreetingRightFirstTurn` permission admits only style0
and the original #946 RIGHT leaf. Fresh connections acquire private `rightFirstTurn`
history from their first accepted standing state. Exactly one accepted normalized
negative turn in [-.105,-.095] (*guess*, the requested policy family) may replace
that heading; any later accepted heading change, position change or crouch permanently
invalidates this permission, including a return to the original state. Invalid and
rate-rejected packets consume nothing. A missing or legacy/null attachment with an
existing authoritative state stays denied. History is serialized privately for
hibernation, never published to observers, and has no timeout or animation-phase input.

The new leaf intersects the actual rounded direction and all eight corners of the
rounded contact cell with both ends of a source-certified canonical prism. A cell
outside that prism falls back to ordinary body1. Build/height and current heading
are inverted before testing; the rounded origin must start outside the certified
avatar envelope. This adds a constant 18 plane intersections, no mesh or pose loops
per shot. Existing #946, other regions, their histories and original tolerances are
unchanged. The [certificate and native checks](verification.md#continuous-style0-right-cell-967)
bind this narrow family to current source geometry. Other styles remain separate
children #968/#969; neither the broader first-turn parent nor movement/crouch support
is implied.


#968 adds only style2 to the same strict first-turn permission and the exact #967
prism. Private history, server wiring, style0, #946 and every other region are
unchanged. Style1 remains denied: its actual historical #957 unsupported corner
intersects this prism, so functional child #973 must derive a different safe
geometric subset. Style3 remains #969; #968 stays open until #973 is delivered.


## Additive rug-material layout contract (#995)

The compatible Worker advertises `materialVersion: 1` on GET/successful PUT of
`/furniture`. Optional `materials: [{id, surface, choice, base}]` patches update
`state.materials[id][surface] = {choice, revision}` in the same serialized atomic
layout transaction. The shared `src/materialcatalog.js` whitelists six existing
rug IDs, their `textile` surface and compact catalog choices; textures stay local.
Each surface base is independent of its furniture pose base, so simultaneous
move/material edits preserve both. Legacy move-only requests preserve materials,
and material-only requests preserve poses; stale same-surface edits return409.
Missing selections mean the exact original. Existing unknown stored selections
are retained by legacy writes. Reset-all continues to reset positions only.
`cloudflare/layout.test.mjs` retains the original external-input credential and
pose/migration tests and adds real DrawingRoom material/legacy/concurrency checks.
This Worker-first contract precedes the requiring client within the same issue.

The #995 client reads/writes these choices through the existing layout cache,
3-second/focus/online polling and deferred pending state. Preview is local; a
confirmed write requires a live recognized Worker capability and an accepted
response. Offline failures retain accepted cached choices/revisions and restore
the accepted material. Cached unknown preset IDs round-trip untouched and render
the original until understood. Ordinary viewers apply shared choices without
unlock/edit mode; the fixed curtain family below reuses this protocol, while further textile families remain separate work.


#669 hidden-start heartbeat diagnosis (2026-10-14): `snapshot().s` now follows
actual `document.hidden` from the first beat, matching the existing visibility
handler's bg policy. Initial background startup can occur without a later
visibilitychange; previously that beat was run/hidden1. No old report is removed
or reclassified: a stored legacy run/hidden1 is still reported after a stale
restart, as is a stale visible run. Such reports are an uncertain unmarked-end
signal, not proof of an OS crash or memory cause. Background/clean exclusion,
foreign-tab freshness/ownership, signature deduplication, quotas and Worker
public projection are unchanged. See the native before/after verification;
#669's physical context-loss acceptance remains open.

### Fixed curtain textiles (#997)

`CURTAINS.materialId` explicitly identifies the six fixed sets (`f-curtain-bedroom1` … `bedroom4`, `f-curtain-kitchen`, `f-curtain-living-room`), separately from `curtain0` … `curtain5` / kitchen `curtain4-valance` in `lunden.blinds`. Material version stays 1; the additive catalogue validates textile choices by surface family, preserving the six exact rug IDs/choices and old pose-only writes. No curtain pose is stored. Worker catalogue commit a5c74aa deployed before the requiring client (Deployed 2026-10-14 10:55:31Z, version 7ff40b59-dad3-442d-99f1-21602d98b5c9). Original/default needs no layout migration. Local real browser/HTTP checks cover ordinary active visitors, new visitors, reload, stale conflicts, offline accepted-cache retention, preview/cancel zero PUT and original restoration; no production home was written by tests.

### Independent interior cushion/throw surfaces (#1014)

`CUSHION_MATERIAL_SURFACES` derives the two exact indoor furniture IDs and their
five/three semantic surface IDs from the existing config. The additive version1
Worker whitelist accepts existing `upholstery-*` choices on those explicit parts,
with independent per-surface revisions. `textile` remains the original base cloth.
No migration is needed; missing values mean Original. Material-only, pose-only,
legacy cached writes and stored unknown fields retain the existing atomic merge.
Different part edits on one piece may confirm concurrently; a stale edit to the
same part still returns409. No decorative geometry/texture is stored remotely.
Worker-first `573551e4e3115f8902b7b4930744ea7e3a90a54f` passed14/14 actual
DrawingRoom tests and deployed through run38556392406/job115826506105 at
2026-10-14T11:25:24Z (versionbfe99040-d786-404a-8391-352bcef0cca9), before the
requiring client. Browser fixtures write only an explicit local Worker; no test
writes to production homes.

### Verona fixed-pad choices (#1012)

`VERONA_UPHOLSTERY_MATERIAL_IDS` derives exactly the three existing movable
Verona IDs from FURNITURE; the long `15.370000000000001` divan2 identity is retained.
Only their explicit `textile` surface accepts existing upholstery presets. The
six indoor-seat IDs, IDANÄS whitelist, other cushion surfaces, rugs and curtains
stay separate. MaterialVersion1, independent pose/surface bases, old move-only
writes, Original/default and stored unknown fields retain the existing contract.
No decorative neighboring instance or legacy whole-group material ID is added.

Worker-first4e214cebf3a63546e79aa301979a8372e4f938ea passed17/17 actual DrawingRoom
tests and actually deployed through run38559680002/job115837374403 at
2026-10-14T11:53:10Z, versiond0e609d1-0472-48c0-be23-748716be2413, before the
requiring client. The normal library handles preview/cancel without PUT and
revision-checked confirmations shared to ordinary visitors. All test writes
use an explicit local Worker; production homes are not modified by verification.

### Outdoor textile identity (#1015)

`PATIO_TEXTILE_SURFACES` whitelists the three actual Verona objects' `cushions`
and the actual non-bow cushion box's `throw-folded` surface. Copies in the box
are representations of the module choice, never a second persisted cushion
choice. Existing version1 material revisions, authorization, legacy poses and
all other family whitelists remain in use. Independent pad/cushion/fleece writes
keep their existing per-surface concurrency and conflict semantics.
### Compatible long-pile selection (#1009)

The new stable `rug-longpile-bluegrey` enum is whitelisted only for the explicit original living-room rug ID; all six old rug choices/IDs, version1 and other families remain intact. Object-aware materialChoices(category,objectId) exposes the choice only to that rug; older calls without an object ID do not offer it. Existing clients preserve unknown stored material fields in legacy pose-only writes; understood Original/default leaves position untouched. Worker-first d13e45ae692ce512429544b51f72d7f39c656753 actually deployed2026-10-14T11:26:00.488Z, version9cd0f3a4-0036-4af3-8666-cab383de6d66, run38556470520/job115826762245 before the requiring client. Native acceptance uses two genuine LOCAL browser/Worker HTTP visitors for active/new/reload/original and concurrent pose/material fields; no production test write is made. Derived support height is not saved as extra moves. The pre-existing #1013 loose reload-XZ defect remains explicitly open.


### Double-bed linen identities (#1019)

`DOUBLE_BED_LINEN` names the five existing IDANÄS linen groups and
`DOUBLE_BED_LINEN_SURFACES` whitelists their IDs only on the actual double bed.
The existing `textile` frame choice remains separate. Version1 material revisions,
legacy furniture poses, accepted cache/conflicts and the existing surface selector
are reused. BedCare still saves only the original stable rumpled-bed ID in Life's
`x.beds`; linen choices remain in the shared material record rather than that
local care record. No new saving or stow policy is introduced.
### MYDAL linen surfaces (#1020)

BUNK_LINEN_SURFACES enrolls only the two actual movable MYDAL IDs, each with lower/upper-sheet/pillow/duvet stable IDs. They use the existing materialVersion1, independent per-surface revisions, /furniture GET/PUT, local preview/cancel and authoritative confirmation. Frame textile/guessed objects/wrong-family presets remain rejected. Real local HTTP tests preserve all twelve choices across active ordinary peers/new visits/reload, independent berth writes plus legacy pose-only writes,409 and offline/cache handling. Material changes preserve four Life/BedCare unit IDs and full home-record save/load; no production writes. Worker-first895086e was actually deployed by job115848446815 at12:20:25.8047925Z on2026-10-14 (versionbb54004c-3db7-40ca-ac86-1bd9ccd73a47) before requiring this client.
### HEMNES per-surface linen persistence (#1021)

DAYBED_LINEN_SURFACES whitelists only the actual `f-daybed-1-0.66-11.078700000000001-0-0` object and eight explicit existing surface IDs. The existing version1/cloth preset catalogue, per-surface revision checks, legacy pose-only writes, conflict state and accepted offline cache remain unchanged. The daybed has no generic frame textile surface: wood, drawers, knobs and neighboring beds are excluded. Private handles restore Original independently without resetting placement. Worker-first f116267c05905f6a59e3d6491337ec784d54d2ce actually deployed2026-10-14T12:23:49.1410089Z, versionf3a39e4b-3f43-49fc-b4bb-52d7d1455c55, run38563417647/job115849954165 before any requiring client. Only local Worker test writes are allowed.

### Focused-input viewport diagnosis (#669)

CrashLog.layoutMeasure adds only optional numeric editing0/1: a genuinely focused visible document with an active editable text/textarea/contenteditable field, excluding disabled/readonly/inputmode-none controls. No input text, value, id or selector is collected. The public Worker projects exactly0/1; missing/invalid legacy fields remain missing and do not retroactively classify old reports. Other report fields, caps, dedup and lifecycle/heartbeat thresholds remain unchanged.

A reduced visualViewport height can coexist with a correct layout viewport when an on-screen keyboard is shown ([Chrome's viewport behavior](https://developer.chrome.com/blog/viewport-resize-behavior)). The narrow runtime exception requires editing1, scale1, matching width, near-zero offsets, matching canvas/window/document and a coherent full-size zero-origin rect. It then still validates camera aspect and allocated buffer. Real CSS/rect/rotation/projection/buffer mismatches, unfocused/stale-active/readonly/button controls stay reportable. This corrects that locally reproduced diagnostic path; the two Android155 public posts have no focus data, so their keyboard cause remains unconfirmed.

The fresh66-report source (SHA794a06afbbcf9dd603fcefe804e417378264ffb11a008c6425ece506284be0f1) also contains a new visible load/up0/gap58 abrupt marker. Native reload/recovery/version navigation first marks clean on pagehide, then bg on visibilitychange; both are normal non-run states and produce no killed report. No lifecycle mitigation is justified by that control. A controlled stale visible58s/load heartbeat still reports and survives actual local POST/KV/public; the real report's OS/GL cause stays unknown. Gap measures time between stored heartbeat and next start, not freeze duration. #669 remains open with physical iPhone acceptance outstanding.
### Canopy and cloth-shade layout surfaces (#1026)

SHADE_CANOPY_TEXTILES and SHADE_CANOPY_SURFACES whitelist only the actual tubelamp shade, DANI shade and parasol canopy IDs. They reuse version1/cloth presets, ordinary edit access, local0PUT preview/cancel and revision-controlled shared confirmation, with independent legacy pose fields, stale409 and offline accepted cache. Original restores each existing finish without resetting pose. Parasol’s existing manual/manualAuto save record stays separate from shared material choice; lamp glow/on/off remains with the existing small-lamp controller. Worker-first3d147087afb313f6a0e0a707aa3f4fe3f0a988fd actually deployed2026-10-14T13:02:08.0341293Z (run38568403820/job115866882862, version27b64635-32fa-4774-8ccc-f81a278d1729) before requiring client publication. All test writes use only an explicitly local Worker.

### Hanging-towel material identities (#1029)

`TOWEL_MATERIAL_SURFACES` whitelists seven surfaces on the four actual ragrund/towelhooks IDs plus explicitly NEW fixed `f-kitchen-oven-towel`. Kitchen registers the existing oven-child object only; it never enters movable furniture poses. Existing materialVersion1/klädsel choices, revision-controlled side-map, legacy pose preservation and capability guard are reused. No towel/HandWash/oven placement or new save policy is introduced; hand wetness remains transient. Local HTTP/schema verification makes no production writes.

### Initial furniture hydration and saved Life positions (#1013)

Life already stores loose world items in absolute world coordinates. Rearrange's
cached layout and first actually applied authoritative GET are therefore explicit
restore operations: their carry boundary leaves actual LifeItem coordinates alone,
including rug-derived Y reconciliation. Other loose objects keep their existing
initial furniture attachment behavior. No Life/main hooks, saved fields, inventory
policy or additional layout writes are introduced.

A deferred initial layout retains its restore flag until it is actually applied.
A failed or stale GET does not complete hydration. A successful normal local move
can complete the baseline before an older in-flight GET returns; the existing
revision guard rejects that older snapshot. Subsequent normal local/remote moves
and rug support changes use the ordinary carry/rotation path. Life restoration
after furniture hydration still writes its own absolute item positions normally.

### Riding hand reservation and existing keep records (#984, first vertical)

The bicycle reservation is transient: no second item or new Items place/version. A stowed LifeItem retains its actual saved hand place while view.sync leaves its model detached. `keep.things` recognizes the stowed Holdable identity; Cup retains its existing held state/content record. Riding `keepSession` includes ordinary keepWorld plus `bicycleSavePlace` safe standing feet; normal non-riding session behavior is unchanged. Reload reconstructs ordinary standing play and existing held adapters. Spawn/death restores the same still-valid item; owner-reset/shatter/removal never resurrects it.

Full #984 reload acceptance is completed in #1035 for Miele, held drawings and loose paper; #1034 supplies the food bridge below. The existing chicken Life extra remains authoritative for cooking/generation/parts/rewards; this step adds no duplicate serialization or reset of it.

### One bicycle-stowed food across reload (#1034)

Existing KEEP_VERSION1 gains optional `bicycleHand:{v:1,kind,state}` only for the actual stowed legacy hand. Main registers the four concrete owners. Each saves/validates its own already withdrawn portion: Fruit slot/generation/bites/scoops, FishFinger identity/cook/bites and carton amount, FriesBunch identity/remaining count and source bag/basket amounts. No arbitrary loose inventory is persisted. Unknown owners/versions, inconsistent scoop counts and malformed data restore nothing silently.

Chicken retains the existing sole `life.x.chicken` authority for cooking/generation/gone/bodyLeft/reward flags. Its stow entry is only the whole/portion pointer and remaining bites, loaded AFTER Life; it never calls breakOff or cooking/eating callbacks. Empty Life stock still serializes this existing extra when a chicken hand actually needs it. Whole-bird take has a silent restore path. The Camera-parent fallback in ordinary Holdable restoration supports actual ChickenPiece, which has no item.camera.

The one transient `restoredBicycleHand` pointer keeps a standing hand that already came from stow through repeated actual F5/update reloads. Main keeps ordinary keepWorld in the session only while riding or while this exact restored hand remains. Existing owners explicitly forget it on put/place/consume/reset; replacement also invalidates the pointer. A reset/reparented stowed model saves no hand entry. Never-stowed legacy food keeps its previous reload policy, and Cup/Life/Holdable records remain compatible.

### Unique bicycle-stowed objects across reload (#1035, completes #984)

The bicycle-hand stow bridge is extended from food (#1034) to the three unique objects: Miele (`miele`), HeldDrawing (`drawing` / `heldDrawing`), and ToiletPaper (`paper` / `toiletPaper`).
1. **Miele (cat):** `saveStowed` serializes variant/coat, custom name, seen state, photo-attempt guard, and hug count. `loadStowed` restores identity and enters `hug` pose silently (`silent: true`), suppressing purr audio and preventing duplicate photo or badge awards. On release/drop, `forgetBicycleHand` clears the active stow reservation.
2. **HeldDrawing:** `saveStowed` persists image data and origin metadata (`origin: 'wall' | 'desk'`, and poster ID if taken from wall). `take()` on desk immediately blanks the desk state in `localStorage` so exactly one sheet exists in the world. Restore uses `silent: true` to suppress paper audio and avoid duplicate posters on the wall. On release/putBack, `forgetBicycleHand` clears the stow pointer.
3. **ToiletPaper (wad):** `saveStowed` preserves loose sheet count (`sheets`). On reload, `Wad.restore()` rebuilds the wad geometry and hand attachment without deducting sheets from Life toilet rolls again. On drop/hide, `forgetBicycleHand` clears the stow pointer.
4. **Resurrection guards:** `restoreBicycleHand` rejects stowed hands for items that were hidden, dropped, or reset while riding (`cat.visible && cat.held`, `drawing.image`, `paper.sheets && paper.sink < 0`).
## Shared beer source ledgers across Glass reload (#1007)

KEEP_VERSION1 remains additive. BeerCan keeps legacy ml/gen/portionId/drunk/fin fields plus full-precision portion JSON; ml now retains fractional transferred volume. Glass.x.beer stores bounded remaining lot ml and source ledger snapshots. A pending beer pour stores its original from/to/t/secs animation: the source has already lost the entire reserved amount, the glass owns that same amount, and load resumes the same interpolation rather than adding/consuming it again. Other drinks keep their existing save behavior.

The normal things.load preflight sums current source stock (excluding away packages), every reserved glass lot, and maxdrunk per validated ID/total, including old generations held only in glasses. The shared local restoreMap then gives sources/glasses the same silent monotone ledger. Contradictory total stock or partial-finished metadata invalidates that ID before any owner loads; affected source stock is suppressed and affected glass beer/pending transfer is conservatively removed, retaining other drink/pose. Pending union-key/amount validation rejects missing from→to keys. The existing held-last raw-content restore revalidates Glass metadata so it cannot resurrect rejected beer; actual Liquid.show follows validation for held and nonheld glasses. No callbacks/statistics/health operations occur while loading; no new inventory system, global historical registry or per-frame protocol is introduced.

## In-game admin reports (#1045, parent #1041)

`src/adminreports.js` intercepts the existing private codes before multiplayer/cheat
submission. The existing private code is typed in the ordinary chat/console field.
A successful session unlocks access to both report submission and rearrangement,
without enabling furniture mode automatically (#1051 user correction, 2026-10-15).
The two authenticated choices, Rapportera and Möblera, appear below that field.
The console normalizes code input exactly as the existing cheat parser, clears it
immediately, then sends `{code}` to the server. No public menu, help or graffiti
lists admin commands or the two codes. Legacy slash aliases remain compatible,
including the optional masked field, where Enter and numpad Enter submit the code (#1054).
Public layout digests cannot create report sessions.

The server checks the real code with the existing private-code verifier and signs
a bounded bearer using a separate server-only `REPORT_SESSION_SECRET` (at least
24 random characters). This signing key is never typed by players or sent to the
browser. The browser holds its one-hour bearer only in page memory. Reload,
pagehide, legacy `/loggaut` or expiry ends both report permission and furniture editing;
logout also wins over delayed login replies. `Rearrange` retires the old persistent
`lunden.furniture.unlocked` key. Shared furniture poses/materials still load.
The codes remain game access codes rather than high-assurance identity credentials;
report text remains untrusted, and neither codes nor report sessions can import
issues or access global administration. The reports-only import token is separate.

The public `cloud` debug override cannot send admin credentials to arbitrary hosts:
only the exact configured `CLOUD_URL`, or a loopback API from a loopback page, is
accepted, and credential-bearing fetches reject redirects. Production uses HTTPS.
`cloudflare/reports.js` implements:

- `POST /report-session` with `{code}`: accepted browser Origin, write rate
  limit before private-code validation, bounded stream/JSON, fail closed when unconfigured.
- `PUT /reports/<v4 UUID>` with `{text,image?,photo?}` and the report-session bearer: exact plain
  text up to `REPORTS.maxChars` (4,000 UTF-16 units), bounded 640 KiB actual stream (*guess*, room for two images, #1182);
  login/claim/receipt bodies remain limited to 16 KiB. Forbidden control/bidi characters
  are rejected. `image` is an optional canonical `data:image/jpeg;base64,…` string,
  at most 200 KiB decoded, with actual JPEG SOF0/SOF2 dimensions no larger than 1280
  pixels per edge. The bounded marker parser rejects unsupported frames, DNL,
  truncation and trailing bytes. No remote URLs or SVG are accepted. Text-only older
  clients remain compatible and retain their original SHA256(text) retry identity;
  image reports hash a separate domain plus the exact text/image payload. `photo` (#1182) is the
  reporter's own picture beside the game screenshot `image`, with the identical JPEG checks; it may come
  without `image`. Reports with `photo` hash a third domain over `{text,image,photo}`, so one-image
  and text-only identities stay unchanged. Text and
  pixels are untrusted data, never HTML or agent instructions.
- `GET /reports?cursor=…`: reports-only `REPORT_IMPORT_TOKEN` (or existing `ADMIN_TOKEN`), returns
  `{untrusted:true,reports:[{id,text,image?,photo?,created,untrusted:true}],cursor:null|string}`,
  pages of at most 50. Read every page; KV visibility can lag behind accepted writes.

- `POST /reports/<id>`: reports-only `REPORT_IMPORT_TOKEN` (or existing `ADMIN_TOKEN`), JSON `{claimId:<v4 UUID>}`. The
  serialized authority persists one random ownership token before returning
  `{id,claimId,token,report}`. A different claim conflicts; the same claim recovers
  its token. Claims never expire: a GitHub create may have an unknown result.
  After acknowledgement the same claim returns `{id,claimId,token,acknowledged:true,issueUrl}`.
- `DELETE /reports/<id>`: reports-only `REPORT_IMPORT_TOKEN` (or existing `ADMIN_TOKEN`), JSON `{claimId,token,issueUrl}`
  must prove ownership and identify an issue in this exact repository. The importing tool must verify successful GitHub creation
  **before** calling this endpoint; the API validates URL shape, not GitHub existence.
  Persist the receipt first, then remove the KV report. A retry completes failed KV
  deletion; a different receipt or owner conflicts. The [reviewed importer](report-import.md)
  verifies GitHub existence, exact report marker and repository before acknowledgement.
  It assigns the fixed `in-game` label; arbitrary report text never becomes instructions.

The current client always captures the game view before uploading a new report.
`ReportCapture` copies only `renderer.domElement` into a disposable 2D canvas in the
same task immediately after the original screen render. DOM, terminal/chat text and
password fields cannot enter this image. It keeps normal drawing-buffer discard,
warm-up and covered-phone drawing policy; no permanent render target or
`preserveDrawingBuffer` is added. The copy is resized to the edge bound and encoded
as JPEG with at most six bounded quality/resize attempts and a five-second request
deadline. A missing completed frame, lost/empty context, encoding failure or oversized
image leaves the draft with an error; the client never silently sends text alone.
The exact image and UUID stay in page memory across same-text upload retries.
Changed report text requests a new image and UUID. Logout/expiry during capture
wins before upload, and neither images nor sessions enter browser storage.

Reports live in `LUNDEN` KV as `report:<UUID>` without automatic expiry. The existing
`DrawingRoom` class, under the distinct object name `reports`, serializes immutable
IDs, KV writes and acknowledgements; its storage keeps the pending record/hash and
then only a hash + claim + issue URL receipt after acknowledgement. This needs no new binding
or migration. Reusing an ID with different text conflicts; successful retries do not
rewrite KV, and acknowledged reports cannot be recreated. Admin reads hide already
acknowledged records even if KV temporarily returns stale data. Rate limiting uses
the existing `LIMITER` binding when configured, otherwise the existing per-isolate
30 writes/minute/IP fallback; forwarded PUTs count once. This is not a global rate
limit without that binding. Reader/ack routes are unavailable without the serialized
storage authority, and unknown/missing secrets grant no access.

Verification: `node --test cloudflare/reports.test.mjs cloudflare/reportphotos.test.mjs` (the second mints
sessions from a fixture secret and needs no private inputs) and
`PLAYWRIGHT_MODULE=… CHROME_PATH=… LUNDEN_SECRET_TEST_INPUTS=<external private fixture> node
 tools/adminreportstest.cjs http://localhost:8874 http://localhost:8875 /tmp/report-probe`.
Start the isolated local Worker with `LUNDEN_REPORT_SESSION_SECRET=<explicit local signing fixture>`.
The browser test uses the real index DOM, production AdminReports binding and original
terminal submit listener, native clipboard paste and actual local Worker, with a small
real Rearrange controller. Apartment bootstrap/WebGL are suppressed: screenshots
certify the terminal, not game rendering, physical-phone behavior or production KV.

Local acceptance: report server tests 5/5 and the combined report/drawing/layout/
score/private-verifier group 42/42; native terminal/API probe 21/21 with no page
errors; updated existing private-code/native-layout probe 39/39. Portrait 390×844
and landscape 844×390 login, saved-report and network-retry screenshots were opened
and inspected. Artifacts: `/tmp/lunden-reports1041/{browser-acceptance,private-native}`.
The first broad run lacked mandatory external verifier inputs; a second used the
explicit inputs in the wrong order for the existing writer-credential assertion.
Both original failures remain in the artifact logs; the final external copy changes
only their order. No production reports, GitHub testissues or server secrets were
created, and no physical-phone or apartment-render acceptance is claimed.

`tools/reportcapturetest.cjs` additionally renders a tiny actual Three component through
the production screen-render/capture hook, decodes known JPEG pixels and checks a new
view, edge/byte limits, no preserved WebGL drawing buffer, exact retry image/UUID,
failed capture and logout during capture. It binds the real production terminal to a
fresh owned local Worker. Run with `PLAYWRIGHT_MODULE`, `CHROME_PATH`,
`LUNDEN_SECRET_TEST_INPUTS` and a local `LUNDEN_REPORT_SESSION_SECRET`, against a local
static server: `node tools/reportcapturetest.cjs http://localhost:8896 /tmp/report-capture`.
Worker port 8897 must be free; the fixture owns it and normally cleans it up.
The image is actual component evidence, not apartment or physical phone performance.

## Remote resting posture (#1150)

`remote-pose.js` derives the ordinary position and heading from the actual
`Rest.spot` (seat/mattress height, fixed direction), rather than the old standing
`Player.pos`. The virtual root accounts for avatar height. `pose:1` means sitting,
`pose:2` lying; missing/invalid values restore standing. `PlayerRoom.cleanState`
accepts only those two numeric enums, forwarding them through ordinary state,
late-join and hibernation snapshots under the existing message/rate bounds.
There are no extra client-controlled transforms or persistence keys.

`Ghost` applies the shared Olof skeleton pose after `Avatar.update`; held models
follow the resulting hands. Name/speech/greeting anchors and shared logical
head/capsule frames follow the same rest pose. Standing/crouching retains its
previous frame and ordinary damage/obstacle checks. The broad body capsule is
still a generous gameplay approximation, not furniture or mesh anatomy.
#1234: a lying figure sits under the cover. A lie spot carries `body` (local y of the figure's centre line: the duvet's
top minus `REST.avatarLieSink`; beds, bunks, daybed in `src/furniture.js`), `restTarget` exposes it as `bodyY`, and
`restState` roots the figure there (no new wire field: only `p.y` changes). The torso is tilted up `REST.avatarLieTilt`
so the head rests on the pillows (`applyRestPose`, logical head frame `rifleBoxPose`); the legs lie nearly straight.
#1237: pose 3 "long sit" is the wire value for a sit spot with `legsUp: true` (the chaise spot of `soffan`, the `sätta dig upp i` spots of
beds; armchair, other sofa seats, chairs and the bunk's `watch` seat keep pose 1). `restState` sends 3, `applyRestPose` keeps the seated torso and
stretches the legs out (`REST.avatarLegsUp` / `avatarLegsReach`), and `rifleBoxPose` gives pose 3 the seated torso frame, so the three head boxes are unchanged.
`cloudflare/players.js` accepts `pose` 1, 2 or 3 (anything else is standing and omitted); `Ghosts` snaps the same three values.
**Rollout order:** deploy the Worker first (`cloudflare/`, by the owner; not done by agents), then Pages. A client on the new Pages with the OLD Worker has its
pose 3 dropped, so observers see the sitter standing (the Worker only whitelists 1/2) until the Worker is redeployed; an OLD client
receiving 3 from the new Worker also shows a standing figure (it snaps only 1/2). Nothing breaks, the posture is just missing, and the owner's own view is unaffected.
Houses A/B/C/L have no furniture; only L1007's `sofa()`/`bed()` carry the spots. Not applicable to the public viewer.
This character/gameplay change does not apply to the public viewer.
#1275: a lie spot is where the HEAD rests (the pillow); `restState` roots the figure at the hips, `REST.avatarLieTorso` * cos(`avatarLieTilt`) * tall towards the feet (along the spot's yaw), so the head lands on the spot instead of poking through the headboard. Only `p.x/z` change (no wire field); legs level at hip height (`y - 0.03`), `avatarLieSink` 0.1. Checked: double bed (both sides), both bunks (numerically, rooms too tight for a camera), daybed.

## Held-item category on the wire (`hi`, #1297)

Players' states carry an optional `hi` (one of `HELD_CATEGORIES` in `src/heldcategory.js`, a short lowercase key; no names, photos or content) beside the weapon key `h`. It rides the existing 5 Hz state message, the welcome snapshot (`ps`, taken from the socket attachment's last clean state, so also after hibernation) and the `t:'s'` broadcast — no new message type, socket or timer, and at most ~14 extra bytes. `cleanState` (cloudflare/players.js) keeps `hi` only when it is exactly a whitelisted string; everything else is dropped, so a stale or hostile client cannot grow the state.

Rollout order (the Worker is deployed by the owner only): (1) deploy the Worker (`cloudflare/`, `wrangler deploy`), (2) publish the client (GitHub Pages). Mixed versions are safe in every order: an old Worker's `cleanState` drops the unknown `hi` (clients keep working, others just see nothing in the hand); an old client ignores `hi` in states it receives; a new Worker with old clients simply never sees the field. Published before the Worker, the feature is dormant until the Worker is deployed.

Kiss greeting (#1343): reserved `KISS.phrase`15 in existing `{t:'g',to,k}`; no new message shape, timers or billable periodic traffic. PlayerRoom checks cleaned target Sarah/Olof substring, finite stored 3D positions within `KISS.serverRange`, unarmed sender and existing greeting cooldown before forwarding. Normal greetings remain unchanged. See [interaction contract](interactions.md#near-avatar-kiss-1343) and players/kiss peer tests.

Shared billiard table (#1355): the players room also owns the children's-room billiard game (`{ t: 'pool', k: 's'|'m'|'r', q, d? }` requests, `T`/`S`/`no` answers, storage key `pool`, authoritative `simulateStroke` from `src/billiardsync.js`); protocol, limits, seats and empty-room behaviour in [furniture.md](furniture.md#shared-table-1355). `cloud.yml` redeploys on `src/billiard*.js` changes.


## Love receipts in visitor statistics (#1398)

`stats.love` counts completed, server-accepted kisses initiated by this visitor; `SCORE.each.love` contributes 100 points each. `stats.loveReceipts` keeps the most recent `KISS.receipts` ids (256) in the existing `lunden.stats` save, sanitized when loading older/corrupt records. `awardLove(id)` rejects a duplicate before counting. Normal save/reload retains both points and receipts; no new key/store or destructive migration is introduced. Ghosts also deduplicates receipt packets in memory and cancels pending completion on disconnect. Ordinary greeting points are unchanged for ordinary greetings and are not granted for a kiss. The room supplies the accepted event identity, not a general server-owned score economy. This personal gameplay is not transferred to the public project.

## Cat encounter photo guard (#1400)

The existing world `cat` record and Miele-only bicycle stow `state` add optional `photo: boolean`.
This is a consumed-attempt flag, independent of `seen`/discovery and of any album photo id. Restoring
explicit false keeps the first real interaction available; true prevents duplicate capture after
keep/resume/stow reload. Old records without the field remain accepted: Miele falls back to `seen`,
ordinary cats to false. A corrupt non-boolean stow field is rejected without modifying the cat.
No DB version/key, JPEG/album migration or peer field is added. Save failure/full capacity consumes
the same attempt, so reload of the kept cat never starts a retry loop. Other persistence/ordinary
transient-cat policies remain unchanged. `MieleHeld.saveStowed` remains Miele-only and silent restore
still suppresses pickup sound/actions; pickup itself no longer produces a photo.


## Report player names (#1493)

New report writes freeze the profile name as `playerName` alongside UUID/text/images.
The Worker normalizes/bounds it through `reportauthor.js`; new-client identities
include the name while old-client retry hashes stay valid. Nameless old clients
store `Okänd spelare`. Reviewed import retains the name in its journal and verifies
GitHub title/`rapportör: <namn>` before acknowledgement. Existing image/body hashes
remain unchanged; no name is guessed from old text. See [report import](report-import.md#reporter-names-1493).

## Christmas presents (#1409/#1410)

`keep.js` excludes dynamic `isChristmasGift` Holdables from the generic things map. The optional `christmasGifts` section records IDs, the once-chosen trinket, opening state, home/placed pose and held status. It restores after existing ordinary/Life hand owners; an occupied hand makes a restored gift return home safely. Duplicate IDs/restores never recreate a package. The temporary Santa/TV state is derived from the restored DayCycle rather than saved separately.
