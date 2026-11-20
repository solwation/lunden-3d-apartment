# #2223 – lightmodestest.cjs: name dialog captures the start click

Cause: the first-visit player-name dialog (#441, `#player-dialog`) covers the start buttons; `tools/lightmodestest.cjs` (#1176) never left it, so `#start-mouse` click timed out (90 s) with "`<div role="dialog" id="player-dialog">` intercepts pointer events". Other tests use the shared `testkit.skipNameDialog(page)` (#1635, clicks `#player-skip` when shown).

Change: `tools/lightmodestest.cjs` requires `./testkit.cjs` and calls `kit.skipNameDialog(p)` before the start click. No game code changed.

Command: `PLAYWRIGHT_MODULE=/home/olof/kvarteret-lunden/node_modules/playwright timeout 3000 tools/browsertest.sh node tools/lightmodestest.cjs http://localhost:8580 /tmp/lm2223`

## Before (exit 0 from the pipe's tail; test threw)
```
    - <div role="dialog" id="player-dialog" aria-label="Spelarnamn">…</div> intercepts pointer events
    - retrying click action (167 x ...)
    at open (tools/lightmodestest.cjs:17:105)
    at async tools/lightmodestest.cjs:42:15
browsertest: peak 1407 MiB of 4G
```

## After (exit 0)
```
ALL PASS
PASS top menu: Prata / Ljuslägen … / Myslägen … (nest)
PASS E = Prata: a random answer (weather)
PASS Ljuslägen page: Allt på / Extrabelysning / Fönsterlampor / Tillbaka (bottom 583 ≤ 600)
PASS Tillbaka: Prata / Ljuslägen … / Myslägen …
PASS all: ceiling 13, small 21 [golvlampan, spotsen, julgranen, långlampan, rottinglampan, Hue Go-lampan, lampan, nattl
PASS extra: ceiling 0, small 20 [golvlampan, spotsen, julgranen, långlampan, rottinglampan, Hue Go-lampan, lampan, natt
PASS window: ceiling 0, small 2 [Hue Go-lampan, lampan], "Okej, bara fönsterlamporna."
PASS cozy: ceiling 0, small 11 [golvlampan, spotsen, julgranen, långlampan, rottinglampan, Hue Go-lampan, lampan, enhö
PASS evening: ceiling 0, small 7 [golvlampan, julgranen, långlampan, lampan, nattlampan, nattlampan, spegelns nattlampa
PASS while on: Prata / Ljuslägen … / Myslägen … / Avsluta ljusläget (bottom 583)
PASS the mode on is marked: Mys / Kvällsmys (på nu) / Disco / Tillbaka
PASS end keeps the player's own changes (långlampan off, Vardagsrum ceiling on, 1 ceiling on)
PASS the rest back as before (18 small lamps on)
PASS the Hue Go keeps its colour
PASS dawn during a mode: held (2 on), after the end the dusk lamps follow day (none on)
PASS Myslägen page: Mys / Kvällsmys / Disco / Tillbaka (bottom 583 ≤ 600)
PASS disco on: ceiling 0, small 20, "Disco! Nu dansar vi."
PASS the music plays the disco channel (playing true, channel 3, AudioContext running, media {"paused":false,"t":0,"read
PASS lamps tinted at once (21/21), saved colour untouched
PASS the next beat: 21 lamps a new colour (glow = pool light), the wash data changed
PASS keep.js saves no disco colour ({"Hue Go-lampan":3368703})
PASS a Hue Go colour chosen during the disco stays (not cycled, not undone)
PASS Avsluta: the other lamps' own colours back (20/20)
PASS Avsluta: the music back as it was (quiet, Jazz: playing false, channel 1)
PASS another mode: the colours back, the visitor's own channel kept playing (4)
PASS music already on: the disco plays it as it is and leaves it on
PASS cut: disco released, colours back, music off
PASS F: disco released, colours back, music off
PASS power cut: released, lamps as they were (11/11)
PASS F: released
PASS Prata: a random answer (date)
PASS phone 844×390: Prata / Ljuslägen … / Myslägen … / Avsluta ljusläget all inside, ≥ 44 px
browsertest: peak 1883 MiB of 4G
```
