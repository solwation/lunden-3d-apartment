"""Root-only loaded/imported Basic readback after normal import; no saves, rendering, builders or world loads here."""
import hashlib
import importlib
import json
from pathlib import Path
import struct
import sys


def verify_basic_import(root, out, world=None, *, run_import_check=True):
    import unreal as u
    root, out = Path(root).resolve(), Path(out)
    if out.exists():
        raise RuntimeError('Require fresh Basic readback output')
    sys.path[:0] = [str(root/'tools/unreal-engine/python')]
    importer = importlib.import_module('import_world')
    builder = importlib.import_module('build_materials')
    if Path(importer.__file__).resolve() != root/'tools/unreal-engine/python/import_world.py':
        raise RuntimeError('Wrong importer module/source checkout')
    folder = root/'unreal/Lunden/Import'
    data = json.loads((folder/'measurements.json').read_text())
    manifest = json.loads((folder/'export-manifest.json').read_text())
    table = json.loads((root/'tools/unreal-engine/material-map.json').read_text())
    # Real importer check validates all current source stamps, generated masters, maps/VC, garage and power shares.
    if run_import_check:
        if world is not None:
            raise RuntimeError('Normal --check loads zone maps: execute it before final world load, then pass run_import_check=False')
        importer.main([str(folder), '--check'])
    basic = {k:v for k,v in data['materials'].items() if v['type']=='bas'}
    result = {'completed':False,'passed':False,'readOnly':True,'normalImportCheckExecutedHere':run_import_check,
              'sourceCommit':manifest['sourceCommit'],'sourceHash':manifest['sourceHash'],
              'sourceBasicKeys':len(basic),'importedSlots':[],'loadedComponentSlots':[], 'chains':{},
              'displayGainExpected':importlib.import_module('river_material').display_gain(),
              'limits':'Source/asset/component metadata and existing graph checks, not GPU colour/Windows/full2424 acceptance'}
    failures=[]; expected={}
    def chain(material):
        path=material.get_path_name()
        if path in result['chains']:
            return result['chains'][path]
        row={'material':path,'chain':[]}; seen=set(); effective=None
        x=material
        while isinstance(x,u.MaterialInstance):
            if x.get_path_name() in seen:raise RuntimeError('Material parent cycle '+path)
            seen.add(x.get_path_name())
            overrides=x.get_editor_property('base_property_overrides')
            active=bool(overrides.get_editor_property('override_shading_model'))
            value=overrides.get_editor_property('shading_model')
            if effective is None and active:effective=value
            item={'path':x.get_path_name(),'overrideShadingModel':active,'shadingModel':str(value)}
            try:item['baseOverrides']=overrides.export_text()
            except Exception as error:item['baseOverrides']={'unknown':str(error)}
            for name in ('scalar_parameter_values','vector_parameter_values','texture_parameter_values'):
                # Optional raw structured wrappers must not stop the model/graph check.
                try:item[name]=[v.export_text() for v in x.get_editor_property(name)]
                except Exception as error:item[name]={'unknown':str(error)}
            row['chain'].append(item)
            x=x.get_editor_property('parent')
        if not isinstance(x,u.Material):raise RuntimeError('No terminal material '+path)
        if effective is None:effective=x.get_editor_property('shading_model')
        row.update(master=x.get_path_name(),effectiveShadingModel=str(effective),
                   effectiveUnlit=effective==u.MaterialShadingModel.MSM_UNLIT,
                   actualBlendMode=str(material.get_blend_mode()),rootShadingModel=str(x.get_editor_property('shading_model')))
        if not row['effectiveUnlit']:failures.append('Effective Basic model is lit: '+path)
        result['chains'][path]=row
        return row
    for entry in manifest['files']:
        if entry['kind']!='glb':continue
        raw=(folder/entry['path']).read_bytes();size=struct.unpack_from('<I',raw,12)[0]
        glb=json.loads(raw[20:20+size]);zone=entry['zone']
        for source_mesh in glb.get('meshes',[]):
            keys={glb['materials'][p['material']]['name'] for p in source_mesh['primitives']}
            if not keys.intersection(basic):continue
            path=f'/Game/Lunden/Generated/{zone}/StaticMeshes/{source_mesh["name"]}'
            if not u.EditorAssetLibrary.does_asset_exist(path):raise RuntimeError('Source mesh missing: '+path)
            mesh=u.EditorAssetLibrary.load_asset(path)
            if not isinstance(mesh,u.StaticMesh):raise RuntimeError('Not actual source StaticMesh: '+path)
            source_slots={}
            for i,slot in enumerate(mesh.get_editor_property('static_materials')):
                names={str(slot.get_editor_property(n)) for n in ('imported_material_slot_name','material_slot_name')}
                matches=keys.intersection(names)
                if len(matches)!=1:
                    if len(keys)==1:matches=keys  # every source primitive has this same key; no slot-order inference
                    else:raise RuntimeError('Unproved source slot join '+path+' '+str(names))
                key=next(iter(matches));source_slots[i]=key
                if key not in basic:continue
                material=slot.get_editor_property('material_interface')
                if material is None:raise RuntimeError('Source Basic slot missing material '+path)
                detail=chain(material)
                result['importedSlots'].append({'zone':zone,'sourceMesh':source_mesh['name'],'slot':i,'key':key,
                    'originalSlotNames':sorted(names),'actualMesh':mesh.get_path_name(),'material':material.get_path_name(),
                    'master':detail['master'],'powerCutExpected':basic[key].get('powerCut',1),
                    'powerCutActual':importer.instance_scalar(material,'PowerCut') if isinstance(material,u.MaterialInstanceConstant) else None,
                    'sourceVertexColors':basic[key]['vertexColors'],'sourceTexture':basic[key].get('texture') or basic[key].get('map')})
            expected[mesh.get_path_name()]=source_slots
    # All generic native masters must actually carry display gain; plain VC must retain the original vertex multiplication.
    masters={v['master'] for v in result['chains'].values()}
    vc_path=importlib.import_module('garage_materials').targets(table)[1]
    for path in sorted(masters.intersection({table['unlitLabel']['master'],vc_path})):
        material=u.EditorAssetLibrary.load_asset(path)
        if not builder.unlit_label_ok(material):failures.append('Display gain/power graph mismatch '+path)
        if path==vc_path:
            node=u.MaterialEditingLibrary.get_material_property_input_node(material,u.MaterialProperty.MP_EMISSIVE_COLOR)
            inputs=u.MaterialEditingLibrary.get_inputs_for_material_expression(material,node)
            vc=any(isinstance(n,u.MaterialExpressionMultiply) and any(isinstance(v,u.MaterialExpressionVertexColor)
                for v in u.MaterialEditingLibrary.get_inputs_for_material_expression(material,n)) for n in inputs)
            if not vc:failures.append('Plain Basic lost actual vertex-colour graph '+path)
    if world is not None:
        result['world']=world.get_path_name()
        for actor in u.GameplayStatics.get_all_actors_of_class(world,u.Actor):
            for component in actor.get_components_by_class(u.StaticMeshComponent):
                mesh=component.get_editor_property('static_mesh')
                if mesh is None or mesh.get_path_name() not in expected:continue
                for slot,key in expected[mesh.get_path_name()].items():
                    if key not in basic:continue
                    material=component.get_material(slot)
                    if material is None:raise RuntimeError('Loaded Basic override resolves null '+component.get_path_name())
                    detail=chain(material)
                    result['loadedComponentSlots'].append({'actor':actor.get_path_name(),'component':component.get_path_name(),
                        'sourceMesh':mesh.get_path_name(),'slot':slot,'key':key,'resolvedMaterial':material.get_path_name(),
                        'master':detail['master'],'effectiveUnlit':detail['effectiveUnlit']})
        if not result['loadedComponentSlots']:failures.append('No actual Basic components in supplied world')
    result.update(completed=True,passed=not failures,failures=failures)
    out.write_text(json.dumps(result,indent=2)+'\n')
    if failures:raise RuntimeError('Basic readback failed: '+str(failures[:5]))
    return result
