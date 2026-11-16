# Parked-car and garage bicycle-row fades — #1988

Verified 2026-11-16 in the detached checkout based on `e55ea7997ed01e604fcfca52165498e0e9efe0e2`. Both raw browser results contain SHA-256 hashes for all affected product files and shared `lod.js` / `streetlife.js`. The hashes match each other and the measured source. Integration rebased onto `54646415`: only unrelated visited-flat config was added to config.js; all vehicle settings, builders and shared LOD source are unchanged. Existing green evidence is reused without another browser run. Shared LOD APIs, courtyard bicycles and car/bicycle geometry builders were not edited.

## Behaviour and scope

Cars keep their original 30 m phone / 60 m desktop policy, now centred in an 8 m dither zone. Four full-detail material layers remain four layers of the same car; the far batch gets one copy, with its original matrix and paint colour. Packing retains the existing 1 m step and a conservative 1 m membership margin; uniforms move each frame. Empty levels stay culled. Phone shadow tiles retain original full-detail matrices/materials; untiled car casters use matching complementary depth dither.

Garage rack and storage rows keep their actual merged near/far geometry, horizontal distance and 10 m + bounding-sphere radius boundary. A 4 m zone replaces the hard switch. Both material clones share the actual shell Color animated by Garage sensor lighting. Existing alpha spokes and bicycle take/return/riding paths are unchanged. Widths are visual guesses in config.

## Executed checks and correction

- `node --test tools/lodtest.mjs tools/vehiclelodtest.mjs`: 13/13 pass, about 0.41 s. [Raw TAP](node-tests.txt).
- `THREE_DIR=/home/devcontainers/.cache/three-0.170.0 tools/browsertest.sh node tools/vehiclelodbrowser.cjs http://127.0.0.1:8798 docs/verification/1988`: actual-builder setup and all nine near/mid/far views passed and their images were saved. The command then failed on a **fixture input error**: it supplied `Garage.setLevel(.035)` expecting the dark colour `.035`, but the real mapping is `.035 + .965 * level`. [Original log](browser.txt), [unchanged raw result with passed:false](result.json).
- The runner was corrected to pass level `0`. Only lighting/setup/error gates were repeated with the same command plus `--lighting-only`: 4/4 pass, exit 0. The nine green view checks were retained rather than rerun. All six product/shared source hashes match the original capture phase. [Correction log](lighting-correction.txt), [raw correction](lighting-correction.json).

Both phases used Chromium 156.0.8078.4, SwiftShader, 960×600 viewport / 960×540 canvas, and reported no page or GLSL errors. The wrapper acquired/released its browser slot and reported that this environment has no systemd user memory scope. The fixture builds actual `carGeometry`, `carFarGeometry`, `addCarLod`, and Garage (11 rack rows / 4 storage rows); it isolates one real rack row and its existing spokes. It calls actual Garage.update. It does not load the whole apartment, simulate a physical phone, or make frame-time/whole-world performance claims. Phone here means the real 30 m car policy.

## Measured render submissions

Counts include the same plain floor in control/fade, plus the garage's unchanged shared spoke mesh. Car near geometry is 5,136 triangles across its four layers; far geometry is 128. Selected garage row radius is 2.538039785 m, so its old boundary is 12.538039785 m. At each position the native-material hard control uses the same camera and geometry as the fade view.

| View | Distance m | Hard calls / triangles | Fade calls / triangles |
| --- | ---: | ---: | ---: |
| Desktop near | 12 | 5 / 5,138 | 5 / 5,138 |
| Desktop mid | 60 | 2 / 130 | 6 / 5,266 |
| Desktop far | 75 | 2 / 130 | 2 / 130 |
| Phone near | 10 | 5 / 5,138 | 5 / 5,138 |
| Phone mid | 30 | 2 / 130 | 6 / 5,266 |
| Phone far | 45 | 2 / 130 | 2 / 130 |
| Garage near | 8.538 | 3 / 9,838 | 3 / 9,838 |
| Garage mid | 12.538 | 3 / 4,706 | 4 / 14,366 |
| Garage far | 16.538 | 3 / 4,706 | 3 / 4,706 |

All six ordinary views have unchanged cost. Mid-zone cars cost one extra far call / 128 triangles relative to near, or four extra near calls / 5,136 triangles relative to far. The garage row adds one near or far call only through its zone. No claim of zero transition overhead is made.

## Inspected result images

All thirteen saved images were directly inspected. Car mid images show complementary dither; far images retain the deliberately coarse historical silhouette. The garage frames retain the actual stalls, bicycles and spokes. Normal-distance captures are the nine measured views:

| Policy | Near | Mid | Far |
| --- | --- | --- | --- |
| Desktop | [near](desktop-near.png) | [mid](desktop-mid.png) | [far](desktop-far.png) |
| Phone | [near](phone-near.png) | [mid](phone-mid.png) | [far](phone-far.png) |
| Garage | [near](garage-near.png) | [mid](garage-mid.png) | [far](garage-far.png) |

The lighting-correction turn also saved explicitly labelled diagnostic zoom supplements to make distant dither readable. These are not the measured normal-distance views: [desktop mid](desktop-mid-zoom.png), [desktop far](desktop-far-zoom.png), [phone mid](phone-mid-zoom.png), [phone far](phone-far-zoom.png).

## Public downstream

The conductor checked the public project: it contains no viewlod.js/streetlife.js or matching car/bicycle LOD implementation, and its garage keeps fixed empty racks only. This change is not applicable there; introducing excluded movable contents is outside this delivery. No public port issue is needed.
