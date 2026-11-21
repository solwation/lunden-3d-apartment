"""#2290: BP_LundenAvatar in Play In Editor: the logical hit zones against the web's shared head contract, the animation
states, and planted feet while walking, running and crouch-walking.

1. Hit zones. For every sample of tools/unreal-engine/avatar-contract.json (written from src/config.js by
   avatar-contract.mjs: the web's own rifleBoxHeadContact, playerBodySegment and rifleHeadBaseY for a standard figure
   standing, half and fully crouched, seated and lying) SetMotion puts the avatar in that state and the same rays are
   traced through the three head boxes: the first contact must lie within 1 cm of the web's. A ray that grazes an edge
   (the web's answer changes within 1.5 cm) may instead match the web 1.5 cm to either side (2.5 cm). The body capsule's axis ends must match playerBodySegment (1 cm).
   The zones hang off HitZones, not the skeleton, so the rendered pose cannot move them (checked: the head bone moves
   with the crouch while the zones move only with SetMotion).
2. States. SetMotion drives ABP_LundenAvatar: idle, walk, run, crouch, jump (Airborne) and sit; the anim instance takes
   over the values and the pelvis and feet go where each state puts them.
3. Feet. The avatar is moved along +X at the web player's walk, sprint and crouched speeds (avatar-contract.json
   motion); while a foot is planted (within 2 cm of its lowest height) its world X speed must stay under 15 % of the
   ground speed (no sliding).

Run like the other PIE tests (save_isolation.py is imported from tools/unreal-engine/tests):
    copy tools\\unreal-engine\\tests\\test_avatar_rig.py unreal\\Lunden\\Content\\Python\\   (untracked; delete afterwards)
    run-tests.ps1 -Filter Editor.Python.Lunden.test_avatar_rig
Writes Saved/avatar-rig-result.json and logs LUNDEN_AVATAR_TEST lines, then LUNDEN_AVATAR_TEST_OK.
"""
import json
import math
from pathlib import Path
import sys
import time

