"""#2284: the production player (/Game/Lunden/Player) against the #2245 export, in Play In Editor.

1. The pilot assets are gone from Blueprints/Pilot and PilotDoors; the mapping binds the nine Player/Input actions.
2. Movement in a temporary level with the world's GameMode (tools/unreal-engine/world-levels.json): standing and
   crouched eye height, walking, sprinting and crouched speed, the jump apex and the mouse look per count (MouseY up
   looks up, MouseX right turns right, #2294), each against
   measurements.json `spawn.player` (src/config.js PLAYER), driven by Unreal keyboard input.
3. Fall damage: the character walks off platforms of 2.9, 3.1, 4.5 and 6.1 m and lands on the ground. The lives lost
   must equal measurements.json `spawn.fall.samples`, which export-scene.js computes with the web's own
   src/falldamage.js, and a death must refill the lives as src/combat.js does.

Run like the pilot tests: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_player
Writes Saved/player-result.json and logs LUNDEN_PLAYER_TEST lines, then LUNDEN_PLAYER_TEST_OK.
"""
import json
import math
from pathlib import Path
import time
import sys
import unreal as u

sys.path.insert(0, str(Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir())).parents[1]
                       / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402  #2311: start without the player's save file

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
WORLD = json.loads((PROJECT.parents[1] / "tools/unreal-engine/world-levels.json").read_text(encoding="utf-8"))
M = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
P, F = M["spawn"]["player"], M["spawn"]["fall"]
DAMAGE = {s["drop"]: s["damage"] for s in F["samples"]}
DROPS = [2.9, 3.1, 4.5, 6.1]
WEB_GRAVITY = 9.8  # src/player.js GRAVITY (m/s^2); not exported, Unreal's default world gravity must match it

# 1. The move --------------------------------------------------------------------------------------------------------
registry = u.AssetRegistryHelpers.get_asset_registry()
for folder in ("/Game/Lunden/Blueprints/Pilot", "/Game/Lunden/Blueprints/PilotDoors"):
    left = [str(a.package_name) for a in registry.get_assets_by_path(folder, True)
            if str(a.asset_name) != "BP_LundenSwingDoor"]
    if left:
        raise RuntimeError(f"Pilot player assets left in {folder}: {left}")
mapping = u.EditorAssetLibrary.load_asset("/Game/Lunden/Player/Input/IMC_LundenPlayer")
try:  # UE 5.5+: the mappings live in DefaultKeyMappings; the old Mappings array stays empty
    entries = mapping.get_editor_property("default_key_mappings").get_editor_property("mappings")
except Exception:
    entries = mapping.get_editor_property("mappings")
bound = sorted(m.action.get_path_name() for m in entries if m.action)
want = sorted(f"/Game/Lunden/Player/Input/IA_Lunden{n}.IA_Lunden{n}"
              for n in ("Forward", "Back", "Left", "Right", "LookX", "LookY", "Jump", "Run", "Crouch"))
if bound != want:
    raise RuntimeError(f"IMC_LundenPlayer binds {bound}, expected {want}")

# 2./3. Temporary level ----------------------------------------------------------------------------------------------
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
actors = u.get_editor_subsystem(u.EditorActorSubsystem)
world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
world.get_world_settings().set_editor_property("default_game_mode", u.load_class(None, WORLD["gameMode"]))
cube = u.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube")


def box(x, y, top, sx, sy, height):
    actor = actors.spawn_actor_from_class(u.StaticMeshActor, u.Vector(x, y, top - height / 2))
    actor.static_mesh_component.set_static_mesh(cube)
    actor.static_mesh_component.set_collision_profile_name("BlockAll")
    actor.set_actor_scale3d(u.Vector(sx / 100, sy / 100, height / 100))


box(0, 0, 0, 8000, 8000, 20)  # ground, top at z = 0
PLATFORMS = {drop: (0, 1000 + i * 800) for i, drop in enumerate(DROPS)}
for drop, (x, y) in PLATFORMS.items():
    box(x, y, drop * 100, 300, 300, drop * 100)
