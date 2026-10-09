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
- `&cat=x,z[,yawDeg[,y]]` — show the cat there; `&miele` — Miele instead (with `&cat=`), else the next cat to turn up is her (#328); `&catv=i` coat variant, `&catt=s` animation time, `&catwalk` walking (#224), `&cattail` its tail up (#262);
  `&kitten` a kitten (#363; with `&cat=`, else the next cat to turn up is one).
- `&time=HH[.h]` — start at that hour (default: the browser's time), `&month=1–12`, `&day=1–31` (default: today), `&freeze` pauses the clock,
  `&clock` opens the wall clock's strip,
  `&lights` turns every lamp on, ceiling lamps too, and keeps the small ones on (#234).
- `&jetpack` — the jetpack on your back (outdoors, #359).
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
- `&perf` — fps / draw-call overlay and the hitch log (#592): frames ≥ 50 ms go to the console with what changed in them.
- `&warm` — run the start's shader / upload warm-up (#432) in headless Chrome too (it skips it otherwise).
- `&fall=h` — drop from h m (default 5) above the ground where you start (#361; with `&at=`): over 3 m it hurts.
- `&hoop` — the basketball hoop up out front. `&car` — our car parked in front of the house. `&water` — turn on every tap and shower. `&tv` — switch the TV on. `&laptop` — Tilly's laptop on. `&secret=i` — the secret drawer shows surprise i (SECRET.items, with `&open`).
- `&phone` — the short touch-only start screen. `&install` — show the iPhone install sheet. `&note` — open the changelog note. `&pet` (with `&cat=`) — the cat is being petted.
- `&clip=y` — clip everything above height y (cut-away plan view, e.g.
  `?shot&at=2.87,6.35,0,-90,16&clip=2.5` for Entréplan from above, `clip=5.6` + feet 19 for Övre plan).

