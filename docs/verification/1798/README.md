# #1798: Kallby ängar and the housing in the north (Google 3D review 2026-11-02)

`side-by-side-<h>.jpg`: left Google 3D reference (`07_bostader_norr_<h>`), middle game before, right game after (same cameras as
`docs/references/google-3d-2026-11-02`, +-10-20 m). The four standard frames mostly look at buildings that were already modelled
inside the terrain; the new footprints show only at the edges (top right of h270). `side-by-side-nordvast.jpg` (before | after,
`?at=-300,-60,53,-25,110`) and `efter-ovanifran.png` (`?at=-450,-150,0,-90,700`) show the new area itself: 116 OSM footprints
(Kallby ängar, Klostergården, Nordanväg) outside the terrain, extruded in the existing `edge-houses` batch.
Storeys come from OSM `building:levels` or the footprint area, roofs and colours are *guess*; trees are out of scope.
Draw calls 42 -> 42, frame triangles 396760 -> 402074 (+1.3 %), phones (`lowmem`) skip the batch as before.
