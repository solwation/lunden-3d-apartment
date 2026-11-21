"""#2323: the backdrop houses' level as imported, checked against the export (commandlet, no Play In Editor).

    run-python.ps1 tools/unreal-engine/tests/check_fond.py

Loads /Game/Lunden/Generated/fond/Level_fond (import_world.py --zones fond) and checks that

- every mesh node of Import/fond.glb is an actor of that level, named and labelled by its export id;
- each actor's visible bounds centre equals the web's world-box centre that its id encodes (export-scene.js node ids:
  `_x<cm>_z<cm>_y<cm>` in the web's axes, `m` = minus) within TOLERANCE, after the Unreal axes (X = web x, Y = web z,
  Z = web y);
- the level is listed in world-levels.json, so compose_world.py streams it in L_Lunden.

Writes Saved/fond-result.json and logs LUNDEN_FOND_OK (or raises).
"""
import json
import math
from pathlib import Path
import re
import struct

import unreal as u

TOLERANCE = 5.0  # cm, the issue's acceptance (the web's place within 5 cm)
PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
TOOLS = PROJECT.parents[1] / "tools/unreal-engine"
LEVEL = "/Game/Lunden/Generated/fond/Level_fond"
ID = re.compile(r"_x(m?\d+)_z(m?\d+)_y(m?\d+)$")


def glb_nodes(path):
    data = path.read_bytes()
    length = struct.unpack("<I", data[12:16])[0]
    gltf = json.loads(data[20:20 + length])
    return [n["name"] for n in gltf["nodes"] if "mesh" in n]


def centre_of(node_id):
    m = ID.search(node_id)
    if not m:
        return None
    x, z, y = (-float(v[1:]) if v.startswith("m") else float(v) for v in m.groups())
    return (x, z, y)  # Unreal X, Y, Z in cm


def main():
    world = json.loads((TOOLS / "world-levels.json").read_text(encoding="utf-8"))
    if LEVEL not in [entry["package"] for entry in world["levels"]]:
        raise RuntimeError(f"{LEVEL} is not listed in world-levels.json")
    nodes = glb_nodes(PROJECT / "Import/fond.glb")
    if not u.EditorLoadingAndSavingUtils.load_map(LEVEL):
        raise RuntimeError(f"Could not load {LEVEL}: run import_world.py --zones fond")
    actors = {a.get_name(): a for a in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()}
    rows, missing, far = [], [], []
    for node_id in nodes:
        actor = actors.get(node_id)
        if actor is None or actor.get_actor_label() != node_id:
            missing.append(node_id)
            continue
        want = centre_of(node_id)
        origin, extent = actor.get_actor_bounds(False)
        got = (origin.x, origin.y, origin.z)
        error = math.dist(got, want) if want else None
        rows.append({"id": node_id, "unreal": [round(v, 2) for v in got], "web": want,
                     "extentM": [round(v / 100, 1) for v in (extent.x, extent.y, extent.z)],
                     "errorCm": None if error is None else round(error, 2)})
        if error is None or error > TOLERANCE:
            far.append(node_id)
    worst = max((r["errorCm"] for r in rows if r["errorCm"] is not None), default=None)
    result = {"level": LEVEL, "nodes": len(nodes), "actors": len(rows), "missing": missing, "outside": far,
              "toleranceCm": TOLERANCE, "worstCm": worst, "rows": rows}
    (PROJECT / "Saved/fond-result.json").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    u.EditorLoadingAndSavingUtils.new_blank_map(False)
    if missing or far:
        raise RuntimeError(f"LUNDEN_FOND_FAIL missing {missing[:5]} outside {TOLERANCE} cm {far[:5]}")
    u.log(f"LUNDEN_FOND_OK {len(rows)} of {len(nodes)} backdrop nodes at the web's place, worst {worst} cm")


main()
