"""#2391 probe (scratch, not versioned): render river-bridge with variants of the bridge steel instance, in memory."""
import datetime, json, os, sys
from pathlib import Path
import unreal as u
TOOLS = Path(r"C:/Users/Olof/Documents/lunden-ue-wt/opus-release-2419/tools/unreal-engine")
sys.path.insert(0, str(TOOLS / "python")); sys.path.insert(0, str(TOOLS / "tests"))
from screenshot_level import render_view
from prepare_nanite_materials import static_mesh_editor
from capture_light import light_for
from capture_world import MANIFEST
MEL = u.MaterialEditingLibrary
VIEWS = json.loads((TOOLS.parents[1] / "unreal/Lunden/Tests/views.json").read_text(encoding="utf-8"))
out = sys.argv[2]; scene = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
u.EditorLoadingAndSavingUtils.load_map(MANIFEST["map"])
world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
light = light_for(world); date = datetime.date(**VIEWS["date"])
hidden = light.seasons.apply((date.year, date.month, date.day))
for path in u.EditorAssetLibrary.list_assets("/Game/Lunden/Generated/omgivning/StaticMeshes", recursive=True, include_folder=False):
    if "bridges" not in path: continue
    mesh = u.EditorAssetLibrary.load_asset(path); s = mesh.get_editor_property("nanite_settings")
    if s and s.get_editor_property("enabled"):
        s.set_editor_property("enabled", False); static_mesh_editor().set_nanite_settings(mesh, s, True)
actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
excluded = [a for a in actors if "kind:collision" in [str(t) for t in a.tags]]
u.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
mi = u.EditorAssetLibrary.load_asset("/Game/Lunden/Generated/omgivning/Materials/std_ffffff_r55_m45_vc")
info = {"parent": mi.get_editor_property("parent").get_path_name()}
for n in ("MetallicFactor", "RoughnessFactor", "SpecularFactor"):
    info[n] = MEL.get_material_instance_scalar_parameter_value(mi, n)
b = MEL.get_material_instance_vector_parameter_value(mi, "BaseColorFactor"); info["BaseColorFactor"] = [b.r, b.g, b.b, b.a]
info["scalars"] = [str(x) for x in MEL.get_scalar_parameter_names(mi)]
u.log("PROBE " + json.dumps(info))
m = info["MetallicFactor"]
variants = [("base", {}), ("diel_spec0", {"MetallicFactor": 0, "SpecularFactor": 0, "Base": 1 - m}), ("grey", {"MetallicFactor": 0, "SpecularFactor": 0, "Grey": 0.04})]
comps = []
for a in actors:
    for c in a.get_components_by_class(u.StaticMeshComponent):
        sm = c.get_editor_property("static_mesh")
        if sm and "bridges-steel" in sm.get_name(): comps.append(c)
u.log(f"PROBE steel components {len(comps)}")
master = u.load_asset("/InterchangeAssets/gltf/M_Default")
cam = [c for c in scene["cameras"] if c["id"] == "river-bridge"][0]
preset = VIEWS["lighting"][cam["lighting"]]
res = []
for name, v in variants:
    MEL.set_material_instance_scalar_parameter_value(mi, "MetallicFactor", v.get("MetallicFactor", m))
    MEL.set_material_instance_scalar_parameter_value(mi, "SpecularFactor", v.get("SpecularFactor", info["SpecularFactor"]))
    k = v.get("Base", 1.0)
    if "Grey" in v:  # neutral reference: divide out the green vertex colour (gcSteel, linear)
        g = v["Grey"]; vc = (0.04666508734226227, 0.10224173218011856, 0.07618538290262222)
        MEL.set_material_instance_vector_parameter_value(mi, "BaseColorFactor", u.LinearColor(g / vc[0], g / vc[1], g / vc[2], 1))
    else:
        MEL.set_material_instance_vector_parameter_value(mi, "BaseColorFactor", u.LinearColor(b.r * k, b.g * k, b.b * k, b.a))
    MEL.update_material_instance(mi)
    if False:
        for c in comps:
            d = c.create_dynamic_material_instance(0, master)
            d.set_vector_parameter_value("BaseColorFactor", u.LinearColor(0.06, 0.06, 0.06, 1))
            d.set_scalar_parameter_value("MetallicFactor", 0); d.set_scalar_parameter_value("SpecularFactor", 0)
            d.set_scalar_parameter_value("RoughnessFactor", 0.55)
    light.use(cam["lighting"], preset, (date.year, date.month, date.day), applied_season=hidden)
    obs = render_view(world, out, "rb-" + name, u.Vector(*cam["xyz"]), u.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"]),
                      scene["width"], scene["height"], scene["horizontalFov"], light.bias(preset), excluded + hidden, lumen=True)
    res.append({"variant": name, **{kk: vv for kk, vv in obs.items() if kk != "xyz"}})
(Path(out) / "probe.json").write_text(json.dumps({"info": info, "renders": res}, indent=1, default=str))
u.EditorLoadingAndSavingUtils.new_blank_map(False)
u.log("PROBE_OK")
