# Architectural seam validation (#505)

The same camera positions, noon light, Chromium/SwiftShader and 640 × 400 viewport
were used before and after the change:

| View | Camera | Looks at | Before | After |
| --- | --- | --- | --- | --- |
| Kitchen/hall | 4.6, 1.65, 3.2 | 3, 1.5, 5.8 | [before](lunden-505-before-hall.png) | [after](lunden-505-after-hall.png) |
| Upstairs hall | 2.35, 4.85, 6.4 | 1.5, 4.85, 4 | [before](lunden-505-before-upper.png) | [after](lunden-505-after-upper.png) |
| Stair core | −17.2, 1.6, 8.3 | −18, 1.5, 6.1 | [before](lunden-505-before-core.png) | [after](lunden-505-after-core.png) |

The false vertical extensions above door jambs disappear; door trim, room corners,
stair treads, rails and the core's window opening remain readable. Kitchen/hall and
upstairs views cover close oblique wall views; the core view covers a longer sightline.

`tools/architecturetest.html` checks touching coplanar blocks, a partial jamb under a
lintel, concave corners, projecting steps, open baked wall panels, rotated solids,
separate animated anchors, the actual apartment/lift batches and real WebGL depth
occlusion. The filter works once at construction; it does not add frame work or draw
calls. A construction-only triangle tree reduced the measured edge generation from
about 36 seconds to 1.15 seconds on this test machine (core + apartment).

The same views were also checked in a 740 × 360 mobile layout (`?phone`):
[hall](lunden-505-mobile-hall.png), [upstairs](lunden-505-mobile-upper.png),
[core](lunden-505-mobile-core.png).
