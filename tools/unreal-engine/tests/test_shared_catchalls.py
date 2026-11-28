"""#2442: real table and coverage function reject the original fallback regressions."""
import importlib.util
import json
from pathlib import Path
import re
import unittest
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('coverage',ROOT/'tools/unreal-engine/tests/test_materials.py')
coverage=importlib.util.module_from_spec(spec);spec.loader.exec_module(coverage)
KEY='std_ffffff_r100_m0_tex'
CASES={'mesh_portikpaving_l0_xm1375_z635_y1':'MI_LundenPatioPaving','mesh_l0_xm1973_z329_y127':'MI_LundenStandardTileSplash','mesh_l0_xm2366_z534_y0':'MI_LundenStandardTileWetFloor','mesh_l0_xm2369_z624_y125':'MI_LundenStandardTileWall'}
def compiled(rows):return [(re.compile(r['match']),re.compile(r['mesh'])if r.get('mesh')else None,r)for r in rows]
class SharedFallback(unittest.TestCase):
    def setUp(self):self.rules=json.loads((ROOT/'tools/unreal-engine/material-map.json').read_text())['rules']
    def test_original_surfaces_and_unknown_sibling(self):
        rules=compiled(self.rules)
        for name,target in CASES.items():
            hit=next(r for rx,mx,r in rules if rx.search(KEY)and(mx is None or mx.search(name)))
            self.assertTrue(hit['material'].endswith('.'+target))
        nodes={n:('hus-l',[(n,{KEY})])for n in CASES};errors=[]
        coverage.catch_all_check(nodes,rules,errors);self.assertEqual(errors,[])
        nodes['unknown']=('hus-l',[('mesh_future_unmapped_tile',{KEY})]);coverage.catch_all_check(nodes,rules,errors)
        self.assertEqual(len(errors),1);self.assertIn('mesh_future_unmapped_tile',errors[0])
    def test_removing_source_selectors_fails(self):
        old=[r for r in self.rules if not(r.get('mesh')and any(re.search(r['mesh'],name)for name in CASES))]
        errors=[];coverage.catch_all_check({n:('hus-l',[(n,{KEY})])for n in CASES},compiled(old),errors)
        self.assertEqual(len(errors),len(CASES))
if __name__=='__main__':unittest.main()
