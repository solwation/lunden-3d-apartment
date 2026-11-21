"""#2289: L1007's furniture, appliances, lamps and pictures in Unreal against the #2245 export (measurements.json `furnishing`).

1. Placement: every exported furniture / appliance / lamp node (`furnishing.items`, zones l1007 and l1007-uteplats) is an
   actor named by its id, within 1 cm of the web's position, its forward / right / up axes within 1 degree of the web's
   (Unreal local X / Y / Z = web local x / z / y) and its scale within 0.1 %. Checked in every level that holds the id:
   the imported zone levels and any derived level of the world map (world-levels.json) that copies them.
2. Textures: every furnishing texture the export kept (`furnishing.textures`) is on each of its mesh nodes: the actor's
   bounds centre is within 1 cm of the web's mesh centre and one of its slots is the key's material instance with a
   Texture2D of the exported image's size.
3. Pictures: every picture file in textures/ is shown by at least one of those textures (so it hangs where the web
   hangs it), and unreal/Lunden/THIRD_PARTY_NOTICES.md names it.

Editor world only (no Play In Editor needed). Run like the other tests: copy this file to unreal/Lunden/Content/Python/
(untracked, delete afterwards) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_furnishing
or run it directly with run-python.ps1. Writes Saved/furnishing-result.json; logs LUNDEN_FURNISHING_TEST lines, then
LUNDEN_FURNISHING_TEST_OK.
"""
import json
import math
from pathlib import Path

import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
REPO = PROJECT.parents[1]
M = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
F = M["furnishing"]
WORLD = json.loads((REPO / "tools/unreal-engine/world-levels.json").read_text(encoding="utf-8"))
ZONES = {"l1007": "/Game/Lunden/Generated/l1007/Level_l1007", "l1007-uteplats": "/Game/Lunden/Generated/l1007-uteplats/Level_l1007-uteplats"}
TOL_CM, TOL_DEG, TOL_SCALE = 1.0, 1.0, 0.001

actors_sub = u.get_editor_subsystem(u.EditorActorSubsystem)
result = {"engine": u.SystemLibrary.get_engine_version(), "levels": {}, "items": {}, "textures": {}, "pictures": {}}


def log(msg):
    u.log("LUNDEN_FURNISHING_TEST " + msg)


def angle(a, b):
    dot = sum(x * y for x, y in zip(a, b)) / (math.hypot(*a) * math.hypot(*b))
    return math.degrees(math.acos(max(-1.0, min(1.0, dot))))


def vec(v):
    return [v.x, v.y, v.z]


def texture_sizes(material):
    """Sizes of the Texture2D parameters of a material instance (and its parents)."""
    out = []
    while isinstance(material, u.MaterialInstanceConstant):
        for t in material.get_editor_property("texture_parameter_values"):
            tx = t.get_editor_property("parameter_value")
            if isinstance(tx, u.Texture2D):
                out.append((tx.blueprint_get_size_x(), tx.blueprint_get_size_y(), tx.get_path_name()))
        material = material.get_editor_property("parent")
    return out


