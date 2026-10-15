# Hob and cooker hood (#1043)

The kitchen now has a thin bevel around the ceramic glass, circular zone outlines
with centre crosses, a printed touch slider/power symbol and an upright live power
digit. The hood uses brushed steel, a dark glass control strip, two woven-metal
filter panels and two recessed LED diffusers. Filter wires are a shared procedural
texture; shell, filters and diffusers are each merged by material. Decorative
dimensions in `KITCHEN` are visual guesses, not manufacturer measurements.

| View | Before | After | Actual render calls / triangles |
|---|---|---|---|
| Kitchen | [before](before-kitchen.png) | [after](after-kitchen.png) | 81 / 8832 → 84 / 9052 |
| Glass | [before](before-hob.png) | [after](after-hob.png) | 61 / 7508 → 64 / 7728 |
| Hood underside | [before](before-hood.png) | [after](after-hood.png) | 32 / 5222 → 35 / 5442 |

[Live power display and preserved heat effect](after-hob-on.png).

These are actual production `buildInterior` kitchen components from the plan,
with production `Lights` and `DayCycle` at June noon, ordinary room/bench/hood
lights on, main's hemisphere/ambient/fill/sun settings, neutral tone mapping and
pixel ratio 1. Component room maps and plain framing walls supply context. The
apartment, neighbouring houses, World, physical phone and frame-rate performance
were not tested. No extra product lights or environment map were added. The
images were opened and inspected. Shader program count remained 8 in all views;
the rendered component adds 3 calls and 220 triangles. Whole component geometry
is 62640 → 62860 triangles; Hob alone is 64 → 80, Hood alone 60 → 288.

`tools/kitchenrealismtest.cjs GAME OUT` runs the bounded component and captures
the views; `--no-render` tests native interactions without WebGL. `--baseline`
routes the four saved pre-change builder/config sources from `BASELINE_DIR`.
Source hashes, raw results and limitations are in the two result JSON files and
`source-sha256.txt`. Final candidate passed 18 checks, actual exit 0, errors[].
Checks exercise actual Hob on/off/glow/display and Web Audio hum, actual Pan
take/place/lift/return, unchanged zone/intake anchors, Hood Web Audio fan and
LED, smoke draw inclusion/exclusion, independent lamp control and native ray
ownership for hob and lamp. Cooking times, food owners, placement methods,
smoke routing and audio methods were not changed.

The original full-World `tools/cooktest.html` was not run for this visual change.
Two earlier component fixture failures remain in `/tmp/lunden-reports-1043`:
the first incorrectly required zero pan resting lift, while cooktest's existing
placement contract allows 3 cm; the second omitted world-matrix propagation
after returning the pan before casting a ray. Only those fixture assumptions
were corrected. Raw failed outputs and producers are retained, not counted as
passing tests. Earlier candidate images also remain there; final `final2`
includes the inspected upright power symbol/digit and fine filter weave.
