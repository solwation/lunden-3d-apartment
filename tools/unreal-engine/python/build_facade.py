"""Build #2324's facade sublevel from the exported desktop meshes. Run with run-python.ps1 after build_lighting.py."""
import hashlib
import json
from pathlib import Path
import sys
import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_lighting as lighting
import facade_scene as facade
import collection_ids

ASSETS = u.EditorAssetLibrary
MEL = u.MaterialEditingLibrary
DIR = "/Game/Lunden/Generated/FacadeLighting"
LEVEL = DIR + "/Level_facade_lighting"
LOCAL_MPC = DIR + "/MPC_LundenFacade"
CONTROLLER = DIR + "/BP_LundenFacade"
PLANE = "/Engine/BasicShapes/Plane"
PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
FOLDER = PROJECT / "Content/Lunden/Generated/FacadeLighting"
STAMP = FOLDER / "facade-stamp.json"
SOURCES = {"PositionWS": u.MaterialExpressionWorldPosition, "ViewDir": u.MaterialExpressionCameraVectorWS,
           "Seconds": u.MaterialExpressionTime, "UV": u.MaterialExpressionTextureCoordinate}
WALL_PARAMETERS = {"WallOn", "WallLevel"}  # MPC_LundenFacade, a file of this folder: the stamp's file hashes cover it


def weather_reads():
    """#2408: the MPC_LundenWeather parameters the facade materials read (their inputs, and Night for the radiance gain)."""
    names = {n for kind in facade.INPUTS for n in facade.INPUTS[kind] if n not in SOURCES and n not in WALL_PARAMETERS}
    return {lighting.MPC: tuple(sorted(names | {"Night"}))}


def unresolved_reads():
    """#2408: facade materials whose collection expressions no longer name a parameter."""
    out = []
    for kind in facade.FIELDS:
        path = DIR + "/M_Facade_" + kind
        if ASSETS.does_asset_exist(path):
            out += [f"{path}: {e}" for e in collection_ids.unresolved(ASSETS.load_asset(path))]
    return out


def asset(path, cls, factory):
    return ASSETS.load_asset(path) if ASSETS.does_asset_exist(path) else lighting.create(path, cls, factory)


def wall_collection():
    mpc = asset(LOCAL_MPC, u.MaterialParameterCollection, u.MaterialParameterCollectionFactoryNew())
    if not list(mpc.get_editor_property("scalar_parameters")):
        entries = []
        for name in ("WallOn", "WallLevel"):
            entry = u.CollectionScalarParameter()
            entry.set_editor_property("parameter_name", name)
            entry.set_editor_property("default_value", 0)
            entries.append(entry)
        mpc.set_editor_property("scalar_parameters", entries)
        lighting.save(mpc)
    return mpc


def wall_controller(spec, weather, wall):
    bp = lighting.load_or_create_blueprint(CONTROLLER, u.Actor)
    g = lighting.Graph(bp)
    def read(chain, mpc, name):
        node = g.call("KismetMaterialLibrary:GetScalarParameterValue", ParameterName=name)
        lighting.constant(node, "Collection", mpc.get_path_name())
        # This getter has exec pins. Its output belongs to the event that executed it.
        chain.then(node)
        return node, "ReturnValue"

    def update(event, ticking):
        chain = lighting.Chain(event)
        expr = lighting.Expr(g, {"night": read(chain, weather, "Night"),
                                 "power": read(chain, weather, "PowerAvailable"),
                                 "latch": read(chain, wall, "WallOn"),
                                 "on": float(spec["on"]), "off": float(spec["off"])})
        desired = expr.run("desired = select(power > 0.5, select(latch > 0.5, select(night < off, 0, 1), select(night > on, 1, 0)), 0)")["desired"]
        level = desired
        if ticking:
            expr.env.update(level=read(chain, wall, "WallLevel"), dt=(event, "DeltaSeconds"), fade=float(spec["fade"]))
            level = expr.run("amount = clamp(level + select(desired > 0.5, 1, -1) * min(dt,1) / fade, 0, 1)")["amount"]
        for name, value in (("WallLevel", level), ("WallOn", desired)):
            node = g.call("KismetMaterialLibrary:SetScalarParameterValue", ParameterName=name)
            lighting.constant(node, "Collection", wall.get_path_name())
            expr.feed(node, "ParameterValue", value)
            chain.then(node)

    update(g.event("Tick", "ReceiveTick"), ticking=True)
    # Still captures run in an editor world without Tick. Read the same inputs on their own exec chain.
    update(g.custom("SettleFacade"), ticking=False)
    lighting.BP.compile_blueprint(bp)
    if g.g.list_nodes_with_errors():
        raise RuntimeError("Could not compile BP_LundenFacade")
    lighting.save(bp)
    return bp


def custom_input(name):
    pin = u.CustomInput()  # #2382: 5.8 structs take no keyword arguments; set fields as stair_lamp.py does
    pin.set_editor_property("input_name", name)
    return pin


