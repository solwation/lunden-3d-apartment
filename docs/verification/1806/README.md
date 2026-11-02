# #1806: garden hedges at the southern villas and white houses (Google 3D review 2026-11-02)

`side-by-side-<h>.jpg`: Google 3D reference (`03_sodra_bebyggelse_<h>`) | game before | game after. The game cameras look at the villa cluster
(centre 190, 215) from 85 m away, 45 m up, pitch -30, yaw -122 (h180), 58 (h000), -32 (h090), 148 (h270); they are not the exact Google
cameras, so compare what is there, not pixel positions. `efter-h180.png` is the full-size after frame.
The hedges are clipped dark-green tents (4 triangles per piece, 136 pieces) along the back and sides of each plot; the street side stays open.
Pieces on roads, car parks, buildings and shared boundaries are left out, so some plots have gaps. Draw calls 25 -> 25 (desktop), 21 -> 21 (`&lowmem`).
Desktop `south-backdrop` +544 triangles (59 329 -> 59 873 in southbackdroptest, limit 60 600 unchanged); `&lowmem` unchanged (no hedges on phones).
Gardens' grass, shrubs, fences, carports and patios are not added (grass already green; the rest are not clear enough in the views to place).
