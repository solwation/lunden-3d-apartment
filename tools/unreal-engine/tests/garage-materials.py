"""Check garage import metadata and Python entry points without starting Unreal.

Old exports missing a source cut-off must fail before any Generated import/build.
"""
import ast
import json
from pathlib import Path
import runpy
import sys
import tempfile
from unittest.mock import Mock, patch

path = Path(__file__).resolve().parents[1] / "python/garage_materials.py"
tree = ast.parse(path.read_text(), filename=str(path))
tree.body = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "entries"]
namespace = {}
exec(compile(tree, str(path), "exec"), namespace)
entries = namespace["entries"]
key = "bas_ffffff_r100_m0_vc_tex_ds_parked_bicycle_spokes_garage_baked_p1000000"
source = dict(type="bas", unlit=True, garageBake=True, powerCut=1, garageAlphaCutoff=.35)
assert entries({"materials": {key: source}}) == {key: source}
for cutoff in (0, .5, 1):
    info = dict(source, garageAlphaCutoff=cutoff)
    assert entries({"materials": {key: info}}) == {key: info}
for cutoff in (None, -.1, 1.1, float("nan")):
    info = dict(source, garageAlphaCutoff=cutoff)
    try:
        entries({"materials": {key: info}})
    except RuntimeError:
        pass
    else:
        raise AssertionError("Accepted missing/invalid actual source cut-off: " + str(cutoff))
old = dict(source)
del old["garageAlphaCutoff"]
try:
    entries({"materials": {key: old}})
except RuntimeError:
    pass
else:
    raise AssertionError("Accepted stale garage export lacking source alphaTest")
print("Garage validation: source cut-offs, zero/one bounds, stale/missing/NaN rejection PASS")


# The commandlet executes the importer as __main__. Garage target selection subsequently imports
# the same source by its module name to read textured(); that import must not run main again.
importer = path.with_name("import_world.py")
unreal = Mock()
unreal.Paths.convert_relative_path_to_full.return_value = str(importer.parents[3] / "unreal/Lunden")
switch = unreal.MaterialEditingLibrary.get_material_instance_static_switch_parameter_value
switch.return_value = False
with tempfile.TemporaryDirectory() as folder:
    export = Path(folder)
    (export / "export-manifest.json").write_text(json.dumps({
        "formatVersion": 1, "sourceCommit": "test", "sourceDirty": False, "files": [],
    }), encoding="utf-8")
    (export / "measurements.json").write_text("{}", encoding="utf-8")
    with (patch.dict(sys.modules, {"unreal": unreal}),
          patch.object(sys, "argv", [str(importer), str(export)]),
          patch.object(sys, "path", list(sys.path))):
        runpy.run_path(str(importer), run_name="__main__")
        assert unreal.log.call_args.args == ("LUNDEN_IMPORT_OK",)
        calls_after_script = list(unreal.log.call_args_list)

        import garage_materials

        material = Mock()
        table = {"unlitLabel": {"master": "label-master"}}
        _, vertex = garage_materials.targets(table)
        assert garage_materials.target_for(material, {"vertexColors": True}, table) == vertex
        switch.assert_called_once_with(material, "bHasBaseColorTexture")
        assert unreal.log.call_args_list == calls_after_script, "Garage module import started the importer again"
        unreal.EditorLoadingAndSavingUtils.new_blank_map.assert_called_once_with(False)

print("Garage import entry points: script runs once, material helper import stays idle PASS")