items = {i["id"]: i for i in F["items"]}
meshes = {m["id"]: (t, m) for t in F["textures"] for m in t["meshes"]}
levels = list(ZONES.values()) + [l["package"] for l in WORLD["levels"] if l["package"] not in ZONES.values()]
placed, shown, errors = {}, {}, []
for level in levels:
    if not u.EditorAssetLibrary.does_asset_exist(level):
        if level in ZONES.values():
            raise RuntimeError(f"{level} is missing: run import_world.py")
        log(f"{level}: not built here, skipped")
        continue
    if not u.EditorLoadingAndSavingUtils.load_map(level):
        raise RuntimeError(f"Cannot load {level}")
    by_name = {a.get_name(): a for a in actors_sub.get_all_level_actors()}
    n_items = n_meshes = 0
    # 1. placement
    for item_id, it in items.items():
        a = by_name.get(item_id)
        if a is None:
            continue
        n_items += 1
        want = it["unreal"]
        off = math.dist(vec(a.get_actor_location()), want["location"])
        axes = {"x": vec(a.get_actor_forward_vector()), "y": vec(a.get_actor_right_vector()), "z": vec(a.get_actor_up_vector())}
        turn = max(angle(axes[k], want["axes"][k]) for k in "xyz")
        scale = vec(a.get_actor_scale3d())
        dscale = max(abs(s - w) / max(abs(w), 1e-6) for s, w in zip(scale, want["scale"]))
        row = placed.setdefault(item_id, {"levels": [], "maxCm": 0.0, "maxDeg": 0.0, "maxScale": 0.0})
        row["levels"].append(level.rsplit("/", 1)[-1])
        row["maxCm"], row["maxDeg"], row["maxScale"] = max(row["maxCm"], off), max(row["maxDeg"], turn), max(row["maxScale"], dscale)
        if off > TOL_CM or turn > TOL_DEG or dscale > TOL_SCALE:
            errors.append(f"{item_id} in {level}: {off:.3f} cm, {turn:.3f} deg, scale {dscale:.5f} off the web")
    # 2. textures on their mesh nodes
    for mesh_id, (t, m) in meshes.items():
        a = by_name.get(mesh_id)
        if a is None:
            continue
        n_meshes += 1
        origin, _ = a.get_actor_bounds(False)
        off = math.dist(vec(origin), m["centre"]["unreal"])
        comp = a.get_component_by_class(u.StaticMeshComponent)
        mats = [x for x in (comp.get_materials() if comp else []) if x]
        mine = [x for x in mats if x.get_name() in t["keys"]]
        want_size = (min(t["width"], F["maxTextureSize"]), min(t["height"], F["maxTextureSize"]))
        sizes = [s for x in mine for s in texture_sizes(x)]
        ok = off <= TOL_CM and mine and any((w, h) == want_size for w, h, _ in sizes)
        row = shown.setdefault(mesh_id, {"texture": t["id"], "images": t["images"], "levels": [], "maxCm": 0.0, "materials": [x.get_name() for x in mine],
                                         "sizes": sorted({(w, h) for w, h, _ in sizes}), "want": list(want_size)})
        row["levels"].append(level.rsplit("/", 1)[-1])
        row["maxCm"] = max(row["maxCm"], off)
        if not ok:
            errors.append(f"{mesh_id} ({t['id']} {t['images'] or t['kind']}) in {level}: centre {off:.3f} cm off, materials "
                          f"{[x.get_name() for x in mats]}, textures {sizes}, want {t['keys']} with {want_size}")
    result["levels"][level] = {"items": n_items, "textureMeshes": n_meshes}
    log(f"{level}: {n_items} furnishing actors, {n_meshes} textured mesh actors checked")

missing_items = sorted(set(items) - set(placed))
missing_meshes = sorted(set(meshes) - set(shown))
if missing_items:
    errors.append(f"furnishing ids with no actor in any level: {missing_items}")
if missing_meshes:
    errors.append(f"textured mesh nodes with no actor in any level: {missing_meshes}")
result["items"] = {"export": len(items), "placed": len(placed), "maxCm": round(max([r["maxCm"] for r in placed.values()] or [0]), 4),
                   "maxDeg": round(max([r["maxDeg"] for r in placed.values()] or [0]), 4),
                   "maxScale": round(max([r["maxScale"] for r in placed.values()] or [0]), 6), "byKind": {}}
for it in items.values():
    result["items"]["byKind"][it["kind"]] = result["items"]["byKind"].get(it["kind"], 0) + 1
result["textures"] = {"export": len(F["textures"]), "meshes": len(meshes), "shown": len(shown),
                      "maxCm": round(max([r["maxCm"] for r in shown.values()] or [0]), 4)}
log(f"items {json.dumps(result['items'])}")
log(f"textures {json.dumps(result['textures'])}")

# 3. pictures: every file in textures/ on a wall in Unreal, and in the notices
notices = (PROJECT / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")
files = sorted(f"textures/{p.name}" for p in (REPO / "textures").iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"))
for f in files:
    where = sorted(mid for mid, r in shown.items() if f in r["images"])
    result["pictures"][f] = {"meshes": where, "inNotices": f"`{f}`" in notices}
    log(f"picture {f}: {where}, notice {f'`{f}`' in notices}")
    if not where:
        errors.append(f"{f} is on no mesh in Unreal")
    if f"`{f}`" not in notices:
        errors.append(f"{f} is not named in THIRD_PARTY_NOTICES.md: run node tools/unreal-engine/notices.mjs")
result["errors"] = errors
result["detail"] = {"items": placed, "meshes": shown}
(Path(u.Paths.project_saved_dir()) / "furnishing-result.json").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
u.EditorLoadingAndSavingUtils.new_blank_map(False)
if errors:
    for e in errors[:40]:
        log("ERROR " + e)
    raise RuntimeError(f"{len(errors)} furnishing checks failed (first: {errors[0]})")
u.log("LUNDEN_FURNISHING_TEST_OK")
