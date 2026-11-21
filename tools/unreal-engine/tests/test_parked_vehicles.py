"""#2374: the imported parked cars and bicycles and their walking collision, measured in Play In Editor.

Loads the zones that hold parked vehicles (gard, kvarteret, omgivning; in memory, nothing is saved) and checks, in the
editor world, that every web model point recorded in measurements.json `site.parkedVehicles` lies within 1 cm of a
vertex of its actor's LOD0 and that every footprint box is a hidden BlockAll actor that blocks Pawn. Then it starts Play
In Editor and sweeps a standing player capsule (the web's PLAYER.radius and headroom, simple collision as the character
uses) from outside one source edge towards the centre, once per area and kind (street/east-lot/garage cars, street,
courtyard and garage racks). The capsule must stop on that box within 1 cm of the web edge; a visible parked mesh that
blocks earlier fails too. Then the game's own player (world-levels.json gameMode, set in memory) walks straight into
a street car, a street bike rack and a garage bike rack, and must stop with its capsule at the web edge (the web's
player circle stops at PLAYER.radius from the footprint), within WALK_TOLERANCE. The zone levels alone have no
walkable ground collision (build_site.py adds it to the composed world), so each walk gets a flat 4 m test slab whose
top is the box's base, in memory only. The editor world of a commandlet
traces nothing (no physics scene), hence PIE.
Run like the other tests: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_parked_vehicles
Logs LUNDEN_PARKED_VEHICLES_OK.
"""
from collections import defaultdict
from itertools import product
import json
import math
from pathlib import Path
import sys
import time

import unreal as u

