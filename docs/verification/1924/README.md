# Gull form and motion — #1924

Baseline `ad9eab1160e095847280a52c585d221a51b75cf1`, before art changes.
The actual production Birds shader submits one call/30 triangles for ten birds,
one/15 for low-memory five, with 492/372 retained attribute bytes respectively
(geometry and instance TypedArray views deduplicated by identity). No textures.
`baseline.json` binds the raw counts, inputs and hashes to the captured source.
Seven component views use the same seeded flock, fixed time, 800×600/DPR1,
70° FOV, daylight and sky background. A real-pixel blank-frame comparison rejects
empty captures. No full World or physical hardware timing is claimed.

## Budget locked before art changes

At most two submitted flock calls for a mixed LOD, far <=12 triangles/bird and
near <=400 triangles/bird; no overlap or dropped instance at the LOD boundary.
All retained unique CPU attribute/index/seed buffers for ten birds <=160 KiB,
no texture, light, physics, shadow or per-frame object/geometry allocation.
Preserve exact deterministic seeds/circle paths and all existing visibility gates.
A bounded allocation-free classification of at most the configured flock size
(default ten/five) is allowed; the shader remains motion authority. Hidden flocks
skip classification. Root agreed this tradeoff before implementation.

Baseline update medians round to zero; p95 about0.001 ms per update in100-call
batches. Render/gl.finish medians about0.1 ms, p95 0.1–0.2 ms, close to timer
resolution. Proposed absolute local update guard median <=0.05 ms/p95 <=0.1 ms;
render p95 <=1 ms for this tiny component. The guards are engineering budgets,
not predicted native GPU speed or phone FPS. If exceeded, reassess before detail.
