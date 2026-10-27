# Basketball visibility (#1655)

Source: `4f3bc36a` plus the scoped basketball/detail-culler patch committed with this evidence.
Chromium 1248, SwiftShader, 1280×800, DPR 1, normal production quality 0 (no test mode),
noon in July, clear weather. Culler quality scale: 0.6. These are software-rendering
counts, not native device performance measurements.

- `three-point.png`: actual shot from 6.75 m, just past its 4.539 m apex above the hoop.
- `far-court.png`: actual shot from 8.4 m, descending at 3.916 m above the 3.05 m rim.
  At this exact point the original 7.667 m distance cutoff puts the ball on hidden
  layer 7; the new opt-in leaves it on the camera's layer 0.
- Across both sampled flight segments the new ball layer stays visible. Normal quality 3
  can already show these distances with the old policy; the reproduced failure is at low quality.
- Matched street view, ball returned home: old/new both **386 calls, 774223 triangles**,
  with the ball still wall-occluded on layer 7. No captured page errors.
- `node --test tools/basketdistanceculltest.mjs`: 1/1 passed. Distance opt-in at four
  quality scales, ordinary small details still hidden and moving ball still hidden by walls.
- `result.json` records positions, per-step layer masks, old cutoff, quality scale and counts.

Boule is an InstancedMesh and already outside DetailCuller. Paper balls are created
later than the culler's one-time collection. No independent defect was found in that inspection.
House geometry is unchanged; A/B/C/L equivalence checks do not apply. No public port:
this flag's only consumer is basketball gameplay, excluded from kvarteret-lunden.

Verification restart reasons: server/agent interruption; the initial quality-3 apex
assertion was too strong, because that shot is within its original cutoff. The final
check follows the real trajectory at low quality and reproduces disappearance at the far end.
