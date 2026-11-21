"""#2325: the courtyard slats, house letters, clumped hedges and Höje å water as drawn in the world (commandlet).

    run-python.ps1 tools/unreal-engine/tests/check_site_details.py

Reads the material keys straight from Import/*.glb and fails when any of these surfaces falls back to a plain
material in Unreal:

- slatted rails (`*_site_slatted_rail`, the A/B/C loggias and the courtyard-edge fence), the house letters
  (`*_site_house_letters`) and the garage storage cages' wire mesh (`*_garage_cage_mesh`, walls and door leaves,
  #2399): Interchange's instance of that key, with its base-colour texture switched on and a Texture2D the size of
  the GLB's PNG; the rails and the cage mesh also masked and two-sided, as the glTF says (MASK, doubleSided);
- patio hedges and boxwood (`std_78a64b_r95_m0_vc_tex`, `std_48733c_r92_m0_vc_tex`): the same texture rule;
- the river keys (`*_river_flow`, `*_river_edge`): the material material-map.json names for them.

Each node is looked up by its id in every level of world-levels.json (the derived levels copy the zone actors);
vegetation hedges are foliage, so their SM_Veg_hedge_* copies in Generated/VegetationWorld are checked instead.
Every node must be drawn by at least one world level or copy. Writes Saved/site-details-result.json and logs
LUNDEN_SITE_DETAILS_OK (or raises).
"""
import json
from pathlib import Path
import re
import struct

import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
TOOLS = PROJECT.parents[1] / "tools/unreal-engine"
IMPORT = PROJECT / "Import"
WORLD = json.loads((TOOLS / "world-levels.json").read_text(encoding="utf-8"))
MAP = json.loads((TOOLS / "material-map.json").read_text(encoding="utf-8"))
KEYS = re.compile(r"_site_slatted_rail$|_site_house_letters$|_garage_cage_mesh$|^std_(78a64b_r95|48733c_r92)_m0_vc_tex$|_river_(flow|edge)$")
TEXTURED = "bHasBaseColorTexture"
VEG = "/Game/Lunden/Generated/VegetationWorld"


def log(msg):
    u.log("LUNDEN_SITE_DETAILS " + msg)


