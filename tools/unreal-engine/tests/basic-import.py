"""#2424: execute production Basic selection/GLB rejection boundaries without Unreal."""
import ast
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import sys

root = Path(__file__).resolve().parents[1]

def functions(path, names, namespace):
    tree = ast.parse(path.read_text(), filename=str(path))
    tree.body = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    exec(compile(tree, str(path), 'exec'), namespace)
    return namespace

table = json.loads((root / 'material-map.json').read_text())
plain = table['unlitLabel']['master']
vertex = '/Game/Lunden/Generated/GarageMaterials/M_LundenGarageUnlitVertexColor.M_LundenGarageUnlitVertexColor'
class Instance:
    def __init__(self, mapped):
        self.mapped = mapped
    def get_path_name(self):
        return '/Game/Lunden/Generated/fixture/Materials/MI_Basic.MI_Basic'

# Real target_for imports this single existing importer query at invocation time.
textured = lambda mi: mi.mapped
saved = sys.modules.get('import_world')
sys.modules['import_world'] = SimpleNamespace(textured=textured)
garage = functions(root/'python/garage_materials.py', {'targets', 'target_for'},
                   {'VC_PATH': vertex.split('.')[0]})
namespace = functions(root/'python/import_world.py', {'unlit_labels', 'unlit_target'},
                      {'textured': textured, 'garage_materials': SimpleNamespace(**garage)})
try:
    for mapped in (False, True):
        for vc in (False, True):
            info = dict(unlit=True, vertexColors=vc, powerCut=.15)
            if mapped:
                info['texture'] = 'actual-canvas'
            assert namespace['unlit_target'](Instance(mapped), info, table) == (vertex if vc and not mapped else plain)
            try:
                namespace['unlit_target'](Instance(not mapped), info, table)
            except RuntimeError:
                pass
            else:
                raise AssertionError('accepted dropped or invented base-colour texture')
    descriptors = {'bas_plain': dict(unlit=True, vertexColors=False, powerCut=1),
                   'bas_vertex': dict(unlit=True, vertexColors=True, powerCut=.15),
                   'std_lit': dict(type='std'),
                   'bas_white_patio_string_bulb': dict(unlit=True),
                   'bas_garage': dict(unlit=True, garageBake=True)}
    assert namespace['unlit_labels']({'materials': descriptors}) == {k: descriptors[k] for k in ('bas_plain', 'bas_vertex')}
finally:
    if saved is None:
        sys.modules.pop('import_world', None)
    else:
        sys.modules['import_world'] = saved

# Exercise the actual canonical GLB checker: plain unlit is valid, image labels must still retain their image.
import os
checker = functions(root/'tests/test_materials.py', {'unlit_label_check'},
                    {'os': os, 'GLTF_LABEL': 'gltf-unlit-label', 'BAKED': 'baked-light',
                     'GLTF_MASTERS': [('KHR_materials_unlit', '/InterchangeAssets/gltf/M_Unlit.M_Unlit')]})
with TemporaryDirectory() as folder:
    Path(folder, 'fixture.glb').touch()
    def check(info, material, rules=()):
        checker['glb_json'] = lambda _: {'materials': [dict(name='bas_plain', **material)]}
        errors = []
        checker['unlit_label_check'](folder, {'bas_plain': dict(type='bas', unlit=True, powerCut=1, **info)}, table, rules, errors)
        return errors
    unlit = {'extensions': {'KHR_materials_unlit': {}}}
    assert not check({}, unlit)
    assert check({}, {}), 'lit GLB fallback must fail'
    assert check({'texture': 'label'}, unlit), 'lost label image must fail'
    assert not check({'texture': 'label'}, dict(unlit, pbrMetallicRoughness={'baseColorTexture': {'index': 0}}))
    import re
    def rule(path):
        return [(re.compile('^bas_plain$'), None, {'match': '^bas_plain$', 'material': path})]
    assert check({}, unlit, rule('/Game/Lunden/Materials/M_LundenWallPaint.M_LundenWallPaint'))
    assert not check({}, unlit, rule('/Game/Lunden/Generated/StairwellMaterials/M_LundenStairwellLight.M_LundenStairwellLight'))
print('Basic import: actual plain/VC/textured target selection, map-loss rejection, garage/bulb exclusion, GLB and intentional stair-bake guards PASS')