sys.path.insert(0, str(Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).parents[1]
                       / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402  #2311: start without the player's save file

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
DATA = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
PARKED = DATA["site"]["parkedVehicles"]
ROWS = PARKED["blockers"]
ZONES = sorted({r["zone"] for r in ROWS} | {v["zone"] for v in PARKED["vehicles"]})
RADIUS, HALF_HEIGHT = DATA["spawn"]["player"]["radius"] * 100, DATA["spawn"]["player"]["headroom"] * 50
level = lambda zone: f"/Game/Lunden/Generated/{zone}/Level_{zone}"
WORLD = json.loads((PROJECT.parents[1] / "tools/unreal-engine/world-levels.json").read_text(encoding="utf-8"))
WALKS = (("street", "car"), ("yard", "rack"), ("garage", "rack"))  # a car and a bike rack at street level, one underground
WALK_TOLERANCE = 2.0  # cm: CharacterMovement stops a hair short of a wall (its own contact offset)


def family(row):
    return row["area"], "car" if "_car_" in row["id"] else "rack"


def edge_of(row):
    """Midpoint of the footprint's first side and its outward unit normal (cm, Unreal x/y)."""
    a, b, opposite, _ = row["foot"]
    edge = [(a[i] + b[i]) * 50 for i in range(2)]
    centre = [(a[i] + opposite[i]) * 50 for i in range(2)]
    length = math.dist(centre, edge)
    return edge, centre, [(edge[i] - centre[i]) / length for i in range(2)]


def check_vertices(actors, vehicles):
    """The editor can reorder vertices. Match the web samples to LOD0's vertices in world space."""
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
            # Parked parts have one GLB primitive each. Interchange can weld or reorder its vertices. LOD0's mesh
            # description is what the render data is built from (the ProceduralMeshComponent plugin and its
            # KismetProceduralMeshLibrary are not enabled in this project).
            desc = mesh.get_static_mesh_description(0)
            section_vertices[path] = [desc.get_vertex_position(u.VertexID(i)) for i in range(desc.get_vertex_count())]
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


editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not u.EditorLoadingAndSavingUtils.load_map(level(ZONES[0])):
    raise RuntimeError(f"Import the {ZONES[0]} zone first")
for zone in ZONES[1:]:
    if not u.EditorLevelUtils.add_level_to_world(editor.get_editor_world(), level(zone), u.LevelStreamingAlwaysLoaded):
        raise RuntimeError(f"Import the {zone} zone first")
NAMES = {a.get_name(): a for a in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()}
VERTEX_ERROR = check_vertices(NAMES, PARKED["vehicles"])
for row in ROWS:
    comp = NAMES[row["id"]].static_mesh_component
    response = comp.get_collision_response_to_channel(u.CollisionChannel.ECC_PAWN)  # Python: CollisionResponseType
    assert getattr(response, "name", str(response)).upper().endswith("BLOCK"), (row["id"], response)
    assert str(comp.get_collision_profile_name()) == "BlockAll" and NAMES[row["id"]].get_editor_property("hidden"), row["id"]
SCENERY = {part["node"] for vehicle in PARKED["vehicles"] for part in vehicle["parts"]}
CUBE = u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube")
for kind in WALKS:
    row = next(r for r in ROWS if family(r) == kind)
    edge, _, _ = edge_of(row)
    slab = u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(
        u.StaticMeshActor, u.Vector(edge[0], edge[1], row["base"] * 100 - 10))
    slab.static_mesh_component.set_static_mesh(CUBE)
    slab.static_mesh_component.set_collision_profile_name("BlockAll")
    slab.set_actor_scale3d(u.Vector(4, 4, 0.2))
editor.get_editor_world().get_world_settings().set_editor_property("default_game_mode", u.load_class(None, WORLD["gameMode"]))
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def parked_test():
    try:
        deadline = time.monotonic() + 60
        world = None
        while not world:
            if time.monotonic() >= deadline:
                raise RuntimeError("Play In Editor did not start")
            world = editor.get_game_world()
            yield
        start = u.GameplayStatics.get_time_seconds(world)
        while u.GameplayStatics.get_time_seconds(world) - start < 0.5:
            yield
        actors = u.GameplayStatics.get_all_actors_of_class(world, u.Actor)
        names = {a.get_name(): a for a in actors}
        samples = {}
        for row in ROWS:
            kind = family(row)
            if kind in samples:
                continue
            actor = names[row["id"]]
            edge, centre, normal = edge_of(row)
            z = row["base"] * 100 + HALF_HEIGHT
            begin = u.Vector(edge[0] + (RADIUS + 50) * normal[0], edge[1] + (RADIUS + 50) * normal[1], z)
            end = u.Vector(*centre, z)
            # A visible parked mesh that blocks the pawn early must fail this sweep too.
            ignore = [other for other in actors if other != actor and other.get_name() not in SCENERY]
            hit = u.SystemLibrary.capsule_trace_single(world, begin, end, RADIUS, HALF_HEIGHT, u.TraceTypeQuery.ECC_VISIBILITY,
                                                       False, ignore, u.DrawDebugTrace.NONE, True)
            if isinstance(hit, tuple):
                hit = hit[-1] if hit[0] else None
            parts = hit.to_tuple() if hit else None
            if not parts or not parts[0] or parts[9] != actor:
                got = parts[9].get_name() if parts and parts[0] and parts[9] else None
                raise RuntimeError(f"Player capsule missed {row['id']} (hit {got})")
            point = parts[5]  # FHitResult.ImpactPoint; compare the horizontal contact with the source edge
            error = math.hypot(point.x - edge[0], point.y - edge[1])
            if error > 1:
                raise RuntimeError(f"{row['id']}: capsule contacted {error:.2f} cm from the web edge")
            samples[kind] = round(error, 3)
            u.log(f"LUNDEN_PARKED_SWEEP {row['id']} ({kind[0]} {kind[1]}): contact {error:.3f} cm from the web edge")
        pawn = u.GameplayStatics.get_player_character(world, 0)
        if not pawn or not pawn.get_class().get_name().startswith("BP_LundenPlayer"):
            raise RuntimeError(f"The game's player did not spawn (got {pawn})")
        capsule = pawn.capsule_component
        radius, half = capsule.get_scaled_capsule_radius(), capsule.get_scaled_capsule_half_height()
        if abs(radius - RADIUS) > 0.01:
            raise RuntimeError(f"Player capsule radius {radius} cm, the web's PLAYER.radius is {RADIUS} cm")
        walks = {}
        for kind in WALKS:
            row = next(r for r in ROWS if family(r) == kind)
            edge, _, normal = edge_of(row)
            pawn.set_actor_location(u.Vector(edge[0] + (radius + 80) * normal[0], edge[1] + (radius + 80) * normal[1],
                                             row["base"] * 100 + half + 5), False, True)
            pawn.get_controller().set_control_rotation(u.Rotator(0, math.degrees(math.atan2(-normal[1], -normal[0])), 0))
            step = u.Vector(-normal[0], -normal[1], 0)
            t0 = u.GameplayStatics.get_time_seconds(world)
            while u.GameplayStatics.get_time_seconds(world) - t0 < 2.5:  # 80 cm at walking speed takes about 0.5 s
                pawn.add_movement_input(step, 1.0, False)
                yield
            loc = pawn.get_actor_location()
            gap = (loc.x - edge[0]) * normal[0] + (loc.y - edge[1]) * normal[1] - radius
            side = abs((loc.x - edge[0]) * -normal[1] + (loc.y - edge[1]) * normal[0])
            walks[kind] = round(gap, 3)
            u.log(f"LUNDEN_PARKED_WALK {row['id']} ({kind[0]} {kind[1]}): the player stopped {gap:.3f} cm outside the web "
                  f"edge + radius, {side:.2f} cm sideways, feet z {loc.z - half:.1f} cm")
            if not -0.5 <= gap <= WALK_TOLERANCE:
                raise RuntimeError(f"{row['id']}: the walking player stopped {gap:.2f} cm from where the web's player stops")
        u.log(f"LUNDEN_PARKED_VEHICLES_OK max LOD0 vertex error {VERTEX_ERROR:.4f} cm, {len(ROWS)} hidden BlockAll boxes, "
              f"standing capsule contact errors (cm) {samples}, walking player gaps (cm) {walks}")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
