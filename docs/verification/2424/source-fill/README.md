# Actual private SourceFill CPU check (#2424)

The unsaved scratch Blueprint/MPC passed all three contexts, including immediate
Flash reset, at absolute tolerance1e-5. All five scalar and five RGB outputs matched
the exported source contract. Its actual DirectionalLight readbacks were:

| Context | Intensity (lux) |
| --- | ---: |
| Clear day | 2.333333254 |
| Mixed weather/context + Flash | 0.512968779 |
| Same context, Flash reset | 0.512968779 |

The factor is the existing Native Sun conversion, actual SunLux20 / SunClear3.
Source RGB and Web-to-Native light direction matched. Atmosphere, shadow,
volumetric-shadow, cloud-shadow and atmosphere-shadow flags were all false;
volumetric scattering was0. The scratch actor was destroyed.

Actual NullRHI Native/runner/tool exits were0/0/0, with97.96s Native and98.023s
outer duration, no log errors, timeout or signal. The independent postflight found
all250 authored packages byte-exact/read-only,5,227 Generated files,12 Import files,
188 dependencies and both source revisions unchanged. `cpu-result.json`,
`native-result.json`, `outer-result.json` and `postflight.json` preserve actual results.
No assets were saved. No screenshot applies to this CPU-only, unbound scratch test;
no shader/GPU, surface-lighting or whole-scene acceptance is claimed.

The private candidate is35eacc6d47aa07525b58c83e538c0750152f17c7, based on
[the earlier79de context preparation](../context-propagation/README.md).
`candidate-fill.patch` is ONLY the incremental35eacc-over79de source/test diff.
The canonical hookup remains unpublished: even OFF, a lighting-builder source
change invalidates its saved signature and needs a real coordinated Lighting build.
`smoke.py` and `prepare.py` are the exact own helper files used; large private
configuration/file baselines and Engine source are intentionally excluded.

The explicit Fill option sets Enabled1 only in its own scratch collection.
Production global policy remains OFF and full #2424 remains open. Actual context
producers, complete material/window/curtain integration, old-fill retirement and
scene acceptance remain. No product promotion, player changelog or downstream
transfer applies to this original-only Unreal technical evidence.
