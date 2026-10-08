# Phone-lag regression (#558)

Reproduced in real Chromium/WebGL with a counter around context.createProgram. Before: 30 new GPU programs for 30 focus/clear switches, plus 30 for instanced figures. After: zero in both warmed cases. First visits to different figure indices now share a uniform-based shader.

focusperftest also verifies shared-source material reuse, original restoration and GPU disposal when the source is disposed. All six checks pass. interactionoutlinetest passes all 34 actual target/material/pixel checks, including lamp rescans, physical materials, animation, occlusion and changing selected figure. No new meshes, lights or render passes; no geometry/input change.

Suspected regression introduced by #531 (6c6f3e5), which released the last brightness shader on every clear. The measured shader churn is fixed; no physical-phone FPS measurement was available.
