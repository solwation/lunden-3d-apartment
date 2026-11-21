"""Headless UE check for #2324. Run run-python.ps1 with this file after build_facade.py and compose_world.py."""
import json
import math
from pathlib import Path
import sys
import unreal as u

project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
sys.path.insert(0, str(project.parents[1] / "tools/unreal-engine/python"))
import build_facade as builder
import facade_scene

spec = json.loads((project / "Import/measurements.json").read_text())["site"]["facadeLighting"]
rows = facade_scene.validate(spec)
world = u.EditorLoadingAndSavingUtils.load_map("/Game/Lunden/Maps/L_Lunden")
if not world:
    raise RuntimeError("Could not load the composed world")
actors = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
faces = {a.get_actor_label():a for a in actors if any(str(t).startswith("facade:") for t in a.tags)}
if len(faces) != len(rows) + len(spec["surfaces"]):
    raise RuntimeError("Facade actors missing or duplicated in the composed world")
for i,r in enumerate(rows):
    a = faces[f"Facade_{r['house']}_{r['kind']}_{i}"]
    xyz = a.get_actor_location()
    c = a.get_component_by_class(u.StaticMeshComponent)
    values = c.get_editor_property("custom_primitive_data").get_editor_property("data")
    position = [xyz.x, xyz.y, xyz.z]
    material = c.get_material(0)
    material_name = material.get_name() if material else None
    collision = c.get_collision_enabled()
    differences = {}
    if math.dist(position, r["xyz"]) > .1:
        differences["position (actual, expected)"] = [position, r["xyz"]]
    if len(values) < len(r["values"]) or any(not math.isclose(x,y,abs_tol=.005) for x,y in zip(values,r["values"])):
        differences["custom primitive data (actual, expected)"] = [list(values), r["values"]]
    if material_name != "M_Facade_" + r["kind"]:
        differences["material"] = material_name
    if collision != u.CollisionEnabled.NO_COLLISION:
        differences["collision"] = str(collision)
    if differences:
        raise RuntimeError(f"{a.get_actor_label()}: {differences}")
for s in spec["surfaces"]:
    mesh = faces[s["name"]].get_component_by_class(u.StaticMeshComponent).static_mesh
    triangles = mesh.get_num_triangles(0)
    if triangles != len(s["indices"])//3 or mesh.get_name() != "SM_"+s["name"]:
        raise RuntimeError("The native light wash/pool is missing its measured geometry: " + s["name"])

ctrl, = (a for a in actors if "lunden:facade-controller" in map(str,a.tags))
weather,wall = u.load_asset(builder.lighting.MPC),u.load_asset(builder.LOCAL_MPC)
def set_value(mpc,name,v):
    u.MaterialLibrary.set_scalar_parameter_value(world,mpc,name,v)
def value(mpc,name):
    return u.MaterialLibrary.get_scalar_parameter_value(world,mpc,name)
saved = [(mpc,n,value(mpc,n)) for mpc,n in [(weather,"Night"),(weather,"PowerAvailable"),(wall,"WallOn"),(wall,"WallLevel")]]
try:
    set_value(wall,"WallOn",0)
    set_value(wall,"WallLevel",0)
    on,off,fade = (spec["wallLight"][k] for k in ("on","off","fade"))
    k = 0
    for n,p,dt,expected in [(off-.01,1,.2,0), (on+.01,1,.3,1), ((on+off)/2,1,.2,1),
                            ((on+off)/2,0,.2,0), ((on+off)/2,1,.2,0), (on+.01,1,2,1), (off-.01,1,.5,0)]:
        set_value(weather,"Night",n)
        set_value(weather,"PowerAvailable",p)
        ctrl.call_method("ReceiveTick", (dt,))
        k = min(1,max(0,k+(1 if expected else -1)*min(dt,1)/fade))
        if value(wall,"WallOn") != expected or not math.isclose(value(wall,"WallLevel"),k,abs_tol=1e-5):
            raise RuntimeError(f"Facade controller failed at night={n}, power={p}, delta={dt}")
    # Change both collections between calls, with no Tick: SettleFacade must read its own fresh inputs.
    for night, power, latch, expected in [(1,1,0,1), (1,0,1,0), ((on+off)/2,1,1,1), ((on+off)/2,1,0,0)]:
        set_value(weather,"PowerAvailable",power)
        set_value(weather,"Night",night)
        set_value(wall,"WallOn",latch)
        set_value(wall,"WallLevel",1-expected)
        ctrl.call_method("SettleFacade")
        if value(wall,"WallOn") != expected or value(wall,"WallLevel") != expected:
            raise RuntimeError(f"Still capture failed at night={night}, power={power}, latch={latch}")
finally:
    for mpc,name,v in saved:
        set_value(mpc,name,v)
u.log(f"LUNDEN_FACADE_LIGHTING_OK {len(rows)} saved faces, {len(spec['surfaces'])} meshes and seven controller steps")
