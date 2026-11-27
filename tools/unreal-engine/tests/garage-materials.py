"""Run the actual pure garage export-validation boundary without importing Unreal.

Old exports missing a source cut-off must fail before any Generated import/build.
"""
import ast
from pathlib import Path

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