def png_size(blob):
    if blob[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("Expected a PNG image in the GLB")
    return struct.unpack(">II", blob[16:24])


def expected():
    """{node id: (zone, key, (w, h) or None, mask, two-sided)} for every GLB mesh node drawn with one of KEYS."""
    out = {}
    for glb in sorted(IMPORT.glob("*.glb")):
        data = glb.read_bytes()
        n = struct.unpack("<I", data[12:16])[0]
        g = json.loads(data[20:20 + n])
        bin0 = 20 + n + 8
        for node in g["nodes"]:
            if "mesh" not in node:
                continue
            for prim in g["meshes"][node["mesh"]]["primitives"]:
                mat = g["materials"][prim["material"]] if "material" in prim else {}
                key = mat.get("name", "")
                if not KEYS.search(key):
                    continue
                tex = mat.get("pbrMetallicRoughness", {}).get("baseColorTexture")
                size = None
                if tex:
                    img = g["images"][g["textures"][tex["index"]]["source"]]
                    view = g["bufferViews"][img["bufferView"]]
                    start = bin0 + view.get("byteOffset", 0)
                    size = png_size(data[start:start + 24])
                out[node.get("extras", {}).get("id") or node["name"]] = (glb.stem, key, size, mat.get("alphaMode") == "MASK",
                                                                         bool(mat.get("doubleSided")))
    return out


def mapped(key, node_id):
    """The material import_world.py puts on key for this node (first matching rule, `mesh` narrows by node), or None."""
    for rule in MAP["rules"]:
        if re.search(rule["match"], key) and (not rule.get("mesh") or re.search(rule["mesh"], node_id)):
            return rule["material"].split(".")[0]
    return None


def textures(mi):
    sizes = []
    x = mi
    while isinstance(x, u.MaterialInstanceConstant):
        for t in x.get_editor_property("texture_parameter_values"):
            tx = t.get_editor_property("parameter_value")
            if isinstance(tx, u.Texture2D):
                sizes.append((tx.blueprint_get_size_x(), tx.blueprint_get_size_y()))
        x = x.get_editor_property("parent")
    return sizes


def two_sided(mi):
    x = mi
    while isinstance(x, u.MaterialInstance):
        o = x.get_editor_property("base_property_overrides")
        if o.get_editor_property("override_two_sided"):
            return o.get_editor_property("two_sided")
        x = x.get_editor_property("parent")
    return bool(x and x.get_editor_property("two_sided"))


def judge(node_id, want, mats):
    """'' when one of mats draws the node as the web does, else the reason."""
    zone, key, size, mask, sided = want
    target = mapped(key, node_id)
    names = [m.get_path_name() for m in mats]
    river = "_river_" in key
    if river and not target:
        return f"{key}: no material-map.json rule names its river material"
    if target and not river:
        return f"{key}: a material-map.json rule replaces the GLB's image with {target}"
    if target:
        return "" if any(p.split(".")[0] == target for p in names) else f"{key} should be {target}, slots {names}"
    mine = [m for m in mats if m.get_name() == key and isinstance(m, u.MaterialInstanceConstant)]
    if not mine:
        return f"no slot with the imported instance {key}: {names}"
    m = mine[0]
    problems = []
    if not u.MaterialEditingLibrary.get_material_instance_static_switch_parameter_value(m, TEXTURED):
        problems.append(f"{TEXTURED} off")
    if size and tuple(size) not in textures(m):
        problems.append(f"texture sizes {textures(m)} lack the GLB's {tuple(size)}")
    if mask and m.get_blend_mode() != u.BlendMode.BLEND_MASKED:
        problems.append(f"blend {m.get_blend_mode()} not masked")
    if sided and not two_sided(m):
        problems.append("not two-sided")
    return "; ".join(problems)


want = expected()
if not want:
    raise RuntimeError("No GLB node uses the #2325 keys: export current?")
found = {i: [] for i in want}
errors = []
actors_sub = u.get_editor_subsystem(u.EditorActorSubsystem)
for level in [l["package"] for l in WORLD["levels"]]:
    if not u.EditorAssetLibrary.does_asset_exist(level):
        errors.append(f"{level} is not built")
        continue
    if not u.EditorLoadingAndSavingUtils.load_map(level):
        raise RuntimeError(f"Cannot load {level}")
    for a in actors_sub.get_all_level_actors():
        node_id = a.get_name()
        if node_id not in want:
            continue
        comp = a.get_component_by_class(u.StaticMeshComponent)
        mats = [m for m in (comp.get_materials() if comp else []) if m]
        why = judge(node_id, want[node_id], mats)
        found[node_id].append({"level": level.rsplit("/", 1)[-1], "ok": not why, "why": why})
        if why:
            errors.append(f"{node_id} in {level}: {why}")

# foliage: the vegetation zone's hedges are instances of SM_Veg_hedge_* copies (build_vegetation.py)
veg_hedges = [i for i, w in want.items() if w[0] == "vegetation"]
if veg_hedges:
    copies = [u.EditorAssetLibrary.load_asset(p) for p in u.EditorAssetLibrary.list_assets(VEG, recursive=True, include_folder=False)
              if p.rsplit("/", 1)[-1].split(".")[0].startswith("SM_Veg_hedge_")]
    for node_id in veg_hedges:
        key = want[node_id][1]
        rows = [c for c in copies if isinstance(c, u.StaticMesh)
                and any(s.material_interface and s.material_interface.get_name() == key for s in c.static_materials)]
        for c in rows:
            why = judge(node_id, want[node_id], [s.material_interface for s in c.static_materials if s.material_interface])
            found[node_id].append({"level": c.get_name(), "ok": not why, "why": why})
            if why:
                errors.append(f"{node_id} as {c.get_name()}: {why}")

for node_id, rows in found.items():
    if not any(r["ok"] for r in rows):
        errors.append(f"{node_id} ({want[node_id][1]}) is drawn by no world level")
summary = {}
for node_id, (zone, key, size, mask, sided) in want.items():
    kind = re.sub(r"^std_[0-9a-f]+_r\d+_m\d+_", "", key)
    row = summary.setdefault(kind, {"nodes": 0, "drawn": 0, "png": list(size) if size else None})
    row["nodes"] += 1
    row["drawn"] += any(r["ok"] for r in found[node_id])
result = {"engine": u.SystemLibrary.get_engine_version(), "summary": summary, "nodes": found, "errors": errors}
(PROJECT / "Saved/site-details-result.json").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
for kind, row in summary.items():
    log(f"{kind}: {row['drawn']} of {row['nodes']} nodes drawn as the web's surface (PNG {row['png']})")
if errors:
    for e in errors[:40]:
        log("FAIL " + e)
    raise RuntimeError(f"{len(errors)} #2325 surfaces fall back to another material")
u.log(f"LUNDEN_SITE_DETAILS_OK {len(want)} nodes")
