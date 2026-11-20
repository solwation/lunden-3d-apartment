# #2178 Bird song and gull calls: verification

Audio change, so no screenshot. Tunables: `BIRD_SONG` in `src/config.js` (all *guesses*, by ear and the Swedish song calendar).

## Schedule (phrases per minute near a treetop, dry; `songPlan`, sun times from `sunTimes(15th of the month)`)

| month | sunrise | sunset | dawn (rise+0.1h) | 09 | 12 | 15 | evening (set-1h) | night 02 | mix (blackbird/chaffinch/great tit/robin) |
|---|---|---|---|---|---|---|---|---|---|
| jan | 8.5 | 16.1 | 1.1 | 1.1 | 0.8 | 1.1 | 1.1 | 0.0 | 0.00/0.00/0.45/0.55 |
| feb | 7.6 | 17.1 | 1.7 | 1.4 | 1.3 | 1.3 | 1.7 | 0.0 | 0.07/0.00/0.47/0.47 |
| mar | 6.5 | 18.1 | 9.8 | 2.9 | 2.9 | 2.9 | 5.9 | 0.0 | 0.24/0.17/0.31/0.28 |
| apr | 6.1 | 20.2 | 14.0 | 4.2 | 4.2 | 4.2 | 8.4 | 0.0 | 0.26/0.26/0.26/0.21 |
| maj | 4.9 | 21.2 | 14.0 | 4.2 | 4.2 | 4.2 | 8.4 | 0.0 | 0.28/0.28/0.25/0.19 |
| jun | 4.4 | 21.9 | 12.6 | 3.8 | 3.8 | 3.8 | 7.6 | 0.0 | 0.31/0.28/0.22/0.19 |
| jul | 4.7 | 21.7 | 8.4 | 2.5 | 2.5 | 2.5 | 5.0 | 0.0 | 0.32/0.21/0.21/0.26 |
| aug | 5.7 | 20.7 | 0.8 | 0.6 | 0.6 | 0.6 | 0.8 | 0.0 | 0.07/0.00/0.21/0.71 |
| sep | 6.7 | 19.3 | 1.1 | 0.8 | 0.8 | 0.8 | 1.1 | 0.0 | 0.00/0.00/0.25/0.75 |
| okt | 7.7 | 18.0 | 1.4 | 1.2 | 1.1 | 1.1 | 1.4 | 0.0 | 0.00/0.00/0.30/0.70 |
| nov | 7.8 | 16.0 | 1.1 | 1.0 | 0.8 | 1.1 | 1.1 | 0.0 | 0.00/0.00/0.40/0.60 |
| dec | 8.5 | 15.6 | 0.8 | 0.8 | 0.6 | 0.8 | 0.8 | 0.0 | 0.00/0.00/0.44/0.56 |

rain May dawn: 0:14.00  0.03:14.00  0.1:12.74  0.2:8.10  0.4:0.56  0.8:0.56

Rain (May dawn, peak 14/min): 0 mm-equivalent 14.0, 0.1 12.7, 0.2 8.1, 0.4 and up 0.56 (4 % left: "nearly silent"). Gulls call about 3 per minute by day
(a gull within 60 m, only while the flock is shown, so never in rain, at night or in the whiteout) and cry out when flushed.
At most 2 voices at once (`VoiceCap(2)`, songbirds and gulls together); songbirds only from treetops within 40 m (3D), gulls within 60 m; indoors x0.2.

## Render levels (OfflineAudioContext, game's own audio.js, source 5 m away; `tools/birdsongbrowser.cjs`)

| call | duration s | notes | peak (FS) | RMS | centroid Hz |
|---|---|---|---|---|---|
| blackbird (flute) | 2.29 | 3 | 0.077 | 0.0255 | 1985 |
| chaffinch (trill) | 1.04 | 16 | 0.059 | 0.0164 | 4058 |
| great tit (ti-tu) | 1.44 | 6 | 0.078 | 0.0200 | 3597 |
| robin | 0.95 | 6 | 0.078 | 0.0195 | 5037 |
| gull call | 0.65 | 2 | 0.074 | 0.0245 | 1731 |
| gull laugh | 1.20 | 6 | 0.080 | 0.0163 | 1636 |
| gull alarm | 1.89 | 7 | 0.103 | 0.0263 | 1593 |

Each call is exactly 1 oscillator + 1 band-pass (+ a gain and the panner); 6 simultaneous requests start 2; muted or before audio starts: nothing.
Songbirds sit at BIRD_SONG.level.song 0.2 and the positional fall-off (refDistance 6 m, rolloff 1.2) puts a 40 m bird about 0.15 of the 5 m level.

## Before / after

Before: the birds had no sound at all. After: the schedule above, from the treetops by day; gulls call, laugh and cry out when walked up to.
