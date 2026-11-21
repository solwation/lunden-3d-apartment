"""#2300: the player's surface sensor, sprint, rest and death on the composed world map L_Lunden, in Play In Editor.

1. Surface sensor (BPC_LundenStepSurface): at each of measurements.json `spawn.surface.control` (parquet, tile, the
   patio's slabs, a stairwell tread, gravel, grass, the road at START, the garage; found by export-player.js with the
   web's own src/stepsurface.js) StepInfo at the web point must give the web's surface, where, stairs and outdoor. Where
   L_Lunden has a floor, the player is also put there, lets the world's collision carry it, and FeetInfo (what #2287's
   footsteps read) must agree. Also StepInfo at the export's random `samples` (the share that agrees is reported; the
   export's own check of the same lookup is spawn.surface.check).
2. Sprint on real floors: Shift on the street at START is PLAYER.runOutdoor, in L1007's living room PLAYER.run.
3. Rest (BPC_LundenRest): looking at a sofa spot from where one stands, PickSpot picks it; E sits down, the eye glides to
   the spot (spawn.rest) and the view is clamped to the spot's limits; E stands up where one stood.
4. Death: Die() blacks out and wakes the player on one of the web's wake points, standing on L_Lunden's ground.

Copy to unreal/Lunden/Content/Python/ (untracked) and run
    run-tests.ps1 -Filter Editor.Python.Lunden.test_player_world
Writes Saved/player-world-result.json, logs LUNDEN_PLAYER_WORLD lines, then LUNDEN_PLAYER_WORLD_OK.
"""
import json
import math
from pathlib import Path
import sys
import time
import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
sys.path.insert(0, str(PROJECT.parents[1] / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402  #2311

WORLD = json.loads((PROJECT.parents[1] / "tools/unreal-engine/world-levels.json").read_text(encoding="utf-8"))
M = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
S, R, WAKE, P = M["spawn"]["surface"], M["spawn"]["rest"], M["spawn"]["respawn"], M["spawn"]["player"]
STEP = u.load_class(None, "/Game/Lunden/Player/BPC_LundenStepSurface.BPC_LundenStepSurface_C")
REST = u.load_class(None, "/Game/Lunden/Player/BPC_LundenRest.BPC_LundenRest_C")

editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not u.EditorLoadingAndSavingUtils.load_map(WORLD["map"]):
    raise RuntimeError("Could not load " + WORLD["map"])
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()


def info_of(values):
    """A StepInfo / FeetInfo result (Surface, Where, Road, Stairs, Outdoor, Code) as a dict."""
    names = ("surface", "where", "road", "stairs", "outdoor", "code")
    got = dict(zip(names, values))
    got["surface"], got["where"] = str(got["surface"]), str(got["where"])
    return got


def same(web, got):
    return all(web[k] == got[k] for k in ("surface", "where", "stairs", "outdoor"))


@u.AutomationScheduler.add_latent_command
def world_test():
    result = {"engine": u.SystemLibrary.get_engine_version(), "map": WORLD["map"], "control": [], "samples": None}
    try:
        deadline = time.monotonic() + 60
        pawn = None
        while not pawn:
            if time.monotonic() > deadline:
                raise RuntimeError("PIE did not possess a pawn")
            game = editor.get_game_world()
            pawn = u.GameplayStatics.get_player_character(game, 0) if game else None
            yield
        pc = pawn.get_controller()
        movement = pawn.character_movement
        step = pawn.get_component_by_class(STEP)
        rest = pawn.get_component_by_class(REST)
        if not step or not rest:
            raise RuntimeError(f"BP_LundenPlayer lacks its #2300 components: step {step}, rest {rest}")
        half = pawn.capsule_component.get_scaled_capsule_half_height()

        def key(name, down):
            u.SystemLibrary.execute_console_command(game, "Input." + ("+key " if down else "-key ") + name + (" 1" if down else ""), pc)

        def seconds(t):
            start = u.GameplayStatics.get_time_seconds(game)
            while u.GameplayStatics.get_time_seconds(game) - start < t:
                if time.monotonic() > deadline + 600:
                    raise RuntimeError("World test timed out")
                yield

        def put(at, yaw=0.0, pitch=0.0):
            pawn.set_actor_location(u.Vector(at[0], at[1], at[2] + half + 5), False, True)
            movement.stop_movement_immediately()
            pc.set_control_rotation(u.Rotator(roll=0, pitch=pitch, yaw=yaw))

        def speed():
            v = pawn.get_velocity()
            return math.hypot(v.x, v.y)

        yield from seconds(1.0)

        # 1. surface sensor -------------------------------------------------------------------------------------------
        failures = []
        for c in S["control"]:
            at = c["unreal"]
            got = info_of(step.call_method("StepInfo", (u.Vector(*at),)))
            row = {"name": c["name"], "unreal": at, "web": {k: c[k] for k in ("surface", "where", "road", "stairs", "outdoor")},
                   "atWebPoint": got, "ok": same(c, got)}
            put(at)
            yield from seconds(0.7)
            feet = pawn.get_actor_location()
            standing = not movement.is_falling() and abs(feet.z - half - at[2]) < 30
            if standing:
                row["standing"] = info_of(step.call_method("FeetInfo"))
                row["standingZ"] = round(feet.z - half, 2)
                row["standingOk"] = same(c, row["standing"])
            else:
                row["standing"] = f"no floor within 30 cm in L_Lunden (feet at {feet.z - half:.1f} cm, falling {movement.is_falling()})"
            result["control"].append(row)
            u.log(f"LUNDEN_PLAYER_WORLD surface {json.dumps(row)}")
            if not row["ok"] or row.get("standingOk") is False:
                failures.append(row["name"])
        stood = [r for r in result["control"] if r.get("standingOk")]
        if failures or len(result["control"]) < 5 or len(stood) < 5:
            raise RuntimeError(f"Surface sensor differs from the web at {failures}; {len(stood)} points checked standing")
        agree = 0
        for smp in S["samples"]:
            got = info_of(step.call_method("StepInfo", (u.Vector(*smp["unreal"]),)))
            agree += same(smp, got)
        result["samples"] = {"n": len(S["samples"]), "agree": agree, "exportCheck": S["check"]}
        u.log(f"LUNDEN_PLAYER_WORLD samples {json.dumps(result['samples'])}")
        if agree < 0.97 * len(S["samples"]):
            raise RuntimeError(f"StepInfo agrees with the web at only {agree} of {len(S['samples'])} samples")

        # 2. sprint on real floors ------------------------------------------------------------------------------------
        living = next(c for c in S["control"] if c["name"].startswith("parquet (L1007"))
        start = M["spawn"]["start"]
        result["sprint"] = {}
        for label, at, yaw, want in (("outdoorCmS", start["unreal"], start["unrealYaw"] + 180, P["runOutdoor"]),
                                     ("indoorCmS", living["unreal"], 90, P["run"])):
            put(at, yaw)
            yield from seconds(0.6)
            key("W", True)
            key("LeftShift", True)
            yield from seconds(0.45)
            got = speed()
            key("LeftShift", False)
            key("W", False)
            result["sprint"][label] = {"got": round(got, 2), "want": 100 * want}
            u.log(f"LUNDEN_PLAYER_WORLD sprint {label} {got:.2f} want {100 * want}")
            if abs(got - 100 * want) > 1.5:
                raise RuntimeError(f"Sprint {label} {got:.2f}, expected {100 * want}")
            yield from seconds(0.4)

        # 3. rest -------------------------------------------------------------------------------------------------------
        spots = R["spots"]
        index = next(i for i, s in enumerate(spots) if s["kind"] == "sit" and "soffa" in s["name"].lower()) \
            if any("soffa" in s["name"].lower() for s in spots) else next(i for i, s in enumerate(spots) if s["kind"] == "sit")
        spot = spots[index]
        aim, eye = spot["aim"]["unreal"], spot["eye"]["unreal"]
        # stand 1.2 m out from the aim point along the spot's facing, eye level, looking at it
        fx, fy = math.cos(math.radians(spot["yaw"])), math.sin(math.radians(spot["yaw"]))
        floor_z = max(lv["unreal"]["floorZ"] for lv in M["plan"]["levels"] if lv["unreal"]["floorZ"] <= eye[2] - R["sitEye"])
        stand = [aim[0] + fx * 120, aim[1] + fy * 120, None]
        put([stand[0], stand[1], floor_z + 10])
        yield from seconds(0.8)
        here = pawn.get_actor_location()
        view, _ = pawn.get_actor_eyes_view_point()
        to = u.Vector(aim[0] - view.x, aim[1] - view.y, aim[2] - view.z)
        pc.set_control_rotation(u.Rotator(roll=0, pitch=math.degrees(math.atan2(to.z, math.hypot(to.x, to.y))),
                                          yaw=math.degrees(math.atan2(to.y, to.x))))
        yield from seconds(0.2)
        picked = rest.call_method("PickSpot")
        picked = picked[0] if isinstance(picked, tuple) else picked
        count0 = rest.get_editor_property("Count")
        key("E", True)  # one frame: the console's injected key counts as just pressed on every frame it is held
        yield
        key("E", False)
        yield from seconds(R["move"] + 0.4)
        sat = rest.get_editor_property("Spot")
        view, rot = pawn.get_actor_eyes_view_point()
        cam = u.GameplayStatics.get_player_camera_manager(game, 0)
        limits = {k: cam.get_editor_property(k) for k in ("view_yaw_min", "view_yaw_max", "view_pitch_min", "view_pitch_max")}
        eye_off = math.dist((view.x, view.y, view.z), eye)
        row = {"spot": index, "name": spot["name"], "item": spot["item"], "picked": picked, "sat": sat,
               "count": rest.get_editor_property("Count") - count0, "eyeOffCm": round(eye_off, 2),
               "yaw": round(rot.yaw, 2), "wantYaw": spot["startYaw"], "pitch": round(rot.pitch, 2), "wantPitch": spot["startPitch"],
               "limits": {k: round(v, 2) for k, v in limits.items()}, "standFrom": [round(here.x, 1), round(here.y, 1), round(here.z, 1)]}
        lim = R["limits"][spot["kind"]]
        want_limits = {"view_yaw_min": spot["yaw"] - lim["yaw"], "view_yaw_max": spot["yaw"] + lim["yaw"],
                       "view_pitch_min": lim["pitch"][0], "view_pitch_max": lim["pitch"][1]}
        yaw_err = abs((rot.yaw - spot["startYaw"] + 180) % 360 - 180)
        bad = (picked != index or sat != index or row["count"] != 1 or eye_off > 1.0 or yaw_err > 0.5
               or abs(rot.pitch - spot["startPitch"]) > 0.5 or any(abs(limits[k] - v) > 0.01 for k, v in want_limits.items()))
        # E again stands up where one stood, walking
        key("E", True)
        yield
        key("E", False)
        yield from seconds(0.5)
        after = pawn.get_actor_location()
        row["stoodUp"] = {"spot": rest.get_editor_property("Spot"), "offCm": round(math.hypot(after.x - here.x, after.y - here.y), 2),
                          "mode": str(movement.movement_mode)}
        result["rest"] = row
        u.log(f"LUNDEN_PLAYER_WORLD rest {json.dumps(row)}")
        if bad or row["stoodUp"]["spot"] != -1 or row["stoodUp"]["offCm"] > 5 or "WALKING" not in row["stoodUp"]["mode"].upper():
            raise RuntimeError(f"Rest differs from src/rest.js: {row}, want limits {want_limits}")

        # 4. death -------------------------------------------------------------------------------------------------------
        put(start["unreal"], start["unrealYaw"])
        yield from seconds(0.5)
        pawn.call_method("Die")
        B = WAKE["blackout"]
        yield from seconds(B["red"] + B["black"] + B["hold"] + 0.2)
        index = pawn.get_editor_property("LastRevive")
        yield from seconds(1.5)
        feet = pawn.get_actor_location()
        point = WAKE["points"][index]["unreal"]
        row = {"wakePoint": WAKE["points"][index], "feet": [round(feet.x, 1), round(feet.y, 1), round(feet.z - half, 1)],
               "offCm": round(math.hypot(feet.x - point[0], feet.y - point[1]), 2), "falling": movement.is_falling(),
               "dz": round(feet.z - half - point[2], 2), "yaw": round(pc.get_control_rotation().yaw, 2), "wantYaw": WAKE["yaw"]}
        result["death"] = row
        u.log(f"LUNDEN_PLAYER_WORLD death {json.dumps(row)}")
        if row["offCm"] > 2 or row["falling"] or abs(row["dz"]) > 25:
            raise RuntimeError(f"The wake is not standing on the web's point in L_Lunden: {row}")
        (Path(u.Paths.project_saved_dir()) / "player-world-result.json").write_text(json.dumps(result, indent=2) + "\n")
        u.log("LUNDEN_PLAYER_WORLD_OK")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
