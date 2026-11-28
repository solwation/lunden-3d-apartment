"""Private #2388 no-save opacity isolation, never an alpha product fix.
prepare(world)->(bind,restore,report), modes original/opacity-zero.
Same original35slots, originalMIC→transientMID only; no masterduplicate/compile.
Property getter and MID calls reuse actual successful recovery-v2.py143–161.
"""
import json
import unreal as u
KEEP=[]
def value(x):
    if x is None or isinstance(x, (int, float, str, bool)):
        return x
    if isinstance(x, u.Vector):
        return [x.x, x.y, x.z]
    if isinstance(x, u.LinearColor):
        return [x.r, x.g, x.b, x.a]
    if isinstance(x, u.Object):
        return x.get_path_name()
    return str(x)


def material(mat):
    result = {'path': mat.get_path_name(), 'class': mat.get_class().get_name(),
              'effectiveBlendMode': str(mat.get_blend_mode()), 'parameters': {}, 'chain': []}
    if isinstance(mat, u.MaterialInstance):
        for kind in ('scalar', 'vector', 'texture', 'static_switch'):
            params = {}
            for name in getattr(u.MaterialEditingLibrary, 'get_' + kind + '_parameter_names')(mat):
                if isinstance(mat, u.MaterialInstanceDynamic) and kind != 'static_switch':
                    actual = getattr(mat, 'get_' + kind + '_parameter_value')(name)
                else:
                    source = mat.get_editor_property('parent') if isinstance(mat, u.MaterialInstanceDynamic) else mat
                    actual = getattr(u.MaterialEditingLibrary, 'get_material_instance_' + kind + '_parameter_value')(source, name)
                if isinstance(actual, u.Texture):
                    actual = {'path': actual.get_path_name(),
                              **{p: value(actual.get_editor_property(p)) for p in ('srgb', 'compression_settings', 'filter')}}
                else:
                    actual = value(actual)
                params[str(name)] = actual
            result['parameters'][kind] = params
    seen = set()
    while isinstance(mat, u.MaterialInstance):
        if mat.get_path_name() in seen:
            raise RuntimeError('Cyclic material inheritance')
        seen.add(mat.get_path_name())
        overrides = mat.get_editor_property('base_property_overrides')
        result['chain'].append({'path': mat.get_path_name(), 'baseOverrides':
            {p: value(overrides.get_editor_property(p)) for p in ('override_blend_mode', 'blend_mode',
                    'override_two_sided', 'two_sided', 'override_shading_model', 'shading_model')}})
        mat = mat.get_editor_property('parent')
    if not isinstance(mat, u.Material):
        raise RuntimeError('Material chain lacks master')
    result['master'] = {'path': mat.get_path_name(), **{p: value(mat.get_editor_property(p)) for p in
                       ('shading_model', 'blend_mode', 'two_sided', 'translucency_lighting_mode', 'translucency_pass')}}
    return result


def prepare(world):
 original=u.load_asset('/Game/Lunden/Materials/MI_LundenWindowGlass')
 if not isinstance(original,u.MaterialInstanceConstant):raise RuntimeError('Original MIC required')
 before=material(original);bindings=[]
 for actor in u.GameplayStatics.get_all_actors_of_class(world,u.Actor):
  for comp in actor.get_components_by_class(u.StaticMeshComponent):
   for slot in range(comp.get_num_materials()):
    if comp.get_material(slot)==original:bindings.append((comp,slot))
 if len(bindings)!=35:raise RuntimeError('Expected all35 original glassbindings')
 def reset():
  for c,slot in bindings:c.set_material(slot,original)
 try:
  first,slot=bindings[0];mid=first.create_dynamic_material_instance(slot,original)
  if not isinstance(mid,u.MaterialInstanceDynamic) or mid.get_editor_property('parent')!=original:raise RuntimeError('MID must inherit actual original MIC')
  KEEP.extend([original,mid]);mid.set_scalar_parameter_value('Opacity',0.)
  if mid.get_scalar_parameter_value('Opacity')!=0.:raise RuntimeError('Actual Opacity0 getter failed')
  temporary=material(mid);wanted=json.loads(json.dumps(before['parameters']));wanted['scalar']['Opacity']=0.
  if temporary['parameters']!=wanted or temporary['chain'][1:]!=before['chain']or temporary['master']!=before['master']:raise RuntimeError('Unrelated PBR/master/inheritance changed')
 finally:reset()
 report={'classification':'private causalOpacity0 isolation; no alpha-productchange/sourcePMREMclaim','original':original.get_path_name(),'MID':mid.get_path_name(),'before':before,'transient':temporary,'actualOpacity':mid.get_scalar_parameter_value('Opacity'),'count':35,'bindings':[{'component':c.get_path_name(),'slot':slot}for c,slot in bindings]}
 def bind(mode):
  if mode not in('original','opacity-zero'):raise ValueError(mode)
  target=original if mode=='original'else mid
  for c,slot in bindings:c.set_material(slot,target)
  if any(c.get_material(slot)!=target for c,slot in bindings):raise RuntimeError('Effective binding differs')
  if material(original)!=before or mid.get_scalar_parameter_value('Opacity')!=0.:raise RuntimeError('Original/MID parameters changed')
 def restore():
  reset();report['restored']=all(c.get_material(slot)==original for c,slot in bindings)and material(original)==before
  if not report['restored']:raise RuntimeError('Effective original glass restoration failed')
  return report
 return bind,restore,report