def material(kind, spec, weather, wall):
    mat = asset(DIR + "/M_Facade_" + kind, u.Material, u.MaterialFactoryNew())
    collection_ids.clear_graph(mat)  # #2408: no orphaned collection expression survives a rebuild
    mat.set_editor_property("shading_model", u.MaterialShadingModel.MSM_UNLIT)
    blend = {"room": u.BlendMode.BLEND_TRANSLUCENT, "lens": u.BlendMode.BLEND_OPAQUE}
    mat.set_editor_property("blend_mode", blend.get(kind, u.BlendMode.BLEND_ADDITIVE))
    mat.set_editor_property("two_sided", kind == "wash")  # room face normals are exported individually
    names = facade.FIELDS[kind] + facade.INPUTS[kind]
    code = MEL.create_material_expression(mat, u.MaterialExpressionCustom, -300, 0)
    code.set_editor_property("inputs", [custom_input(n) for n in names])
    code.set_editor_property("output_type", u.CustomMaterialOutputType.CMOT_FLOAT4)
    code.set_editor_property("code", facade.shader(kind, spec))
    sources = SOURCES
    for i, name in enumerate(names):
        if name in facade.FIELDS[kind]:
            e = MEL.create_material_expression(mat, u.MaterialExpressionScalarParameter, -800,i*65)
            e.set_editor_property("parameter_name", name)
            e.set_editor_property("use_custom_primitive_data", True)
            e.set_editor_property("primitive_data_index", i)
        elif name in sources:
            e = MEL.create_material_expression(mat, sources[name], -800,i*65)
        else:
            e = MEL.create_material_expression(mat, u.MaterialExpressionCollectionParameter, -800,i*65)
            e.set_editor_property("collection", wall if name in WALL_PARAMETERS else weather)
            e.set_editor_property("parameter_name", name)
        if not MEL.connect_material_expressions(e, "", code, name):
            raise RuntimeError(f"{kind}: failed to connect {name}")
    outputs = [("rgb",u.MaterialProperty.MP_EMISSIVE_COLOR)]
    if kind == "room":
        outputs.append(("a",u.MaterialProperty.MP_OPACITY))
    for channels, prop in outputs:
        mask = MEL.create_material_expression(mat, u.MaterialExpressionComponentMask, -100, 0 if channels=="rgb" else 120)
        for ch in "rgba":
            mask.set_editor_property(ch, ch in channels)
        if not MEL.connect_material_expressions(code, "", mask, ""):
            raise RuntimeError(f"{kind}: failed to connect {channels}")
        output = mask
        if prop == u.MaterialProperty.MP_EMISSIVE_COLOR:
            # The desktop shader returns scene colour at its own exposure. Convert that colour to native
            # radiance using the measured game exposure in the two November reference views (#2324).
            output = MEL.create_material_expression(mat, u.MaterialExpressionMultiply, 80, -75)
            if kind == "wash":
                # Additive light overlays the already-lit wall or ground. Interpolate the two native
                # render trials against the web's measured radial profile (gain 1 too dim, gain 5.86 too bright).
                output.set_editor_property("const_b", 2.65)
            else:
                night = MEL.create_material_expression(mat, u.MaterialExpressionCollectionParameter, -300, -210)
                night.set_editor_property("collection", weather)
                night.set_editor_property("parameter_name", "Night")
                gain = MEL.create_material_expression(mat, u.MaterialExpressionLinearInterpolate, -100, -210)
                gain.set_editor_property("const_a", 2 ** 1.965)
                gain.set_editor_property("const_b", 2 ** 2.55)
                if not (MEL.connect_material_expressions(night, "", gain, "Alpha")
                        and MEL.connect_material_expressions(gain, "", output, "B")):
                    raise RuntimeError(f"{kind}: failed to connect the exposure-dependent radiance gain")
            if not MEL.connect_material_expressions(mask, "", output, "A"):
                raise RuntimeError(f"{kind}: failed to connect the facade radiance conversion")
        if not MEL.connect_material_property(output, "", prop):
            raise RuntimeError(f"{kind}: failed to connect {channels} output")
    MEL.recompile_material(mat)
    ASSETS.set_metadata_tag(mat, "Lunden.Assumption", "guess: native facade radiance calibrated to the matched November game views (#2324)")
    lighting.save(mat)
    return mat


def glow_mesh(surface, template):
    path = DIR + "/SM_" + surface["name"]
    mesh = (ASSETS.load_asset(path) if ASSETS.does_asset_exist(path) else
            lighting.TOOLS.duplicate_asset(path.rsplit("/",1)[1], DIR, template))
    desc = u.StaticMesh.create_static_mesh_description(mesh)
    group = desc.create_polygon_group()
    slot = mesh.get_editor_property("static_materials")[0].get_editor_property("material_slot_name")
    desc.set_polygon_group_material_slot_name(group, slot)
    vertex_ids = []
    for x,y,z,uvx,uvy in surface["vertices"]:
        vertex = desc.create_vertex()
        desc.set_vertex_position(vertex, u.Vector(x,y,z))
        vertex_ids.append(vertex)
    indices = surface["indices"]
    for start in range(0,len(indices),3):
        corners = []
        for i in indices[start:start+3]:
            corner = desc.create_vertex_instance(vertex_ids[i])
            desc.set_vertex_instance_uv(corner, u.Vector2D(*surface["vertices"][i][3:]))
            corners.append(corner)
        desc.create_triangle(group, corners)
    # Commit source mesh descriptions as well as render buffers so the editor can save and cook the assets.
    mesh.build_from_static_mesh_descriptions([desc], False, False)
    lighting.save(mesh)
    return mesh


