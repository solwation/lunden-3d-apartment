# Historical hail/storm source candidate (#2439)

This records preparation before the actual Native runs. The later completed
build/tests/images are in [the delivery record](README.md); pending/unpublished
statements below describe this earlier checkpoint. The sky-colour domain limit
remains applicable.

This is an unpublished source checkpoint, not native acceptance or a finished issue.
No engine, browser, export, authored asset or running Linux cook was changed here.

The existing `BP_LundenSky` manual weather controls gain mutually exclusive `Hail`
and `Storm` states. Hail carries the existing rain amount and the source hail audio
mix; storm carries rain and the existing audio strike clock. Date-driven simulated
or real weather remains the separate after-R1 scope (#2331). This candidate does
not introduce a second strike clock or claim a new hail-particle implementation.

`BPC_LundenAudio.ReadSky` reads both states. Its existing `Strike` first calls the
optional `FlashSky` function, using that strike's actual `ThunderNear` to set
`FlashK = 0.35 + 0.65 * near` and `FlashT = 0`. The call precedes the audio-device
validity branch, so `-nosound` cannot suppress the flash. A missing sky or
`UseSky=False` returns from that optional function without cancelling thunder.
The existing distance/sound-speed delay and random strike intervals remain intact.

The sky ages the flash in real `DeltaSeconds`, independently of calendar
`TimeScale`, and evaluates the unchanged source `Weather.update` envelope. Its
existing native ambient/hemisphere calibration receives the source flash strength,
and the precipitation material receives the same `Flash` through the weather MPC.
`site.sourceAmbient.flashLight` already exists in the real export, so this change
requires no new export format or guessed flash-intensity constant.

## Sky units and explicit partial boundary

The first source checkpoint added sky flash after the Neutral inverse. That was
wrong: `skyFragmentShader` adds `(0.75, 0.78, 0.95) * uFlash` to its **raw sky**
after cloud/celestial composition, before cloud-deck/horizon blending and
`colorspace_fragment`; it has no `tonemapping_fragment`. The correction passes
Flash into the existing day/night source methods, adds it to that raw target
before the horizon fade, then performs the complete existing Neutral inverse.
The clear daytime haze scatter is also damped by the actual `hazeState` factor
`1 - min(1, flash * 0.5)`. Exposure cancellation remains at the end of the inverse;
there is no new exposure, RGB gain, clamp or second clock.

This remains a **functional candidate, not a claim of exact sky-colour parity**.
The existing pre-tonemap route cannot reproduce all source targets: a raw target
with peak >= 1 has no finite Neutral inverse, and inverse desaturation can require
negative scene colour. Those cases explicitly retain the old native sky; a strong
source flash can therefore be absent there. The corrected arithmetic does not
solve that boundary. Existing twilight/sun-disc/high-flight transition coverage,
cloud-deck whitening and old exports without a source palette also retain their
old paths. The original acceptance asks for the hail sound and simultaneous flash/thunder,
plus green test_audio/test_lighting; it does not require a new all-weather RGB gate.
The inverse fallback loses the extra sky colour, not the entire light flash:
legacy Ambient and SkyLight still receive the same Flash at its peak. Exact sky
colour outside this domain remains a disclosed limitation, subject to real visual
review of the functional flash rather than assumed failure of that acceptance.

## Legacy light path and native checks

`source-ambient-policy.json` is OFF. That disables the experimental injected
SourceAmbient policy; `build_lighting` does not branch on it and still builds the
legacy SkyLight and Ambient cubemap. `linux-low.ini` does not disable either path.
These source facts do not prove rendered brightness: the actual component reads
and the two on/off originals below must establish that in Native.

The ambient normalization now reserves the maximum source flash contribution
`flashLight * (0.4 + HemiShare * max(1, HemiNight))`. This keeps the post-process
blend weight within 0..1 at the peak. Cubemap intensity times weight remains the
same requested fill at zero flash; no material colour or new light gain changes.

Bounded actual verification, Root owns all launches/builds/locks:

1. One normal canonical sync, including the real `build_lighting.py` and
   `build_audio.py` builders, then their normal `--check` paths. No new web export.
   Lighting may save its existing eight authored outputs; Audio's normal builder
   attempts its existing 23 assets (including BPC_LundenAudio), even though the
   source audio graphs other than that component are unchanged. Actual changed
   bytes and all other authored packages must be recorded, not presumed.
2. Fresh NullRHI automation with the two canonical files copied unchanged from
   this source to Content/Python: `run-linux.py --engine-root
   /mnt/d/UnrealEngine/5.8.4 --data-dir /mnt/d/LundenLinux --timeout 600 tests
   'Editor.Python.Lunden.test_lighting+Editor.Python.Lunden.test_audio'`.
   AutomationCommandline.cpp:135 parses `+` into test filters in exact 5.8.4.
   Existing assertions remain; the added cases read actual Hail/Storm→audio,
   Strike→FlashT/FlashK and distance/343 delay, plus actual Ambient intensity×weight
   and SkyLight intensity at peak/decay/end at both day and full night. No sound
   device means parameter/MetaSound proof, not an audible listening test.
3. One normal rendered batch: the same canonical outdoor patio camera at
   November16 18:15, lamps unchanged, storm/rain on, first FlashT=9 then FlashT=0
   with the same FlashK=0.675. Save two raw originals and actual clock/weather/
   Flash/component metadata; inspect a visible light blink and preserved foreground.
   This is functional visual acceptance, not an invented source RGB threshold.

## Source checks

- `test_sky_weather_source.py` now has three passing tests. It executes the actual web flash fragment and compares
  36 strength/boundary cases with the arithmetic nodes emitted by the real `Expr`.
- Four pre-change lighting fixtures preserve every existing output exactly with
  zero flash. Fixtures retain their source commit/hash and require no Git history
  on shallow CI checkouts. They are arithmetic examples, not scene calibration.
- The extended day-sky test uses actual DayCycle uniforms and the installed
  Three 0.170.0 Neutral shader body: 4,364 ordinary roundtrips plus 7,787
  day/full-night flash roundtrips; 9,894 flash targets are explicitly rejected by
  the inverse domain rather than silently clipped. These synthetic cases are not
  a frequency estimate or a rendered weather acceptance result. The fixture
  resets the hour after pausing because constructor wall time can advance it.
- The unchanged night test passes 6,615 dim-sky and 143 celestial roundtrips;
  method wiring/order checks pass. GPU/HLSL compilation was not run.
- The real offline Lighting signature changes when the exported flash strength
  changes, and ignores an unrelated spawn change. The complete lamp factory,
  source lamp rows and stair mask binding functions are AST-identical to the base.
- Exact 5.8.4 `KismetMathLibrary.h` declares `Not_PreBool(bool)` at line 217 and
  `Exp(double)` at line 642. Python syntax and diff checks pass.

Native `test_lighting` adds the state transitions and actual envelope/MPC readback.
`test_audio` preserves its independent old cases and adds one actual sky fixture
for ReadSky plus immediate flash before the existing delayed thunder. These native
assertions have **not** been executed for this candidate.

## Remaining gates

Root must review/build the actual sky/MPC/precipitation and audio component, take
the relevant LFS locks only at that time, and run real `test_lighting` and
`test_audio`. Lighting's normal saved signature must match the new Python source.
Sound graphs/parameters are unchanged; any reuse of their saved assets must be
bound to actual unchanged source and bytes, not assumed from a component rebuild.

A real rendered flash capture and whole-image review remain necessary. In
particular, the inverse-domain/coverage boundary above remains unsolved, and
transparent foreground and the existing native ambient calibration are **not**
proved by the arithmetic tests. No pixel
match, GPU compilation, hail-particle parity or complete weather delivery is
claimed. Existing normal Sun/lamp/material regressions must remain green.

This is original-only Unreal work. No player changelog or public downstream
transfer is appropriate before real integration/acceptance.
