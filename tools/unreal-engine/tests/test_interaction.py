"""#2285: L1007's doors, windows, switches and taps in Play In Editor on the composed world map L_Lunden.

1. Coverage: every L1007 door and window sash in measurements.json has exactly one interactable (tag interact:<id>),
   and so do the room switches and taps. Since #2314 also the doors outside L1007: Hus L's stairwell doors (portik,
   loftgång) and its portik's small room, the entrances of Hus A, B and C, and the garage door (kind overhead, checked
   like a sash: pivot, angle, check point).
2. By id, without the player (#2292/#2293): OpenDoor on every door and sash; after its Seconds each hinge is within
   1 cm of the export's hinge / pivot, a swing door's yaw within 1 degree of open.unrealYaw, a slider's blocking box
   within 1 cm of openCentre, and a sash's check point (bottom rail centre) within 1 cm of checkOpen at the export's
   angle (within 1 degree). A second OpenDoor changes nothing: ChangeCount rises exactly once per change. CloseDoor
   brings each back to its closed pose. Wardrobe pairs: opening one panel closes its open partner (src/doors.js).
3. Player use: the production controller's E aimed at the front door (as the pilot's door test) opens it. #2314: E
   from outside opens each original entrance and a representative of each new leaf type/house, then closes it.
   The two yellow buttons operate the gate; test its timeout, reversal, real opening bounds and the vehicle hook.
4. A switch turns its room's real lamps (#2283's BP_LundenLamp actors tagged lamp:<id> in Level_lighting) on and off
   and leaves another room's lamp off; a tap shows and hides its water.
5. The four lifts' 49 buttons (Level_lift_buttons) sit within 1 cm of the export and light once on two presses.
6. The change event (#2312): a BP_LundenInteractionListener placed before Play receives OnInteractableChanged exactly once
   per real change: for every interactable its calls equal its ChangeCount and alternate with the state, and a door, a
   window sash, a switch and a tap each get exactly [open, closed] for open + repeated open + close.

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
LISTENER = "/Game/Lunden/Interaction/BP_LundenInteractionListener.BP_LundenInteractionListener_C"
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
listener_class = u.load_class(None, LISTENER)
if not listener_class:
    raise RuntimeError(LISTENER + " is missing: run build_interaction.py (#2312)")
subscriber = u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(listener_class, u.Vector(0, 0, -1000))
subscriber.tags = [u.Name("interaction-test-listener")]  # subscribes for the whole Play session (PIE copies it)
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()

DOORS = {d["id"]: d for d in M["doors"] if d["kind"] != "overhead"}  # L1007's and (#2314) the other zones' doors
L1007 = [i for i, d in DOORS.items() if d["zone"] == "l1007"]
OUTSIDE = [i for i, d in DOORS.items() if d["zone"] != "l1007"]
OVERHEAD = {d["id"]: d for d in M["doors"] if d["kind"] == "overhead"}  # #2314: the garage door, tipped up like a sash
SASHES = {s["id"]: s for w in M["windows"] for s in w.get("sashes", [])}
SASHES.update(OVERHEAD)
GARAGE_BUTTONS = [b for d in OVERHEAD.values() for b in d.get("control", {}).get("buttons", [])]
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
        stop = time.monotonic() + 180
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
        listener, = u.GameplayStatics.get_all_actors_with_tag(game, "interaction-test-listener")

        def heard(i):
            """The states OnInteractableChanged reported for id i, in order (#2312)."""
            return [state == "true" for got_id, state in
                    (str(r).rsplit("=", 1) for r in listener.get_editor_property("Received")) if got_id == i]
        # 1. coverage
        every = list(DOORS) + list(SASHES) + [s["id"] for s in SWITCHES] + [t["id"] for t in TAPS] + [b["id"] for b in LIFT_BUTTONS + GARAGE_BUTTONS]
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
                if "checkClosed" in row:
                    angle = math.radians(rot.yaw)
                    latch = [loc[0] + 100 * row["width"] * math.cos(angle), loc[1] + 100 * row["width"] * math.sin(angle), loc[2]]
                    error = math.dist(latch, row["checkOpen" if opened else "checkClosed"]["unreal"])
                    if error > 1:
                        problems.append(f"{i}: latch {error:.2f} cm from the web")

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
        evidence["overhead"] = {}

        def bucket(i):
            return evidence["doors"] if i in DOORS else evidence["overhead"] if i in OVERHEAD else evidence["sashes"]
        wardrobes = [i for i, d in DOORS.items() if d["kind"] == "wardrobe"]
        simple = [i for i in list(DOORS) + list(SASHES) if i not in wardrobes]
        wait = max([d["seconds"] for d in DOORS.values()] + [s["seconds"] for s in SASHES.values() if s["id"] not in OVERHEAD]) + 0.4
        slow = max([wait] + [d["seconds"] + 0.4 for d in OVERHEAD.values()])  # the garage door takes GARAGE.door.seconds
        for i in simple:
            act[i].call_method("OpenDoor")
        yield from seconds(slow)
        for i in simple:
            act[i].call_method("OpenDoor")  # already open: no change, no event
        yield from seconds(0.1)
        for i in simple:
            bucket(i)[i] = {"opened": check(i, True)}
            if count(act[i]) != 1:
                problems.append(f"{i}: {count(act[i])} changes after open + repeated open")
        for i in simple:
            act[i].call_method("CloseDoor")
        yield from seconds(slow)
        for i in simple:
            bucket(i)[i]["closed"] = check(i, False)
            if count(act[i]) != 2:
                problems.append(f"{i}: {count(act[i])} changes after open + close")
            if heard(i) != [True, False]:
                problems.append(f"{i}: event {heard(i)} after open + repeated open + close (expected [True, False])")
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

        def press_e(at, rotation, i, want_open, settle):
            camera.set_actor_location_and_rotation(u.Vector(*at), rotation, False, True)
            yield from seconds(0.2)
            n = count(act[i])
            u.SystemLibrary.execute_console_command(game, "Input.+key E 1", pc)
            yield
            u.SystemLibrary.execute_console_command(game, "Input.-key E", pc)
            yield from seconds(settle)
            if count(act[i]) != n + 1 or act[i].get_editor_property("TargetOpen") != want_open:
                problems.append(f"E did not {'open' if want_open else 'close'} {i} once ({n} -> {count(act[i])})")
            return check(i, want_open) if i in DOORS or i in SASHES else count(act[i])

        # All moving leaves have both physical poses checked above. Aim E at every original entrance plus each new
        # house/leaf type; the representative clicks keep this native route within the automation timeout.
        evidence["outsideWithE"] = {}
        selected, sampled = [], set()
        for i in OUTSIDE:
            d = DOORS[i]
            kind = (d.get("house"), d.get("leafType"))
            if not d.get("leafType") or kind not in sampled:
                selected.append(i)
                sampled.add(kind)
        for i in selected:
            d = DOORS[i]
            reach = 30 if d.get("leafType") else 100
            hx, hy, hz = d["hinge"]["unreal"]
            w = 100 * d["width"]
            c, o = (math.radians(d[k]["unrealYaw"]) for k in ("closed", "open"))
            dc, do = (math.cos(c), math.sin(c)), (math.cos(o), math.sin(o))
            dot = do[0] * dc[0] + do[1] * dc[1]
            n = (do[0] - dot * dc[0], do[1] - dot * dc[1])
            n = (n[0] / math.hypot(*n), n[1] / math.hypot(*n))  # the side the leaf opens to (outside)
            leaf = (hx + w / 2 * dc[0], hy + w / 2 * dc[1])
            cam = (leaf[0] + reach * n[0], leaf[1] + reach * n[1], hz + 110)
            opened = yield from press_e(cam, u.Rotator(roll=0, pitch=0, yaw=math.degrees(math.atan2(leaf[1] - cam[1], leaf[0] - cam[0]))),
                                        i, True, d["seconds"] + 0.4)
            leaf = (hx + w / 2 * do[0], hy + w / 2 * do[1])
            cam = (leaf[0] + reach * dc[0], leaf[1] + reach * dc[1], hz + 110)
            closed = yield from press_e(cam, u.Rotator(roll=0, pitch=0, yaw=math.degrees(math.atan2(leaf[1] - cam[1], leaf[0] - cam[0]))),
                                        i, False, d["seconds"] + 0.4)
            evidence["outsideWithE"][i] = {"opened": opened, "closed": closed}
        for i, d in OVERHEAD.items():  # outside on the drive, then from inside under the open door looking up at it
            px, py, pz = d["pivot"]["unreal"]
            floor = d["checkClosed"]["unreal"][2]
            opened = yield from press_e((px - 150, py, floor + 110), u.Rotator(roll=0, pitch=0, yaw=0), i, True, d["seconds"] + 0.4)
            closed = yield from press_e((px + 130, py, floor + 150), u.Rotator(roll=0, pitch=80, yaw=0), i, False, d["seconds"] + 0.4)
            evidence["outsideWithE"][i] = {"opened": opened, "closed": closed}
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
        act[sw["id"]].call_method("OpenDoor")  # already on: no change, no event
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
        act[tap["id"]].call_method("OpenDoor")  # already on: no change, no event
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
        # 6. the change event (#2312): one call per real change for every interactable, alternating with the state
        sample = {"door": next(i for i in simple if i in DOORS), "sash": next(i for i in simple if i in SASHES),
                  "switch": sw["id"], "tap": tap["id"]}
        for what, i in sample.items():
            if what in ("switch", "tap") and heard(i) != [True, False]:
                problems.append(f"{what} {i}: event {heard(i)} after on + repeated on + off (expected [True, False])")
        if GARAGE_BUTTONS:
            gate_id, row = next(iter(OVERHEAD.items()))
            gate = act[gate_id]
            control, = u.GameplayStatics.get_all_actors_with_tag(game, "garage-control")
            control.set_actor_tick_enabled(False)  # the following calls supply exact game time and occupancy
            state = lambda: gate.get_editor_property("TargetOpen")
            advance = lambda dt, visitor=False: control.call_method("AdvanceGarage", args=(dt, visitor))
            vehicle = lambda inside, hold, request: control.call_method("SetVehicleState", args=(inside, hold, request))
            bounds = row["control"]["opening"]
            middle_y = (bounds["z0"] + bounds["z1"]) * 50
            x, top = bounds["x"] * 100, bounds["top"] * 100
            margin = (bounds["radius"] + bounds["xMargin"]) * 100
            for feet, expected in [((x, middle_y, top - 1), True), ((x + margin + 1, middle_y, top - 1), False),
                                   ((x, bounds["z1"] * 100 + 1, top - 1), False), ((x, middle_y, top + 1), False)]:
                if bool(control.call_method("VisitorInOpening", args=(u.Vector(*feet),))) != expected:
                    problems.append(f"opening predicate at {feet}, expected {expected}")
            for b in GARAGE_BUTTONS:
                if math.dist(xyz(act[b["id"]].get_actor_location()), b["position"]["unreal"]) > 1:
                    problems.append(f"{b['id']}: button moved")
            outside, inside = GARAGE_BUTTONS
            x, y, z = outside["position"]["unreal"]
            yield from press_e((x - 45, y, z), u.Rotator(roll=0, pitch=0, yaw=0), outside["id"], True, .1)
            if not state():
                problems.append("the outside button did not open the gate")
            yield from seconds(row["seconds"] + .1)
            advance(row["control"]["autoSeconds"] - .1)
            if not state():
                problems.append("closed before timeout")
            advance(1, True)
            advance(row["control"]["autoSeconds"] - .1)
            if not state():
                problems.append("visitor failed to reset the full timer")
            advance(.2)
            if state():
                problems.append("did not close at timeout")
            yield from seconds(.4)
            advance(.1, True)
            if not state():
                problems.append("closing gate did not reverse for the visitor")
            yield from seconds(.8)
            vehicle(False, True, False)
            advance(30)
            if not state():
                problems.append("did not hold for approaching car")
            x, y, z = inside["position"]["unreal"]
            yield from press_e((x + 45, y, z), u.Rotator(roll=0, pitch=0, yaw=180), inside["id"], True, .1)
            if state():
                problems.append("the inside button did not close the gate")
            yield from seconds(.4)
            vehicle(True, False, False)
            advance(.1)
            if not state():
                problems.append("did not reverse for the car in the opening")
            gate.call_method("CloseDoor")
            yield from seconds(row["seconds"] + .1)
            vehicle(False, False, True)
            advance(.1)
            if not state():
                problems.append("car route did not open the closed gate")
            vehicle(False, False, False)
            control.set_actor_tick_enabled(True)
            evidence["garageButtons"] = {b["id"]: count(act[b["id"]]) for b in GARAGE_BUTTONS}

        wrong = {}
        for i in every:
            got = heard(i)
            alternate = all(a != b for a, b in zip(got, got[1:]))
            if len(got) != count(act[i]) or not alternate or (got and got[-1] != act[i].get_editor_property("TargetOpen")):
                wrong[i] = (got, count(act[i]))
        if wrong:
            problems.append(f"event calls do not match the changes: {dict(list(wrong.items())[:8])}")
        received = list(listener.get_editor_property("Received"))
        source = listener.get_editor_property("LastSource")
        if listener.get_editor_property("Total") != len(received) or not source or source.get_class().get_name() != "BP_LundenSwingDoor_C":
            problems.append(f"listener Total {listener.get_editor_property('Total')} vs {len(received)} calls, "
                            f"LastSource {source}")
        evidence["event"] = {"listener": LISTENER, "calls": len(received), "changes": sum(count(act[i]) for i in every),
                             "interactables": len(every), "mismatched": len(wrong),
                             "samples": {what: [i, heard(i)] for what, i in sample.items()},
                             "lastSource": source.get_name() if source else None}
        evidence["problems"] = problems
        (Path(u.Paths.project_saved_dir()) / "interaction-result.json").write_text(json.dumps(evidence, indent=1) + "\n", encoding="utf-8")
        if problems:
            raise RuntimeError("LUNDEN_INTERACTION_TEST failed: " + "; ".join(problems[:20]))
        u.log(f"LUNDEN_INTERACTION_TEST_OK {len(L1007)} doors, {len(SASHES) - len(OVERHEAD)} sashes, {len(SWITCHES)} switches, {len(TAPS)} taps, "
              f"{len(OUTSIDE)} doors outside L1007, {len(OVERHEAD)} garage door, "
              f"{len(LIFT_BUTTONS)} lift buttons, {len(received)} change events")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
