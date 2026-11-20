# #2190 ambient bed: Höje å babble and distant city hum (audio, no screenshots)

`tools/ambientbedbrowser.cjs` renders the game's own `src/audio.js` graph (`sfx.ambientBed()`, real `riverPath`) in an OfflineAudioContext, 1 s,
RMS after 0.5 s (full metrics: [metrics.json](metrics.json)). Two sources and two filters are built once; two further `set()` calls build nothing.

| Case | RMS | Spectral centroid |
|---|---|---|
| river, at the centreline | 0.0172 | ~4290 Hz |
| river, 25 m away | 0.0124 | ~4130 Hz |
| river, 50 m away | 0.0025 | ~3410 Hz |
| river, 150 m away | 0 | - |
| river at the centreline, indoors | 0.0011 | ~2200 Hz |
| city 03:00 (night) | 0.0004 | ~155 Hz |
| city 12:00 | 0.0021 | ~225 Hz |
| city 08:00 / 17:00 (rush) | 0.0050 | ~310 Hz |
| city 22:00 | 0.0009 | ~180 Hz |
| city 08:00 indoors | 0.0010 | ~147 Hz |

Note: the issue text says the hum nearly dies at night; that is what is implemented (night is about 1/12 of rush hour).
Unit tests: `node --test tools/ambientbedtest.mjs` (5/5). Existing audio tests rerun: windsoundtest 7, birdsongtest 10, soundocclusiontest 10,
occlusiontest 8, windsimtest 8 (all fail 0); `tools/windsoundbrowser.cjs` PASS. Boot smoke of main.js (`?shot&test`): no page errors (audio not started there,
so the main.js update branch itself is covered only by the helper + graph tests). Levels are *guesses* by ear; no listening review done.
