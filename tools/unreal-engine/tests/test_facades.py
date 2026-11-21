"""#2302: the façades of Hus L, A, B and C stop the player on the composed world map, in Play In Editor.

For every façade ray of the export (measurements.json `buildings`, ids `*_facade` and `*_gable`: each house's street,
courtyard and gable sides) the production character is placed on the ground 2.5 m outside the façade, faces it and
walks (W only) towards a point 6 m inside the building. It must stop outside: not reach that point and end less than
3 m past the ray's façade point (loggia rails and the loftgång stand in front of the ground-floor wall). Before #2302
the façades had no player collision and the character walked through.

The intentional openings must stay as open as before (`PASSAGES`): Hus L's portik from the street through to the
courtyard, and the drive up to the garage door in the box's west wall (src/config.js SITE.garageDoor). The garage door
itself and the A/B/C entrances keep the closed leaves and glazing of build_exterior.py's garage and stairwell copies
(#2279: they block since then, and opening doors is #2285); the route into Hus L's stairwell is test_exterior_route.py.

Run like the other world tests: copy this file to unreal/Lunden/Content/Python/ (untracked) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_facades
Writes Saved/facades-result.json and logs LUNDEN_FACADE lines, then LUNDEN_FACADES_OK.
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
MAP = WORLD["map"]
HALF_HEIGHT = 94.65  # capsule centre above the floor while walking (test_l1007.py)
OUTSIDE, INSIDE, PAST = 250.0, 600.0, 300.0  # cm: start outside the façade, walk target inside, allowed overshoot
FACADES = [p for p in M["buildings"] if p["expect"] == "hit" and (p["id"].endswith("_facade") or p["id"].endswith("_gable"))]
# name, start (x, y), target (x, y), floor z (cm): Hus L's portik (the export's clear ray, x -14.96 m) and the drive to
# the garage door (SITE.garageDoor: x -70.5 m, z 41 ... 47 m, park level GARAGE.floor -3 m; the closed leaf stops the
# capsule centre about 14 cm before the door line, measured before #2302)
PASSAGES = [("Hus L portik, street to courtyard", (-1496, -300), (-1496, 1500), 0.0),
            ("drive up to the garage door", (-7600, 4400), (-7090, 4400), -300.0)]

editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
if not u.EditorLoadingAndSavingUtils.load_map(MAP):
    raise RuntimeError(f"Could not load {MAP}: run compose_world.py first")
if len({p["house"] for p in FACADES}) < 4:
    raise RuntimeError("measurements.json lacks façade rays for Hus L, A, B and C: export with hus-l and kvarteret")
saved_slot = save_isolation.isolate()
levels.editor_request_begin_play()


@u.AutomationScheduler.add_latent_command
def facades_test():
    try:
        deadline = time.monotonic() + 60
        pawn = None
        while not pawn:
            if time.monotonic() >= deadline:
                raise RuntimeError("L_Lunden did not spawn the player")
            world = editor.get_game_world()
            pawn = u.GameplayStatics.get_player_character(world, 0) if world else None
            yield
        pc = pawn.get_controller()
        result = {"engine": u.SystemLibrary.get_engine_version(), "map": MAP, "export": M.get("sourceCommit"),
                  "facades": [], "passages": []}

        def wait(seconds):
            now = u.GameplayStatics.get_time_seconds(world)
            while u.GameplayStatics.get_time_seconds(world) - now < seconds:
                yield

        def press(key, down):
            u.SystemLibrary.execute_console_command(world, ("Input.+key " + key + " 1") if down else ("Input.-key " + key), pc)

        def ground(x, y, top):
            """The first walkable surface below `top` (simple collision: what the capsule stands on)."""
            hit = u.SystemLibrary.line_trace_single(world, u.Vector(x, y, top), u.Vector(x, y, top - 3000),
                                                    u.TraceTypeQuery.ECC_VISIBILITY, False, [pawn], u.DrawDebugTrace.NONE, True)
            if isinstance(hit, tuple):
                hit = hit[-1] if hit[0] else None
            parts = hit.to_tuple() if hit else None
            return parts[5].z if parts and parts[0] else None

        def place(x, y, z_top, yaw):
            floor = ground(x, y, z_top)
            if floor is None:
                raise RuntimeError(f"No ground under ({x:.0f}, {y:.0f}) below z {z_top:.0f}")
            pawn.set_actor_location(u.Vector(x, y, floor + HALF_HEIGHT + 5), False, True)
            pawn.get_movement_component().stop_movement_immediately()
            pc.set_control_rotation(u.Rotator(roll=0, pitch=0, yaw=yaw))
            return floor

        def walk(x, y, limit=8.0):
            """Walk towards (x, y); returns (reached, position) once there, stalled for 0.8 s or after `limit` s."""
            press("W", True)
            began = u.GameplayStatics.get_time_seconds(world)
            nearest, progress = float("inf"), began
            try:
                while True:
                    p = pawn.get_actor_location()
                    distance = math.hypot(x - p.x, y - p.y)
                    if distance <= 10:
                        return True, p
                    now = u.GameplayStatics.get_time_seconds(world)
                    if distance < nearest - 2:
                        nearest, progress = distance, now
                    if now - progress > 0.8 or now - began > limit:
                        return False, p
                    pc.set_control_rotation(u.Rotator(roll=0, pitch=0, yaw=math.degrees(math.atan2(y - p.y, x - p.x))))
                    yield
            finally:
                press("W", False)

        yield from wait(0.5)
        failures = []
        for f in FACADES:
            hx, hy, hz = f["hit"]["unreal"]
            dx, dy = f["to"][0] - f["from"][0], f["to"][1] - f["from"][1]
            n = math.hypot(dx, dy)
            dx, dy = dx / n, dy / n
            # ground-floor rays start just above their own floor; Hus L's rays are at storey 2 (the loftgång above the street)
            top = hz + 50 if hz < 345 else 150
            floor = place(hx - dx * OUTSIDE, hy - dy * OUTSIDE, top, math.degrees(math.atan2(dy, dx)))
            yield from wait(0.3)
            gen = walk(hx + dx * INSIDE, hy + dy * INSIDE)
            try:
                while True:
                    next(gen)
                    yield
            except StopIteration as done:
                reached, p = done.value
            past = (p.x - hx) * dx + (p.y - hy) * dy  # how far the capsule centre went past the façade point
            ok = not reached and past < PAST
            row = {"id": f["id"], "house": f["house"], "what": f["what"], "facadeCm": [hx, hy], "floorCm": round(floor, 2),
                   "stopCm": [round(p.x, 2), round(p.y, 2), round(p.z, 2)], "pastFacadeCm": round(past, 2),
                   "walkedThrough": reached, "ok": ok}
            result["facades"].append(row)
            u.log(f"LUNDEN_FACADE {f['id']} ({f['house']}, {f['what']}): {'walked through' if reached else 'stopped'} "
                  f"{past:+.1f} cm from the façade point, floor {floor:.1f}")
            if not ok:
                failures.append(f["id"])
        for name, (sx, sy), (tx, ty), want in PASSAGES:
            place(sx, sy, want + 150, math.degrees(math.atan2(ty - sy, tx - sx)))
            yield from wait(0.3)
            gen = walk(tx, ty, limit=20.0)
            try:
                while True:
                    next(gen)
                    yield
            except StopIteration as done:
                reached, p = done.value
            result["passages"].append({"name": name, "reached": reached, "stopCm": [round(p.x, 2), round(p.y, 2), round(p.z, 2)]})
            u.log(f"LUNDEN_FACADE_PASSAGE {name}: {'passable' if reached else 'BLOCKED'} at [{p.x:.1f}, {p.y:.1f}, {p.z:.1f}]")
            if not reached:
                failures.append(name)
        houses = {}
        for r in result["facades"]:
            h = houses.setdefault(r["house"], {"points": 0, "stopped": 0})
            h["points"] += 1
            h["stopped"] += 1 if r["ok"] else 0
        result["houses"] = houses
        out = Path(u.Paths.project_saved_dir()) / "facades-result.json"
        out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        for h, s in sorted(houses.items()):
            u.log(f"LUNDEN_FACADE_HOUSE {h}: {s['stopped']}/{s['points']} façade points stop the player")
        if failures or any(s["stopped"] < 2 for s in houses.values()):
            raise RuntimeError(f"LUNDEN_FACADES_FAIL {failures} (see {out})")
        u.log(f"LUNDEN_FACADES_OK {len(result['facades'])} façade points, {len(result['passages'])} passages")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
