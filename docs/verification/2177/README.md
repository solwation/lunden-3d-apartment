# #2177 outdoor wind sound (audio, no screenshot)

One looping noise through two filters (`sfx.windBed`, src/audio.js): a low-pass body (whoosh; the Q rises into a howl above ~45-80 % wind
power) and a band-pass (summer: broad high leaf rustle near trees; winter: narrow, resonant bare whistle). `windSoundParams`
(src/windsound.js, pure; tunables `WIND_SOUND` in src/config.js, all *guesses* by ear) maps wind speed (from `weather.wind`, #2117),
the gust sweep, leaf cover (`SEASON.trees[month][3]`), nearness of the nearest tree (`treeFeet`, 14 m) and indoors to the settings; main.js
updates them every 0.25 s with 0.6 s easing. The open-window wind (`sfx.wind`) follows the same strength via `setWindPower`.

## Parameters (pure helper, tree distance 0 m; gust 0.5 = neutral, 0.9 = swelling)

| Wind | Season | Where | Strength | body gain | lowpass Hz | lowpass Q | band gain | band Hz | band Q |
|---|---|---|---|---|---|---|---|---|---|
| calm 0.5 m/s | summer (near trees) | outdoor | 0.05 | 0.024 | 229 | 0.7 | 0.0000 | 3243 | 0.8 |
| breeze 4 m/s | summer (near trees) | outdoor | 0.35 | 0.070 | 498 | 0.7 | 0.0396 | 3477 | 0.8 |
| gusty (gust sweep up) 9 m/s | summer (near trees) | outdoor | 0.85 | 0.183 | 966 | 7.0 | 0.0677 | 3884 | 0.8 |
| storm 18 m/s | summer (near trees) | outdoor | 0.96 | 0.209 | 1062 | 7.0 | 0.0729 | 3967 | 0.8 |
| calm 0.5 m/s | summer (near trees) | indoor | 0.05 | 0.004 | 229 | 0.7 | 0.0000 | 3243 | 0.8 |
| breeze 4 m/s | summer (near trees) | indoor | 0.35 | 0.013 | 420 | 0.7 | 0.0040 | 3477 | 0.8 |
| gusty (gust sweep up) 9 m/s | summer (near trees) | indoor | 0.85 | 0.033 | 420 | 7.0 | 0.0068 | 3884 | 0.8 |
| storm 18 m/s | summer (near trees) | indoor | 0.96 | 0.038 | 420 | 7.0 | 0.0073 | 3967 | 0.8 |
| calm 0.5 m/s | winter (near trees) | outdoor | 0.05 | 0.024 | 229 | 0.7 | 0.0000 | 3243 | 0.8 |
| breeze 4 m/s | winter (near trees) | outdoor | 0.35 | 0.070 | 498 | 0.7 | 0.0105 | 1485 | 4.1 |
| gusty (gust sweep up) 9 m/s | winter (near trees) | outdoor | 0.85 | 0.183 | 966 | 7.0 | 0.0813 | 2197 | 7.1 |
| storm 18 m/s | winter (near trees) | outdoor | 0.96 | 0.209 | 1062 | 7.0 | 0.0875 | 2342 | 7.8 |
| calm 0.5 m/s | winter (near trees) | indoor | 0.05 | 0.004 | 229 | 0.7 | 0.0000 | 3243 | 0.8 |
| breeze 4 m/s | winter (near trees) | indoor | 0.35 | 0.013 | 420 | 0.7 | 0.0010 | 1485 | 4.1 |
| gusty (gust sweep up) 9 m/s | winter (near trees) | indoor | 0.85 | 0.033 | 420 | 7.0 | 0.0081 | 2197 | 7.1 |
| storm 18 m/s | winter (near trees) | indoor | 0.96 | 0.038 | 420 | 7.0 | 0.0088 | 2342 | 7.8 |


Indoors = the player is not outdoors / below / in the core / in the playroom: gain x0.18, low-pass ceiling 420 Hz, rustle/whistle x0.1.
Far from trees (near = 0) the summer rustle is 0 and the winter whistle is halved.

## Rendered check (tools/windsoundbrowser.cjs, OfflineAudioContext, 1 s, game's own audio.js; raw: metrics.json)

| Season | Where | Condition | m/s | rendered RMS | crude centroid Hz |
|---|---|---|---|---|---|
| summer | outdoor | calm | 0.5 | 0.0013 | 209 |
| summer | outdoor | breeze | 4 | 0.0098 | 5032 |
| summer | outdoor | gusty | 9 | 0.0306 | 2912 |
| summer | outdoor | storm | 18 | 0.0410 | 2592 |
| winter | outdoor | calm | 0.5 | 0.0012 | 219 |
| winter | outdoor | breeze | 4 | 0.0058 | 532 |
| winter | outdoor | gusty | 9 | 0.0290 | 956 |
| winter | outdoor | storm | 18 | 0.0402 | 1091 |
| summer | indoor | calm | 0.5 | 0.0002 | 219 |
| summer | indoor | breeze | 4 | 0.0012 | 4009 |
| summer | indoor | gusty | 9 | 0.0037 | 2431 |
| summer | indoor | storm | 18 | 0.0046 | 2280 |

Graph built once per bed (1 buffer source + 2 filters), repeated `set` builds nothing, no page errors. The centroid column is a crude
first-difference estimate (white-noise-heavy, so over-reads the high band), only for relative comparison.
