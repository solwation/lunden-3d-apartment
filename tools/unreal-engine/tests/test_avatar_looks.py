"""#2291: the look component against the web's look codes (tools/unreal-engine/avatar-looks.json, written from
src/config.js by avatar-looks.mjs, which checks the same table against the web's decoder for thousands of looks).

1. Code round trip. For every sample (legacy 7 and 9 digits, chosen heights 100/188/200, extended tags, a wire code)
   BPC_LundenLook.ParseLook accepts the code and EncodeLook gives the web's own encodeAvatarLook(decodeAvatarLook(code))
   back: the code itself for every canonical code, 9 digits for a 7-digit one, without the wire tags d and s. Every
   field of the table reads the web's value. Malformed codes are refused, and a malformed extension is dropped, as
   the web does (avatar-looks.json edgeCases).
2. The figure. On a BP_LundenAvatar, Look.ApplyLook(code) for every avatar-parts.json sample shows exactly the web
   pieces the look's rules pick, colours every region as the web's own figure does (linear RGB read back from
   avatarModelGeometry), scales the figure as the web (avatarProportions or the seeded tall) and stands as tall as the
   web's bind-pose figure (within 1 cm, where the web's head keeps its size); BP_LundenAvatar gets the code and scales.
3. Play (PIE on L_Lunden, the save slot set aside by save_isolation): the hall mirror (Level_LundenMirror) has the
   player's own figure in the plain look; the look menu applies a typed code (the child's head bone grows as the
   web's), refuses an invalid one, saves the chosen one; the figure stands at the player's feet and the capture is the
   player's camera reflected in the glass (1 cm); after a restart (a second PIE) the figure wears the chosen look.

Run like the other tests: copy this file to unreal/Lunden/Content/Python/ (untracked; delete afterwards) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_avatar_looks
Writes Saved/avatar-looks-result.json and logs LUNDEN_AVATAR_LOOKS_TEST lines, then LUNDEN_AVATAR_LOOKS_TEST_OK.
"""
import json
import sys
import time
from pathlib import Path

import unreal as u

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
DATA = json.loads((PROJECT.parents[1] / "tools/unreal-engine/avatar-looks.json").read_text(encoding="utf-8"))
COMPONENT = "/Game/Lunden/Avatar/Looks/BPC_LundenLook.BPC_LundenLook_C"
holder = u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(u.Actor, u.Vector(0, 0, 0))
look = u.new_object(u.load_class(None, COMPONENT), outer=holder)
result = {"engine": u.SystemLibrary.get_engine_version(), "samples": [], "edgeCases": []}
failures = []
names = [f["name"] for f in DATA["fields"]]
for s in DATA["samples"]:
    ok = look.call_method("ParseLook", (s["code"],))
    code = look.call_method("EncodeLook")
    stored = look.get_editor_property("LookCode")
    got = {n: look.call_method("LookField", (n,)) for n in names}
    wrong = {n: (got[n], s["fields"][n]) for n in names if got[n] != s["fields"][n]}
    entry = {"what": s["what"], "code": s["code"], "valid": ok, "encoded": code, "web": s["encoded"], "fieldsWrong": wrong}
    result["samples"].append(entry)
    u.log(f"LUNDEN_AVATAR_LOOKS_TEST {s['what']}: {s['code']} -> {code} (web {s['encoded']}), {len(names) - len(wrong)}/{len(names)} fields")
    if not ok or code != s["encoded"] or stored != code or wrong:
        failures.append(f"{s['what']}: valid {ok}, {code} vs web {s['encoded']}, stored {stored}, fields {wrong}")
for case in DATA["edgeCases"]:
    ok = look.call_method("ParseLook", (case["code"],))
    got = look.call_method("EncodeLook") if ok else ""
    result["edgeCases"].append({**case, "unrealValid": ok, "unrealEncoded": got})
    if ok != case["valid"] or got != case["encoded"]:
        failures.append(f"{case['code']!r}: Unreal valid {ok} {got!r}, web valid {case['valid']} {case['encoded']!r}")
holder.destroy_actor()

PARTS = json.loads((PROJECT.parents[1] / "tools/unreal-engine/avatar-parts.json").read_text(encoding="utf-8"))
AVATAR = "/Game/Lunden/Avatar/Rig/BP_LundenAvatar.BP_LundenAvatar_C"
avatar = u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(u.load_class(None, AVATAR), u.Vector(0, 0, 0))
look = [c for c in avatar.get_components_by_class(u.ActorComponent) if c.get_name() == "Look"]
result["figures"] = []
if len(look) != 1:
    failures.append(f"BP_LundenAvatar has no Look component: {[c.get_name() for c in avatar.get_components_by_class(u.ActorComponent)]}")
