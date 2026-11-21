"""#2291: the look component against the web's look codes (tools/unreal-engine/avatar-looks.json, written from
src/config.js by avatar-looks.mjs, which checks the same table against the web's decoder for thousands of looks).

1. Code round trip. For every sample (legacy 7 and 9 digits, chosen heights 100/188/200, extended tags, a wire code)
   BPC_LundenLook.ParseLook accepts the code and EncodeLook gives the web's own encodeAvatarLook(decodeAvatarLook(code))
   back: the code itself for every canonical code, 9 digits for a 7-digit one, without the wire tags d and s. Every
   field of the table reads the web's value. Malformed codes are refused, and a malformed extension is dropped, as
   the web does (avatar-looks.json edgeCases).

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
result["failures"] = failures
out = PROJECT / "Saved/avatar-looks-result.json"
out.write_text(json.dumps(result, indent=1, default=str) + "\n", encoding="utf-8")
if failures:
    raise RuntimeError(f"{len(failures)} failures, first: {failures[:5]}")
u.log(f"LUNDEN_AVATAR_LOOKS_TEST_OK {len(DATA['samples'])} codes round-trip with {len(names)} fields each, "
      f"{len(DATA['edgeCases'])} malformed codes answered as the web; result {out}")
