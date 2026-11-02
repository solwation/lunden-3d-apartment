# #1807: school-yard play corners against Google 3D

`<view>_google-fore-efter.jpg`: left Google 3D reference, middle game before, right game after (same camera, the `used at` values of the
[reference README](../../references/google-3d-2026-11-02/README.md)): `05_norra_skolor_h000/h090/h270`, `06_kunskapsskolan_h270`.
`narbild_lekplats_fore-efter.jpg` is a ground-level view (121, -96, yaw -45) of Freinet's new play corner (sand, teal pad, swing, climbing
frame, house, green fence, bench); `ovanifran_*` are top views (140 m) of the Freinet strip and the Framtiden and Montessori yards.

Changes (all *guess*, `SITE.east.access[*].yard.detail` in `src/config.js`, drawn by `src/schoolyard.js` into the existing `access` batch;
phone mode skips them): play corners at Freinet, Framtiden, Höjebroskolan and Montessori, a lawn at Framtiden and Höjebro, benches, 1.2 m green fences.
Draw calls unchanged (desktop 372 -> 372 at 05_h090, 428 -> 428 at h270, 390 -> 390 at 06_h270; phone 307 -> 307 with 748 976 triangles both).
Campus triangles +1 953 (84 163 -> 86 116 at the first positions; 85 993 at the final ones). Not done: extra tree groups.
Limitation: the 160 m views show the corners as small coloured patches; the Google views do not resolve the real equipment, so positions are read from top views.
