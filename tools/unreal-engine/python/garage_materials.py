"""#2404: retain the garage's actual lamp-baked Basic materials, entirely under Generated.

The export carries full-on colour, vertex light, maps/cut-outs and the source off/on ratio.
No point light, exposure fit, or change to other zones/materials is made here.
"""
import unreal as u

VC_PATH = "/Game/Lunden/Generated/GarageMaterials/M_LundenGarageUnlitVertexColor"


def entries(measurements):
    result = {}
    for key, info in measurements.get("materials", {}).items():
        if not info.get("garageBake"):
            continue
        cut = info.get("powerCut")
        if (info.get("type") != "bas" or info.get("unlit") is not True
                or not isinstance(cut, (int, float)) or not 0 <= cut <= 1
                or "_garage_baked_p" not in key):
            raise RuntimeError("Invalid source garage bake: " + key)
        result[key] = info
    if not result and any("garage_cage_mesh" in key for key in measurements.get("materials", {})):
        raise RuntimeError("Garage bake metadata missing: re-export before importing; the old dark Basic snapshot is unsupported")
    return result


def vc_spec(table):
    source = table["vertexColor"]["masters"]["/InterchangeAssets/gltf/M_Unlit.M_Unlit"].split(".")[0]
    return {"graph": "gltf-unlit-label", "from": source,
            "source": "src/garage.js bake + MeshBasicMaterial + setLevel; export-garage-lighting.js",
            "note": "Existing untextured unlit vertex-colour master x source display gain x PowerCut/MPC supply",
            "assumption": "Full-on area snapshot, as existing garage labels; dynamic sensors remain Later2332"}


def prepare(table, data):
    if data:
        from build_materials import build_entries
        build_entries({VC_PATH: vc_spec(table)})


def targets(table):
    return table["unlitLabel"]["master"], VC_PATH + "." + VC_PATH.rsplit("/", 1)[-1]


def target_for(mi, info, table):
    from import_world import textured
    plain, vertex = targets(table)
    # Interchange's texture branch already multiplies COLOR_0. Only its untextured branch needs the VC copy.
    return vertex if info["vertexColors"] and not textured(mi) else plain


def apply(zone, table, data):
    if not data or zone != "kvarteret":
        return 0
    from import_world import zone_meshes, effective_overrides, instance_scalar
    done = set()
    for _, mesh in zone_meshes(zone):
        for slot in mesh.static_materials:
            mi = slot.material_interface
            if not isinstance(mi, u.MaterialInstanceConstant) or mi.get_name() not in data or mi.get_path_name() in done:
                continue
            if not mi.get_path_name().startswith("/Game/Lunden/Generated/kvarteret/"):
                raise RuntimeError("A material rule replaced the source garage bake: " + mi.get_path_name())
            info = data[mi.get_name()]
            target_path = target_for(mi, info, table)
            target = u.EditorAssetLibrary.load_asset(target_path)
            if not isinstance(target, u.Material):
                raise RuntimeError("Missing Generated garage master: " + target_path)
            base = mi.get_base_material().get_path_name()
            allowed = {"/InterchangeAssets/gltf/M_Unlit.M_Unlit",
                       table["vertexColor"]["masters"]["/InterchangeAssets/gltf/M_Unlit.M_Unlit"], *targets(table)}
            if base not in allowed:
                raise RuntimeError("Garage lost KHR_materials_unlit: " + base)
            if base != target_path:
                blend, overrides = mi.get_blend_mode(), effective_overrides(mi)
                u.MaterialEditingLibrary.set_material_instance_parent(mi, target)
                mi.set_editor_property("base_property_overrides", overrides)
                if mi.get_blend_mode() != blend:
                    raise RuntimeError("Garage cut-out blend changed: " + mi.get_name())
            if instance_scalar(mi, "PowerCut") != info["powerCut"]:
                parameter = u.MaterialParameterInfo()
                parameter.set_editor_property("name", "PowerCut")
                value = u.ScalarParameterValue()
                value.set_editor_property("parameter_info", parameter)
                value.set_editor_property("parameter_value", float(info["powerCut"]))
                scalars = [v for v in mi.get_editor_property("scalar_parameter_values")
                           if str(v.get_editor_property("parameter_info").get_editor_property("name")) != "PowerCut"]
                mi.set_editor_property("scalar_parameter_values", scalars + [value])
            u.MaterialEditingLibrary.update_material_instance(mi)
            done.add(mi.get_path_name())
    u.log("LUNDEN_GARAGE_BAKE applied " + str(len(done)) + " source instances; no native lights added")
    return len(done)


def check(zone, table, data):
    if not data or zone != "kvarteret":
        return set()
    from build_materials import check as check_materials
    from import_world import zone_meshes, instance_scalar, textured
    check_materials({"materials": {VC_PATH: vc_spec(table)}})
    vertex_master = u.EditorAssetLibrary.load_asset(VC_PATH)
    output = u.MaterialEditingLibrary.get_material_property_input_node(vertex_master, u.MaterialProperty.MP_EMISSIVE_COLOR)
    # The added display/power Multiply wraps the existing, source-owned vertex-colour Multiply.
    originals = u.MaterialEditingLibrary.get_inputs_for_material_expression(vertex_master, output)
    if not any(isinstance(node, u.MaterialExpressionMultiply) and any(
            isinstance(value, u.MaterialExpressionVertexColor) for value in
            u.MaterialEditingLibrary.get_inputs_for_material_expression(vertex_master, node)) for node in originals):
        raise RuntimeError("Generated garage master lost the source vertex-colour multiplication")
    seen, keys = set(), set()
    for _, mesh in zone_meshes(zone):
        for slot in mesh.static_materials:
            mi = slot.material_interface
            if mi is None or mi.get_name() not in data:
                continue
            info = data[mi.get_name()]
            cut = instance_scalar(mi, "PowerCut") if isinstance(mi, u.MaterialInstanceConstant) else None
            if (not isinstance(mi, u.MaterialInstanceConstant)
                    or mi.get_base_material().get_path_name() != target_for(mi, info, table)
                    or mi.get_base_material().get_editor_property("shading_model") != u.MaterialShadingModel.MSM_UNLIT
                    or cut is None or abs(float(cut) - info["powerCut"]) > 1e-6
                    or info.get("textured") and not textured(mi)):
                raise RuntimeError("Garage source unlit/vertex/map/power check failed: " + mi.get_name())
            seen.add(mi.get_path_name()); keys.add(mi.get_name())
    missing = set(data) - keys
    if missing:
        raise RuntimeError("Missing source garage keys: " + str(sorted(missing)))
    u.log("LUNDEN_GARAGE_BAKE checked " + str(len(seen)) + " source instances")
    return seen
