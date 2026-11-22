"""#2289: L1007's furniture, appliances, lamps and pictures in Unreal against the #2245 export (measurements.json `furnishing`).

1. Placement: every exported furniture / appliance / lamp node (`furnishing.items`, zones l1007 and l1007-uteplats) is an
   actor named by its id, within 1 cm of the web's position, its forward / right / up axes within 1 degree of the web's
   (Unreal local X / Y / Z = web local x / z / y) and its scale within 0.1 %. Checked in every level that holds the id:
   the imported zone levels, any derived level of the world map (world-levels.json) that copies them, and the composed
   world map itself, which must hold every item and textured mesh (the patio is a world sub-level since #2289).
2. Textures: every furnishing texture the export kept (`furnishing.textures`) is on each of its mesh nodes: the actor's
   bounds centre is within 1 cm of the web's mesh centre and one of its slots is the key's material instance with a
   Texture2D of the exported image's size.
3. Pictures: every picture file in textures/ is shown by at least one of those textures (so it hangs where the web
   hangs it), and unreal/Lunden/THIRD_PARTY_NOTICES.md names it.
4. Hand-made furnishing materials (#2395): every material-map.json rule whose `mesh` selector picks a furnishing mesh
   (the fruit bowl's copper wire) is on that mesh in every level, never the imported key's generic instance; the
   material's colour, roughness and metalness are the export key's (the web's), its two-sided override follows the
   key, and a material marked `raster` leaves the mesh off Nanite.
5. Patio beers (#2406): the slat table's two pints (`furnishing.patioBeers`, src/patio.js) stand where the web stands
   them: each glass, bottom, beer and foam mesh actor's bounds centre within 1 cm of the web's mesh centre, and every one
   carries the export's date and clock-hour window as season tags (seasonFrom/To, seasonHourFrom/To) for BPC_LundenSeasons.
6. Furnishings main.js builds next to the world (#2310, #2429): the export holds the fruit bowl, the basketball and the
   TV remote (by their `source`), so they cannot silently drop out of the export (point 1 only checks what is exported);
   the remote's body carries its export material key (the web's black plastic) in every level that holds it.
7. The snowman (#2445, `furnishing.snowman`, src/patio.js): exported (by its `source`, as point 6), its actor within 1 cm
   of the web's PATIO.snowman spot in every level that holds it, and carrying the export's date window as season tags.

Editor world only (no Play In Editor needed). Run like the other tests: copy this file to unreal/Lunden/Content/Python/
(untracked, delete afterwards) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_furnishing
or run it directly with run-python.ps1. Writes Saved/furnishing-result.json; logs LUNDEN_FURNISHING_TEST lines, then
LUNDEN_FURNISHING_TEST_OK.
"""
import json
import math
from pathlib import Path
import re
import struct

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


def glb_mesh_keys(path):
    """{mesh name: [material keys of its primitives]} from a zone GLB's JSON chunk."""
    data = path.read_bytes()
    j = json.loads(data[20:20 + struct.unpack("<I", data[12:16])[0]])
    names = [m["name"] for m in j.get("materials", [])]
    return {m.get("name", ""): [names[p["material"]] for p in m.get("primitives", []) if "material" in p] for m in j.get("meshes", [])}


