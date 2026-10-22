# #1508 — first-focus program warm-up, 2026-10-22

Base revision: `5c3cd042477cd5c2352d3b1f5eb8411b535623aa`.
The initial #1506 trace tied 7/8 intervals above250ms to first-use GL program waits.
Draw-level instrumentation then identified all18 late programs as interaction-brightness
variants. The normal warm-up omitted the private material produced by first focus.
This is one cause fix; no shadow/culling/save/quality policy or geometry is changed.

`InteractionOutline.warmCompiler` supplies compile-only focus representatives to the
existing WarmUp screen/mirror readiness waits and sliced compile budget. Original
object compilation precedes its extra, giving an exact geometry-dependent base key.
Already-equivalent material families reuse a representative. Targets arriving during
compilation are discovered too. No renderable, pass or texture is added. Existing
highlight GLSL, source appearance and source-driven disposal are unchanged.

## Matched native-GPU evidence

Windows Chrome155.0.8059.40, Intel UHD630 / driver31.0.101.2141, ANGLE Direct3D11;
WebGL/GPU compositing enabled. Same1363×849 viewport/render size, DPR1, pinned quality3,
lowMemoryfalse/testnull, July noon clear/frozen life scenario, cloud disabled. New isolated
Chrome test profile, no personal saved home, same scene with no cat. Both cases run
with focus emulation because the host otherwise marks the test window hidden. Both
have Chrome Performance +1ms sampling enabled; no throttling or artificial JS stalls.
Before uses the three frozen source modules; after uses the candidate, in the same
browser. Run order is before→after, not a cold driver-cache or randomized experiment.
Program counts provide the direct first-focus comparison; timings also include profiler
and driver/cache behavior. This is not the user's stronger GPU or ordinary manual play.

The scripted route is four5second360° turns (kitchen/hall/living/patio), teleports between
poses and ordinary fridge/front-door toggle APIs. It is not the manual walking/E route.
All recorded intervals are active; no background/menu/startup/warm-up samples are mixed in.

| Metric | Before lap1 | After lap1 | Before lap2 | After lap2 |
|---|---:|---:|---:|---:|
| Duration, s |20.003|20.022|19.996|20.041|
| Samples |574|651|621|656|
| Median, ms |29.6|28.7|30.7|29.9|
| p95, ms |48.5|47.1|48.2|47.1|
| p99, ms |104.8|74.6|56.4|53.5|
| Max, ms |1262.7|139.3|380.7|92.0|
| >50ms |24|24|25|23|
| >100ms |7|4|1|0|
| >250ms |3|0|1|0|
| New programs, all focus variants |17|1|1|0|

Initial warm program residency increases311→412. This is a real startup/code-cache cost,
not free optimization or a measured GPU-memory/FPS improvement. The variant programs
are prepared behind startup instead of first focus. No startup-duration improvement is
claimed. Draw/geometry/texture budgets and graphical level are unchanged.

The remaining late program belongs to a drawing; its recorded frame is111.6ms in the
final candidate. Asynchronously loaded poster geometry or its final material key can
arrive after the relevant compile stage. This narrower remaining case is tracked in
[#1514](https://github.com/solwation/lunden-3d-apartment/issues/1514), with a bounded
startup/readiness requirement. #1506 and its stronger-GPU evidence request remain open.

## Risk-based checks and rejected fixtures

- `tools/focuswarmtest.html`:9/9PASS. Very first screen/mirror focus, hidden/late-loaded/
  double-sided/instanced objects, no scene/source-material changes, independent live
  source appearance, source disposal and sliced compileObjects.
- Existing `tools/focusperftest.html`:6/6PASS (30focus/clear switches, shared source,
  instance-uniform reuse, source disposal and exact original restoration).
- Native-GPU route above: both final laps CLI0, no recorded route errors, actual normal
  app images opened/inspected. These are visual checks, not pixel-identity claims across
  independently animated scene loads. No A/B/C/L architecture is modified.

The first component fixture incorrectly disposed the focused clone and expected a
shared GPU program to disappear. It failed. The corrected fixture disposes the actual
source and checks the disposal event/new focus material; it does not require eviction
of a program still used by a different source. The product disposal implementation was
not changed. The first production candidate still had a389.3ms late-drawing frame;
its separate raw files remain, not counted as final verification. The final adds
late-target discovery during compile and retains the explicitly tracked #1514 gap.

Initial interaction-fixture attempts aimed at an assumed hall coordinate that did not
focus the actual front door, then sent E in touch mode (the native handler requires
pointer lock). A subsequent native Windows pointer-lock attempt was refused in the
host window. These are rejected fixtures, not passed keyboard evidence or demonstrated
product regressions. The final fixture uses the actual opening center and real visible
touch action; it separately exercises the lowmem/sliced warm-up. Exact result is linked
on the issue. No native Windows pointer-lock/E or physical-phone claim is made.

## Artifacts and downstream

Raw sources/scripts, rejected and final JSON, CPU profiles, traces and normal images
are preserved locally in `/home/devcontainers/.local/state/lunden-shaders-1508-20261022/`.
Chrome traces/resource names and private scene pictures are not uploaded publicly.
`before-*`, `after-*` (first candidate), and `after-final-*` stay distinct.

Public checkout `solwation/kvarteret-lunden` at `0d16b35f709b21b9a4df513c70718367bbfc172f`
was reviewed with AGENTS.md/docs/upstream.md. It has no WarmUp, InteractionOutline or
interaction-brightness shader variants; its fixed opening fronts already use the
existing frontFocus uniform. There is no applicable code transfer, and no private
interaction/drawing/game content is introduced there.

Final actual interaction/sliced check: Windows native Chrome, explicit lowmem844×390,
DPR1/quality3/testnull, warmdone/slicedtrue. The visible normal desktop touch action
opened the real entrance; after a fresh lowmem scene's full startup, its actual visible
touch action also opened that entrance. Mobile image opened/inspected. The inherited
arm cover from the refused mouse-lock attempt was handled with its real arm-touch
button before desktop touch; no product input code was changed. `mobile-smoke.json`
records400programs,1043compileSlice ticks (including readiness-wait no-ops), max9new
programs in a call and94.1ms compile CPU time at worst. Existing program/time limits
are checked after a batch and are soft bounds, not a claim that every call is≤4programs
or20ms. This does not prove physical-phone startup duration, memory headroom or FPS.