actors.spawn_actor_from_class(u.PlayerStart, u.Vector(-2000, -2000, 100))
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def player_test():
    result = {"engine": u.SystemLibrary.get_engine_version(), "gameMode": WORLD["gameMode"], "player": P, "fall": []}
    try:
        deadline = time.monotonic() + 30
        pawn = None
        while not pawn:
            if time.monotonic() > deadline:
                raise RuntimeError("PIE did not possess a pawn")
            game = editor.get_game_world()
            pawn = u.GameplayStatics.get_player_character(game, 0) if game else None
            yield
        pc = pawn.get_controller()
        names = (pawn.get_class().get_name(), pc.get_class().get_name())
        if names != ("BP_LundenPlayer_C", "BP_LundenPlayerController_C"):
            raise RuntimeError(f"Unexpected possession {names}")
        movement = pawn.character_movement

        def key(name, down):
            u.SystemLibrary.execute_console_command(game, "Input." + ("+key " if down else "-key ") + name + (" 1" if down else ""), pc)

        def seconds(t):
            start = u.GameplayStatics.get_time_seconds(game)
            while u.GameplayStatics.get_time_seconds(game) - start < t:
                if time.monotonic() > deadline + 120:
                    raise RuntimeError("Player test timed out")
                yield

        def check(label, got, want, tolerance):
            u.log(f"LUNDEN_PLAYER_TEST {label}: got {got:.4f}, want {want:.4f} (tolerance {tolerance})")
            result[label] = {"got": round(got, 4), "want": round(want, 4)}
            if abs(got - want) > tolerance:
                raise RuntimeError(f"{label}: {got:.4f}, expected {want:.4f} +- {tolerance}")

        def speed():
            v = pawn.get_velocity()
            return math.hypot(v.x, v.y)

        pc.set_control_rotation(u.Rotator(roll=0, pitch=0, yaw=0))
        yield from seconds(0.4)
        floor = 0.0  # the ground box's top
        eye, _ = pawn.get_actor_eyes_view_point()
        check("eyeStandingCm", eye.z - floor, 100 * P["eye"], 1.0)
        key("LeftControl", True)
        yield from seconds(0.3)
        eye, _ = pawn.get_actor_eyes_view_point()
        check("eyeCrouchedCm", eye.z - floor, 100 * P["crouchEye"], 1.0)
        key("W", True)
        yield from seconds(0.8)
        check("crouchSpeedCmS", speed(), 100 * P["walk"] * P["crouchSpeed"], 1.0)
        key("LeftControl", False)
        yield from seconds(0.8)
        check("walkSpeedCmS", speed(), 100 * P["walk"], 1.0)
        key("LeftShift", True)
        yield from seconds(0.8)
        check("runSpeedCmS", speed(), 100 * P["run"], 1.0)
        key("LeftShift", False)
        key("W", False)
        yield from seconds(0.8)
        check("gravityCmS2", -movement.get_gravity_z(), 100 * WEB_GRAVITY, 0.01)
        base = pawn.get_actor_location().z
        lives0 = pawn.get_editor_property("Lives")
        key("SpaceBar", True)
        peak = base
        for tick in seconds(1.0):
            peak = max(peak, pawn.get_actor_location().z)
            yield tick
        key("SpaceBar", False)
        yield from seconds(0.3)
        check("jumpApexCm", peak - base, (100 * P["jump"]) ** 2 / (2 * 100 * WEB_GRAVITY), 2.0)
        if pawn.get_editor_property("Lives") != lives0:
            raise RuntimeError("An ordinary jump cost lives")

        # Mouse look (#2294): a forced raw MouseY / MouseX count of +1 each frame must raise the pitch (look up) and
        # the yaw (turn right) by the web's PLAYER.mouseSens per pixel (src/main.js look), in degrees.
        per_count = math.degrees(P["mouseSens"])
        for axis, part in (("MouseY", "pitch"), ("MouseX", "yaw")):
            pc.set_control_rotation(u.Rotator(roll=0, pitch=0, yaw=0))
            yield from seconds(0.2)
            last = getattr(pc.get_control_rotation(), part)
            deltas = []
            key(axis, True)
            for _ in range(30):
                yield
                now = getattr(pc.get_control_rotation(), part)
                deltas.append(now - last)
                last = now
            key(axis, False)
            moving = sorted(d for d in deltas if abs(d) > 1e-6)
            if len(moving) < 20:
                raise RuntimeError(f"{axis} moved the view in only {len(moving)} of 30 frames: {deltas}")
            check(f"look{axis}DegPerCount", moving[len(moving) // 2], per_count, 0.001)
        pc.set_control_rotation(u.Rotator(roll=0, pitch=0, yaw=0))
        yield from seconds(0.2)

        lives, max_lives = pawn.get_editor_property("Lives"), pawn.get_editor_property("MaxLives")
        if max_lives != F["lives"] or lives != F["lives"]:
            raise RuntimeError(f"Lives {lives}/{max_lives}, expected {F['lives']} (COMBAT.lives)")
        for drop in DROPS:
            x, y = PLATFORMS[drop]
            pawn.set_actor_location(u.Vector(x, y, drop * 100 + movement.get_editor_property("max_step_height") + 60), False, True)
            pc.set_control_rotation(u.Rotator(roll=0, pitch=0, yaw=0))
            yield from seconds(0.8)
            before = pawn.get_editor_property("Lives")
            deaths = pawn.get_editor_property("Deaths")
            key("W", True)
            for tick in seconds(3.0):
                if pawn.get_actor_location().z < 100 and not movement.is_falling():
                    break
                yield tick
            key("W", False)
            yield from seconds(0.3)
            after = pawn.get_editor_property("Lives")
            damage = DAMAGE[drop]  # the web's own fallDamage(drop, drop, COMBAT.lives)
            dead = damage > 0 and before <= damage  # src/combat.js fall()
            want = max_lives if dead else max(0, before - damage)
            got_drop = pawn.get_editor_property("LastFallDrop")
            got_damage = pawn.get_editor_property("LastFallDamage")
            row = {"dropM": drop, "measuredDropCm": round(got_drop, 2), "damage": got_damage, "webDamage": damage,
                   "livesBefore": before, "livesAfter": after, "dead": pawn.get_editor_property("Deaths") > deaths}
            result["fall"].append(row)
            u.log(f"LUNDEN_PLAYER_TEST fall {json.dumps(row)}")
            if abs(got_drop - 100 * drop) > 3 or got_damage != damage or after != want or row["dead"] != dead:
                raise RuntimeError(f"Fall of {drop} m differs from the web: {row}, expected lives {want}, dead {dead}")
        (Path(u.Paths.project_saved_dir()) / "player-result.json").write_text(json.dumps(result, indent=2) + "\n")
        u.log("LUNDEN_PLAYER_TEST_OK")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
