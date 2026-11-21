"""Run as an Unreal Python Automation test in a project containing the production player (/Game/Lunden/Player, #2284)."""
import time
import unreal as u

MODE = "/Game/Lunden/Player/BP_LundenGameMode.BP_LundenGameMode_C"
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
actors = u.get_editor_subsystem(u.EditorActorSubsystem)
world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
world.get_world_settings().set_editor_property("default_game_mode", u.load_class(None, MODE))
cube = u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube")


def box(x, z, sx, sz):
    actor = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(x, 0, z))
    actor.static_mesh_component.set_static_mesh(cube)
    actor.static_mesh_component.set_collision_profile_name("BlockAll")
    actor.set_actor_scale3d(u.Vector(sx, 8, sz))


box(0, -10, 24, 0.2)      # ground surface at z=0
box(195, 10.15625, 0.7, 0.203125)  # one real L1007 riser (325 cm / 16)
box(300, 125, 0.2, 2.5)    # front of wall at x=290
actors.spawn_actor_from_class(u.PlayerStart, u.Vector(0, 0, 95))
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def walk():
    try:
        deadline = time.monotonic() + 12
        pawn = None
        while not pawn:
            if time.monotonic() > deadline:
                raise RuntimeError("PIE did not possess a pawn")
            game = editor.get_game_world()
            pawn = u.GameplayStatics.get_player_character(game, 0) if game else None
            yield
        if pawn.get_class().get_name() != "BP_LundenPlayer_C":
            raise RuntimeError(f"Wrong possessed pawn: {pawn.get_class().get_name()}")
        pc = pawn.get_controller()

        if pc.get_class().get_name() != "BP_LundenPlayerController_C":
            raise RuntimeError(f"Expected the production player controller, possessed by {pc.get_class().get_name()}")

        def key(name, down):
            u.SystemLibrary.execute_console_command(game, "Input." + ("+key " if down else "-key ") + name + (" 1" if down else ""), pc)

        def seconds(t):
            start = u.GameplayStatics.get_time_seconds(game)
            while u.GameplayStatics.get_time_seconds(game) - start < t:
                yield

        yield from seconds(0.2)
        eye, _ = pawn.get_actor_eyes_view_point()
        start = pawn.get_actor_location()
        u.log(f"PILOT_START position={start} eye={eye} controller={pc.get_class().get_name()}")
        key("W", True)
        yield from seconds(0.75)
        moved = pawn.get_actor_location()
        if not 85 < moved.x - start.x < 140:
            raise RuntimeError(f"W did not walk at 160 cm/s: {start} to {moved}")
        key("LeftShift", True)
        peak = moved.z
        for tick in seconds(0.8):
            peak = max(peak, pawn.get_actor_location().z)
            yield tick
        if peak < start.z + 18:
            raise RuntimeError(f"Character did not step onto the 20.3 cm tread: {peak-start.z}")
        stopped = pawn.get_actor_location()
        u.log(f"PILOT_WALL position={stopped} speed={pawn.character_movement.max_walk_speed}")
        if not 266 < stopped.x < 269 or abs(pawn.character_movement.max_walk_speed - 320) > 0.1:
            raise RuntimeError(f"Expected sprint to stop 22 cm short of wall: {stopped}")
        yield from seconds(0.25)
        if abs(pawn.get_actor_location().x - stopped.x) > 0.5:
            raise RuntimeError("Capsule passed through the blocking wall")
        key("W", False)
        key("LeftShift", False)
        key("LeftControl", True)
        yield from seconds(0.25)
        crouch, _ = pawn.get_actor_eyes_view_point()
        key("LeftControl", False)
        yield from seconds(0.25)
        stand, _ = pawn.get_actor_eyes_view_point()
        if abs(crouch.z - 95) > 1.0 or abs(stand.z - 162) > 1.0:
            raise RuntimeError(f"Unexpected crouch/stand eye heights: {crouch.z}/{stand.z}")
        key("SpaceBar", True)
        yield from seconds(0.16)
        jumped = pawn.get_actor_location()
        key("SpaceBar", False)
        if jumped.z < stopped.z + 25:
            raise RuntimeError(f"Jump did not leave the floor: {jumped.z}")
        yield from seconds(0.9)
        key("S", True)
        yield from seconds(0.35)
        key("S", False)
        key("D", True)
        yield from seconds(0.35)
        key("D", False)
        strafe = pawn.get_actor_location()
        key("A", True)
        yield from seconds(0.35)
        key("A", False)
        if strafe.x >= stopped.x - 30 or strafe.y < 30 or pawn.get_actor_location().y > strafe.y - 25:
            raise RuntimeError(f"Back or strafe mapping failed: {stopped} {strafe} {pawn.get_actor_location()}")
        before = pc.get_control_rotation()
        key("MouseX", True)
        key("MouseY", True)
        yield from seconds(0.3)
        key("MouseX", False)
        key("MouseY", False)
        after = pc.get_control_rotation()
        if abs(after.yaw-before.yaw) < 0.1 or abs(after.pitch-before.pitch) < 0.1:
            raise RuntimeError(f"Mouse look failed: {before} to {after}")
        u.log(f"LUNDEN_PILOT_WALK_OK start={start} walk={moved} wall={stopped} step={peak-start.z} strafe={strafe} look={after} crouchEye={crouch.z} eye={stand.z} jump={jumped.z}")
    finally:
        levels.editor_request_end_play()
