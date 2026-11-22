"""Lunden (#2282): key coverage of tools/unreal-engine/material-map.json against a web export. Plain Python 3, no Unreal.

    python3 tools/unreal-engine/tests/test_materials.py [<export dir>] [--table]

<export dir> defaults to unreal/Lunden/Import (the folder tools/unreal-engine/export-world.mjs writes). Checks:
  1. every material key on a building or ground node (`scope`: zones x kinds) matches a rule or a default with a reason;
  2. every rule names a material listed under `materials`, and every rule with a `mesh` selector still selects a mesh
     with that key in the export (a moved surface changes its id: the rule would silently stop applying);
  3. every instance names a listed master and only parameters that master has;
  4. every material carries `source` and an `assumption` field, and an entry whose source or note says *guess* keeps an
     assumption text (plan-material's markers stay with the material);
  5. (#2308) every lawn key has a rule to a grass instance of its own colour; (#2433) every gravel key (the shared stone
     map) a rule to a gravel instance whose colour over the map's mean is the key's, vertex colour drawn where it has one;
  6. (#2318) every web look with a patterned surface (brick, roof seams, asphalt, paving: PATTERNED) reaches a material that
     draws that surface (its `surface` field), on every mesh that shows it, in every zone of the export. The class comes from
     the export itself (measurements.json materials[].looks: the web's own weather class, or the colour map's name, or the
     class of another look drawing the same canvas, `mapIndex`), never from a list of keys here. A look without a colour
     map (the web's plain brick pilasters, a plain asphalt path) is drawn in full by Interchange's instance and may stay.
  7. (#2321) every export key with vertex colours, in every zone, draws them: a rule's material multiplies the vertex
     colour in, the GLB material has a base colour texture (Interchange's textured branch multiplies the vertex colour
     itself), or the key matches `vertexColor.match` and the glTF master Interchange gives it (from the GLB material:
     KHR_materials_unlit, transmission, clearcoat, sheen, else M_Default) has a vertex-colour copy listed under
     `vertexColor.masters` and built as a `gltf-vertex-color` material from that master.
  8. (#2416) meshes drawing the same web canvas (measurements.json materials[].looks[].mapIndex), in any zone, reach the
     same material: a `mesh` selector that misses a sibling (Hus L's screen walls) would send it to the key's catch-all.
  9. (#2425) the A/B/C windows' soldier courses (src/surroundings.js openingTexture, map `site-opening-soldiers`) are in
     the export, every key drawing them carries that canvas as its GLB base colour texture, and no rule replaces it, so
     they cannot fall back to Interchange's plain white instance (the wide white surround #2425 found).
 10. (#2448) a rule never makes a double-sided web surface single-sided: every mesh whose GLB material is `doubleSided`
     (the web's THREE.DoubleSide, the export's `_ds`), in every zone, reaches a two-sided material when a rule replaces
     Interchange's instance (which keeps the glTF flag), unless the rule says why one side is enough (`singleSided`).
     The garage box's retaining walls face into the box; with a single-sided brick the park saw the terrain's grass step
     4 cm behind them (#2448).
--table prints one line per key: key, nodes, rule material or "default: <reason>".
Exit 0 when all hold, 1 otherwise; prints MATERIAL_COVERAGE_OK.
"""
import json
import os
import re
import struct
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
MASTER_PARAMS = {
    "surface": {"BaseColor", "Roughness", "Metallic"},
    "tiled": {"FilterBrick", "BedJoint", "TexelBlur", "HueJitter", "SaturationJitter", "LightnessJitter", "Size", "Color", "JointColor", "Joint", "Bond", "Stagger", "Variation", "Grain", "Roughness", "JointRoughness"},
    "backdrop-texture": {"BaseColor", "Roughness", "Metallic"},
    "glass": {"BaseColor", "Opacity", "Roughness", "Specular"},
    "grass": {"Color", "Ground", "BladeRange", "BladeLength", "Cell", "StrokeWidth", "StrawTint", "BladeTint",
              "VertexColorWeight", "Roughness", "Tile", "PatchCells", "PatchContrast", "Dry", "Lush", "TuftCount", "TuftRadius",
              "TuftShade"},
    "gravel": {"Color", "VertexColorWeight"},
}
GLTF_VC = "gltf-vertex-color"  # #2321: build_materials.py's copy of an Interchange glTF master times the vertex colour
BAKED = "baked-light"  # #2431: build_materials.py's unlit master, emissive = vertex colour x display gain x power
GLTF_MASTERS = (("KHR_materials_unlit", "/InterchangeAssets/gltf/M_Unlit.M_Unlit"),  # Interchange's choice by extension
                ("KHR_materials_transmission", "/InterchangeAssets/gltf/M_Transmission.M_Transmission"),
                ("KHR_materials_clearcoat", "/InterchangeAssets/gltf/M_ClearCoat.M_ClearCoat"),
                ("KHR_materials_sheen", "/InterchangeAssets/gltf/M_Sheen.M_Sheen"),
                ("KHR_materials_pbrSpecularGlossiness", "/InterchangeAssets/gltf/M_SpecularGlossiness.M_SpecularGlossiness"))
