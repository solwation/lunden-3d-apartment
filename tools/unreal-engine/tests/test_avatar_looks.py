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

Run like the other tests: copy this file to unreal/Lunden/Content/Python/ (untracked; delete afterwards) and
    run-tests.ps1 -Filter Editor.Python.Lunden.test_avatar_looks
Writes Saved/avatar-looks-result.json and logs LUNDEN_AVATAR_LOOKS_TEST lines, then LUNDEN_AVATAR_LOOKS_TEST_OK.
"""
import json
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
out.write_text(json.dumps(result, indent=1, default=str) + "\n", encoding="utf-8")
if failures:
    raise RuntimeError(f"{len(failures)} failures, first: {failures[:5]}")
u.log(f"LUNDEN_AVATAR_LOOKS_TEST_OK {len(DATA['samples'])} codes round-trip with {len(names)} fields each, "
      f"{len(DATA['edgeCases'])} malformed codes answered as the web, {len(result['figures'])} figures as the web's; result {out}")
