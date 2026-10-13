# Saving, shared layouts and cloud

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [deployment](deployment.md), [life](life.md).
## Module and test map

```text
src/privatecodes.js     shared synchronous UTF-8 SHA-256 and exact private-code/layout-credential verifier (#853)
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
                       .github/workflows/cloud.yml redeploys on cloudflare/** and shared schema/verifier changes when the repo has Cloudflare secrets
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
For future #879 head contact use the actual `avatar.bones.head` and skinned vertices;
`Ghost.head` remains the previous fixed greeting anchor and is not a headshot surface.
No hit classification/damage or head-height guesses are introduced here.


Confirmed distance reward state (#873): the server attachment adds only a monotonic `awardSeq` alongside the existing per-minute accepted-point counter. It survives room hibernation, increments only on an accepted hit and starts again with a new connection. Hit acknowledgements carry `award:{i,seq,distance,points}`; all values come from the server's accepted geometry and the shared config rule, not request fields. Neither shots nor bonuses introduce KV writes or timers.

The existing `lunden.stats` record gains `pvpRangePoints` (default0), containing extra distance points only. Existing `pvpHits` still stores integer events and yields its unchanged base reward, so old saves do not lose or double previously earned points. Both values follow the existing save/pagehide/reload/reset path. Combat's score high-watermark is per current connection; no growing or persisted score-receipt map is added. The separate #871 `killReceipts` map retains its existing persistence/reset semantics. The additive Worker protocol should deploy before the new client; a cached older Worker gives the existing base-only reward until updated.

### Canonical avatar appearance (#892 preparation)

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
