"""Lunden (#2282): key coverage of tools/unreal-engine/material-map.json against a web export. Plain Python 3, no Unreal.

    python3 tools/unreal-engine/tests/test_materials.py [<export dir>] [--table]

<export dir> defaults to unreal/Lunden/Import (the folder tools/unreal-engine/export-world.mjs writes). Checks:
  1. every material key on a building or ground node (`scope`: zones x kinds) matches a rule or a default with a reason;
  2. every rule names a material listed under `materials`, and every rule with a `mesh` selector still selects a mesh
     with that key in the export (a moved surface changes its id: the rule would silently stop applying);
  3. every instance names a listed master and only parameters that master has;
  4. every material carries `source` and an `assumption` field, and an entry whose source or note says *guess* keeps an
     assumption text (plan-material's markers stay with the material).
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
}


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
                    if hit[0] in selector_hits:
                        selector_hits[hit[0]] += 1
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
