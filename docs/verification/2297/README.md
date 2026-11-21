# #2297 verification: import fingerprint and collision box after an editor restart

UE 5.8.4, Windows worktree, headless (`run-python.ps1`: `-unattended -nullrhi -nosplash`). Export of `e8e7e288`
(zones `l1007`, `l1007-uteplats`, `fixture`; no exporter source changed up to `c1a1140f`). No visual result, so no images.

## Reproduction and measurement (importer version 3, `c1a1140f`)

A copy of `import_world.py` dumped the fingerprint's input at import and in a new editor process (`--check`):

- `--check`: `l1007: content fingerprint 0a27b9a000d2ed81 differs from the stamp's f1f53a331672cc21`;
  `fixture` and `l1007-uteplats` matched.
- All 2,615 actors identical. 34 of 2,553 assets differed, only in vertex and triangle count, all raster furniture
  meshes (e.g. `furn_besta_l0_x42_z1055__11`: 190 vertices / 370 triangles at import, 610 / 992 after the restart).
  The source mesh description was the same both times (513 / 992). At import the meshes still had the **Nanite fallback**
  render data although `nanite_settings.enabled` was already `False`.
- The collision cube `col_l0_x40_z23_y150` had **0** simple boxes at import **and** after the restart: the earlier
  diagnosis ("box counts identical") was right that nothing changed, but the box never existed.
- Probe on one mesh in the commandlet: `set_editor_property("nanite_settings", …)` and
  `EditorStaticMeshLibrary.set_lod_build_settings` left the counts unchanged (no rebuild);
  `unreal.new_object(unreal.StaticMeshEditorSubsystem).set_nanite_settings(mesh, s, True)` rebuilt it at once
  (190/370 with Nanite, 610/992 without). `get_editor_subsystem(StaticMeshEditorSubsystem)` is `None` there, and the
  deprecated `EditorStaticMeshLibrary` is a silent no-op, which is also why `add_simple_collisions` added nothing.

## After the fix (importer version 4)

Import (`--zones l1007,l1007-uteplats,fixture`, re-imported because of the version bump):

```text
LUNDEN_IMPORT zone fixture: imported … fingerprint 70a3715f2b59d0eb
LUNDEN_IMPORT_FIXTURE max error 0.000 cm over 9 markers (tolerance 1.0 cm)
LUNDEN_IMPORT zone l1007-uteplats: imported … fingerprint 88dbd0aee8ee6a16
LUNDEN_NANITE l1007: 1855 Nanite meshes; 73 raster meshes with unsupported slots; 504 Nanite materials; 565 packages changed
LUNDEN_IMPORT zone l1007: imported l1007.glb (843663136442) … 2615 actors, 2553 assets, … fingerprint 390386bbedda9db6
LUNDEN_IMPORT_IDS zone l1007: 186 ids present as actor name, label and tag {"door": 18, "furniture": 88, "interactive": 48, "light": 26, "window": 6}
LUNDEN_IMPORT_COLLISION zone l1007: 54 collision actors, each a hidden BlockAll mesh with one simple box
LUNDEN_IMPORT_OK
```

`--check` in a new editor process:

```text
LUNDEN_IMPORT_FINGERPRINT zone fixture: 70a3715f2b59d0eb matches the stamp
LUNDEN_IMPORT_FINGERPRINT zone l1007-uteplats: 88dbd0aee8ee6a16 matches the stamp
LUNDEN_IMPORT_STAMP zone l1007: unchanged since import of 843663136442, 2553 package files byte-identical
LUNDEN_IMPORT_COLLISION zone l1007: 54 collision actors, each a hidden BlockAll mesh with one simple box
LUNDEN_IMPORT_FINGERPRINT zone l1007: 390386bbedda9db6 matches the stamp
LUNDEN_CHECK_OK
```

The `fixture` and `l1007-uteplats` fingerprints are the same as with version 3, so only zones with a reduced raster
mesh or collision nodes get a new fingerprint. `compose_world.py` does not read the import stamp or call the changed
functions, so `L_Lunden` was not rebuilt.
