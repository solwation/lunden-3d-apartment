"""#2374: check the imported parked vehicle/rack boxes and sweep a standing player's capsule across each kind.
run-python.ps1 tools/unreal-engine/tests/test_parked_vehicles.py [measurements.json]
"""
from collections import defaultdict
from itertools import product
import json
import math
from pathlib import Path
import sys

import unreal as u


def check_vertices(actors, vehicles):
    """The editor can reorder vertices. Match the web samples to actual rendered LOD0 vertices in world space."""
    by_node = defaultdict(list)
    for vehicle in vehicles:
        for part in vehicle["parts"]:
            for anchor in part["anchors"]:
                x, y, z = anchor["web"]
                by_node[part["node"]].append((100*x, 100*z, 100*y))
    section_vertices = {}
    worst = 0
    for node, targets in by_node.items():
        component = actors[node].get_component_by_class(u.StaticMeshComponent)
        mesh = component.static_mesh
        path = mesh.get_path_name()
        if path not in section_vertices:
            # Parked parts have one GLB primitive each. Interchange can weld or reorder its vertices.
            section_vertices[path] = u.KismetProceduralMeshLibrary.get_section_from_static_mesh(mesh, 0, 0)[0]
        # 1 cm bins around the small set of requested vertices avoid scanning each mesh once per sample.
        bins = defaultdict(list)
        best = [float("inf")] * len(targets)
        for index, target in enumerate(targets):
            cell = [math.floor(value) for value in target]
            for offset in product((-1, 0, 1), repeat=3):
                bins[tuple(a+b for a, b in zip(cell, offset))].append(index)
        transform = component.get_world_transform()
        for local in section_vertices[path]:
            p = transform.transform_location(local)
            point = (p.x, p.y, p.z)
            for index in bins.get(tuple(map(math.floor, point)), ()):
                best[index] = min(best[index], math.dist(point, targets[index]))
        if max(best) > 1:
            raise RuntimeError(f"{node}: native render vertex missing within 1 cm of {targets[best.index(max(best))]}")
        worst = max(worst, max(best))
    return worst


def run(file):
    data = json.loads(file.read_text(encoding="utf-8"))
    parked = data["site"]["parkedVehicles"]
    rows = parked["blockers"]
    vertex_error = 0
    radius, half_height = (data["spawn"]["player"]["radius"] * 100, data["spawn"]["player"]["headroom"] * 50)
    samples = {}
    for zone in sorted({r["zone"] for r in rows}):
        if not u.EditorLoadingAndSavingUtils.load_map(f"/Game/Lunden/Generated/{zone}/Level_{zone}"):
            raise RuntimeError(f"Import the {zone} zone first")
        world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
        actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
        names = {a.get_name(): a for a in actors}
        vehicles = [v for v in parked["vehicles"] if v["zone"] == zone]
        vertex_error = max(vertex_error, check_vertices(names, vehicles))
        scenery = {part["node"] for vehicle in vehicles for part in vehicle["parts"]}
        for row in (r for r in rows if r["zone"] == zone):
            actor = names[row["id"]]
            comp = actor.static_mesh_component
            assert comp.get_collision_response_to_channel(u.CollisionChannel.ECC_PAWN) == u.CollisionResponse.ECR_BLOCK, row["id"]
            assert str(comp.get_collision_profile_name()) == "BlockAll" and actor.get_editor_property("hidden"), row["id"]
            family = (row["area"], "car" if "_car_" in row["id"] else "rack")
            if family in samples:
                continue
            a, b, opposite, _ = row["foot"]
            edge = [(a[i] + b[i]) * 50 for i in range(2)]
            centre = [(a[i] + opposite[i]) * 50 for i in range(2)]
            length = math.dist(centre,edge)
            normal = [(edge[i]-centre[i])/length for i in range(2)]
            z = row["base"] * 100 + half_height
            start = u.Vector(edge[0]+(radius+50)*normal[0],edge[1]+(radius+50)*normal[1],z)
            end = u.Vector(*centre,z)
            # A visible parked mesh that blocks the pawn early must fail this sweep too.
            ignore = [other for other in actors if other != actor and other.get_name() not in scenery]
            hit = u.SystemLibrary.capsule_trace_single(world,start,end,radius,half_height,u.TraceTypeQuery.ECC_VISIBILITY,
                                                      False,ignore,u.DrawDebugTrace.NONE,True)
            if isinstance(hit,tuple):
                hit = hit[-1] if hit[0] else None
            parts = hit.to_tuple() if hit else None
            if not parts or not parts[0] or parts[9] != actor:
                raise RuntimeError(f"Player capsule missed {row['id']}")
            point = parts[5]  # FHitResult.ImpactPoint; compare the horizontal contact with the source edge
            error = math.hypot(point.x-edge[0], point.y-edge[1])
            if error > 1:
                raise RuntimeError(f"{row['id']}: capsule contacted {error:.2f} cm from the web edge")
            samples[family] = round(error,3)
    u.log(f"LUNDEN_PARKED_VEHICLES_OK max render vertex error {vertex_error:.4f} cm, "
          f"{len(rows)} BlockAll boxes, standing capsule contact errors (cm) {samples}")


if __name__ == "__main__":
    run(Path(sys.argv[1]) if len(sys.argv)>1 else Path(u.Paths.project_dir()) / "Import/measurements.json")