else:
    look = look[0]
    for s in PARTS["samples"]:
        applied = look.call_method("ApplyLook", (s["code"],))
        figure = look.get_editor_property("Figure")
        comps = [figure] + [c for c in look.get_editor_property("PieceComps") if c.get_editor_property("skeletal_mesh_asset")]
        shown = sorted(c.get_editor_property("skeletal_mesh_asset").get_name() for c in comps)
        wrong = []
        if not applied:
            wrong.append("not applied")
        if shown != sorted(s["pieces"]):
            wrong.append(f"pieces {sorted(set(shown) ^ set(s['pieces']))}")
        for region, rgb in s["linear"].items():
            c = look.get_editor_property("Colour" + region[0].upper() + region[1:])
            if max(abs(c.r - rgb[0]), abs(c.g - rgb[1]), abs(c.b - rgb[2])) > 2e-3:
                wrong.append(f"{region} {c.r:.4f},{c.g:.4f},{c.b:.4f} vs web {rgb}")
        scale = look.get_editor_property("FigureScale")
        top = max(o.z + e.z for o, e, _ in (u.SystemLibrary.get_component_bounds(c) for c in comps))
        entry = {"code": s["code"], "pieces": len(shown), "scale": [scale.x, scale.z], "head": look.get_editor_property("HeadScale"),
                 "topCm": round(top, 3), "webCm": s["heightCm"]}
        if s["scale"]:
            if abs(scale.x - s["scale"]["x"]) > 1e-4 or abs(scale.z - s["scale"]["y"]) > 1e-4 or abs(entry["head"] - s["scale"]["head"]) > 1e-4:
                wrong.append(f"scale {scale.x},{scale.z},{entry['head']} vs web {s['scale']}")
            if s["scale"]["head"] == 1 and abs(top - s["heightCm"]) > 1.0:
                wrong.append(f"height {top:.2f} cm vs web {s['heightCm']} cm")
        if avatar.get_editor_property("LookCode") != look.get_editor_property("LookCode") or \
                abs(avatar.get_editor_property("HeightScale") - scale.z) > 1e-6:
            wrong.append("BP_LundenAvatar did not get the code and scale")
        entry["wrong"] = wrong
        result["figures"].append(entry)
        u.log(f"LUNDEN_AVATAR_LOOKS_TEST figure {s['code']}: {len(shown)} pieces, top {top:.2f} cm (web {s['heightCm']}), "
              f"{'ok' if not wrong else wrong}")
        if wrong:
            failures.append(f"figure {s['code']}: {wrong}")
avatar.destroy_actor()
result["failures"] = failures
out = PROJECT / "Saved/avatar-looks-result.json"
sys.path.insert(0, str(PROJECT.parents[1] / "tools/unreal-engine/tests"))
import save_isolation  # noqa: E402

MIRROR = "/Game/Lunden/Avatar/Looks/BP_LundenMirror.BP_LundenMirror_C"
MENU = "/Game/Lunden/Avatar/Looks/WBP_LundenLookMenu.WBP_LundenLookMenu_C"
CHILD, CHOSEN = "000000000100", PARTS["samples"][14]["code"]
editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
u.EditorLoadingAndSavingUtils.load_map("/Game/Lunden/Maps/L_Lunden")
world = editor.get_editor_world()
if not u.GameplayStatics.get_all_actors_of_class(world, u.load_class(None, "/Game/Lunden/Avatar/Looks/BP_LundenMirror.BP_LundenMirror_C")):
    # before compose_world.py has the world-levels.json row in the map: add the sub-level in memory only (never saved)
    u.EditorLevelUtils.add_level_to_world(world, "/Game/Lunden/Avatar/Looks/Level_LundenMirror", u.LevelStreamingAlwaysLoaded)
    result["mirrorLevelAddedForTheTest"] = True
saved_slot = save_isolation.isolate()
result["play"] = {}


def check(ok, what):
    result["play"][what] = bool(ok)
    u.log(f"LUNDEN_AVATAR_LOOKS_TEST play {what}: {'ok' if ok else 'FAILED'}")
    if not ok:
        failures.append("play: " + what)


def play():
    levels.editor_request_begin_play()
    deadline = time.monotonic() + 90
    game = None
    while not game:
        if time.monotonic() > deadline:
            raise RuntimeError("PIE did not start")
        game = editor.get_game_world()
        yield
    for _ in range(20):
        yield
    return game


def mirror_of(game):
    found = u.GameplayStatics.get_all_actors_of_class(game, u.load_class(None, MIRROR))
    return found[0] if len(found) == 1 else None


def look_of(avatar):
    return [c for c in avatar.get_components_by_class(u.ActorComponent) if c.get_name() == "Look"][0]


