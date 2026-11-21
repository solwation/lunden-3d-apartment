# Temporary (never committed): read/edit the packaged game's LundenSave.sav, copied into the editor's slot.
import json, sys
import unreal as u
mode = sys.argv[1]
TARGET = u.Vector(777.7, 888.8, 94.65)
FACING = u.Rotator(roll=0.0, pitch=-20.0, yaw=-45.0)
s = u.GameplayStatics.load_game_from_slot("LundenSave", 0)
if not s:
    raise RuntimeError("cannot read the slot")
def dump():
    loc, rot = s.get_editor_property("PlaceLocation"), s.get_editor_property("PlaceRotation")
    return {"class": s.get_class().get_path_name(), "version": s.get_editor_property("SaveVersion"), "id": s.get_editor_property("PlayerId"),
            "map": s.get_editor_property("PlaceMap"), "location": [round(loc.x, 3), round(loc.y, 3), round(loc.z, 3)],
            "rotation": [round(rot.pitch, 3), round(rot.yaw, 3), round(rot.roll, 3)],
            "settings": {str(k): str(v) for k, v in s.get_editor_property("Settings").items()}, "name": s.get_editor_property("PlayerName")}
u.log("PACKCHECK read " + json.dumps(dump()))
if mode == "edit":
    s.set_editor_property("PlaceLocation", TARGET)
    s.set_editor_property("PlaceRotation", FACING)
    settings = s.get_editor_property("Settings"); settings["pack.check"] = "2288"; s.set_editor_property("Settings", settings)
    s.set_editor_property("PlayerName", "Paketprov")
    if not u.GameplayStatics.save_game_to_slot(s, "LundenSave", 0):
        raise RuntimeError("cannot write")
    u.log("PACKCHECK edited " + json.dumps(dump()))
elif mode == "verify":
    d = dump()
    loc = s.get_editor_property("PlaceLocation"); rot = s.get_editor_property("PlaceRotation")
    dist = (loc - TARGET).length()
    turn = max(abs((rot.pitch - FACING.pitch + 180) % 360 - 180), abs((rot.yaw - FACING.yaw + 180) % 360 - 180))
    ok = dist <= 1.0 and turn <= 1.0 and d["settings"].get("pack.check") == "2288" and d["name"] == "Paketprov" and d["map"] == "L_SaveTest"
    u.log(f"PACKCHECK verify distance {dist:.4f} cm, facing {turn:.4f} deg, ok {ok}")
    if not ok:
        raise RuntimeError("packaged restore check failed")
