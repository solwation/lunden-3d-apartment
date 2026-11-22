"""#2392 probe (scratch, not versioned): render entrance-a and patio-lawn with variants of MI_LundenPatioPaving, in memory.
Nothing is saved. Variants: base (as built), grey (Color = JointColor = linear 0.2, Variation 0, Grain 0: the neutral
matte reference that the web capture also puts on its paving)."""
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
scene = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")); out = sys.argv[2]
variants = (sys.argv[3] if len(sys.argv) > 3 else "base,grey").split(",")
u.EditorLoadingAndSavingUtils.load_map(MANIFEST["map"])
world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
light = light_for(world); date = datetime.date(**VIEWS["date"]); cd = (date.year, date.month, date.day)
hidden = light.seasons.apply(cd)
n = 0
for path in u.EditorAssetLibrary.list_assets("/Game/Lunden/Generated", recursive=True, include_folder=False):
    if "/StaticMeshes/" not in path: continue
    mesh = u.EditorAssetLibrary.load_asset(path)
    s = mesh.get_editor_property("nanite_settings") if isinstance(mesh, u.StaticMesh) else None
    if s and s.get_editor_property("enabled"):
        s.set_editor_property("enabled", False); static_mesh_editor().set_nanite_settings(mesh, s, True); n += 1
actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
excluded = [a for a in actors if "kind:collision" in [str(t) for t in a.tags]]
u.SystemLibrary.execute_console_command(world, "r.Shadow.Virtual.Enable 0")
# which material the walk meshes draw
walks = {}
for a in actors:
    for c in a.get_components_by_class(u.StaticMeshComponent):
        sm = c.get_editor_property("static_mesh")
        if sm and any(k in sm.get_name() for k in ("xm1690_z991", "xm2640_z3230", "x284_z1521", "xm1509_z1426", "site-paving")):
            mats = [c.get_material(i).get_path_name() if c.get_material(i) else None for i in range(c.get_num_materials())]
            walks.setdefault(sm.get_name(), []).append({"actor": a.get_actor_label(), "level": a.get_outer().get_path_name(), "materials": mats, "hidden": a.is_hidden_ed(), "castShadow": c.get_editor_property("cast_shadow")})
u.log("PROBE_WALKS " + json.dumps(walks))
mi = u.EditorAssetLibrary.load_asset("/Game/Lunden/Materials/MI_LundenPatioPaving")
info = {}
for nme in ("Variation", "Grain", "Roughness", "JointRoughness", "Joint"):
    info[nme] = MEL.get_material_instance_scalar_parameter_value(mi, nme)
for nme in ("Color", "JointColor", "Size"):
    c = MEL.get_material_instance_vector_parameter_value(mi, nme); info[nme] = [c.r, c.g, c.b, c.a]
u.log("PROBE_MI " + json.dumps(info))
os.makedirs(out, exist_ok=True)
res = []
for var in variants:
    if var == "grey":
        g = u.LinearColor(0.2, 0.2, 0.2, 1)
        MEL.set_material_instance_vector_parameter_value(mi, "Color", g)
        MEL.set_material_instance_vector_parameter_value(mi, "JointColor", g)
        MEL.set_material_instance_scalar_parameter_value(mi, "Variation", 0.0)
        MEL.set_material_instance_scalar_parameter_value(mi, "Grain", 0.0)
        MEL.update_material_instance(mi)
    for cam in [c for c in scene["cameras"] if c["id"] in ("entrance-a", "patio-lawn")]:
        preset = VIEWS["lighting"][cam["lighting"]]
        light.use(cam["lighting"], preset, cd, applied_season=hidden)
        obs = render_view(world, out, var + "-" + cam["id"], u.Vector(*cam["xyz"]), u.Rotator(roll=0, pitch=cam["pitch"], yaw=cam["yaw"]),
                          scene["width"], scene["height"], scene["horizontalFov"], light.bias(preset), excluded + hidden, lumen=True)
        res.append({"variant": var, "id": cam["id"], "exposureBias": light.bias(preset), **{k: v for k, v in obs.items() if k != "xyz"}})
(Path(out) / "probe.json").write_text(json.dumps({"mi": info, "walks": walks, "naniteOff": n, "renders": res}, indent=1, default=str))
u.EditorLoadingAndSavingUtils.new_blank_map(False)
u.log("PROBE_OK")
