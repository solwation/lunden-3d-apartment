# Three.js investigation and selective backport — #1871

Source baseline: `97f9b6c91f2ec7839860a8791cfa09168137ad00`.
Three.js candidate: r187 / npm 0.187.0, released 2026-10-30, tag commit
`7e89746a687bb88271253698fa108b1dd59825d0`. Investigation date: 2026-11-05.

## Decision

Keep the production renderer pinned to r170/WebGL. Backport only r187's
EdgesGeometry Map lookup change into `src/vendor/three/EdgesGeometry.js`, with
its MIT license; imports are the only adaptation from the released source.
`architectureedges.js` uses it when constructing fixed architecture's edges.
The render loop, geometry, colours, culling, collision and pick targets do not change.
The avatar outline's separate EdgesGeometry call remains on the pinned library.
Remove the helper when a verified library upgrade includes the optimization.

[Meshlet implementation follow-up #1872](https://github.com/solwation/lunden-3d-apartment/issues/1872).
[Public transfer #254](https://github.com/solwation/kvarteret-lunden/issues/254).

## Primary-source findings

[Drawing-pipeline PR #35191](https://github.com/mrdoob/three.js/pull/35191), merged
2026-10-29, adds GPU cluster culling and screen-error LOD to WebGPURenderer.
A mesh is split into 64-triangle clusters. Hidden clusters can be skipped and
smaller distant detail simplified. WebGL falls back to ordinary drawing;
assigning this pipeline to our WebGLRenderer would not enable it. Demo speedups
are workload-specific: an already culled/LOD-managed scene can benefit much less.

[Released r187 pipeline source](https://github.com/mrdoob/three.js/blob/7e89746a687bb88271253698fa108b1dd59825d0/examples/jsm/pipelines/MeshletDrawingPipeline.js)
rejects transparent/transmissive, vertex-coloured, non-FrontSide, flat-shaded,
polygon-offset and several other material configurations. Our merged site geometry
frequently uses those features. Fallback does not translate our GLSL customizations.

Local migration contracts needing deliberate work: `standardinterior.js` animates
batched fronts through GLSL; `lampwash.js`, `groundao.js`, `foliage.js`,
`plantwind.js` and `architectureedges.js` patch shaders; `reflections.js` wraps
WebGL Reflector and deliberately uses the r170 screen-output program path on
phones; `interactionoutline.js` reads WebGL program internals; `lowmemory.js`
releases CPU attribute arrays after upload, before later meshlet preparation could
read them. Existing `detail.js`, site batching, campus/car LOD and occlusion
already remove substantial work. A full renderer change is not a dependency bump.

[Migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
identifies changed shadow filtering, blending, PBR appearance, matrix update
semantics, PMREM and render-target viewport handling across r170–r187.
[Release notes](https://github.com/mrdoob/three.js/releases/tag/r187) also include
resource-disposal, BatchedMesh and normalized-attribute improvements. Our own
batching is not Three's BatchedMesh. [Normalized attribute access #34992](https://github.com/mrdoob/three.js/pull/34992)
may reduce CPU accessor cost, but it is not evidence of a game FPS improvement.

[EdgesGeometry #34805](https://github.com/mrdoob/three.js/pull/34805) is suitable
for selective import: Map lookup replaces object-property lookup while retaining
hash precision, angle threshold, handling of shared edges and output order.

## Verification and limits

1. `node tools/edgesbackporttest.mjs`: 30 byte-exact comparisons with r170,
   indexed/non-indexed boxes, planes, spheres, cylinders, bevelled extrusion,
   duplicate/degenerate triangles, thresholds 1/30/90, clone and parameters.
2. `tools/browsertest.sh node tools/edgesbackportbrowser.cjs http://127.0.0.1:8171 docs/verification/1871`:
   real application build; every call to the architectural edge constructor
   computed both versions, alternated timing order, asserted every Float32 value
   with Object.is and retained the backport. 3,848 calls / 706,104 components /
   zero mismatches. Construction includes the actual shared architectural callers;
   no building dimensions or A/B/C/L layout variants changed.
3. Diff/source/license review, including the exact r187 import-only adaptation.

First paired run: r170 constructors total 808.9 ms, backport 569.7 ms (29.6% less).
This is one instrumented Chromium/SwiftShader build, not a total loading-time,
FPS, GPU, phone or Surface performance measurement. The capture retake also gave
zero mismatches: 488.7 → 372.9 ms (23.7% less); the absolute times vary. Instrumentation constructs
both versions, so total startup time is deliberately unsuitable for comparison.
The 404 for `data/todo.json` is the unpublished local generated issue list, present
with both library versions; no JavaScript or shader exception occurred.

The full r187 WebGL probe in `r187-probe/` successfully started and rendered an
exterior view, but warned that PCFSoftShadowMap was replaced by PCFShadowMap.
It did not exercise the WebGPU pipeline, mirrors, all materials or mobile memory.
`navigator.gpu` only indicates API presence. No performance conclusion follows.
Its script accepts REPO THREE_PACKAGE OUT and uses the same browser wrapper.

The images show the delivered r170 renderer with the selective edge backport.
The first attempted interior capture was blank after a viewport/pose transition;
that capture was rejected and retaken. The exact constructor comparison remained
valid. Images are representative appearance checks, not a pixel-diff benchmark.
