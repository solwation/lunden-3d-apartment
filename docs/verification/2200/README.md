# #2200 rain by surround: audio-graph evidence (no images)

`tools/rainsurfacebrowser.cjs` builds the game's real `sfx.rain()` (src/audio.js) in an OfflineAudioContext and renders 1 s per surround
with the real `RAIN_SURFACE` mix (src/rainsurface.js) and the real river path; `metrics.json` holds RMS, spectral centroid and node counts.
The graph is built once: 1 buffer source, 7 filters, 7 gains; re-mixing adds no nodes (`extra: 0`).

| surround | RMS | centroid Hz |
|---|---|---|
| plain hiss, no mix (old behaviour) = hard ground | 0.0217 | 4752 |
| over grass (soft) | 0.0193 | 3942 |
| under a roof / canopy (drumming) | 0.0217 | 3764 |
| next to / in the car (metal ping) | 0.0206 | 4415 |
| under summer trees (leafy) | 0.0224 | 4633 |
| bare winter trees | 0.0193 | 3942 (same as grass: no leaf layer) |
| at Höje å (splashes) | 0.0234 | 3759 |
| 40 m from the river | 0.0202 | 3834 |
| indoors, top floor | 0.0034 | 1136 |
| indoors, plain mix | 0.0030 | 1465 (indoor model applied once: Weather's 0.3 gain + 900 Hz) |

Level stays within about +8 % / -11 % of the old hiss outdoors (#1470 preserved); the no-mix path equals the old graph's level exactly.
Not measured: in-game listener position inputs (trees, river, car, grass, roof) were checked by reading the code, not by a browser walk.
