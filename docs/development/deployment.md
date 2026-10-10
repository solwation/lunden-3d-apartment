# Deployment, startup and updates

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [storage](storage.md), [verification](verification.md).
## Module and test map

```text
src/viewport.js        renderer/camera sizing is attached before scene loading, including rotations during awaits (#567)
src/bootstrap.js       lightweight startup gate: bounded version check before importing main.js (#512)
src/startup.js         fresh HTML/build check + cache-busted early update; loop guards; no scene on outgoing page
src/version.js         BUILD/CONTENT stamps + polling for publications later during a visit
src/changelog.js       changelog list + the note on the freezer (newest `t` first, "Nytt" by the highest `t` seen, #341; E to read; `scrollNote`: ↑ ↓ / W S, PageUp/Down, Space,
                       Home/End scroll it, the wheel is passed on under pointer lock, #275)
src/install.js         iPhone "add to home screen" sheet (no fullscreen API there); install link
                       where the browser offers beforeinstallprompt
manifest.webmanifest   web app manifest; icons/ = icon.svg rendered to PNG (192, 512, apple-touch 180)
                       + qr-site.svg, the start screen's QR code to the site (#193; made with OpenCV's
                       cv2.QRCodeEncoder, level M, and checked with cv2.QRCodeDetector on a screenshot; hidden on phones)
data/changelog.json    what changed, for visitors (see Workflow rules)
tools/notetest.html    headless test of the changelog note ("Nytt", read/close, no walking, swings with the freezer door;
                       scrolling keys, a W held from before ignored, #275)
tools/updatetest.html  headless test of the update notice on a phone-sized touch screen (on top, 44 px, touch works);
                       `isNewer`: a new SHA with the same content hash is no reload, a changed hash is (#304; on a stamped
                       site it also checks the page's own version.json);
                       the countdown 5 … 1, cancelled by a key / mouse move / the stick / a touch, held back by brewing (#277)
tools/stamp.sh         build the published site with a version stamp (used by CI); exits 1 with `::error::` if the stamped
                       data/changelog.json is not a non-empty list of entries with id/date/text/`t` (empty fridge note, #655)
tools/changelog_stamp.py the published changelog.json (run by stamp.sh): `t` per entry from git history, newest first,
                       a warning on duplicate / out-of-order ids (#341)
```

## Publishing and update lifecycle

