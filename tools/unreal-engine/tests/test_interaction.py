"""#2285: L1007's doors, windows, switches and taps in Play In Editor on the composed world map L_Lunden.

1. Coverage: every L1007 door and window sash in measurements.json has exactly one interactable (tag interact:<id>),
   and so do the room switches and taps.
2. By id, without the player (#2292/#2293): OpenDoor on every door and sash; after its Seconds each hinge is within
   1 cm of the export's hinge / pivot, a swing door's yaw within 1 degree of open.unrealYaw, a slider's blocking box
   within 1 cm of openCentre, and a sash's check point (bottom rail centre) within 1 cm of checkOpen at the export's
   angle (within 1 degree). A second OpenDoor changes nothing: ChangeCount rises exactly once per change. CloseDoor
   brings each back to its closed pose. Wardrobe pairs: opening one panel closes its open partner (src/doors.js).
3. Player use: the production controller's E aimed at the front door (as the pilot's door test) opens it.
4. A switch turns its room's real lamps (#2283's BP_LundenLamp actors tagged lamp:<id> in Level_lighting) on and off
   and leaves another room's lamp off; a tap shows and hides its water.
5. The four lifts' 49 buttons (Level_lift_buttons) sit within 1 cm of the export and light once on two presses.

Run: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_interaction
Writes Saved/interaction-result.json; logs LUNDEN_INTERACTION_TEST_OK.
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

MAP = "/Game/Lunden/Maps/L_Lunden"  # the composed world: L1007 via Level_l1007_interaction, lamps via Level_lighting
DOOR = "/Game/Lunden/Blueprints/PilotDoors/BP_LundenSwingDoor.BP_LundenSwingDoor_C"
LAMP = "/Game/Lunden/Lighting/BP_LundenLamp.BP_LundenLamp_C"
CONTROLLER = "/Game/Lunden/Player/BP_LundenPlayerController.BP_LundenPlayerController_C"
PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
M = json.loads((PROJECT / "Import/measurements.json").read_text(encoding="utf-8"))
ENTRANCE = "door_l0_x80_z0"
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
world = u.EditorLoadingAndSavingUtils.load_map(MAP)
if not world:
    raise RuntimeError("Compose L_Lunden first (build_interaction.py, build_lighting.py, compose_world.py)")
mode = u.load_class(None, "/Game/Lunden/Player/BP_LundenGameMode.BP_LundenGameMode_C")
world.get_world_settings().set_editor_property("default_game_mode", mode)
cam = u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(u.CameraActor, u.Vector(130.665, -100, 110))
cam.root_component.set_mobility(u.ComponentMobility.MOVABLE)
cam.tags = [u.Name("interaction-test-camera")]
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()

DOORS = {d["id"]: d for d in M["doors"] if d["zone"] == "l1007"}
SASHES = {s["id"]: s for w in M["windows"] for s in w.get("sashes", [])}
SWITCHES = M["interaction"]["switches"]
TAPS = M["interaction"]["taps"]
LIFT_BUTTONS = M["interaction"].get("liftButtons", [])


def xyz(v):
    return [v.x, v.y, v.z]


def yaw_diff(a, b):
    return abs((a - b + 180) % 360 - 180)


def quat_angle(a, b):
    dot = abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w)
    return math.degrees(2 * math.acos(min(1.0, dot)))


@u.AutomationScheduler.add_latent_command
def run():
    try:
        stop = time.monotonic() + 120
        pc = None
        while not pc or pc.get_class().get_name() != "BP_LundenPlayerController_C":
            if time.monotonic() > stop:
                raise RuntimeError("PIE did not start the player controller: " + str(pc))
            game = editor.get_game_world()
            pc = u.GameplayStatics.get_player_controller(game, 0) if game else None
            yield

        def seconds(amount):
            end = u.GameplayStatics.get_time_seconds(game) + amount
            while u.GameplayStatics.get_time_seconds(game) < end:
                if time.monotonic() > stop:
                    raise RuntimeError("timed out")
                yield

        def by_id(i):
            found = u.GameplayStatics.get_all_actors_with_tag(game, "interact:" + i)
            if len(found) != 1:
                raise RuntimeError(f"interact:{i}: {len(found)} actors")
            return found[0]

        def count(a):
            return a.get_editor_property("ChangeCount")

        problems, evidence = [], {"engine": u.SystemLibrary.get_engine_version(), "map": MAP, "doors": {}, "sashes": {}}
        # 1. coverage
        every = list(DOORS) + list(SASHES) + [s["id"] for s in SWITCHES] + [t["id"] for t in TAPS] + [b["id"] for b in LIFT_BUTTONS]
        act = {i: by_id(i) for i in every}
        cls = u.load_class(None, DOOR)
        total = len(u.GameplayStatics.get_all_actors_of_class(game, cls))
        if total != len(every):
            problems.append(f"{total} interactables for {len(every)} export rows")
        closed_pose = {i: (xyz(act[i].get_actor_location()), act[i].get_actor_rotation().quaternion(), act[i].get_actor_rotation().yaw)
                       for i in list(DOORS) + list(SASHES)}

        def box_of(i):
            kids = [k for k in act[i].get_attached_actors() if any(str(t).startswith(("door-leaf:", "sash:")) for t in k.tags)]
            return kids[0]

        def check(i, opened):
            a, row = act[i], DOORS.get(i)
            loc, rot = xyz(a.get_actor_location()), a.get_actor_rotation()
            got = {"hingeCm": [round(c, 2) for c in loc], "yaw": round(rot.yaw, 2), "open": opened, "changes": count(a)}
            if row and row["kind"] == "swing":
                if math.dist(loc, row["hinge"]["unreal"]) > 1:
                    problems.append(f"{i} hinge {loc} vs {row['hinge']['unreal']}")
                want = row["open" if opened else "closed"]["unrealYaw"]
                if yaw_diff(rot.yaw, want) > 1:
                    problems.append(f"{i} yaw {rot.yaw} vs {want}")
            elif row:
                want = row["openCentre" if opened else "closedCentre"]["unreal"]
                centre = xyz(box_of(i).get_actor_location())
                got["boxCm"] = [round(c, 2) for c in centre]
                if math.dist(centre, want) > 1:
                    problems.append(f"{i} centre {centre} vs {want}")
            else:
                s = SASHES[i]
                if math.dist(loc, s["pivot"]["unreal"]) > 1:
                    problems.append(f"{i} pivot {loc} vs {s['pivot']['unreal']}")
                c_loc, c_q, _ = closed_pose[i]
                q = rot.quaternion()
                angle = quat_angle(c_q, q)
                got["angle"] = round(angle, 2)
                if abs(angle - (abs(s["angleDeg"]) if opened else 0)) > 1:
                    problems.append(f"{i} angle {angle} vs {s['angleDeg'] if opened else 0}")
                rel = [c - p for c, p in zip(s["checkClosed"]["unreal"], s["pivot"]["unreal"])]
                local = c_q.unrotate_vector(u.Vector(*rel))
                point = [p + r for p, r in zip(loc, xyz(q.rotate_vector(local)))]
                want = s["checkOpen" if opened else "checkClosed"]["unreal"]
                got["checkCm"] = [round(c, 2) for c in point]
                if math.dist(point, want) > 1:
                    problems.append(f"{i} check point {point} vs {want}")
            return got

        # 2. by id: swing doors, sliders and sashes all at once; wardrobes in pairs afterwards
        wardrobes = [i for i, d in DOORS.items() if d["kind"] == "wardrobe"]
        simple = [i for i in list(DOORS) + list(SASHES) if i not in wardrobes]
        wait = max([d["seconds"] for d in DOORS.values()] + [s["seconds"] for s in SASHES.values()]) + 0.4
        for i in simple:
            act[i].call_method("OpenDoor")
        yield from seconds(wait)
        for i in simple:
            act[i].call_method("OpenDoor")  # already open: no change, no event
        yield from seconds(0.1)
        for i in simple:
            (evidence["doors"] if i in DOORS else evidence["sashes"])[i] = {"opened": check(i, True)}
            if count(act[i]) != 1:
                problems.append(f"{i}: {count(act[i])} changes after open + repeated open")
        for i in simple:
            act[i].call_method("CloseDoor")
        yield from seconds(wait)
        for i in simple:
            (evidence["doors"] if i in DOORS else evidence["sashes"])[i]["closed"] = check(i, False)
            if count(act[i]) != 2:
                problems.append(f"{i}: {count(act[i])} changes after open + close")
        done = set()
        for i in wardrobes:
            j = DOORS[i].get("partner")
            if i in done or not j:
                continue
            done |= {i, j}
            act[i].call_method("OpenDoor")
            yield from seconds(wait)
            first = check(i, True)
            act[j].call_method("OpenDoor")  # the web: opening one panel slides the other back
            yield from seconds(wait)
            second, back = check(j, True), check(i, False)
            if act[i].get_editor_property("TargetOpen"):
                problems.append(f"{i} stayed open when its partner {j} opened")
            act[j].call_method("CloseDoor")
            yield from seconds(wait)
            evidence["doors"][i] = {"opened": first, "closedByPartner": back}
            evidence["doors"][j] = {"opened": second, "closed": check(j, False)}
        # 3. player use with E on the front door (the pilot door test's camera)
        camera, = u.GameplayStatics.get_all_actors_with_tag(game, "interaction-test-camera")
        pc.set_view_target_with_blend(camera)
        camera.set_actor_location_and_rotation(u.Vector(130.665, -100, 110), u.Rotator(roll=0, pitch=0, yaw=90), False, True)
        yield from seconds(0.2)
        before = count(act[ENTRANCE])
        u.SystemLibrary.execute_console_command(game, "Input.+key E 1", pc)
        yield
        u.SystemLibrary.execute_console_command(game, "Input.-key E", pc)
        yield from seconds(wait)
        evidence["frontDoorWithE"] = check(ENTRANCE, True)
        if count(act[ENTRANCE]) != before + 1 or not act[ENTRANCE].get_editor_property("TargetOpen"):
            problems.append(f"E did not open the front door once ({before} -> {count(act[ENTRANCE])})")
        # 4. a switch and its room's lamps; a tap and its water
        lamps = {}
        for lid in sorted({lid for s in SWITCHES for lid in s["lamps"]}):
            found = u.GameplayStatics.get_all_actors_with_tag(game, "lamp:" + lid)
            if len(found) != 1 or found[0].get_class().get_name() != "BP_LundenLamp_C":
                raise RuntimeError(f"lamp:{lid}: {[a.get_class().get_name() for a in found]} (is Level_lighting in L_Lunden?)")
            lamps[lid] = found[0]
        for lamp in lamps.values():  # all start off (#2283)
            if lamp.get_editor_property("IsOn"):
                lamp.call_method("TurnOff")
        sw = next(s for s in SWITCHES if len(s["lamps"]) > 1) if any(len(s["lamps"]) > 1 for s in SWITCHES) else SWITCHES[0]
        other = next(lid for lid in lamps if lid not in sw["lamps"])
        act[sw["id"]].call_method("OpenDoor")
        yield from seconds(0.1)
        on = {lid: lamps[lid].get_editor_property("IsOn") for lid in sw["lamps"]}
        other_on = lamps[other].get_editor_property("IsOn")
        act[sw["id"]].call_method("CloseDoor")
        yield from seconds(0.1)
        off = {lid: lamps[lid].get_editor_property("IsOn") for lid in sw["lamps"]}
        evidence["switch"] = {"id": sw["id"], "room": sw["room"], "on": on, "off": off, "otherRoomLamp": [other, other_on]}
        if not all(on.values()) or any(off.values()) or other_on:
            problems.append(f"switch {sw['id']}: on {on}, off {off}, other {other_on}")
        tap = TAPS[0]
        water, = u.GameplayStatics.get_all_actors_with_tag(game, "water:" + tap["id"])
        hidden0 = water.get_editor_property("hidden")
        act[tap["id"]].call_method("OpenDoor")
        yield from seconds(0.1)
        hidden1 = water.get_editor_property("hidden")
        act[tap["id"]].call_method("CloseDoor")
        yield from seconds(0.1)
        hidden2 = water.get_editor_property("hidden")
        evidence["tap"] = {"id": tap["id"], "hiddenBefore": hidden0, "hiddenOn": hidden1, "hiddenOff": hidden2}
        if not (hidden0 and not hidden1 and hidden2):
            problems.append(f"tap {tap['id']}: hidden {hidden0} -> {hidden1} -> {hidden2}")
        # 5. the lifts' buttons: each sets its state and counts exactly once per change (the lifts are not ported yet)
        for b in LIFT_BUTTONS:
            a = act[b["id"]]
            if math.dist(xyz(a.get_actor_location()), b["position"]["unreal"]) > 1:
                problems.append(f"{b['id']} at {xyz(a.get_actor_location())} vs {b['position']['unreal']}")
            a.call_method("OpenDoor")
            a.call_method("OpenDoor")
        yield from seconds(0.3)
        pressed = {b["id"]: (act[b["id"]].get_editor_property("TargetOpen"), count(act[b["id"]])) for b in LIFT_BUTTONS}
        bad = {k: v for k, v in pressed.items() if v != (True, 1)}
        if bad:
            problems.append(f"lift buttons not lit once: {bad}")
        evidence["liftButtons"] = {"count": len(LIFT_BUTTONS), "litOnceAfterTwoPresses": len(pressed) - len(bad)}
        evidence["problems"] = problems
        (Path(u.Paths.project_saved_dir()) / "interaction-result.json").write_text(json.dumps(evidence, indent=1) + "\n", encoding="utf-8")
        if problems:
            raise RuntimeError("LUNDEN_INTERACTION_TEST failed: " + "; ".join(problems[:20]))
        u.log(f"LUNDEN_INTERACTION_TEST_OK {len(DOORS)} doors, {len(SASHES)} sashes, {len(SWITCHES)} switches, {len(TAPS)} taps, "
              f"{len(LIFT_BUTTONS)} lift buttons")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
