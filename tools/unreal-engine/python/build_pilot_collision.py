"""Build the pilot's walkable geometry in its persistent map, preserving both source imports."""
import unreal as u

MAP = "/Game/Lunden/Maps/Pilot_L1007"
COLLISION_ASSETS = "/Game/Lunden/Generated/PilotCollision"
CUBE = "/Engine/BasicShapes/Cube"
# Stable export IDs of the 4 straight, 8 winding and 3 return treads from src/stairs.js.
TREADS = """
mesh_l0_x364_z713_y10 mesh_l0_x393_z713_y20 mesh_l0_x422_z713_y30 mesh_l0_x450_z713_y41
mesh_l0_x483_z710_y89 mesh_l0_x507_z710_y109 mesh_l0_x507_z708_y130 mesh_l0_x507_z683_y150
mesh_l0_x507_z648_y170 mesh_l0_x507_z623_y191 mesh_l0_x507_z621_y211 mesh_l0_x483_z621_y231
mesh_l0_x451_z618_y252 mesh_l0_x425_z618_y272 mesh_l0_x399_z618_y292
""".split()

world = u.EditorLoadingAndSavingUtils.load_map(MAP)
if not world:
    raise RuntimeError("Compose the pilot level before preparing its collision")
actors = u.get_editor_subsystem(u.EditorActorSubsystem)
existing = {str(a.get_actor_label()): a for a in actors.get_all_level_actors()}
cube = u.EditorAssetLibrary.load_asset(CUBE)
tools = u.AssetToolsHelpers.get_asset_tools()


def static_actor(label, mesh, hidden=True):
    actor = existing.get(label) or actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(0, 0, 0))
    actor.set_actor_label(label)
    actor.static_mesh_component.set_static_mesh(mesh)
    actor.static_mesh_component.set_collision_profile_name("BlockAll")
    actor.set_actor_hidden_in_game(hidden)
    if hidden:
        actor.tags = [u.Name("kind:collision"), u.Name("zone:pilot")]
    return actor


def box(label, centre, extent, hidden=True):
    actor = static_actor(label, cube, hidden)
    actor.set_actor_location(centre, False, False)
    actor.set_actor_scale3d(extent / 50)
    return actor


def surface(label, x0, x1, y0, y1, top, material):
    centre = u.Vector((x0 + x1) / 2, (y0 + y1) / 2, top - 10)
    extent = u.Vector((x1 - x0) / 2, (y1 - y0) / 2, 10)
    mesh_actor = box(label, centre, extent, False)
    path = "/Game/Lunden/Generated/l1007-uteplats/Materials/" + material
    appearance = u.EditorAssetLibrary.load_asset(path)
    if not appearance:
        raise RuntimeError(f"Missing pilot ground material {path}")
    mesh_actor.static_mesh_component.set_material(0, appearance)


# SITE.roads "Gården framför Hus L" and SITE.life.strip, clipped at this
# apartment's boundaries. The web leaves a 35 cm margin on each side of the
# entrance gap. Both the car park and entrance approach are at street level.
surface("Lunden pilot forecourt", 0, 575.3, -1630, -350, 0, "std_55595c_r86_m0_tex")
surface("Lunden pilot entrance ground", 0, 575.3, -350, 0, 0, "std_8d8f8c_r90_m0")
surface("Lunden pilot planting west", 0, 45.47, -350, -290, 10, "std_78a64b_r95_m0_vc_tex")
surface("Lunden pilot planting east", 215.86, 575.3, -350, -290, 10, "std_78a64b_r95_m0_vc_tex")

# The imported proxies carry the web wall rectangles and floor plates, including
# the staircase opening. Their shared Interchange cube can have an empty BodySetup.
# Reuse their bounds with the engine's collidable 100 cm cube.
proxies = [a for a in existing.values()
           if {"kind:collision", "zone:l1007"}.issubset(str(tag) for tag in a.tags)]
if not proxies:
    raise RuntimeError("The pilot does not contain the imported apartment collision proxies")
for source in proxies:
    centre, extent = source.get_actor_bounds(False)
    box("Lunden pilot collision " + source.get_actor_label(), centre, extent)

# The patio plan in data/plan.json runs from 4.66..563.81 by 1274.82..1772.24 cm.
# Bridge the 4.92 cm joint between the apartment slab and the paving.
box("Lunden pilot patio support", u.Vector(284.235, 1521.07, -10), u.Vector(279.575, 251.17, 10))

# A bounding box would fill the gaps between wedge-shaped winders. Use the
# actual triangles from each visible tread for the character's simple sweeps.
for name in TREADS:
    source = existing.get(name)
    if not source:
        raise RuntimeError(f"Missing imported L1007 tread {name}")
    target = "Collision_" + name
    path = f"{COLLISION_ASSETS}/{target}"
    if u.EditorAssetLibrary.does_asset_exist(path):
        mesh = u.EditorAssetLibrary.load_asset(path)
    else:
        mesh = tools.duplicate_asset(target, COLLISION_ASSETS, source.static_mesh_component.static_mesh)
    body = mesh.get_editor_property("body_setup")
    body.set_editor_property("collision_trace_flag", u.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
    if not u.EditorAssetLibrary.save_loaded_asset(mesh, only_if_is_dirty=False):
        raise RuntimeError(f"Could not save {path}")
    actor = static_actor("Lunden pilot collision " + name, mesh)
    actor.set_actor_transform(source.get_actor_transform(), False, False)

if not u.EditorLoadingAndSavingUtils.save_map(world, MAP):
    raise RuntimeError("Cannot save pilot collision")
u.log(f"LUNDEN_PILOT_COLLISION_OK {len(proxies)} wall/floor boxes and {len(TREADS)} treads")
