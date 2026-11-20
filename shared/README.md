# Shared data contract: web ↔ Unreal (#2245)

The web version and the Unreal (Windows) version are built from **the same sources**. This folder only holds the
*contract* between them — what is canonical where, the formats the export writes, and their versions. It is not a
second copy of any data. Pipeline, commands and phase status: [docs/development/unreal.md](../docs/development/unreal.md).

## What is canonical where

Nothing moves: the web's paths stay where they are, because `tools/stamp.sh`, the cache-busting of `'data/…json'`,
Pages `paths-ignore`, the tests and the public downstream copy rely on them.

| Source (edit here) | Holds | Reaches Unreal as |
|---|---|---|
| `data/plan.json` (from `L1007_mattsatt_planritning.pdf` by `tools/extract_plan.py`) | walls, windows, doors, cabinets, stair, rooms, patio | zone GLBs (geometry, ids, `source` pointers) and `measurements.json` |
| `src/config.js` | every measurement and tunable the PDF lacks: `VERTICAL`/`LEVELS`, `START`, `PLAYER`, `STAIR`, `WINDOWS`, `DOOR_HEIGHT`, `FURNITURE`, `SITE` … | `measurements.json`; geometry through the scene build |
| `src/*.js` scene builders (`world.js`, `furniture.js`, `lights.js` …) | how the geometry is made | zone GLBs (the export runs the real `buildWorld`) |
| `data/elevation.json` (Copernicus GLO-30) | terrain grid | `measurements.json` `terrain`: a reference (grid, hash), not a copy |
| `models/*.glb` | the web's ready-made models (project-authored) | listed as export sources; imported directly by later zones |
| `textures/`, `music/`, `data/fonts/`, `icons/` | images, music, font | used directly by Unreal when a port needs them; attribution in `unreal/Lunden/THIRD_PARTY_NOTICES.md` |

**Never edit generated output by hand:** not the export (`unreal/Lunden/Import/`, Git-ignored) and not the imported
assets in `unreal/Lunden/Content/Lunden/Generated/`. Change the source above, export and import again.
Unreal's own materials, lighting and game logic are made in Unreal (`Content/Lunden/Materials/`, `Blueprints/`,
`Source/`) and are not shared.

## Formats

| File | Schema | Written by |
|---|---|---|
| `export-manifest.json` | [`schema/export-manifest.schema.json`](schema/export-manifest.schema.json) | `tools/unreal-engine/export-world.mjs` |
| `<zone>.glb` node `extras` | [`schema/node-extras.schema.json`](schema/node-extras.schema.json) | `tools/unreal-engine/export-scene.js` (three's GLTFExporter writes `userData` as `extras`) |
| `measurements.json` | [`schema/measurements.schema.json`](schema/measurements.schema.json) | `tools/unreal-engine/export-scene.js` + `export-world.mjs` |

`tools/unreal-engine/check-export.mjs` validates all three against these schemas (its own small validator, no dependencies).

### Format versions

Every file carries an integer `formatVersion` (the GLB on its root node's `extras`). Readers refuse a version newer
than they know with a clear error (`check-export.mjs`, `tools/unreal-engine/python/import_world.py`). Bump it for any change
an older reader would misread (renamed/removed field, changed unit or axis, changed id scheme); adding an optional
field does not need a bump. Record every version here:

| formatVersion | Date | Change |
|---|---|---|
| 1 | 2026-11-20 | First version (#2245 phase A): zones `l1007`, `l1007-uteplats`, `fixture`; ids, extras, measurements, manifest as in the schemas. |

### Ids

A node's name equals its `extras.id`. Ids are made from the kind, the level and the position in centimetres
(`door_l0_x80_z0` is the front door's hinge at x 0.80 m, z 0; `furn_sofa_l0_x410_z1126` the sofa's centre;
negative values get `m`, e.g. `xm350`), so they are identical between exports of the same commit and survive unrelated
changes. A duplicate gets `_2`, `_3` … in scene order. Moving an object changes its id: Unreal-side references to
moved objects must be updated with the move. Furniture also carries the web's saved-layout id (`webId`). Child
nodes of an object are `part`s named `<id>__<n>`; ids use only letters, digits, `_` and `-` (Unreal object names
cannot contain dots).

## Axes and units

| | Units | Handedness | Axes |
|---|---|---|---|
| Web / plan | metres | right-handed | x = east, y = up, z = south (north = −z) |
| glTF (the GLBs) | metres | right-handed | the web's axes unchanged |
| Unreal | centimetres | left-handed | X forward, Y right, Z up |

**Target mapping** (`tools/unreal-engine/coordinates.mjs`, tested by `node tools/unreal-engine/coordinatestest.mjs`): `Unreal X = 100·x` (east),
`Unreal Y = 100·z` (south), `Unreal Z = 100·y` (up) — a renaming of axes, no mirroring: north is Unreal −Y, the plan seen from
above keeps its orientation. Yaw: `unrealYaw = −90° − yawDeg` for the web's `?at=`/`START` yaw (0 north, 90 west,
180 south, −90 east), so START's 180 is Unreal 90 (+Y, south); an object's `rotation.y` = a (radians) points its local +z
at Unreal yaw `90° − a`. Pitch is unchanged (positive looks up).

**Assumption (phase B):** how Unreal's Interchange glTF import converts glTF axes itself. The importer measures it
with the `fixture` zone (markers on L1007's corners, the stair foot, START, Övre plan; north and east arrows) and must
end with every marker within 1 cm of its `unreal` position in `measurements.json`.