def level(rows, spec, materials, manager):
    levels = u.EditorLoadingAndSavingUtils
    world = levels.new_blank_map(False)
    actors = u.get_editor_subsystem(u.EditorActorSubsystem)
    template = u.load_asset(PLANE)
    if not template:
        raise RuntimeError("Missing stock UE plane " + PLANE)
    controller = actors.spawn_actor_from_class(manager.generated_class(), u.Vector())
    controller.set_actor_label("Lunden facade lights")
    controller.tags = [u.Name("lunden:facade-controller")]

    def place(label, tags, mesh, kind, values, pos, rot, scale):
        actor = actors.spawn_actor_from_class(u.StaticMeshActor, pos, rot)
        actor.set_actor_label(label)
        actor.tags = [u.Name(t) for t in tags]
        comp = actor.get_component_by_class(u.StaticMeshComponent)
        comp.set_static_mesh(mesh)
        comp.set_material(0, materials[kind])
        comp.set_editor_property("cast_shadow", False)
        # An explicit profile disables static mesh default collision when the saved sublevel registers again.
        comp.set_collision_profile_name("NoCollision")
        comp.set_default_custom_primitive_data_float_array(0, [float(v) for v in values])
        comp.set_editor_property("translucency_sort_priority", {"wash":1,"window":3,"room":2}.get(kind,0))
        actor.set_actor_scale3d(scale)

    for i, r in enumerate(rows):
        nx, ny = r["normal"]
        rot = u.MathLibrary.make_rot_from_xz(u.Vector(ny,-nx,0), u.Vector(nx,ny,0))
        w,h = r["size"]
        place(f"Facade_{r['house']}_{r['kind']}_{i}", ["facade:"+r["kind"], "house:"+r["house"]],
              template, r["kind"], r["values"], u.Vector(*r["xyz"]), rot, u.Vector(w/100,h/100,1))
    for s in spec["surfaces"]:
        peak = spec["wallLight"]["washPeak" if s["name"].endswith("Wash") else "poolPeak"]
        place(s["name"], ["facade:wash"], glow_mesh(s,template), "wash", [peak], u.Vector(), u.Rotator(), u.Vector(1,1,1))
    if not levels.save_map(world, LEVEL):
        raise RuntimeError("Could not save " + LEVEL)


def hashes():
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in FOLDER.glob("*") if p.suffix in (".uasset",".umap")}


def main(argv):
    paths = [s for s in argv if not s.startswith("--")]
    spec = json.loads((Path(paths[0]) if paths else PROJECT / "Import/measurements.json").read_text())["site"]["facadeLighting"]
    rows = facade.validate(spec)
    weather = ASSETS.load_asset(lighting.MPC)
    # #2382: struct and asset properties through get_editor_property (5.8 has no Python attributes for them)
    names = {str(p.get_editor_property("parameter_name")) for p in weather.get_editor_property("scalar_parameters")} if weather else set()
    if not {"Night","Hour","PowerAvailable"} <= names:
        raise RuntimeError("Run build_lighting.py with the facade clock/power collection first (#2373)")
    digest = hashlib.sha256(json.dumps(spec,sort_keys=True).encode())
    for p in (Path(__file__), Path(facade.__file__), *sorted(facade.SHADERS.glob("*.hlsl"))):
        digest.update(p.read_bytes())
    # #2408: the weather collection's parameter GUIDs; a collection rebuilt with new ones rebuilds the facade materials
    digest.update(json.dumps(collection_ids.ids(weather_reads()), sort_keys=True).encode())
    stamp = {"input": digest.hexdigest(), "files": hashes()}
    unresolved = unresolved_reads()
    if (STAMP.exists() and stamp["files"] and stamp == json.loads(STAMP.read_text()) and not unresolved
            and "--force" not in argv):
        u.log("LUNDEN_FACADE_OK unchanged")
        return
    if "--check" in argv:
        raise RuntimeError("Native facade missing or stale" + "".join("; " + e for e in unresolved))
    wall = wall_collection()
    manager = wall_controller(spec["wallLight"],weather,wall)
    materials = {kind: material(kind,spec,weather,wall) for kind in facade.FIELDS}
    level(rows,spec,materials,manager)
    stamp["files"] = hashes()
    STAMP.write_text(json.dumps(stamp,sort_keys=True,indent=2)+"\n")
    u.log(f"LUNDEN_FACADE_OK {len(rows)} room, window and lens faces, {len(spec['surfaces'])} glow meshes")


if __name__ == "__main__":
    main(sys.argv[1:])
