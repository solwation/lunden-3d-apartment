"""#2438: actual importer functions, fresh/reimport source exceptions, no Unreal."""
import ast
from pathlib import Path
import types
import unittest
ROOT=Path(__file__).resolve().parents[3]
tree=ast.parse((ROOT/'tools/unreal-engine/python/import_world.py').read_text())
namespace={'unreal':types.SimpleNamespace(StaticMeshComponent=object)}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in ('casts_shadow','apply_shadows')],type_ignores=[]),'importer-functions','exec'),namespace)
class Component:
    def __init__(self,cast):self.cast=cast
    def set_editor_property(self,key,value):
        assert key=='cast_shadow';self.cast=value
class Actor:
    def __init__(self,comp):self.comp=comp
    def get_component_by_class(self,cls):return self.comp
class ShadowPolicy(unittest.TestCase):
    def test_effective_policy_reimport_and_small_controls(self):
        extras={'body':{'castShadow':False,'unrealArchitectureShadow':True},'bulb':{'castShadow':False},'bench':{}}
        comps={k:Component(v)for k,v in [('body',False),('bulb',True),('bench',True)]}
        actors={k:Actor(v)for k,v in comps.items()}
        for _ in range(2):
            self.assertEqual(namespace['apply_shadows'](actors,extras),1)
            self.assertTrue(comps['body'].cast);self.assertFalse(comps['bulb'].cast);self.assertTrue(comps['bench'].cast)
        self.assertFalse(namespace['casts_shadow']({'castShadow':False}))
    def test_invalid_override_or_missing_component_fails(self):
        for invalid in [False,0,'true',None]:
            with self.assertRaises(RuntimeError):namespace['casts_shadow']({'unrealArchitectureShadow':invalid})
        with self.assertRaises(RuntimeError):namespace['apply_shadows']({'body':Actor(None)},{'body':{'unrealArchitectureShadow':True}})
if __name__=='__main__':unittest.main()
