# Linux shader-error classification — #2496

A real UE5.8.4 run returned Native/runner/outer0/0/0 although21 preserved shader-diagnostic lines reported a material compilation failure and fallback rendering. Its five fallback pictures were rejected. This change makes the supervisor reject those errors while retaining the actual native exit0 in result.json and recording logErrors.

Three actual child-process fixtures reproduced the false success before the fix. Afterward, all16 runner tests passed in2.279s, including rendered-Python/Null-Python/Null-Automation passing-report cases, harmless cache warnings, detached-worker cleanup, external cancellation and service cleanup. All21 original diagnostic lines are rejected by the new classifier. No full Unreal scene, browser or asset rebuild was needed for this process-supervision change.

This is nonvisual tooling verification: real child-process results and diagnostics are the reviewable outcome. No app image, player changelog or public-web transfer applies. The independent HLSL source typo remains part of #2421 and is not this fix.
