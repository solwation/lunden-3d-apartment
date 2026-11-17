# #2064 — eye surface detail

Source: `37879cecac1c6518e9ece83f2441af710707f04c`, baseline `b78e0b64`.
This is original-only avatar content; it is not transferred to the public project.

## Result and checks

The sclera darkens toward its corners with a warm tint; the medial corner has a small pink
caruncle. The iris has a darker limbus and fine radial fibres, filtered by pixel footprint.
Its geometric relief is reduced to 30% and the wet highlight uses a reconstructed cornea
normal over that flatter coloured surface. This is a virtual cornea: no extra transparent
mesh, refraction pass or downloaded texture. Eye socket depth is a separate change (#2063).

`node --test tools/avatareyestest.mjs tools/avatarlidstest.mjs`: 10/10 passed
([raw output](node-tests.txt)). The existing pupil adaptation, lid geometry and blink
contracts pass. The scoped browser run tests all eight `EYES` colours, pupil response to
bright/dark light (0.7 / 1.4412), front daylight/backlight for three skin tones, 45° and
profile, a shut blink and sideways gaze. Zero page/shader/console errors; every captured
frame is one draw call. [Raw browser data](eyes.json), [source manifest](source.json).

The first capture setup lacked baseline GLB files and produced three 404s. Its baseline
was corrected to serve the unchanged models and the same capture completed successfully.
The successful outputs survived the daemon restart and were inspected rather than repeated.

[Matched comparison](ogon-fore-efter.png): first two rows baseline, last two rows candidate.
The pink inner corner, warm edge and iris fibres are visible, and the shut blink has no
white leak. This comparison is a component close-up of the production Avatar recipe.

## Budget and measured cost

| Fixed style-0 figure | Baseline | Candidate |
| --- | ---: | ---: |
| Triangles | 15,660 | 15,660 |
| Head-tagged triangles | 12,140 | 12,140 |
| Skeleton bones | 15 | 15 |
| Draw calls | 1 | 1 |
| Render + `gl.finish()`, median | 0.40 ms | 0.30 ms |
| Render + `gl.finish()`, p90 | 2.70 ms | 0.70 ms |

Thirty samples after ten warmup frames, identical fixture camera, lighting, look, 640×400
canvas, Chromium headless/SwiftShader. The timing difference is below useful software-renderer
precision and is not evidence of a speedup or physical-device frame rate. The shader adds one
`vec3` varying plus eye-only colour/fibre arithmetic and a corneal normal; the radial fibres
add `atan`, two `sin` and derivatives only on iris fragments. There are no new vertex
attributes, lights, textures, materials, passes, persistent fields or network fields.

Reproduce with the existing current server at 8172 and a baseline server at 8182:

```sh
PLAYWRIGHT_MODULE=/home/olof/github-dashboard/node_modules/playwright \
  tools/browsertest.sh node tools/avatareye2064browser.cjs \
  http://localhost:8172 docs/verification/2064 http://localhost:8182
```

The baseline directory must contain baseline `src/` and `tools/avatareyes.html` plus the
unchanged `models/` assets. The capture tool asserts geometry/bone equality, one draw,
pupil response and no browser errors. It does not claim full-apartment, mobile or native-GPU
performance testing.