def linear(hex_colour):
    c = [int(hex_colour.lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def handmade_targets():
    """[(mesh name, key, material path, spec)] for the material-map rules that pick furnishing meshes (#2395)."""
    table = json.loads((REPO / "tools/unreal-engine/material-map.json").read_text(encoding="utf-8"))
    ids = [i["id"] for i in F["items"]]
    out = []
    for zone in ZONES:
        for mesh, keys in glb_mesh_keys(PROJECT / "Import" / f"{zone}.glb").items():
            if not any(mesh.startswith(i + "__") or mesh == i for i in ids):
                continue
            for key in keys:
                rule = next((r for r in table["rules"] if re.search(r["match"], key) and (not r.get("mesh") or re.search(r["mesh"], mesh))), None)
                if rule and rule.get("mesh"):
                    path = rule["material"].split(".")[0]
                    out.append((mesh, key, path, table["materials"][path]))
    return out


def handmade_errors(mesh_actors, level):
    """Problems with the hand-made furnishing materials in one loaded level; fills result["handmade"]."""
    errs = []
    for mesh, key, path, spec in HANDMADE:
        comps = mesh_actors.get(mesh, [])
        row = result["handmade"].setdefault(mesh, {"key": key, "material": path, "levels": []})
        if comps:
            row["levels"].append(level.rsplit("/", 1)[-1])
        for comp in comps:
            names = [m.get_path_name().split(".")[0] if m else None for m in comp.get_materials()]
            if path not in names:
                errs.append(f"{mesh} in {level}: materials {names}, want {path} (not the generic {key})")
                continue
            mat = comp.get_materials()[names.index(path)]
            web = M["materials"][key]
            got = u.MaterialEditingLibrary.get_material_instance_vector_parameter_value(mat, "BaseColor")
            off = max(abs(a - b) for a, b in zip([got.r, got.g, got.b], linear(web["color"])))
            rough = u.MaterialEditingLibrary.get_material_instance_scalar_parameter_value(mat, "Roughness")
            metal = u.MaterialEditingLibrary.get_material_instance_scalar_parameter_value(mat, "Metallic")
            faces = mat.get_editor_property("base_property_overrides")
            two_sided = faces.get_editor_property("override_two_sided") and faces.get_editor_property("two_sided")
            nanite = comp.get_editor_property("static_mesh").get_editor_property("nanite_settings").enabled
            row.update({"colourOff": round(off, 5), "roughness": round(rough, 4), "metallic": round(metal, 4),
                        "twoSided": bool(two_sided), "nanite": bool(nanite)})
            if off > 1e-3 or abs(rough - web["roughness"]) > 1e-3 or abs(metal - web["metalness"]) > 1e-3:
                errs.append(f"{mesh} in {level}: {path} colour off {off:.4f}, roughness {rough}, metallic {metal}; the web's "
                            f"{web['color']}, {web['roughness']}, {web['metalness']}")
            if bool(two_sided) != bool(web["doubleSided"]):
                errs.append(f"{mesh} in {level}: {path} two-sided {bool(two_sided)}, the web's doubleSided {web['doubleSided']}")
            if spec.get("raster") and nanite:
                errs.append(f"{mesh} in {level}: Nanite is on, but {path} asks for the raster path ({spec['raster']})")
    return errs


# 6. (#2310, #2429) source → a material key that must be on the node's meshes (None: placement only)
LOOSE = {"src/config.js#FRUIT": None, "src/config.js#BASKET.ball": None, "src/config.js#REMOTE": "std_17181b_r55_m10",
         "src/config.js#PATIO.snowman": None}  # #2445
loose_seen = {}


def actor_materials(a):
    """Material names on an actor's static meshes and on the actors attached to it (the node's parts)."""
    names, todo = set(), [a]
    while todo:
        x = todo.pop()
        for comp in x.get_components_by_class(u.StaticMeshComponent):
            names.update(m.get_name() for m in comp.get_materials() if m)
        todo.extend(x.get_attached_actors())
    return names


HANDMADE = handmade_targets()
result["handmade"] = {}
items = {i["id"]: i for i in F["items"]}
meshes = {m["id"]: (t, m) for t in F["textures"] for m in t["meshes"]}
levels = list(ZONES.values()) + [l["package"] for l in WORLD["levels"] if l["package"] not in ZONES.values()] + [WORLD["map"]]
placed, shown, errors = {}, {}, []
BEERS = F.get("patioBeers")  # #2406
beer_meshes = {m["id"]: m for g in (BEERS or {}).get("glasses", []) for m in g["meshes"]}
beers_seen = {}
if not beer_meshes:
    errors.append("measurements.json has no furnishing.patioBeers: re-export (#2406)")
else:
    w = BEERS["seasonal"]
    BEER_TAGS = {"seasonal", f"season:{w['what']}", f"seasonFrom:{w['from'][0] * 100 + w['from'][1]}",
                 f"seasonTo:{w['to'][0] * 100 + w['to'][1]}", f"seasonHourFrom:{w['hours'][0]}", f"seasonHourTo:{w['hours'][1]}"}
SNOWMAN = F.get("snowman")  # #2445
snowman_seen = {}
if not SNOWMAN:
    errors.append("measurements.json has no furnishing.snowman: re-export (#2445)")
else:
    w = SNOWMAN["seasonal"]
    SNOWMAN_TAGS = {"seasonal", f"season:{w['what']}", f"seasonFrom:{w['from'][0] * 100 + w['from'][1]}", f"seasonTo:{w['to'][0] * 100 + w['to'][1]}"}
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
    # 6. the loose furnishings' materials (#2429)
    for item_id, it in items.items():
        key = LOOSE.get(it.get("source"))
        a = by_name.get(item_id)
        if key is None or a is None:
            continue
        mats = actor_materials(a)
        loose_seen.setdefault(item_id, {"key": key, "levels": []})["levels"].append(level.rsplit("/", 1)[-1])
        if key not in mats:
            errors.append(f"{item_id} in {level}: materials {sorted(mats)}, want {key}")
    # 4. hand-made furnishing materials (#2395)
    mesh_actors = {}
    for a in by_name.values():
        for comp in a.get_components_by_class(u.StaticMeshComponent):
            sm = comp.get_editor_property("static_mesh")
            if sm:
                mesh_actors.setdefault(sm.get_name(), []).append(comp)
    errors.extend(handmade_errors(mesh_actors, level))
    # 5. the patio beers (#2406)
    for mesh_id, m in beer_meshes.items():
        a = by_name.get(mesh_id)
        if a is None:
            continue
        origin, _ = a.get_actor_bounds(False)
        off = math.dist(vec(origin), m["centre"]["unreal"])
        tags = {str(t) for t in a.tags}
        row = beers_seen.setdefault(mesh_id, {"levels": [], "maxCm": 0.0})
        row["levels"].append(level.rsplit("/", 1)[-1])
        row["maxCm"] = max(row["maxCm"], off)
        if off > TOL_CM or not BEER_TAGS.issubset(tags):
            errors.append(f"patio beer {mesh_id} in {level}: centre {off:.3f} cm off the web, season tags "
                          f"{sorted(t for t in tags if t.startswith('season'))}, want {sorted(BEER_TAGS)}")
    # 7. the snowman (#2445)
    a = by_name.get(SNOWMAN["id"]) if SNOWMAN else None
    if a is not None:
        off = math.dist(vec(a.get_actor_location()), SNOWMAN["position"]["unreal"])
        tags = {str(t) for t in a.tags}
        row = snowman_seen.setdefault(SNOWMAN["id"], {"levels": [], "maxCm": 0.0, "tags": sorted(t for t in tags if t.startswith("season"))})
        row["levels"].append(level.rsplit("/", 1)[-1])
        row["maxCm"] = max(row["maxCm"], off)
        if off > TOL_CM or not SNOWMAN_TAGS.issubset(tags):
            errors.append(f"snowman {SNOWMAN['id']} in {level}: {off:.3f} cm off the web, season tags "
                          f"{sorted(t for t in tags if t.startswith('season'))}, want {sorted(SNOWMAN_TAGS)}")
    result["levels"][level] = {"items": n_items, "textureMeshes": n_meshes}
    if level == WORLD["map"] and (n_items, n_meshes) != (len(items), len(meshes)):
        # the composed world (its sub-levels load with it) holds every furnishing item and textured mesh, patio included
        errors.append(f"{level} holds {n_items} of {len(items)} furnishing items and {n_meshes} of {len(meshes)} textured meshes")
    log(f"{level}: {n_items} furnishing actors, {n_meshes} textured mesh actors checked")

missing_items = sorted(set(items) - set(placed))
for source in LOOSE:
    ids = sorted(i for i, it in items.items() if it.get("source") == source)
    result.setdefault("loose", {})[source] = ids
    log(f"loose {source}: {ids}")
    if not ids:
        errors.append(f"measurements.json has no furnishing item from {source}: the export lost it (#2310, #2429)")
result["looseMaterials"] = loose_seen
missing_meshes = sorted(set(meshes) - set(shown))
if not HANDMADE:
    errors.append("material-map.json has no rule for a furnishing mesh: the fruit bowl's copper wire (#2395) is gone")
for mesh, row in result["handmade"].items():
    log(f"handmade {mesh} {json.dumps(row)}")
    if not row["levels"]:
        errors.append(f"{mesh} ({row['material']}) has no actor in any level")
if missing_items:
    errors.append(f"furnishing ids with no actor in any level: {missing_items}")
missing_beers = sorted(set(beer_meshes) - set(beers_seen))
if missing_beers:
    errors.append(f"patio beer meshes with no actor in any level: {missing_beers}")
result["patioBeers"] = {"export": len(beer_meshes), "placed": len(beers_seen),
                        "maxCm": round(max([r["maxCm"] for r in beers_seen.values()] or [0]), 4), "detail": beers_seen}
log(f"patio beers {json.dumps(result['patioBeers'])}")
if SNOWMAN and not snowman_seen:
    errors.append(f"snowman {SNOWMAN['id']} has no actor in any level")
result["snowman"] = {"id": SNOWMAN and SNOWMAN["id"], "detail": snowman_seen}
log(f"snowman {json.dumps(result['snowman'])}")
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
