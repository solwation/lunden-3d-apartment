# #1797: eastern quarter (Kunskapsskolan, HepCat, Realgymnasiet 20) against Google 3D

`<view>_fore-efter.png`: game before (left) and after (right), same camera. Camera values are the `used at` values of
[the Google 3D README](../../references/google-3d-2026-11-02/README.md) (`06_kunskapsskolan_h000/h090/h180/h270`,
`04_nybygge_h000/h090`); compare with `docs/references/google-3d-2026-11-02/bilder/<view>.jpg`. Same capture settings as #1792
(35 degree FOV, clouds and HUD hidden), except the fog is left out of range only in the page, so a light haze remains.
`close_parking_fore-efter.png` is a close view (62, 30, yaw 0, 15 m) of the new hedge.

Changes: Kunskapsskolan / byggnad 19 and its east pavilion roof from grey (about 94,106,120 on screen) to a darker, bluer slate
(`SITE.east.roofColors.styles.laundry`, 0x3c4864, guess); a clipped hedge along the Klockhuset car park's north edge (two runs
with a gap for the footpath), reusing the #1737 `yard` mechanism. No new draw calls: desktop 06_h090 379 -> 379 calls (923578 -> 923650 tris),
lowmem 312 -> 312 (787306 -> 787378); 06_h270 lowmem 325 -> 325.
