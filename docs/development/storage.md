# Saving, shared layouts and cloud

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [deployment](deployment.md), [life](life.md).
## Module and test map

```text
src/layoutmigrations.js  retire old grouped poster layout ids while preserving later individual moves (#493)
src/keep.js            the world's state across a page-made reload (#277): saveWorld / loadWorld, one part per module
src/realweather.js    the weather cache (#674): localStorage `lunden.weather.<YYYY-MM>` = `{ v:1, at, final, d:{ y, m, t, p, s, c } }` (hourly temperature, precipitation, snowfall, weather code of one month, ~15–20 KB); archive months (`final`) never expire, forecast months are used for 3 h and refreshed in the background; at most `WEATHER.real.keepMonths` (12) kept, the oldest dropped first, and all of them if the quota is full; a bad/short entry is ignored. Not in RESET_KEEP: "Återställ" clears it (it is only a cache)
src/reset.js           "Återställ" on the start screen (#303): clears every local 'lunden.*' key except RESET_KEEP (config)
src/idb.js             the shared IndexedDB 'lunden' (version 2: catPhotos + drawings) — every module opens it here
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
src/crashlog.js        crash reports (#629), inert without the cloud (same switch as cloud.js): a heartbeat every CRASHLOG.beatMs (outside the
                       render loop) writes place, quality level, fps, renderer.info, a GPU-memory ESTIMATE (canvas, shadow map,
                       mirror target, source texture images — walked in short slices; incomplete, not measured GPU usage), last keys/taps and console.error lines to localStorage
                       'lunden.crash.beat' (state run / bg on hidden / clean on pagehide). At the next start a beat still 'run' (and not
                       a live other tab) = the last run died → sent as typ 'död' (a hypothesis: memory); window error, unhandledrejection,
                       webglcontextlost/restored → typ 'fel'. POST /crash as text/plain (fetch, sendBeacon when hidden; unsent ones wait
                       in 'lunden.crash.out'); v2 keeps 12 heartbeat samples (~24 s) with frame progress, load phase and timer lag.
                       Since #669 each sample also has `warm` (the sliced warm-up's position, e.g. `compiling 12/113`) and `worst` = the slowest
                       frame since the last beat when it took 50 ms or more: [CPU ms, new shader programs, shadow-map redraw 0/1, warm-up state].
                       #669 also reads pending `worst` non-destructively in event snapshots, with `beatAgeMs` since the last
                       actual heartbeat (not a CPU/GPU loss-frame measurement). Loss/restore reports include current `layout`
                       measures and `context.surface` = last actual resize/orientation event `{kind, up}`; absent event is null.
                       These establish temporal observations, not a rotation/shader cause. Only heartbeat consumes frameDiag.
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
cloudflare/            the Worker (NOT published on Pages): worker.js (API, limits, CORS, admin emergency brake), wrangler.toml,
                       setup.sh (the user's one-command setup: login, KV, deploy, ADMIN_TOKEN, CLOUD_URL into config),
                       dev.mjs (the same Worker on Node with an in-memory KV, for tests), README.md (Swedish, for the user);
                       .github/workflows/cloud.yml redeploys on cloudflare/** changes when the repo has Cloudflare secrets
tools/glrestoretest.cjs  phone WebGL context loss (#628): a restored context makes the page reload once through the ordinary resume
                       (`reloadOnContextRestore`, src/lowmemory.js; same place and world, no "Ny version" note; max one per 60 s, sessionStorage `lunden.glReloadAt`)
tools/reloadtest.html  headless test: resume after "Ladda om", F5 starts at START, "Börja från start", bad record;
                       the world kept (#277): the car still arriving then parks, a cup of coffee in the hand, the fridge open, lamps,
                       sitting, a bottle put down, the TV, the cat, the game's clock; a new tab fresh at the real time
                       the life sim (#371): an opened butter with 185 g, a cut cucumber + slices on the board, a used plate with half a
                       slice, then that plate in the hand across a reload; a broken life part harms nothing; lunden.life is written
tools/resettest.html   headless test of "Återställ" (#303) against `node cloudflare/dev.mjs 8144`: Avbryt / Esc change nothing; the
                       home's keys and resume / F5 records go, the queue, drawings (wall, desk, server), score, name and cat
                       photo stay, START at the real time with the notice; the queued drawing still goes out; a later reload fresh
                       Running the two Worker tests (cloudtest, resettest; #635): one test at a time against one Worker, each wipes it with the
                       admin token `testtoken` (the dev.mjs default; a 403 there now fails the test at once, since leftovers from an earlier
                       run fail checks later; the Worker also limits writes to 30 per minute per instance, one IP). Cloud session: Playwright Chromium as in verification.md; the page opens
                       it from a fresh `--user-data-dir`; allow ~10 min per test under SwiftShader (every iframe load is a ~3 min warm-up).
                       `cloud.sync()` is a no-op while a poll is under way (`pulling`): tests wait with `syncNow()`, and the offline step
                       `await cloud.flush()` before the address is restored. `http://localhost:9` fails at once as ERR_UNSAFE_PORT in Chromium.
                       Återställ from the menu closes the menu afterwards (#522): resettest checks the key, then the plain start screen
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

Christmas tree placement (#571): the tree is a normal entry in the shared furniture layout (`lunden.furniture.layout` / GET-PUT `/furniture`, id `f-xmastree-0-0.82-8.45-0-0` since #591; an entry under the #571 id `f-xmastree-0-1.08-11.5-0-0` carries over if it was moved off the old default, else it is dropped — rearrange.js `apply` `carryOld`), so a confirmed move survives reloads, later visits, dates out of season and the next season (the pose is applied while it is hidden too). What it hides is a pure visibility layer recomputed on load — nothing about the season or the hidden pieces is stored, and their own layout entries are never written. tools/christmastest.html reloads in December and October.

Visited flats (#574, src/visitunit.js): a flat you walk into (L1004) has no save of its own and writes none of L1007's keys:
its doors / windows / lids are not in `world.doors` / `world.lids` (so keep.js `open` never sees them), they start shut on
every visit, using them bumps no stat, and nothing can be put down there. Only the ordinary resume / session record (a place,
`feetY`) can point inside it; tools/visittest.html checks a resume upstairs in it and that the saved world is unchanged.

Ghost score badges (#672): `src/ghostbadge.js` draws name and score in the existing sprite, with 20% smaller world scale and text sizes set by `GHOSTS.tagWidth/tagHeight/tagNamePx/tagScorePx` (*guess*). The background fits both rows, including a short name with 10 000 000 points. Immutable materials are shared per live name/score; reference counts immediately dispose unused maps/materials when scores change or ghosts leave, so history cannot grow texture memory. Missing legacy scores display 0. Ghosts defaults to stats.totalScore and sends score-only changes within the existing shared 5 Hz state/shot budget; they do not extend movement idle time. PlayerRoom carries the score in state/welcome attachments, clamps it to the existing leaderboard's 0…1e7 range, and adds no requests, timers or message types. Scores are client-reported display data, not authoritative combat or leaderboard results. `ghostbadgetest.cjs` uses real Ghosts and the local PlayerRoom in a small controlled scene (no apartment bootstrap) to check anonymous/max scores, updates/rate/idle, shared materials, 50 updates without GPU texture growth, draws and departure; screenshots at desktop and iPhone landscape size. Physical phone rendering is not certified.

Task state (#709): `life.keepPart('tasks')` now writes v2 with played seconds, selected active ids, discovered ids and
per-task goal ids, completion count and cooldown deadline. Reload restores selection/progress without reward callbacks;
v1 goals/shown migrate, with completed tasks initially cooling down. `lunden.stats` stores per-id task counts plus
`legacyTaskPoints`, preserving previously earned generic task points on upgrade. Repeats use `SCORE.tasks[id].again`;
statistics reset clears both counters and task state, while home reset clears the existing Life/statistics records.

#708: `Life.x.chicken` keeps raw/golden/burnt progress, off-grill pose or courtyard grate placement, missing/eaten parts and completion/penalty flags. The generic holdable snapshot still excludes chicken to avoid a second restore. `keep.js` restores grill heat before Life; saved grill relighting and chicken loading emit no task progress. F returns the existing bird rather than creating a fresh rewardable one.