def finish():
    result["failures"] = failures
    out.write_text(json.dumps(result, indent=1, default=str) + "\n", encoding="utf-8")
    if failures:
        raise RuntimeError(f"{len(failures)} failures, first: {failures[:5]}")
    u.log(f"LUNDEN_AVATAR_LOOKS_TEST_OK {len(DATA['samples'])} codes round-trip with {len(names)} fields each, "
          f"{len(DATA['edgeCases'])} malformed codes answered as the web, {len(result['figures'])} figures as the web's, "
          f"menu, mirror and a restart in play; result {out}")


@u.AutomationScheduler.add_latent_command
def in_play():
    try:
        game = yield from play()
        mirror = mirror_of(game)
        check(mirror is not None, "one hall mirror in L_Lunden")
        avatar = mirror.get_editor_property("Avatar") if mirror else None
        check(avatar is not None and look_of(avatar).get_editor_property("CaptureOnly"), "the player's own capture-only figure")
        if avatar:
            look = look_of(avatar)
            check(look.get_editor_property("LookCode") == "012340100", "a fresh save wears the plain look")
            pc = u.GameplayStatics.get_player_controller(game, 0)
            # through the menu's own button path (ui-extensions.json row "Look": WBP_LundenMenu.OpenExtension)
            ui = [c for c in pc.get_components_by_class(u.ActorComponent) if c.get_class().get_name() == "BPC_LundenUI_C"]
            ui[0].get_editor_property("Menu").call_method("OpenExtension", (u.load_class(None, MENU),))
            yield
            menus = [w for w in u.ObjectIterator(u.load_class(None, MENU)) if not w.get_name().startswith("Default__")
                     and w.get_world() == game]
            check(len(menus) == 1, "the menu button opens the look menu")
            menu = menus[0]
            box = menu.get_editor_property("CodeBox")
            box.set_text(CHILD)
            check(menu.call_method("Apply") and look.get_editor_property("LookCode") == CHILD, "the menu applies a typed code")
            for _ in range(5):
                yield
            figure = look.get_editor_property("Figure")
            anim = figure.get_anim_instance()
            scale = figure.get_socket_transform("head", u.RelativeTransformSpace.RTS_COMPONENT).scale3d
            want = [s_["scale"]["head"] for s_ in PARTS["samples"] if s_["code"] == CHILD][0]
            result["play"]["headScale"] = [anim.get_editor_property("HeadScale").x if anim else None, scale.z, want]
            check(abs(scale.z - want) < 1e-3, f"the child's head bone grows by {want:.3f} (got {scale.z:.3f})")
            box.set_text("abc")
            check(not menu.call_method("Apply") and look.get_editor_property("LookCode") == CHILD, "an invalid code changes nothing")
            box.set_text(" " + CHOSEN + " ")
            check(menu.call_method("Apply") and look.get_editor_property("LookCode") == CHOSEN, "the chosen code is applied and kept")
            view = DATA["mirror"]["view"]["unreal"]
            pawn = u.GameplayStatics.get_player_pawn(game, 0)
            pawn.teleport(u.Vector(view[0], view[1], 100.0), u.Rotator(roll=0, pitch=0, yaw=DATA["mirror"]["view"]["unrealYaw"]))
            pc.set_control_rotation(u.Rotator(roll=0, pitch=0, yaw=DATA["mirror"]["view"]["unrealYaw"]))
            for _ in range(40):
                yield
            cam = u.GameplayStatics.get_player_camera_manager(game, 0).get_camera_location()
            p0, n = mirror.get_actor_location(), mirror.get_actor_forward_vector()
            d = (cam - p0).dot(n)
            want_loc = cam - n * (2 * d)
            got = mirror.get_editor_property("Capture").get_world_location()
            result["play"]["capture"] = {"camera": [cam.x, cam.y, cam.z], "capture": [got.x, got.y, got.z],
                                         "expected": [want_loc.x, want_loc.y, want_loc.z], "glass": [p0.x, p0.y, p0.z], "normal": [n.x, n.y, n.z]}
            check((got - want_loc).length() < 1.0, f"the capture is the camera reflected in the glass ({(got - want_loc).length():.2f} cm)")
            feet = pawn.get_nav_agent_location()
            check((avatar.get_actor_location() - feet).length() < 1.0, "the figure stands at the player's feet")
        levels.editor_request_end_play()
        for _ in range(30):
            yield
        game = yield from play()
        mirror = mirror_of(game)
        again = mirror.get_editor_property("Avatar") if mirror else None
        check(again is not None and look_of(again).get_editor_property("LookCode") == CHOSEN, "the chosen look survives a restart")
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
        finish()
    except Exception:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot, editor)
        raise
