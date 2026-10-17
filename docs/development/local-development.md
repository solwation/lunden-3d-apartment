# Local server and debug parameters

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [verification](verification.md).
## Run and debug

ES modules + `fetch` need HTTP (not `file://`):

```
python3 -m http.server 8137    # in the repo root → http://localhost:8137/
```

URL parameters (debugging / screenshots):

- `?at=x,z,yawDeg[,pitchDeg[,feetY]]` — place the camera. yaw 0 = north (−z), 90 = west,
  180 = south, −90 = east. `feetY` = 3.25 for Övre plan; on the roofs (#360): 6.4 the loftgång (`?at=3,0.8,-90,0,6.4`),
  9.46 a terrace (`?at=3,11.5,180,0,9.46`), 12.75 Hus L's roof between the panel rows (`?at=3,5,0,0,12.75`).
- `&shot` — hide the start overlay.
- `&open` — open every door, cabinet door and drawer (screenshots of open doors / wardrobes / furniture).
- `&olof[=i]` — Olof in seat i at once (0–2 the sofa, 3 the armchair; random without i) (#586); `&car&olofcar` — at the wheel of the parked car (#599).
- `&cat=x,z[,yawDeg[,y]]` — show the cat there; `&miele` — Miele instead (with `&cat=`), else the next cat to turn up is her (#328); `&catv=i` coat variant, `&catt=s` animation time, `&catwalk` walking (#224), `&cattail` its tail up (#262);
  `&kitten` a kitten (#363; with `&cat=`, else the next cat to turn up is one).
- `&time=HH[.h]` — start at that hour (default: the browser's time), `&month=1–12`, `&day=1–31` (default: today), `&freeze` pauses the clock,
  `&clock` opens the wall clock's strip (its "Nu" / N returns to the real time, #1145; the day runs in real time),
  `&lights` turns every lamp on, ceiling lamps too, and keeps the small ones on (#234).
- `&newyear` — start at 23:59:45 on 31 December: the TVs count down to midnight, flutes on the coffee table (#1199; `&freeze` holds it).
- `&jetpack` — the jetpack on your back (outdoors, #359).
- `&spidersuit` — the Spider-Man suit on (#597; climbing outdoors only).
- `&weather=rain|storm|snow|hail|clear` — force the weather (#248, #249).
- `&blinds=0…1` — every pleated blind drawn up that far (#273; not saved).
- `&fries` — golden, steaming fries in the open air-fryer basket (#301).
- `&toaster` — the toaster out on the worktop by the corner, plugged in and toasting (#401).
- `&mess=0` — no automatic crumbs or dust (#388, LIFE.rules.mess).
- `&life` — the life simulator's developer scenario (#365, `src/life.js` `devScenario`, `LIFE.dev`): everything at home and
  shut (not with `&open`), no cat, noon paused (unless `&time`), the visitor in the kitchen, an empty cup + the milk on the worktop, a wine glass
  on the dining table; life items on the dining table and in the drawer (`LIFE.dev.items` / `stored`) + the kitchen's stock, fresh (LIFE_FOOD, #373). The resume / F5 records are neither read nor written (`resume.js`), so the visitor's own place stays.
- `&beers=http://localhost:8144/beer-shelf` — test the daily beer source through `node cloudflare/dev.mjs 8144`; separate from shared-layout `&cloud=`. `&life` normally uses the prepared beer snapshot and no persistent beer cache.
- `&lowmem` — the phone memory limits (#585, `LOW_MEMORY`: textures ≤ 1024 px, 1024² shadows, pixel ratio ≤ 1) and the lighter campus facades (#589, `CAMPUS_LOD`) on a desktop.
- `&keepgeo` — on a phone / with `&lowmem`, keep the geometry's CPU copies and float normals (A/B of #628 step 4, `freeSceneGeometryCopies`).
- `&perf` — fps / draw-call overlay and the hitch log (#592): frames ≥ 50 ms go to the console with what changed in them.
- `&quality=0–3` — pin the adaptive graphics level (#592: resolution, shadows, mirrors, detail distance, particles); not remembered.
- `&test[=lazy]` — test mode for headless runs (#703, `src/testmode.js`): only the drawing gets cheaper (no antialiasing, no shadows, quality pinned to 0 unless `&quality=` is given, no start warm-up); game logic, collision, network and timing are unchanged. `=lazy` also skips the loop's own `render()` (logic frames still run). `__app.testMode.setFull(true/false)` = quality 3 + shadows for a real screenshot, `.draw()` renders one frame. Never with `perfcount`, `turntest`, `phonememtest`, `glrestoretest` or pixel comparisons ([verification](verification.md)).
- `&warm` — run the start's shader / upload warm-up (#432) in headless Chrome too (it skips it otherwise).
- `&fall=h` — drop from h m (default 5) above the ground where you start (#361; with `&at=`): over 3 m it hurts.
- `&hoop` — the basketball hoop up out front. `&car` — our car parked in front of the house. `&water` — turn on every tap and shower. `&tv` — switch the TV on. `&laptop` — Tilly's laptop on. `&secret=i` — the secret drawer shows surprise i (SECRET.items, with `&open`).
- `&phone` — the short touch-only start screen. `&install` — show the iPhone install sheet. `&note` — open the changelog note. `&pet` (with `&cat=`) — the cat is being petted.
- `&clip=y` — clip everything above height y (cut-away plan view, e.g.
  `?shot&at=2.87,6.35,0,-90,16&clip=2.5` for Entréplan from above, `clip=5.6` + feet 19 for Övre plan).



## Semantic fixture waits (#880)

`tools/semanticwait.cjs` exports `waitForState(pageOrFrame, predicate, arg = null, { timeout = 30000, polling = 100 })`. Use it only for semantic readiness/result/DOM-state markers that do not require a painted frame or layout calculation. It returns Playwright's usual JSHandle and preserves its timeout failure; both budgets must be finite positive numbers, so zero/infinite waits and `raf` polling cannot sneak in. Pass the caller's existing timeout unchanged. Timer polling can observe state while rAF callbacks stop; it cannot unblock a synchronously stalled page thread. Read raw fixture output with `textContent`/`page.evaluate` when visible layout is not the assertion.

`testkit.open` uses this helper for `__app.renderer`, keeping its original 1,500,000 ms default and every caller override, URL/test/lazy/viewport/context option and wait:false behavior. `fixtureviewport` still exits genuine DOM fullscreen and sets the browser viewport before checking the same dimensions with its original 10,000 ms budget. Only `fixtureviewport.test.cjs` (its original 30,000 ms default waits) and `combatremotetest.cjs` (45,000 ms result marker) are additionally routed here. Their predicates/assertions/modes/ports are unchanged and their existing result reads already avoid innerText; #869's separate raw-text fix is retained. `testkit.shot` keeps actual rAF/draw/screenshot requirements. Do not substitute semantic readiness for pixels, visibility/layout assertions, first full draw or physical-device acceptance.


## Native window fullscreen fixture (#889)

Run `PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome FIXTURE_VIEWPORT_ARTIFACTS=/tmp/native-viewport node --test tools/fixtureviewport.test.cjs` with Playwright **1.60 or newer** and a full Chromium/Chrome executable. `nativefixturebrowser.cjs` launches an owned headless browser with a disposable profile and an OS-assigned loopback CDP port, then uses the documented `connectOverCDP({ noDefaults: true })` on its default context. Older modules fail explicitly before launch; there is no silent fallback or skipped assertion. No server, apartment or WebGL is loaded.

Normal Playwright page initialization enables focus emulation. Chromium treats that as visible capture and deliberately enters fullscreen *within the tab*; DOM fullscreen can stay true while the browser window stays normal indefinitely. Waiting longer for window fullscreen does not fix that mode. The isolated `noDefaults` connection prevents that override, so the existing entry function requests genuine window fullscreen. The original DOM/window assertions, native exit, 667×375 phone / 480×300 restore / 960×600 desktop dimensions, text value, touch class and repeated episodes remain required. `setFixtureViewport` and product entry/exit code are unchanged. See the [official Playwright option](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp-option-no-defaults), Chromium's [focus capture handler](https://chromium.googlesource.com/chromium/src/+/main/content/browser/devtools/protocol/emulation_handler.cc) and [fullscreen-within-tab controller](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/ui/exclusive_access/fullscreen_controller.cc).

Current raw evidence is `result.json` (replacing this fixture's old `native.json`) plus `phone.png` and `desktop.png`. The checkpoint records exact whitelisted source hashes, source revision, browser/Playwright versions and completed snapshots before screenshots, with separate logic/image/cleanup/actual CLI states. A later failure remains failed or incomplete. The helper closes its owned browser process and removes its profile even if connection or test phases fail. These native DOM captures establish fixture behavior, not apartment imagery, performance or physical-phone acceptance.


### Native fixture teardown and primary failures (#942)
The native fixture helper keeps an owned `pid`/`profile` for provenance. It bounds
its browser-close wait to3s, then waits3s for its own master after SIGTERM and1s
after SIGKILL. It does not remove the profile if that master still has not exited.
After exit, asynchronous recursive removal retries only ENOTEMPTY at most five
times, with100/200/300/400/500ms waits for the whole profile (no per-directory
retry multiplication). Other removal errors fail immediately. This handles a
transient directory-not-empty race without asserting that child-process teardown
was the proven cause. Launch flags, noDefaults, fullscreen and viewport behavior
are unchanged. No global browser killing or other profile removal is permitted.

`close()` remains compatible. The same cleanup promise is reused, so a permanent
cleanup failure is still an error on a second call. For external finally blocks,
explicitly retain and pass the primary error:
```js
let primaryError;
try { /* fixture */ }
catch (error) { primaryError = error; throw error; }
finally { await native.close(primaryError); }
```
Successful cleanup returns normally, preserving the caller's original throw. If
cleanup also fails, `close(primaryError)` throws AggregateError with original
error as cause and first errors element, followed by cleanup error. The startup
catch uses the same contract. A plain external `finally { await close(); }` cannot
infer a caller's prior exception; migrate only the explicit error tracking, never
silently swallow cleanup errors or claim a false CLI0. `fixtureviewport.test.cjs`
adopts this contract without changing any existing fullscreen assertions.