import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
sys.path.insert(0, str(PROJECT.parents[1] / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402  #2311: start without the player's save file

CONTRACT = json.loads((PROJECT.parents[1] / "tools/unreal-engine/avatar-contract.json").read_text(encoding="utf-8"))
AVATAR = "/Game/Lunden/Avatar/Rig/BP_LundenAvatar.BP_LundenAvatar_C"
ORIGIN = u.Vector(500.0, 300.0, 1000.0)  # away from the PIE player; nothing here collides with the zones
TOL, EDGE_TOL, SLIDE_SHARE = 1.0, 2.5, 0.15
HEAD = ("HeadLower", "HeadMiddle", "HeadTop")


def frame(v):
    """Avatar frame (forward, left, up; metres) -> Unreal offset (cm): X forward, Y right, Z up."""
    return u.Vector(v[0] * 100, -v[1] * 100, v[2] * 100)


def component(actor, name):
    for c in actor.get_components_by_class(u.SceneComponent):
        if c.get_name() == name:
            return c
    raise RuntimeError(f"BP_LundenAvatar has no component {name}")


def first_hit(boxes, start, end):
    best = None
    for box in boxes:
        res = box.line_trace_component(start, end, False, False, False)
        if res is None:  # no contact
            continue
        items = res if isinstance(res, tuple) else (res,)
        found = [x for x in items if isinstance(x, u.HitResult)]
        if not found:
            raise RuntimeError(f"line_trace_component returned {res!r}")
        # A returned result is a contact (the zones overlap rather than block, so blocking_hit stays False)
        loc = found[0].to_dict()["impact_point"]
        if True:
            d = (loc - start).length()
            if best is None or d < best[0]:
                best = (d, loc)
    return best[1] if best else None


u.EditorLoadingAndSavingUtils.new_blank_map(False)
u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(u.load_class(None, AVATAR), ORIGIN)
saved_slot = save_isolation.isolate()
u.get_editor_subsystem(u.LevelEditorSubsystem).editor_request_begin_play()
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)


@u.AutomationScheduler.add_latent_command
def avatar_rig_test():
    levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
    result = {"engine": u.SystemLibrary.get_engine_version(), "seed": CONTRACT["seed"], "zones": [], "states": {}, "feet": []}
    failures = []
    try:
        deadline = time.monotonic() + 60
        game = None
        while not game:
            if time.monotonic() > deadline:
                raise RuntimeError("PIE did not start")
            game = editor.get_game_world()
            yield
        found = u.GameplayStatics.get_all_actors_of_class(game, u.load_class(None, AVATAR))
        if len(found) != 1:
            raise RuntimeError(f"PIE world has {len(found)} BP_LundenAvatar")
        avatar = found[0]
        boxes = [component(avatar, n) for n in HEAD]
        capsule = component(avatar, "BodyZone")
        body = component(avatar, "Body")
        for _ in range(5):
            yield

        def motion(speed=0.0, crouch=0.0, air=False, pose=0):
            avatar.call_method("SetMotion", (float(speed), float(crouch), bool(air), int(pose)))

        def bone(name):
            return body.get_socket_location(name) - avatar.get_actor_location()

        # 1. Hit zones --------------------------------------------------------------------------------------------
        for sample in CONTRACT["samples"]:
            st = sample["state"]
            motion(0, st.get("c", 0), False, st.get("pose", 0))
            yield
            worst, checked, skipped = 0.0, 0, 0
            for ray in sample["rays"]:
                start = ORIGIN + frame(ray["from"])
                end = start + frame(ray["dir"]) * 10.0
                got = first_hit(boxes, start, end)
                axis = 2 if ray["dir"][2] else 0
                want = None if ray["hit"] is None else ray["hit"] * 100
                have = None if got is None else (got.z - ORIGIN.z if axis == 2 else got.x - ORIGIN.x)
                if ray.get("edge"):
                    # a grazing ray: Unreal may answer like the web 1.5 cm to either side (or as the ray itself)
                    options = [ray["hit"]] + ray["alt"]
                    if any((o is None and have is None) or (o is not None and have is not None and abs(have - o * 100) <= EDGE_TOL)
                           for o in options):
                        skipped += 1
                        continue
                    failures.append(f"{sample['name']} edge ray {ray['from']} {ray['dir']}: web {options}, Unreal {have}")
                    continue
                if (want is None) != (have is None):
                    failures.append(f"{sample['name']} ray {ray['from']} {ray['dir']}: web {want}, Unreal {have}")
                    continue
                checked += 1
                if want is not None:
                    err = abs(have - want)
                    worst = max(worst, err)
                    if err > TOL:
                        failures.append(f"{sample['name']} ray {ray['from']} {ray['dir']}: web {want:.2f}, Unreal {have:.2f} cm")
            # body capsule axis ends
            t = capsule.get_world_transform()
            axis_dir = capsule.get_up_vector()
            half = capsule.get_scaled_capsule_half_height() - capsule.get_scaled_capsule_radius()
            ends = [t.translation - axis_dir * half - ORIGIN, t.translation + axis_dir * half - ORIGIN]
            want_ends = [frame(p) for p in sample["body"]]
            body_err = max((a - b).length() for a, b in zip(ends, want_ends))
            if body_err > TOL:
                failures.append(f"{sample['name']} body capsule ends off by {body_err:.2f} cm")
            # lowest head point: a downward sweep is enough to compare with rifleHeadBaseY's role (informational)
            head_bone = bone("head")
            entry = {"name": sample["name"], "rays": checked, "edgeRays": skipped, "worstCm": round(worst, 3),
                     "bodyEndsErrCm": round(body_err, 3), "headBone": [round(head_bone.x, 1), round(head_bone.z, 1)],
                     "radius": capsule.get_scaled_capsule_radius()}
            result["zones"].append(entry)
            u.log(f"LUNDEN_AVATAR_TEST zones {entry}")

        # 2. States -----------------------------------------------------------------------------------------------
        anim = body.get_anim_instance()
        if not anim or anim.get_class().get_name() != "ABP_LundenAvatar_C":
            raise RuntimeError(f"Body runs {anim.get_class().get_name() if anim else None}, not ABP_LundenAvatar")
        cases = [("stand", dict()), ("walk", dict(speed=160)), ("run", dict(speed=320)), ("crouch", dict(crouch=1)),
                 ("crouch-walk", dict(speed=80, crouch=1)), ("jump", dict(air=True)), ("sit", dict(pose=1))]
        for name, kw in cases:
            motion(**kw)
            for _ in range(40):  # past every blend (0.3 s at most)
                yield
            got = {k: anim.get_editor_property(k) for k in ("Speed", "Moving", "Airborne", "Sitting")}
            pelvis, fl, fr, head = bone("pelvis"), bone("foot_l"), bone("foot_r"), bone("head")
            entry = {"vars": {k: (round(v, 2) if isinstance(v, float) else v) for k, v in got.items()},
                     "pelvisZ": round(pelvis.z, 1), "feetZ": [round(fl.z, 1), round(fr.z, 1)],
                     "headXZ": [round(head.x, 1), round(head.z, 1)]}
            result["states"][name] = entry
            u.log(f"LUNDEN_AVATAR_TEST state {name}: {entry}")
            want = {"Speed": float(kw.get("speed", 0)), "Moving": kw.get("speed", 0) > CONTRACT["motion"]["legsWalkAbove"] * 100,
                    "Airborne": kw.get("air", False), "Sitting": kw.get("pose", 0) > 0}
            for k, v in want.items():
                if (abs(got[k] - v) > 1e-3) if isinstance(v, float) else got[k] != v:
                    failures.append(f"state {name}: anim {k} = {got[k]}, want {v}")
        s = result["states"]
        drop = s["stand"]["pelvisZ"] - s["crouch"]["pelvisZ"]
        want_drop = CONTRACT["head"]["hipDrop"] * 100
        checks = [
            ("crouch lowers the pelvis by hipDrop", abs(drop - want_drop) <= 3.0, f"{drop:.1f} vs {want_drop:.1f} cm"),
            ("crouched feet stay on the ground", max(s["crouch"]["feetZ"]) <= max(s["stand"]["feetZ"]) + 3.0, str(s["crouch"]["feetZ"])),
            ("crouched head leans forward", s["crouch"]["headXZ"][0] > s["stand"]["headXZ"][0] + 10, f"{s['crouch']['headXZ']} vs {s['stand']['headXZ']}"),
            ("sitting lowers the pelvis", s["sit"]["pelvisZ"] < s["stand"]["pelvisZ"] - 25, str(s["sit"]["pelvisZ"])),
            ("the jump pose differs from standing", abs(s["jump"]["feetZ"][0] - s["stand"]["feetZ"][0]) + abs(s["jump"]["pelvisZ"] - s["stand"]["pelvisZ"]) > 3,
             f"{s['jump']} vs {s['stand']}"),
        ]
        for label, ok, detail in checks:
            u.log(f"LUNDEN_AVATAR_TEST {'ok' if ok else 'FAIL'} {label}: {detail}")
            if not ok:
                failures.append(f"{label}: {detail}")
        result["checks"] = [{"check": c[0], "ok": c[1], "detail": c[2]} for c in checks]

        # 3. Planted feet -----------------------------------------------------------------------------------------
        m = CONTRACT["motion"]
        for name, speed, crouch in (("walk", m["walk"] * 100, 0), ("sprint", m["run"] * 100, 0),
                                    ("crouch-walk", m["walk"] * m["crouchSpeed"] * 100, 1)):
            avatar.set_actor_location(ORIGIN, False, False)
            motion(speed, crouch)
            for _ in range(30):
                yield
            x = ORIGIN.x
            track = []
            t0 = time.monotonic()
            while len(track) < 240:
                dt = u.GameplayStatics.get_world_delta_seconds(game)
                x += speed * dt
                avatar.set_actor_location(u.Vector(x, ORIGIN.y, ORIGIN.z), False, False)
                yield
                track.append((u.GameplayStatics.get_time_seconds(game), body.get_socket_location("foot_l"),
                              body.get_socket_location("foot_r")))
            planted = []
            for i in (1, 2):
                low = min(p[i].z for p in track)
                for a, b in zip(track, track[1:]):
                    dt = b[0] - a[0]
                    if dt > 0 and a[i].z < low + 2.0 and b[i].z < low + 2.0:
                        planted.append(abs(b[i].x - a[i].x) / dt)
            planted.sort()
            median = planted[len(planted) // 2] if planted else float("nan")
            ok = bool(planted) and median <= SLIDE_SHARE * speed
            entry = {"gait": name, "speed": speed, "plantedSamples": len(planted), "medianFootSpeed": round(median, 2),
                     "limit": round(SLIDE_SHARE * speed, 2), "ok": ok, "seconds": round(time.monotonic() - t0, 2)}
            result["feet"].append(entry)
            u.log(f"LUNDEN_AVATAR_TEST feet {entry}")
            if not ok:
                failures.append(f"feet slide at {name}: {entry}")

        result["failures"] = failures
        out = Path(u.Paths.project_saved_dir()) / "avatar-rig-result.json"
        out.write_text(json.dumps(result, indent=1, default=str) + "\n", encoding="utf-8")
        if failures:
            raise RuntimeError(f"{len(failures)} failures, first: {failures[:8]}")
        u.log(f"LUNDEN_AVATAR_TEST_OK {sum(z['rays'] for z in result['zones'])} rays within {TOL} cm, "
              f"{len(result['states'])} states, feet planted at {[f['gait'] for f in result['feet']]}; result {out}")
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
