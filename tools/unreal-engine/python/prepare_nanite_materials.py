"""Prepare Nanite shader usage on project-owned materials, rasterize meshes with unsupported material slots and keep
every Nanite mesh's fallback at all its triangles (#2298)."""
import sys
import unreal

ROOT = "/Game/Lunden/"
USAGE = unreal.MaterialUsage.MATUSAGE_NANITE
SUPPORTED = (unreal.BlendMode.BLEND_OPAQUE, unreal.BlendMode.BLEND_MASKED)
FULL_FALLBACK = unreal.NaniteFallbackTarget.PERCENT_TRIANGLES
assets = unreal.EditorAssetLibrary
materials = unreal.MaterialEditingLibrary


def save(asset):
    if not assets.save_loaded_asset(asset, only_if_is_dirty=False):
        raise RuntimeError("Could not save " + asset.get_path_name())


def static_mesh_editor():
    """The StaticMeshEditorSubsystem. get_editor_subsystem returns None in the pythonscript commandlet (5.8.4), and the
    deprecated EditorStaticMeshLibrary then silently does nothing (#2297); a new instance of the subsystem works there."""
    return unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem) or unreal.new_object(unreal.StaticMeshEditorSubsystem)


def prepare_zone(zone, check_only=False):
    folder = ROOT + "Generated/" + zone + "/StaticMeshes"
    if not assets.does_directory_exist(folder):
        raise RuntimeError("Missing imported meshes in " + folder)
    interfaces = {}
    nanite = fallback = changed = 0
    reduced = [0, 0]  # fallback triangles of the meshes changed below, before and after
    for path in assets.list_assets(folder, recursive=True, include_folder=False):
        mesh = assets.load_asset(path)
        if not isinstance(mesh, unreal.StaticMesh):
            continue
        slots = [slot.material_interface for slot in mesh.static_materials if slot.material_interface]
        settings = mesh.get_editor_property("nanite_settings")
        # Blend overrides live on Interchange's instances. The common glTF parent remains opaque.
        unsupported = any(mat.get_blend_mode() not in SUPPORTED for mat in slots)
        if unsupported:
            fallback += 1
            if settings.enabled:
                if check_only:
                    raise RuntimeError("Unsupported blend on a Nanite mesh: " + path)
                settings.enabled = False
                # set_editor_property only flips the flag: the session kept the Nanite fallback render data (fewer
                # vertices and triangles) until the next editor start, so the import's fingerprint differed (#2297).
                # set_nanite_settings(..., apply_changes=True) rebuilds the render data now.
                static_mesh_editor().set_nanite_settings(mesh, settings, True)
                if mesh.get_editor_property("nanite_settings").enabled:
                    raise RuntimeError("Could not disable Nanite: " + path)
                save(mesh)
                changed += 1
        elif settings.enabled:
            nanite += 1
            # A Nanite mesh's fallback (render LOD 0) is what complex collision, traces and non-Nanite drawing such as
            # the commandlet captures use. The default (AUTO) simplifies large meshes: 7.7 cm off on Hus L's façade,
            # thin rails gone (#2298). Keep every triangle; Nanite drawing itself is unchanged.
            if settings.fallback_target != FULL_FALLBACK or settings.fallback_percent_triangles < 1.0:
                if check_only:
                    raise RuntimeError("Nanite fallback is not the full mesh: " + path)
                before = mesh.get_num_triangles(0)
                settings.fallback_target = FULL_FALLBACK
                settings.fallback_percent_triangles = 1.0
                static_mesh_editor().set_nanite_settings(mesh, settings, True)
                save(mesh)
                reduced[0], reduced[1] = reduced[0] + before, reduced[1] + mesh.get_num_triangles(0)
                changed += 1
            for mat in slots:
                interfaces[mat.get_path_name()] = mat

    for path, mat in interfaces.items():
        local = path.startswith(ROOT)
        instance = isinstance(mat, unreal.MaterialInstanceConstant)
        has_usage = materials.has_material_usage(mat, USAGE)
        # The editor can enable usage temporarily while displaying a mesh. A project-owned
        # instance must persist its own override independently of the engine parent.
        needs_override = local and instance
        if has_usage and (not needs_override or materials.has_material_usage_override(mat, USAGE)):
            continue
        if check_only or not local:
            raise RuntimeError("Missing persisted Nanite usage: " + path)
        if instance:
            materials.set_material_usage_override(mat, USAGE, True, True)
        elif isinstance(mat, unreal.Material):
            materials.set_base_material_usage(mat, USAGE, True)
        else:
            raise RuntimeError("Unsupported material type: " + path)
        save(mat)
        if not materials.has_material_usage(mat, USAGE):
            raise RuntimeError("Could not enable Nanite usage: " + path)
        changed += 1
    unreal.log(f"LUNDEN_NANITE {zone}: {nanite} Nanite meshes; {fallback} raster meshes with unsupported slots; "
               f"{len(interfaces)} Nanite materials; fallback triangles {reduced[0]} -> {reduced[1]}; {changed} packages changed")


if __name__ == "__main__":
    check = "--check" in sys.argv[1:]
    zones = [arg for arg in sys.argv[1:] if arg != "--check"]
    for zone in zones or ["l1007", "l1007-uteplats"]:
        prepare_zone(zone, check)
    unreal.log("LUNDEN_NANITE_OK")
