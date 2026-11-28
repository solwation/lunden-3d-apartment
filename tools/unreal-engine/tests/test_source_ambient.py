"""Fast pure tests for #2424 builder wires/coverage gates, no Unreal import."""
from copy import deepcopy
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]/'python'))
import source_ambient as source
import build_source_ambient as builder


class SourceAmbient(unittest.TestCase):
    def test_actual_variants_share_only_validated_ambient_inputs(self):
        fixture = json.loads((Path(__file__).parent/'fixtures/source-ambient-variants.json').read_text())
        variants, key = fixture['variants'], fixture['materialKey']
        self.assertEqual(len(variants), 4)
        self.assertEqual({v['textures']['bumpMap']['name'] for v in variants},
                         {'tile-height-roughness', 'paving-height-roughness',
                          'painted-screen-height-roughness', 'asphalt-height-roughness'})
        row = {'sourceAmbient': variants[0], 'sourceAmbientVariants': variants}
        before = deepcopy(row)
        actual = source.layer_for_key({key: row}, key)
        self.assertEqual(source.layer_bindings(actual),
                         {'Clearcoat': 0., 'Transmission': 0., 'SheenColor': (0., 0., 0.)})
        self.assertEqual(actual['textures']['bumpMap'], {'present': True})
        self.assertFalse(actual['textures']['normalMap']['present'])
        self.assertEqual(actual['normalFacing'], 'front-sided')
        for variant in variants:
            self.assertEqual(source.layer_for_key({key: {'sourceAmbient': variant}}, key), actual)
        # The actual builder serializes this returned layer in its binding context.
        # Source list order and unused bump names must not select different contexts.
        reordered = {'sourceAmbient': variants[-1], 'sourceAmbientVariants': variants[::-1]}
        self.assertEqual(json.dumps(actual, sort_keys=True),
                         json.dumps(source.layer_for_key({key: reordered}, key), sort_keys=True))
        self.assertEqual(row, before)  # Keep every raw source variant/provenance intact.
        def changed(*path, value):
            result = deepcopy(row)
            target = result['sourceAmbientVariants'][-1]
            for name in path[:-1]: target = target[name]
            target[path[-1]] = value
            return result
        negatives = [
            changed('textures', name, 'present', value=present)
            for name, present in (('aoMap', True), ('bumpMap', False), ('normalMap', True),
                                  ('clearcoatMap', True), ('clearcoatNormalMap', True),
                                  ('sheenColorMap', True), ('transmissionMap', True))]
        negatives += [changed(name, value=value) for name, value in (
            ('aoMapIntensity', .5), ('transmission', .2), ('clearcoat', .2),
            ('sheenColor', [.1, 0, 0]), ('model', 'MeshLambertMaterial'),
            ('physical', True), ('unlit', True), ('normalFacing', 'double-sided'),
            ('normalFacing', None), ('ownEnvironmentMap', True))]
        physical = deepcopy(row)
        physical['sourceAmbientVariants'][-1].update(model='MeshPhysicalMaterial', physical=True)
        negatives.append(physical)  # Valid supported model, but different source identity.
        physical = deepcopy(row)
        for layer in [physical['sourceAmbient'], *physical['sourceAmbientVariants']]:
            layer.update(model='MeshPhysicalMaterial', physical=True)
            layer['textures']['bumpMap']['present'] = False
        self.assertEqual(source.layer_for_key({key: physical}, key)['clearcoat'], 0.)
        physical['sourceAmbientVariants'][-1]['clearcoat'] = .2
        negatives.append(physical)  # Every layer supports binding, but coefficients differ.
        physical = deepcopy(physical)
        physical['sourceAmbientVariants'][-1]['clearcoat'] = 0
        physical['sourceAmbientVariants'][-1]['sheenColor'] = [.1, .2, .3]
        negatives.append(physical)
        unsupported = deepcopy(row)
        for layer in [unsupported['sourceAmbient'], *unsupported['sourceAmbientVariants']]:
            layer['textures']['aoMap']['present'] = True
        negatives.append(unsupported)  # Equally unsupported is never equivalence.
        for i, candidate in enumerate(negatives):
            with self.subTest(rejection=i), self.assertRaises(ValueError):
                source.layer_for_key({key: candidate}, key)
        for variant in unsupported['sourceAmbientVariants']:
            with self.assertRaises(ValueError):
                source.layer_for_key({key: {'sourceAmbient': variant}}, key)

    def test_emitted_blueprint_parameters_match_source_state(self):
        # The exact sky_parameters function writes to fake call/feed connectors;
        # numerical Expr execution leaves every parameter name and RGB wire intact.
        contract = {'version':1, 'space':'linear-srgb',
            'colors':{'ambient':[1,1,1],'skyDay':[.7,.8,1],'skyNight':[.1,.2,.4],'ground':[.5,.4,.3],'fill':[.9,.9,1]},
            'clear':{'ambient':.25,'hemi':1.5,'fill':.35},'overcast':{'ambient':.6,'hemi':2,'fill':.9},
            'nightAmbient':.05,'flashLight':3,'garageCarLight':2,'hemiDirection':[0,1,0],'fillDirection':[1,0,0]}
        for state in ({'day':1,'overcast':0,'dim':0,'under':0,'flash':0,'garage_lit':0},
                      {'day':.25,'overcast':.7,'dim':.3,'under':.5,'flash':.2,'garage_lit':.4}):
            runtime = dict(zip(('SourceDim','SourceUnder','SourceFlash','SourceGarageLit'),(state['dim'],state['under'],state['flash'],state['garage_lit'])))
            class Graph:
                def get(self, name): return runtime[name] if name in runtime else name
                def call(self, kind, **args): return {'kind':kind, **args}
            class Expr:
                def __init__(self): self.env={'day':state['day'],'oc':state['overcast']}
                def run(self, text):
                    self.env.update({k:v[0] if isinstance(v,tuple) else v for k,v in self.env.items()})
                    exec(text,{'__builtins__':{}},self.env)
                    return self.env
                def feed(self, node, pin, value): node[pin]=value
            class Chain:
                def __init__(self): self.nodes=[]
                def then(self,node): self.nodes.append(node)
            class MPC:
                def get_path_name(self): return '/fake/MPC'
            g,e,c=Graph(),Expr(),Chain()
            builder.sky_parameters(g,e,c,MPC(),contract,lambda n,p,v:n.update({p:v}),lambda a,o,b,p:b.update({p:a}),active=True,direct_units=20/3)
            scalars={n['ParameterName']:n['ParameterValue'] for n in c.nodes if n['kind'].endswith('SetScalarParameterValue')}
            vectors={n['ParameterName']:[n['ParameterValue'][ch] for ch in 'RGB'] for n in c.nodes if n['kind'].endswith('SetVectorParameterValue')}
            expected=source.uniforms(contract,**state)
            self.assertAlmostEqual(scalars['SourceAmbientIntensity'],expected['ambientIntensity'])
            self.assertAlmostEqual(scalars['SourceHemiIntensity'],expected['hemiIntensity'])
            self.assertAlmostEqual(scalars['SourceFillIntensity'],expected['fillIntensity'])
            self.assertEqual(vectors['SourceHemiSky'],expected['skyColor'])
            self.assertEqual(vectors['SourceHemiGround'],contract['colors']['ground'])
            self.assertEqual(vectors['SourceFillDirection'],[1,0,0])
            self.assertEqual(scalars['SourceAmbientEnabled'],1.)
            actual_fill=next(n for n in c.nodes if n['kind']=='LightComponent:SetIntensity')
            self.assertAlmostEqual(actual_fill['NewIntensity'],expected['fillIntensity']*20/3)
            rotation=next(n for n in c.nodes if n['kind']=='SceneComponent:K2_SetWorldRotation')['NewRotation']['X']
            self.assertEqual([rotation[k] for k in ('X','Y','Z')],[-1,0,0])

    def test_actual_primitive_keys_reject_physical_even_when_export_omits_layers(self):
        with tempfile.TemporaryDirectory() as temp:
            data={'materials':[{'name':'std_rug'},{'name':'phys_glass'},{'name':'bas_label','extensions':{'KHR_materials_unlit':{}}},{'name':'unused'}],
                  'meshes':[{'primitives':[{'material':i} for i in range(3)]}]}
            raw=json.dumps(data).encode();raw+=b' '*((-len(raw))%4)
            payload=struct.pack('<4sII',b'glTF',2,len(raw)+20)+struct.pack('<I4s',len(raw),b'JSON')+raw
            Path(temp,'one.glb').write_bytes(payload)
            rows=source.glb_inventory(temp)
            self.assertEqual([r['adapter'] for r in rows],['default-lit-candidate','physical-layer-binding-required','unchanged-unlit'])
            self.assertNotIn('unused',[r['key'] for r in rows])

    def test_physical_constant_layers_bind_and_unexported_maps_fail_closed(self):
        layer={'version':1,'model':'MeshPhysicalMaterial','physical':True,'unlit':False,
               'textures':{k:{'present':False} for k in ('aoMap','clearcoatMap','clearcoatNormalMap','sheenColorMap','transmissionMap','normalMap','bumpMap')},
               'clearcoat':1.,'transmission':0.,'sheenColor':[.1,.2,.3]}
        self.assertEqual(source.layer_bindings(layer),{'Clearcoat':1.,'Transmission':0.,'SheenColor':(.1,.2,.3)})
        for key in ('aoMap','clearcoatMap','normalMap'):
            layer['textures'][key]['present']=True
            with self.assertRaises(ValueError):source.layer_bindings(layer)
            layer['textures'][key]['present']=False
        layer['transmission']=.3
        with self.assertRaisesRegex(ValueError,'transmitted-light'):source.layer_bindings(layer)

    def test_standalone_activation_refuses_enabled_complete_coverage(self):
        # Exercise the real guard against files, including a complete-looking
        # coverage record. Redirect only the policy location; no editor stub.
        read_policy = source.policy
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            policy = root/'policy.json'
            coverage = root/'coverage.json'
            enabled = {**read_policy(), 'enabled': True, 'coverageFile': coverage.name}
            policy.write_text(json.dumps(enabled))
            complete = {name: True for name in ('masterInventoryComplete', 'allLitMastersBound',
                'physicalLayersBound', 'liveSourceInputsBound', 'sourceFillDirectionalBound',
                'windowFunctionBound', 'curtainCompensationRetired', 'nativeReloadVerified', 'rootIntegrationApproved')}
            coverage.write_text(json.dumps(complete))
            with patch.object(source, 'policy', lambda: read_policy(policy)):
                with self.assertRaisesRegex(RuntimeError, 'integration not implemented'):
                    builder.guard(root)
            enabled['enabled'] = False
            policy.write_text(json.dumps(enabled))
            coverage.unlink()
            with patch.object(source, 'policy', lambda: read_policy(policy)):
                self.assertFalse(builder.guard(root))

    def test_binding_lifecycle_second_bind_and_context_change_never_reinject(self):
        original='/Game/Lunden/Generated/l1007/Materials/std_rug.std_rug'
        path=source.BINDING_OWNER+'Instances/cache/std_rug.std_rug'
        record={'version':1,'kind':'instance','original':original,
                'originalPackageSHA256':'a'*64,'originalChainSHA256':'b'*64,
                'contractSHA256':'c'*64,'parent':source.BINDING_OWNER+'Masters/M_old.M_old'}
        receipt={'packageSHA256':'1'*64,'stamp':source.binding_stamp(record),'provenanceSHA256':'2'*64}
        proof={'dirty':False,**receipt,'receipt':receipt}
        args={'path':path,'stamp':source.binding_stamp(record),'provenance':record,'kind':'instance','bound_copy_proof':proof,
              'actual_parent':record['parent'],'injection_count':0,
              'original_package_sha256':'a'*64,'original_chain_sha256':'b'*64,'contract_sha256':'c'*64}
        self.assertEqual(source.binding_decision(**{**args,'path':original,'stamp':'','provenance':None}),'build')
        # Direct second bind, and a vegetation slot inheriting this bound chain,
        # both return the same artifact instead of using its injected master.
        self.assertEqual(source.binding_decision(**args),'reuse')
        self.assertEqual(source.binding_decision(**args),'reuse')
        # Source originals and provenance remain identical, but an edited bound
        # copy (dirty or altered saved bytes) cannot be reused.
        for changed in ({**proof,'dirty':True},{**proof,'packageSHA256':'4'*64},
                        {**proof,'receipt':None},None):
            with self.assertRaises(ValueError):
                source.binding_decision(**{**args,'bound_copy_proof':changed})
        # Context includes function/window/layers/display_gain and MPC package.
        self.assertEqual(source.binding_decision(**{**args,'contract_sha256':'d'*64}),'rebuild')
        # clear_zone/reimport can replace the same original path's package bytes;
        # unchanged leaf bytes can also inherit a changed original parent chain.
        self.assertEqual(source.binding_decision(**{**args,'original_package_sha256':'e'*64}),'rebuild')
        self.assertEqual(source.binding_decision(**{**args,'original_chain_sha256':'f'*64}),'rebuild')
        self.assertEqual(record['original'],original)
        for delta in ({'provenance':None},{'stamp':'0'*64},{'actual_parent':'/Foreign/Parent'},
                      {'path':'/Foreign/Copy'},{'original_package_sha256':None},
                      {'provenance':{**record,'original':'/Foreign/Other'}}):
            with self.assertRaises(ValueError):source.binding_decision(**{**args,**delta})
        with self.assertRaises(ValueError):
            source.binding_decision(**{**args,'provenance':None,'stamp':''})
        with self.assertRaises(ValueError):
            source.binding_decision(**{**args,'path':original,'provenance':None,'stamp':'','injection_count':1})
        master={**record,'kind':'master','parent':None,'original':'/InterchangeAssets/gltf/M_Default.M_Default'}
        master_receipt={**receipt,'stamp':source.binding_stamp(master)}
        master_args={**args,'kind':'master','actual_parent':None,'provenance':master,'stamp':source.binding_stamp(master),'injection_count':1,
                     'bound_copy_proof':{'dirty':False,**master_receipt,'receipt':master_receipt}}
        self.assertEqual(source.binding_decision(**master_args),'reuse')
        with self.assertRaises(ValueError):source.binding_decision(**{**master_args,'injection_count':2})

    def test_global_activation_requires_complete_source_and_native_coverage(self):
        self.assertFalse(builder.guard(Path(__file__).parents[3]))
        for coverage in ({},{'masterInventoryComplete':True,'allLitMastersBound':True}):
            with self.assertRaisesRegex(RuntimeError,'sourceFillDirectionalBound'):
                source.require_activation({'enabled':True},coverage)
        complete={name:True for name in ('masterInventoryComplete','allLitMastersBound','physicalLayersBound','liveSourceInputsBound','sourceFillDirectionalBound','windowFunctionBound','curtainCompensationRetired','nativeReloadVerified','rootIntegrationApproved')}
        with self.assertRaisesRegex(RuntimeError,'not implemented'):
            source.require_activation({'enabled':True},complete)
        with self.assertRaises(ValueError): source.irradiance({'hemiDirection':[0,1,0]},[0,2,0])


if __name__=='__main__': unittest.main()
