"""Lunden (#2282): key coverage of tools/unreal-engine/material-map.json against a web export. Plain Python 3, no Unreal.

    python3 tools/unreal-engine/tests/test_materials.py [<export dir>] [--table]

<export dir> defaults to unreal/Lunden/Import (the folder tools/unreal-engine/export-world.mjs writes). Checks:
  1. every material key on a building or ground node (`scope`: zones x kinds) matches a rule or a default with a reason;
  2. every rule names a material listed under `materials`, and every rule with a `mesh` selector still selects a mesh
     with that key in the export (a moved surface changes its id: the rule would silently stop applying);
  3. every instance names a listed master and only parameters that master has;
  4. every material carries `source` and an `assumption` field, and an entry whose source or note says *guess* keeps an
     assumption text (plan-material's markers stay with the material);
  5. (#2308) every lawn key has a rule to a grass instance of its own colour;
  6. (#2318) every web look with a patterned surface (brick, roof seams, asphalt, paving: PATTERNED) reaches a material that
     draws that surface (its `surface` field), on every mesh that shows it, in every zone of the export. The class comes from
     the export itself (measurements.json materials[].looks: the web's own weather class, or the colour map's name, or the
     class of another look drawing the same canvas, `mapIndex`), never from a list of keys here. A look without a colour
     map (the web's plain brick pilasters, a plain asphalt path) is drawn in full by Interchange's instance and may stay.
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
    "tiled": {"Size", "Color", "JointColor", "Joint", "Bond", "Stagger", "Variation", "Grain", "Roughness", "JointRoughness"},
    "glass": {"BaseColor", "Opacity", "Roughness", "Specular"},
    "grass": {"Color", "Ground", "BladeRange", "BladeLength", "Cell", "StrokeWidth", "StrawTint", "BladeTint",
              "VertexColorWeight", "Roughness", "Tile", "PatchCells", "PatchContrast", "Dry", "Lush", "TuftCount", "TuftRadius",
              "TuftShade"},
}
GRASS_MAP = "shared-grass-detail"  # src/grass.js grassTexture's name; measurements.json materials[].map since #2308
# #2318: web surface classes whose look is a pattern in the colour map (joints, seams, aggregate) that Interchange's plain
# instance loses, and colour-map names that carry a class themselves (src/roofsurface.js roofMap, src/asphaltsurface.js)
PATTERNED = ("brick", "roof", "asphalt", "paving")
MAP_CLASS = {"roof-surface": "roof", "asphalt-aggregate-colour": "asphalt"}


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
            if unknown:
                errors.append(f"{path}: {parent.get('graph')} master has no parameter(s) {sorted(unknown)}")
        elif spec.get("graph", "constant") not in ("constant", *MASTER_PARAMS):
            errors.append(f"{path}: unknown graph {spec.get('graph')}")
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
