# Watering verification (#553)

Chromium/SwiftShader, real touch start and action controls. WATERING dimensions, capacity, 120 ml dose and foliage dryness are game assumptions.

- wateringtest: all 27 checks pass. Empty/full can, actual tap and window-plant touch, interrupted preview, one dose after double press, independent soil/foliage, moved pot and return to merged home, artificial plant, saved reload and actual reset.
- life2test only=382: all existing glass/milk rules pass.
- perfcount: compared with #552, kitchen 329 → 330 draws, identical triangles; every other recorded spot unchanged. One extra pothos soil material draw, no new lights or render passes.
- planttest: pre-existing `.where()` error on both b084464 and this change, tracked separately as #559; no claim of a complete passing legacy planttest.

[dry.png](dry.png) and [watered.png](watered.png) show the same existing kitchen-window pot from the same camera. Watered leaf heights and soil vertex colours are checked quantitatively in wateringtest as well.
