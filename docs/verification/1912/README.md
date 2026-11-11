# Connected bicycle frame — #1912

Basee300a2bd. The exporter kept a lower frame tube ending(0.33,0.40) but omitted the
connection up to the steering head(0.34,0.76). Restored that tube in both LODs;
it overlaps the existing lower/top/head/fork attachment points. No runtime input,
physics, handlebar/grip, geometry placement or material recipe changes.
Near/far are2424/800 triangles (a32/8-triangle increase), same four material parts.

## Two risk groups

1. `node --test tools/bicycleglbtest.mjs tools/bike1856finaltest.mjs`:10/10 pass.
   Actual committed GLB and near/far consumers parse; final Player motion/terrain
   contact/airborne exit and legal grounded dismount cases remain green.
2. Chromium/SwiftShader: four whole axis views of near/far GLB, actual StreetLife
   nine bicycles/four instanced components, moved bicycle.place and actual ghostBike
   merged proxy. Every component retains nine instances, no page errors. Four images
   beside this README; all opened and inspected. Connection is visibly continuous.

The gallery uses the production spoke texture. Component scenes show the real
StreetLife yard with controlled camera; no full World or garage route claim. Garage
and courtyard use the same `bikeGeometry` factory (reviewed call sites), so the same
corrected part is supplied there. A complete full-app steering/input/network drive
was not rerun for a single frame-tube change; source-bound Player checks cover the
motion/exit risks. The final release still waits for model delivery#1913 and app-start
blocker#1914.

Public assessment atcd79c14: public `fixed-racks.js`, courtyard and garage explicitly
render empty fixed racks, excluding residents' bikes. No bicycle model/GLB/ride
consumer exists to fix. Copying this model would introduce excluded residents'
possessions/gameplay; no applicable public transfer.
