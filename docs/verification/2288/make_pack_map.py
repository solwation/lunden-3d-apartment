# Temporary (never committed): a flat test level with the world's GameMode for the packaged #2288 save check.
import unreal as u
PATH = "/Game/Lunden/Save/_PackTest/L_SaveTest"
world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
world.get_world_settings().set_editor_property("default_game_mode", u.load_class(None, "/Game/Lunden/Player/BP_LundenGameMode.BP_LundenGameMode_C"))
actors = u.get_editor_subsystem(u.EditorActorSubsystem)
ground = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(0, 0, -10))
ground.static_mesh_component.set_static_mesh(u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube"))
ground.static_mesh_component.set_collision_profile_name("BlockAll")
ground.set_actor_scale3d(u.Vector(80, 80, 0.2))
actors.spawn_actor_from_class(u.PlayerStart, u.Vector(-2000, -2000, 100))
if not u.EditorLoadingAndSavingUtils.save_map(world, PATH):
    raise RuntimeError("could not save " + PATH)
u.log("PACKMAP_OK " + PATH)
