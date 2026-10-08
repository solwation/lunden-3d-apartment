# Saving, shared layouts and cloud

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [deployment](deployment.md), [life](life.md).
## Module and test map

```text
src/layoutmigrations.js  retire old grouped poster layout ids while preserving later individual moves (#493)
src/keep.js            the world's state across a page-made reload (#277): saveWorld / loadWorld, one part per module
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
                       POSTed as text/plain when changed, every LEADERBOARD.every s, sendBeacon when hidden; names escaped
cloudflare/            the Worker (NOT published on Pages): worker.js (API, limits, CORS, admin emergency brake), wrangler.toml,
                       setup.sh (the user's one-command setup: login, KV, deploy, ADMIN_TOKEN, CLOUD_URL into config),
                       dev.mjs (the same Worker on Node with an in-memory KV, for tests), README.md (Swedish, for the user);
                       .github/workflows/cloud.yml redeploys on cloudflare/** changes when the repo has Cloudflare secrets
tools/reloadtest.html  headless test: resume after "Ladda om", F5 starts at START, "Börja från start", bad record;
                       the world kept (#277): the car still arriving then parks, a cup of coffee in the hand, the fridge open, lamps,
                       sitting, a bottle put down, the TV, the cat, the game's clock; a new tab fresh at the real time
                       the life sim (#371): an opened butter with 185 g, a cut cucumber + slices on the board, a used plate with half a
                       slice, then that plate in the hand across a reload; a broken life part harms nothing; lunden.life is written
tools/resettest.html   headless test of "Återställ" (#303) against `node cloudflare/dev.mjs 8144`: Avbryt / Esc change nothing; the
                       home's keys and resume / F5 records go, the queue, drawings (wall, desk, server), score, name and cat
                       photo stay, START at the real time with the notice; the queued drawing still goes out; a later reload fresh
tools/cloudtest.html   headless test of the shared world against `node cloudflare/dev.mjs 8144` (start it first): PUT on
                       taping, someone else's drawing appears, DELETE on throwing, thrown elsewhere → gone here, offline
                       queue, desk sheet, cat photos neither sent nor fetched (#211), a fresh visitor gets them, the
                       leaderboard (name, score, escaped list, a capped cheat), off without &cloud
```


Laundry item state (#550): Items adds optional moisture ('wet'/'dry'/null) independently of clean and machine.folded. Version-2 serialization/load includes it when present; older records keep type defaults (ordinary items null, laundry dry), without a migration or change to existing cleanliness values. Laundry stores register before Life.restore and existing restock keeps original basket homes/ids. laundrytest performs a real page reload with clean wet clothes in machine slots, verifies empty hands/closed fronts and checks inventory audit.

Laundry programme persistence (#551): Life.keepPart('laundry') stores the washer's state, exact remaining game seconds and captured garment ids, loaded after the item record. Idle is explicit so a saved idle record resets an older active controller too. There are no timestamps or offline advances; laundrytest flushes during a running programme, reloads the actual page and checks the unchanged time/load before finishing. Door positions retain existing visit/reload semantics; a paused programme resumes once its door is fully shut.

Dryer/folded wardrobe state (#552): the existing laundry extra also includes the dryer's state/left/start ids. Older washer-only extras load an idle dryer. The ordinary item record keeps independent moisture, machine.folded, wardrobe slot and original basket home, so storing clothes never causes duplicate stock at a later visit. Normal visits start empty-handed with closed fronts and saved clothes in their slots; the normal home reset clears everything and creates three dirty dry basket garments with idle machines. laundrytest checks real page reloads at mid-drying and after all three clothes are folded/stored, then invokes the actual reset control and reloads fresh.

Beer shelf (#511): `src/beershelfdata.js` stores one complete JSON Response (metadata and all four original PNG/JPEG data URLs) in CacheStorage `lunden.beerShelf.v1`, key `./data/beer-shelf-cache` relative to the document. IndexedDB remains version 2. Schema validation and actual browser image decoding precede replacement; the previous complete response survives HTTP/network/timeout/metadata/image failures unchanged, including source and successful timestamp. Successful `fetchedAt`/`day` use Europe/Stockholm: repeated loads that day perform no source request. Failed updates do not advance the day and retry on another load. First offline startup uses the committed prepared snapshot (`fetchedAt: 0`, `day: null`, separate `preparedAt`). Cache is independent of home/furniture saving. The complete live refresh has an eight-second deadline, and the Worker source batch has a 6.5-second deadline. `?life` uses only the prepared snapshot without reading/writing the visitor cache, unless an explicit `&beers=` endpoint requests a development fetch. `tools/beershelfcachetest.html` exercises real CacheStorage/image decoding and an actual page reload.

Console cleanup (#514) writes the existing Life record immediately; Items/bin state and x.mess/x.pan/x.dishwasher use existing extras, with no schema migration or reset of layouts/settings. Legacy lounge glasses add optional `{used: true}` via their existing holdable keepState hook; old records default false. Ordinary page-made resume snapshots capture the already-cleaned cup/holdable state through saveWorld. Normal visits retain saved clean Life dishes, food, full glasses, empty bins and cleared mess; tools/cheattest performs an actual page reload to verify these results.