GLTF_DEFAULT = "/InterchangeAssets/gltf/M_Default.M_Default"
GRAVEL_MAP = "gravel-stones-colour"  # #2433: src/gravelsurface.js gravelTextures' colour map name
GRASS_MAP = "shared-grass-detail"  # src/grass.js grassTexture's name; measurements.json materials[].map since #2308
# #2318: web surface classes whose look is a pattern in the colour map (joints, seams, aggregate) that Interchange's plain
# instance loses, and colour-map names that carry a class themselves (src/roofsurface.js roofMap, src/asphaltsurface.js)
PATTERNED = ("brick", "roof", "asphalt", "paving")
MAP_CLASS = {"roof-surface": "roof", "asphalt-aggregate-colour": "asphalt"}
SOLDIER_MAP = "site-opening-soldiers"  # #2425: src/surroundings.js openingTexture's name


def hex_channels(text):
    v = text.lstrip("#")
    return [int(v[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def linear_of(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def srgb_byte(lin):
    return 255 * (lin * 12.92 if lin <= 0.0031308 else 1.055 * lin ** (1 / 2.4) - 0.055)


def look_classes(export_materials):
    """[(key, look, class)] for every look of the export whose surface is PATTERNED and drawn by a colour map."""
    by_map = {}
    for info in export_materials.values():
        for look in info.get("looks", []):
            cls = MAP_CLASS.get(look.get("map")) or look.get("surface")
            if look.get("mapIndex") is not None and cls:
                by_map.setdefault(look["mapIndex"], set()).add(cls)
    out = []
    for key, info in export_materials.items():
        for look in info.get("looks", []):
            if look.get("mapIndex") is None:
                continue  # no colour map: the key's colour, roughness and metalness are the whole web look
            cls = MAP_CLASS.get(look.get("map")) or look.get("surface")
            if not cls:  # an untagged material drawing a tagged one's canvas (the school wall's historic brick)
                same = by_map.get(look["mapIndex"], set())
                cls = next(iter(same)) if len(same) == 1 else None
            if cls in PATTERNED:
                out.append((key, look, cls))
    return out


def zone_meshes(export_dir):
    """{node id: (zone, [(mesh name, keys)])} for every node with an id in every zone GLB of the export."""
    out = {}
    for name in sorted(os.listdir(export_dir)):
        if not name.endswith(".glb") or name == "fixture.glb":
            continue
        j = glb_json(os.path.join(export_dir, name))
        nodes, meshes, materials = j["nodes"], j.get("meshes", []), [m.get("name", "") for m in j.get("materials", [])]

        def walk(i, acc):
            n = nodes[i]
            if "mesh" in n:
                mesh = meshes[n["mesh"]]
                acc.append((mesh.get("name", ""), {materials[p["material"]] for p in mesh.get("primitives", []) if "material" in p}))
            for c in n.get("children", []):
                walk(c, acc)
            return acc
        for i, n in enumerate(nodes):
            nid = (n.get("extras") or {}).get("id")
            if nid and (n.get("extras") or {}).get("kind") not in ("zone", "part"):
                out[nid] = (name[:-4], walk(i, []))
    return out


def glb_json(path):
    with open(path, "rb") as f:
        head = f.read(20)
        length = struct.unpack("<I", head[12:16])[0]
        return json.loads(f.read(length))


def scope_nodes(export_dir, scope):
    """(zone, node id, mesh names of the node's subtree, material keys) for every in-scope node."""
    out = []
    for zone in scope["zones"]:
        j = glb_json(os.path.join(export_dir, zone + ".glb"))
        nodes, meshes, materials = j["nodes"], j.get("meshes", []), [m.get("name", "") for m in j.get("materials", [])]

        def walk(i, acc):
            n = nodes[i]
            if "mesh" in n:
                mesh = meshes[n["mesh"]]
                keys = {materials[p["material"]] for p in mesh.get("primitives", []) if "material" in p}
                acc.append((mesh.get("name", ""), keys))
            for c in n.get("children", []):
                walk(c, acc)
            return acc
        for i, n in enumerate(nodes):
            ex = n.get("extras") or {}
            if ex.get("kind") in scope["kinds"]:
                out.append((zone, ex["id"], walk(i, []), set(ex.get("materialKeys", []))))
    return out


def vertex_color_check(export_dir, table, rule_rx, errors):
    """#2321: Interchange's glTF masters ignore COLOR_0, so a vertex-coloured key on one renders as its plain (often
    white) base colour. Every key whose GLB material is vertex-coloured (the export's `_vc`, or COLOR_0 on a primitive
    using it) must reach a material that multiplies the vertex colour in. Returns the number of such keys."""
    mats, vc = table["materials"], table.get("vertexColor") or {}
    match = re.compile(vc.get("match", "(?!)"))
    masters = vc.get("masters", {})
    for src, dst in masters.items():
        spec = mats.get(dst.split(".")[0])
        if not spec or spec.get("graph") != GLTF_VC or spec.get("from") != src.split(".")[0]:
            errors.append(f"vertexColor master {src} -> {dst} is not a listed {GLTF_VC} material built from {src.split('.')[0]}")
    keys = {}
    for name in sorted(os.listdir(export_dir)):
        if not name.endswith(".glb"):
            continue
        j = glb_json(os.path.join(export_dir, name))
        materials = j.get("materials", [])
        colored = {p["material"] for mesh in j.get("meshes", []) for p in mesh.get("primitives", [])
                   if "material" in p and "COLOR_0" in p.get("attributes", {})}
        for mesh in j.get("meshes", []):
            for p in mesh.get("primitives", []):
                if "material" not in p:
                    continue
                m = materials[p["material"]]
                key = m.get("name", "")
                if "_vc" not in key and p["material"] not in colored:
                    continue
                entry = keys.setdefault(key, {"zones": set(), "meshes": set(), "material": m})
                entry["zones"].add(name[:-4])
                entry["meshes"].add(mesh.get("name", ""))
    for key, entry in sorted(keys.items()):
        where = f"{key} ({', '.join(sorted(entry['zones']))})"
        ruled, unruled = set(), False
        for mesh in entry["meshes"]:
            hit = next((r for rx, mx, r in rule_rx if rx.search(key) and (mx is None or mx.search(mesh))), None)
            if hit:
                ruled.add(hit["material"].split(".")[0])
            else:
                unruled = True
        for target in sorted(ruled):
            spec = mats.get(target, {})
            parent = mats.get(spec.get("parent"), {}) if "parent" in spec else spec
            weight = spec.get("params", {}).get("VertexColorWeight", 0)
            backdrop_vc = parent.get("graph") == "backdrop-texture" and parent.get("vertexColors") is True
            draws_land = parent.get("graph") == "river" and parent.get("mode") == "edge"
            if not (parent.get("graph") in (GLTF_VC, BAKED) or backdrop_vc or draws_land or (parent.get("graph") in ("grass", "gravel") and weight > 0)):
                errors.append(f"vertex-coloured key {where}: rule material {target} does not multiply the vertex colour in")
        if not unruled:
            continue  # every mesh using the key gets a rule's material
        if "baseColorTexture" in entry["material"].get("pbrMetallicRoughness", {}):
            continue  # Interchange's textured branch (bHasBaseColorTexture) multiplies the vertex colour itself
        if not match.search(key):
            errors.append(f"vertex-coloured key {where} does not match vertexColor.match {match.pattern!r}: it would render without its vertex colour")
            continue
        ext = entry["material"].get("extensions", {})
        master = next((m for e, m in GLTF_MASTERS if e in ext), GLTF_DEFAULT)
        if master not in masters:
            errors.append(f"vertex-coloured key {where}: Interchange gives it {master}, which vertexColor.masters does not map")
    return len(keys)


def two_sided(mats, path):
    """The material's effective two-sidedness: its own `twoSided`, else its master's (a master without one is single-sided)."""
    spec = mats.get(path.split(".")[0], {})
    if spec.get("graph") == "river":
        return True  # river_material.py builds both river masters two-sided (the camera may be under the bridge's water)
    if "twoSided" in spec:
        return bool(spec["twoSided"])
    return bool(mats.get(spec.get("parent"), {}).get("twoSided")) if "parent" in spec else False


def double_sided_check(export_dir, mats, rule_rx, errors):
    """#2448: (key, mesh) pairs of double-sided GLB materials a rule replaces, and the rules that keep them single-sided
    with a reason. A rule without a reason sending one to a single-sided material is an error."""
    checked, excused = set(), set()
    for name in sorted(os.listdir(export_dir)):
        if not name.endswith(".glb"):
            continue
        j = glb_json(os.path.join(export_dir, name))
        materials = j.get("materials", [])
        for mesh in j.get("meshes", []):
            for p in mesh.get("primitives", []):
                if "material" not in p or not materials[p["material"]].get("doubleSided"):
                    continue
                key, mesh_name = materials[p["material"]].get("name", ""), mesh.get("name", "")
                hit = next((r for rx, mx, r in rule_rx if rx.search(key) and (mx is None or mx.search(mesh_name))), None)
                if not hit or (key, mesh_name) in checked:
                    continue
                checked.add((key, mesh_name))
                if two_sided(mats, hit["material"]):
                    continue
                if hit.get("singleSided"):
                    excused.add(hit["match"] + (" " + hit["mesh"] if hit.get("mesh") else ""))
                    continue
                errors.append(f"double-sided key {key} on {name[:-4]}/{mesh_name}: rule {hit['match']} sends it to single-sided "
                              f"{hit['material'].split('.')[-1]} (set twoSided on the material, or give the rule a singleSided reason)")
    return checked, excused


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    export_dir = args[0] if args else os.path.join(ROOT, "unreal", "Lunden", "Import")
    with open(os.path.join(ROOT, "tools", "unreal-engine", "material-map.json"), encoding="utf-8") as f:
        table = json.load(f)
    errors = []
    mats, rules, defaults = table["materials"], table["rules"], table.get("defaults", [])
    rule_rx = [(re.compile(r["match"]), re.compile(r["mesh"]) if r.get("mesh") else None, r) for r in rules]
    default_rx = [(re.compile(d["match"]), d) for d in defaults]

    # 2. rules -> listed materials
    for r in rules:
        if r["material"].split(".")[0] not in mats:
            errors.append(f"rule {r['match']} names {r['material']}, which is not listed under materials")
    for d in defaults:
        if not d.get("reason"):
            errors.append(f"default {d['match']} has no reason")
    # 3. instances -> masters and their parameters
    for path, spec in mats.items():
        if "parent" in spec:
            parent = mats.get(spec["parent"])
            if parent is None or "parent" in parent:
                errors.append(f"{path}: parent {spec['parent']} is not a listed master")
                continue
            unknown = set(spec.get("params", {})) - MASTER_PARAMS.get(parent.get("graph"), set())
            params = spec.get("params", {})
            if parent.get("graph") == "tiled" and bool(params.get("FilterBrick")) != (spec.get("surface") == "brick"):
                errors.append(f"{path}: only running-bond brick surfaces should enable the mortar footprint filter")
            if params.get("FilterBrick") and (params.get("Bond") != 0.5 or params.get("Stagger") != 0):
                errors.append(f"{path}: the mortar footprint filter expects alternate half-brick rows")
            if unknown:
                errors.append(f"{path}: {parent.get('graph')} master has no parameter(s) {sorted(unknown)}")
        elif spec.get("graph", "constant") not in ("constant", "river", GLTF_VC, BAKED, *MASTER_PARAMS):
            errors.append(f"{path}: unknown graph {spec.get('graph')}")
        if spec.get("graph") == BAKED and (not path.startswith("/Game/Lunden/Generated/")
                                           or not 0 <= spec.get("emergency", -1) <= 1 or spec.get("twoSided") is not True
                                           or not 0 < spec.get("opacity", 1) <= 1
                                           or not re.fullmatch(r"#[0-9a-f]{6}", spec.get("color", "#ffffff"))):
            errors.append(f"{path}: a {BAKED} master is generated (under /Game/Lunden/Generated/), two-sided, with emergency 0-1, "
                          "an optional opacity 0-1 and an optional #rrggbb color")
        if spec.get("graph") == "backdrop-texture":
            canvas = spec.get("canvas", "")
            if not re.fullmatch(r"[A-Za-z]+", canvas) or not os.path.isfile(os.path.join(
                    ROOT, "tools", "unreal-engine", "backdrop-textures", canvas + ".png")):
                errors.append(f"{path}: missing backdrop canvas {canvas}")
            if not all(isinstance(spec.get(key), bool) for key in ("vertexColors", "twoSided")):
                errors.append(f"{path}: backdrop must specify vertexColors and twoSided")
        # 4. source / assumption
        if not spec.get("source") or "assumption" not in spec:
            errors.append(f"{path}: needs `source` and `assumption`")
        if re.search(r"guess", (spec.get("source") or "") + (spec.get("note") or ""), re.I) and not spec.get("assumption"):
            errors.append(f"{path}: source says guess but the assumption is empty")

    # 5. #2308: every lawn key of the export (its colour map is the grass detail map, in any zone) has a rule to a grass
    # instance whose Color is the key's own colour
    mpath = os.path.join(export_dir, "measurements.json")
    if os.path.isfile(mpath):
        with open(mpath, encoding="utf-8") as f:
            export_materials = json.load(f).get("materials", {})
        lawns = {k: v for k, v in export_materials.items() if v.get("map") == GRASS_MAP}
        for key, info in sorted(lawns.items()):
            rule = next((r for rx, mx, r in rule_rx if rx.search(key) and mx is None), None)
            target = mats.get(rule["material"].split(".")[0]) if rule else None
            parent = mats.get(target.get("parent")) if target else None
            if not parent or parent.get("graph") != "grass":
                errors.append(f"lawn key {key} (map {GRASS_MAP}) has no rule to a grass material")
            elif target["params"].get("Color", "").lower() != info["color"].lower():
                errors.append(f"lawn key {key}: {rule['material']} Color {target['params'].get('Color')} is not the key's {info['color']}")
        print(f"lawn keys (map {GRASS_MAP}): {len(lawns)}, each on a grass material with its own colour")

        # 5b. #2433: every gravel key (the shared stone map) has a rule to a gravel instance whose Color, divided by the map's
        # linear mean as the web's gravelColor does, gives the key's colour (the export clips it to 1 per channel)
        mean = (json.load(open(mpath, encoding="utf-8")).get("site", {}).get("gravelSurface") or {}).get("mean")
        gravels = {k: v for k, v in export_materials.items() if v.get("map") == GRAVEL_MAP}
        for key, info in sorted(gravels.items()):
            rule = next((r for rx, mx, r in rule_rx if rx.search(key) and mx is None), None)
            target = mats.get(rule["material"].split(".")[0]) if rule else None
            parent = mats.get(target.get("parent")) if target else None
            if not parent or parent.get("graph") != "gravel":
                errors.append(f"gravel key {key} (map {GRAVEL_MAP}) has no rule to a gravel material")
            elif not mean:
                errors.append("measurements.json has no site.gravelSurface.mean: re-export (#2433)")
            else:
                want = [srgb_byte(min(1.0, linear_of(c) / mean)) for c in hex_channels(target["params"].get("Color", "#000000"))]
                got = hex_channels(info["color"])
                if any(abs(w - g * 255) > 1.01 for w, g in zip(want, got)):
                    errors.append(f"gravel key {key}: {rule['material']} Color {target['params'].get('Color')} / mean {mean} "
                                  f"is not the key's {info['color']}")
            if info.get("vertexColors") and target and target.get("params", {}).get("VertexColorWeight", 0) <= 0:
                errors.append(f"gravel key {key} is vertex-coloured (the boule court's tint) but {rule['material']} ignores it")
        print(f"gravel keys (map {GRAVEL_MAP}): {len(gravels)}, each on a gravel material with the web's colour")

        # 6. #2318: patterned web surfaces never fall back to Interchange's plain instance or another surface's material
        patterned, by_node, checked = look_classes(export_materials), zone_meshes(export_dir), {}
        if not any("looks" in info for info in export_materials.values()):
            errors.append("measurements.json has no materials[].looks: the export predates #2318, export again")
        for key, look, cls in patterned:
            nodes = look.get("nodes") or [nid for nid, (_, parts) in by_node.items() if any(key in k for _, k in parts)]
            for nid in nodes:
                zone, parts = by_node.get(nid, (None, []))
                for mesh_name, mkeys in parts:
                    if key not in mkeys:
                        continue
                    hit = next((r for rx, mx, r in rule_rx if rx.search(key) and (mx is None or mx.search(mesh_name))), None)
                    target = mats.get(hit["material"].split(".")[0]) if hit else None
                    got = target.get("surface") if target else None
                    if got != cls:
                        errors.append(f"{cls} look of key {key} on {zone}/{mesh_name} reaches "
                                      f"{hit['material'].split('.')[-1] if hit else 'the import default'} (draws {got or 'no ' + cls})")
                    checked.setdefault(cls, set()).add((zone, mesh_name, key))
        print("patterned surfaces (#2318): " + ", ".join(f"{c} {len(checked.get(c, ()))} mesh(es)" for c in PATTERNED)
              + f" from {len(patterned)} look(s); each on a material that draws its surface")

        # 6b. #2416: meshes drawing the same web canvas (a look's mapIndex) reach the same material in every zone. A
        # `mesh` selector names surfaces one by one; a sibling it misses (Hus L's patio and terrace screen walls next to
        # L1007's) falls through to the shared key's catch-all (white wall tiles) although the web paints it alike
        canvases = shared = 0
        for key, info in sorted(export_materials.items()):
            for look in info.get("looks", []):
                if look.get("mapIndex") is None:
                    continue
                reach = {}
                for nid in look.get("nodes") or []:
                    zone, parts = by_node.get(nid, (None, []))
                    for mesh_name, mkeys in parts:
                        if key in mkeys:
                            hit = next((r for rx, mx, r in rule_rx if rx.search(key) and (mx is None or mx.search(mesh_name))), None)
                            reach.setdefault(hit["material"].split(".")[-1] if hit else "the import default", []).append(f"{zone}/{mesh_name}")
                canvases += 1
                if len(reach) > 1:
                    errors.append(f"key {key} canvas {look['mapIndex']} ({look.get('surface') or look.get('map') or 'untagged'}) "
                                  "reaches different materials: " + "; ".join(f"{m}: {', '.join(sorted(w))}" for m, w in sorted(reach.items())))
                elif reach and sum(len(w) for w in reach.values()) > 1:
                    shared += 1
        print(f"shared web canvases (#2416): {canvases} look(s), {shared} drawn on several meshes, each mesh on the same material")
        # 9. #2425: the soldier courses keep their canvas (a plain white key drew a wide white band round every window)
        soldier = sorted(k for k, v in export_materials.items()
                         if v.get("map") == SOLDIER_MAP or any(l.get("map") == SOLDIER_MAP for l in v.get("looks", [])))
        if not soldier:
            errors.append(f"no export key draws the soldier courses (map {SOLDIER_MAP}): openingTexture lost its name?")
        textured = set()
        for name in sorted(os.listdir(export_dir)):
            if name.endswith(".glb"):
                for m in glb_json(os.path.join(export_dir, name)).get("materials", []):
                    if m.get("name") in soldier and "baseColorTexture" in m.get("pbrMetallicRoughness", {}):
                        textured.add(m["name"])
        for key in soldier:
            if key not in textured:
                errors.append(f"soldier-course key {key} has no base colour texture in its GLB")
            hit = next((r for rx, mx, r in rule_rx if rx.search(key)), None)
            if hit:
                errors.append(f"soldier-course key {key}: rule {hit['match']} replaces its canvas with {hit['material']}")
        print(f"soldier courses (#2425): {', '.join(soldier) or 'none'}, each with its canvas in the GLB")

    # 10. #2448: double-sided web surfaces stay double-sided under a rule's material
    before = len(errors)
    checked, excused = double_sided_check(export_dir, mats, rule_rx, errors)
    single = len(errors) - before
    print(f"double-sided surfaces under rules (#2448): {len(checked)} key/mesh pair(s), "
          + (f"{single} on a single-sided material" if single else "each on a two-sided material")
          + (f" or a rule with a singleSided reason ({len(excused)}: {', '.join(sorted(excused))})" if excused else ""))
    for r in rules:
        if "singleSided" in r and not str(r["singleSided"]).strip():
            errors.append(f"rule {r['match']} has an empty singleSided reason")

    # 7. #2321: vertex colours drawn in every zone
    vc_keys = vertex_color_check(export_dir, table, rule_rx, errors)
    print(f"vertex-coloured keys (all zones): {vc_keys}, each on a master that multiplies the vertex colour in")

    # 1. coverage, per (key, mesh) so mesh selectors count
    nodes = scope_nodes(export_dir, table["scope"])
    per_key, selector_hits = {}, {i: 0 for i, r in enumerate(rules) if r.get("mesh")}
    for zone, node_id, parts, keys in nodes:
        for key in keys:
            per_key.setdefault(key, {"nodes": 0, "targets": set()})["nodes"] += 1
        for mesh_name, mkeys in parts:
            for key in mkeys:
                hit = next(((i, r) for i, (rx, mx, r) in enumerate(rule_rx) if rx.search(key) and (mx is None or mx.search(mesh_name))), None)
                if hit:
                    per_key.setdefault(key, {"nodes": 0, "targets": set()})["targets"].add(hit[1]["material"].split(".")[-1])
    # a `mesh` selector may name a mesh of any zone (#2318: the façades, roofs and ground outside the scope zones)
    for _, parts in zone_meshes(export_dir).values():
        for mesh_name, mkeys in parts:
            for key in mkeys:
                hit = next((i for i, (rx, mx, r) in enumerate(rule_rx) if rx.search(key) and (mx is None or mx.search(mesh_name))), None)
                if hit in selector_hits:
                    selector_hits[hit] += 1
    for i, n in selector_hits.items():
        if n == 0:
            errors.append(f"rule {rules[i]['match']} with mesh {rules[i]['mesh']} selects no mesh in the export (moved surface?)")
    mapped = defaulted = 0
    lines = []
    for key in sorted(per_key, key=lambda k: (-per_key[k]["nodes"], k)):
        info = per_key[key]
        if info["targets"]:
            mapped += 1
            lines.append(f"  {key:34s} {info['nodes']:4d}  -> {', '.join(sorted(info['targets']))}")
            continue
        d = next((d for rx, d in default_rx if rx.search(key)), None)
        if d is None:
            errors.append(f"key {key} ({info['nodes']} nodes) has neither a rule nor a default")
            lines.append(f"  {key:34s} {info['nodes']:4d}  UNMAPPED")
        else:
            defaulted += 1
            lines.append(f"  {key:34s} {info['nodes']:4d}  default: {d['reason'][:90]}")
    if "--table" in argv:
        print("\n".join(lines))
    print(f"material keys on {len(nodes)} building/ground nodes ({', '.join(table['scope']['zones'])}): "
          f"{len(per_key)} keys, {mapped} mapped by rules, {defaulted} on the import default with a reason, "
          f"{len(per_key) - mapped - defaulted} unmapped")
    for e in errors:
        print("ERROR: " + e)
    if errors:
        return 1
    print("MATERIAL_COVERAGE_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
