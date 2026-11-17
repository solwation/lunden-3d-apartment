# #2067 — fine skin detail

Source `c8e18193a04e562291f070c71521dc7e813bcba0`, baseline `24957657`.
Avatar content only; no public-project transfer.

## Result

The old 2.4 mm sparse pores and 6.5 mm dimples read as pits at a normal close-up distance.
They are now a dense quasi-periodic fine field: pore period 0.65 mm, relief 1 µm; grain
period 1.5 mm, relief 1.5 µm. These are artistic guesses rather than measured skin.
The existing six differently directed/phased waves keep the field irregular. A cheek/nose
weight makes other facial skin gentler; both layers now leave lip and eyelid surfaces smooth.
The layers fade between six and four pixels per period, removing them before undersampling.
Shader constants retain eight decimals so micrometre relief does not round to zero.

[Matched result image](hud-fore-efter.png): first two rows baseline, last two candidate.
Three skin tones at a 0.30 m face camera distance in day/backlight, a tighter cheek view,
a backlit ear, flush/sweat and rain. Individually visible pits are gone from the candidate's
0.30 m views; eyelids and lips remain smooth. The ear still transmits red backlight and
exercise still warms the face and changes the sheen. All views use the real `Avatar` material.
The finer field is intentionally subtle at normal viewing distances.

## Checks and budget

- `node --test tools/avatarbreathtest.mjs tools/avatarweathertest.mjs`: 13/13 passed
  ([output](node-tests.txt)); retained exercise/flush/sweat state and rain/snow behaviour.
- One successful fixed-input browser run with result images, 8-frame camera movements at
  2 m and 5 m, geometry/attribute/bone equality and render timing. Zero browser/shader errors;
  every captured view is one draw. [Raw data](skin.json), [source and environment](source.json).
- Visual inspection of the successful contact sheet: no sparse pits, retained backlight,
  flush and wet sheen; no new eyelid/lip bumps.

The first local node command lacked the `three` dependency symlink; after adding the
existing cached dependency it passed. An initial browser setup used the wrong fixture
uniform property for wet/exertion; it was stopped and corrected before accepting any
result. The successful run uses `material.userData.u` and the actual shader uniforms.

| Same style-0 avatar / renderer | Baseline | Candidate |
| --- | ---: | ---: |
| Triangles | 15,660 | 15,660 |
| Bones | 15 | 15 |
| Vertex attributes | 17 | 17 |
| Draw calls | 1 | 1 |
| 2 m motion Δluma ratio, detail on/off | 1.033 | 1.029 |
| 5 m motion Δluma ratio, detail on/off | 1.031 | 1.029 |
| Render + `gl.finish()` median | 0.20 ms | 0.10 ms |
| Render + `gl.finish()` p90 | 0.30 ms | 0.20 ms |

Motion ratios remain below the existing 1.1 component guard. The normal detail filters
out at distance; the retained flush/transmission still alter the on/off comparison.
Timing is 20 samples after five warmup frames at 400×400, Chromium/SwiftShader. This
sub-millisecond difference is not a speedup claim or physical-device measurement.
The wave count stays six sin + six cos inside the close-detail branch. The facial weight
adds two exponentials and mask arithmetic on head skin, without another varying, attribute,
texture, light, draw call or pass. Colour flush and light-transmission logic, weather,
exercise, look codes and network fields are unchanged; no geometry or rig code changed.

Reproduce:

```sh
PLAYWRIGHT_MODULE=/home/olof/github-dashboard/node_modules/playwright \
  tools/browsertest.sh node tools/avatarskin2067browser.cjs \
  http://localhost:8174 docs/verification/2067
```

The harness intercepts baseline `avatarskin.js` and `config.js` from the stated revision;
every other input is shared. Component evidence does not establish full-apartment, mobile
or native-GPU performance.