Static site, no build step for development, no npm. Every push to `main` deploys to
https://solwation.github.io/lunden-3d-apartment/ (public repo) via
`.github/workflows/pages.yml`, which runs `tools/stamp.sh`: it copies the site to `_site`,
writes the commit SHA into `src/version.js` (`BUILD`) and `version.json`, and appends
`?v=SHA` to module imports / `data/plan.json` so a reload never mixes cached old modules.
It also writes a **content hash** (`CONTENT` in version.js, `content` in version.json, #304) of what the page loads:
index.html, the manifest, icons/, src/, data/, textures/, music/ and stamp.sh — not tools/, docs/, the PDF or the .md files.
It also writes `data/todo.json` from the repo's open issues (`tools/todo.py`, REST API with the workflow's
GITHUB_TOKEN, `[]` on any error) AFTER the hash and outside it (#340): a changed TODO list reloads nobody; the Pages
workflow also runs once a day (schedule) so the post-its follow the issues. Locally `data/todo.sample.json` is used.
Commits that only touch docs/, material/, cloudflare/, `*.md` or cloud.yml do not deploy at all (`paths-ignore`).
Crash reports (#629): the Worker (cloudflare/crash.js) must be deployed (cloud.yml does it on `cloudflare/**` pushes) before reports
arrive; until then POST /crash gets 404 and the client just queues at most three and gives up silently. Read them with
`curl -H "Authorization: Bearer $ADMIN_TOKEN" <CLOUD_URL>/crash` (list, newest first) and `…/crash/<id>`; `DELETE /admin/crash` clears.
An agent can only read them when the user supplies `ADMIN_TOKEN` (an environment secret) or pastes the output.
At startup, `bootstrap.js` waits at most 2.5 seconds for `startup.js` to check `version.json` and (when needed) fresh HTML before importing the expensive scene. A coherent new build navigates to `?v=<SHA>` before `main.js` runs; network/HTML errors continue the working version. Session and URL guards prevent repeated startup navigation. Saved home/settings/resume data remain intact. No service worker is installed by this project; a legacy registration with exactly this app's scope is retired only for an early update, without touching parent-site registrations.

During a visit the page polls `version.json` every minute; when its content hash differs from `CONTENT` (`isNewer`; a file without a
hash falls back to the SHA) it reloads by itself — a new SHA with the same content (tests, reference images) is no
reload, so a reload without a note entry means an invisible fix (#192, `autoReload` in
main.js, `AUTO_RELOAD` in config): once the visitor has been still for 2.5 s (no keys/stick/mouse/touch, not walking, no panel,
no music, nothing time-bound: coffee brewing, frying, the airfryer, the dishwasher (#385), the grill, Kaffeturbo, the car's music, a ball in the air) "Uppdateras om
5 … 1" counts down at the top (#277, `#countdown`; any input or movement cancels it: "Uppdatering avbruten"), then the
picture fades out, the place and the world are saved (resume record) and `?v=<new SHA>` loads, fading back in with "Ny version laddad";
only if they are never still for 5 min does the old "new version" notice (top centre) appear. Its buttons react to a lifted touch as well as a click (`onTap`,
#41), and "Ladda om" navigates to `?v=<new SHA>` so no cache serves the old page
(`tools/updatetest.html`). That button stores a one-time record (`src/resume.js`: position, level, view,
clock, input mode, mute, fullscreen; sessionStorage + localStorage, < 2 min) which the next load reads, deletes and resumes from (not with `?at=`; a spot
inside a wall falls back to START); F5 uses the running record below (a new tab starts at START). The automatic update and "Ladda om" also put
a `world` part in it (#277, `src/keep.js` `saveWorld` / `loadWorld`, versioned plain JSON, every part optional and read tolerantly): the
game's clock and date (spooled / paused — only a new visit starts at the real time, #143), the car (`Car.saveState`: arriving / leaving
carries on along its path, parked with its doors, the music), open doors / lids / fronts / windows, room lamps + small lamps (on/off and the
dusk state, not the pool), TV / PC / hob / hood / grill, the coffee in the jug, the Sonos, the parasol's hand choice, things put down and the
one in the hand (cups with pattern and contents, glasses, the served beer), sitting / lying (`sitAt`), the cat. Fresh as before: the
chicken / fish fingers / fries in the air fryer (the bag itself is kept like the milk), taps, a drawing in the hand, F5 (place only).
A record made mid-visit skips the start screen (#181, `continueAfterReload`): touch plays at once (sound/fullscreen on the
first touch), mouse & keyboard gets the see-through `#arm` (the next click takes the mouse, #190); "Ny version laddad" fades out at the top after 3 s.
F5 (#203): while visiting, the place (+ view, mode, mute, `BUILD`) is written to this tab's sessionStorage every 2 s and on
`pagehide` (`saveSession`), so an F5 carries on the same way — the note only if the build changed; a new tab starts as usual.
An inline script in index.html's <head> sees a valid record with a mode before anything is drawn and sets
`html.resuming` (start screen hidden, a dark "Laddar…" cover) until main.js has resumed — or drops it on a bad record (#222).
A record made on the start screen (no mode) shows it with "Du fortsätter där du var" + "Börja från start". The start screen
always offers "Gå till startplatsen" (both also set the clock and calendar back to now, `realNow`)
and "Återställ" (#303, `src/reset.js`, `resetHome` in main.js): after a question (#reset-confirm, Avbryt / Esc changes nothing)
every 'lunden.*' key in local/sessionStorage goes except the whitelist `RESET_KEEP` in config (the cloud's queue and
seen list, the desk drawing, the stats/score, the leaderboard name + id, conveniences) — a new key is reset unless it is
added there — and the page reloads clean (no resume / F5 record): START, the real time, everything shut / off / at home,
"Hemmet är återställt" on the start screen. IndexedDB is never touched: every taped-up drawing stays (synced ones, and
with the cloud off the visitor's own — their creations, not the home's state), the cat photos too; nothing is sent to
the cloud (`tools/resettest.html`, with `node cloudflare/dev.mjs`)
(`tools/reloadtest.html`). Locally `BUILD = 'dev'` and no checks run. Keep imports
between `src/` files in the form `from './x.js'` on one line so the stamp regex finds them.
Use relative paths only.

## Recent implementation notes

Startkontroll (#512): `tools/startuptest.html` har 20 kontroller av aktuell/ny version, samma innehåll efter dokumentationsändring, HTML som inte hunnit publiceras, blockerad lagring, loopskydd, offline/fel, tidsgräns och sena svar, samt appens/andra sidors serviceworker-scope. Webbläsarintegration verifierar fem startscenarier (ny, aktuell, offline versionskontroll, utdraget svar, halvpublicerad HTML), en enda scenimport, cachebustad navigation och bibehållna hem-/inställnings-/resume-data. `loadingtest` och `updatetest` passerar; `stamp.sh` cachebustar bootstrap och dess små beroenden innan `main.js?v=BUILD` importeras.


Changelog robustness (#655): `loadChangelog` accepts only an OK answer that is a non-empty list; it tries `data/changelog.json?v=…` twice (5 s timeout each), then once without `?v` (built as `['data','changelog.json'].join('/')` so stamp.sh does not rewrite it), and falls back on the last good answer kept in localStorage (`lunden.changelogCache`, 200 entries). `changelog.fresh` is false when the server did not answer; main.js then runs `retryChangelog` in the background (5/20/60/180 s) and redraws the list and the paper (`note.refresh`) on the first fresh answer. Start is never blocked longer than the two timeouts.

Freezer history limit (#543): loadChangelog marks/sorts the complete history before selecting CHANGELOG_NOTE.limit (100) entries for both the note texture and readable list. data/changelog.json retains the complete history and seen metadata still tracks the full input. notetest covers publication order with a late low-id entry, New markers and histories below/at/above the cap.
