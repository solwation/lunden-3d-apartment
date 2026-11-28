"""Private no-save #2405 opaque parked-glass AO0 isolation. Root owns launch/guards.
prepare(world) -> (bind_original_or_ao_zero, restore, report).
Capture original, AO0, then original again through the SAME existing canonical
parked-street camera; this is indirect-term isolation, never acceptance or PMREM parity.
All copies are unsaved; Root guards every authored/Generated/export file.
"""
import uuid
import unreal as u
KEEP=[]
def text(v):
 if hasattr(v,'get_path_name'):return v.get_path_name()
 if hasattr(v,'export_text'):return v.export_text()
 if isinstance(v,(list,tuple)):return[text(x)for x in v]
 return str(v)
def instance_state(mi):
 mel=u.MaterialEditingLibrary
 state={'local':{p:([text(x)for x in mi.get_editor_property(p)]if p.endswith('_values')else text(mi.get_editor_property(p)))for p in('scalar_parameter_values','vector_parameter_values','texture_parameter_values','base_property_overrides')},'effective':{}}
 for kind in('scalar','vector','texture','static_switch'):
  state['effective'][kind]={str(n):text(getattr(mel,'get_material_instance_'+kind+'_parameter_value')(mi,n))for n in getattr(mel,'get_'+kind+'_parameter_names')(mi)}
 return state


def prepare(world, targets_path):
 import json
 from pathlib import Path
 contract=json.loads(Path(targets_path).read_text());rows=contract['rows'];wanted={r['meshPath']:r for r in rows};mel=u.MaterialEditingLibrary
 profile={k:u.SystemLibrary.get_console_variable_int_value(k)for k in ('r.AllowStaticLighting','r.SSR.Quality','r.ReflectionMethod','r.ForwardShading')}
 if profile['r.AllowStaticLighting']!=0 or profile['r.SSR.Quality']!=0 or profile['r.ReflectionMethod']!=0:raise RuntimeError('Require existing staticlighting0/SSR0/noLumen; do not change those profile premises')
 bindings=[];found=set();counts={'omgivning':0,'kvarteret':0}
 for actor in u.GameplayStatics.get_all_actors_of_class(world,u.Actor):
  for comp in actor.get_components_by_class(u.StaticMeshComponent):
   mesh=comp.get_editor_property('static_mesh')
   if not mesh or mesh.get_path_name()not in wanted:continue
   source=wanted[mesh.get_path_name()];hits=[]
   for slot in range(comp.get_num_materials()):
    original=comp.get_material(slot)
    if original and original.get_name()==contract['glassKey']:hits.append((slot,original))
   if len(hits)!=1:raise RuntimeError('Actual car source glass slot not uniquely joined '+comp.get_path_name())
   slot,original=hits[0];bindings.append((comp,slot,original,source));found.add(mesh.get_path_name());counts[source['zone']]+=1
 if found!=set(wanted)or counts!=contract['sourceCounts']:raise RuntimeError('Actual loaded car-glass mesh/node coverage differs: '+str((counts,len(found),len(wanted))))
 sky_tints=[]
 for actor in u.GameplayStatics.get_all_actors_of_class(world,u.Actor):
  for sky in actor.get_components_by_class(u.SkyLightComponent):
   tint=sky.get_editor_property('occlusion_tint');rgb=[tint.r,tint.g,tint.b];sky_tints.append({'component':sky.get_path_name(),'occlusionTint':rgb})
   if any(v!=0 for v in rgb):raise RuntimeError('AO0 cannot suppress nonblack skylight occlusion tint')
 if not sky_tints:raise RuntimeError('Actual skylight missing')
 folder='/Game/Lunden/Generated/Private2405AO_'+uuid.uuid4().hex;tools=u.AssetToolsHelpers.get_asset_tools();copies={};states={};masters=[]
 def copy(original):
  path=original.get_path_name()
  if path in copies:return copies[path]
  obj=tools.duplicate_asset(original.get_name()+'_'+str(len(copies)),folder,original)
  if not obj:raise RuntimeError('Unsaved chain duplication failed '+path)
  copies[path]=obj;KEEP.extend([original,obj])
  if isinstance(original,u.MaterialInstanceConstant):
   before=instance_state(original);states[path]=(original,before);parent=copy(original.get_editor_property('parent'));mel.set_material_instance_parent(obj,parent)
   if instance_state(obj)!=before:raise RuntimeError('Actual local/effective/static/texture copy differs '+path)
  elif isinstance(original,u.Material):
   if original.get_editor_property('shading_model')!=u.MaterialShadingModel.MSM_DEFAULT_LIT or original.get_editor_property('material_domain')!=u.MaterialDomain.MD_SURFACE or original.get_editor_property('use_material_attributes')or original.get_blend_mode()!=u.BlendMode.BLEND_OPAQUE:raise RuntimeError('Require actual opaque DefaultLit graph '+path)
   zero=mel.create_material_expression(obj,u.MaterialExpressionConstant,-800,800);zero.set_editor_property('r',0.)
   if not mel.connect_material_property(zero,'',u.MaterialProperty.MP_AMBIENT_OCCLUSION):raise RuntimeError('Cannot connect copied AO0')
   errors=list(map(str,mel.recompile_material(obj)))
   if errors:raise RuntimeError('Copied actual compiler errors '+str(errors))
   actual=mel.get_material_property_input_node(obj,u.MaterialProperty.MP_AMBIENT_OCCLUSION)
   if not isinstance(actual,u.MaterialExpressionConstant)or float(actual.get_editor_property('r'))!=0:raise RuntimeError('Copied AO0 pin not actual0')
   masters.append({'original':path,'copy':obj.get_path_name(),'shadingModel':str(obj.get_editor_property('shading_model')),'blendMode':str(obj.get_blend_mode()),'AOConstant':0.,'compilerErrors':errors})
  else:raise RuntimeError('Unsupported material chain '+path)
  return obj
 for comp,slot,original,source in bindings:
  if original.get_blend_mode()!=u.BlendMode.BLEND_OPAQUE:raise RuntimeError('Actual effective car glass is not opaque')
  for name,expected in [('RoughnessFactor',.05),('MetallicFactor',.55)]:
   actual=float(mel.get_material_instance_scalar_parameter_value(original,name))
   if abs(actual-expected)>1e-6:raise RuntimeError('Actual source scalar differs '+name+': '+str(actual))
  colour=mel.get_material_instance_vector_parameter_value(original,'BaseColorFactor');expected=source['sourcePBR']['baseColorFactor']
  if any(abs(getattr(colour,k)-v)>1e-6 for k,v in zip(('r','g','b','a'),expected)):raise RuntimeError('Actual source BaseColorFactor differs')
  copy(original)
 report={'classification':'Private opaque AO0 indirect isolation; no sourceambient or carpaint cube replacement/product acceptance','folder':folder,'actualProfile':profile,'actualSkyLightTints':sky_tints,'actualCounts':counts,'sharedSourceMeshes':len(found),'sourceNodes':len(rows),'copiedMasters':masters,'bindings':[{'component':c.get_path_name(),'slot':slot,'mesh':source['meshPath'],'zone':source['zone'],'original':o.get_path_name(),'copy':copies[o.get_path_name()].get_path_name(),'state':instance_state(o)}for c,slot,o,source in bindings],'overrideArraysBefore':{c.get_path_name():[text(v)for v in c.get_editor_property('override_materials')]for c,_,_,_ in bindings},'globalPolicyNotModified':True}
 def check(mode):
  for comp,slot,original,_ in bindings:
   target=original if mode=='original'else copies[original.get_path_name()]
   if comp.get_material(slot)!=target:raise RuntimeError('Actual effective car binding differs')
  for original,before in states.values():
   if instance_state(original)!=before or instance_state(copies[original.get_path_name()])!=before:raise RuntimeError('Original/copied PBR/local/static state changed')
  return [{'component':comp.get_path_name(),'slot':slot,'material':comp.get_material(slot).get_path_name()}for comp,slot,_,_ in bindings]
 def bind(mode):
  if mode not in ('original','ao-zero'):raise ValueError(mode)
  for comp,slot,original,_ in bindings:comp.set_material(slot,original if mode=='original'else copies[original.get_path_name()])
  return check(mode)
 def restore():
  bind('original');report['effectiveBindingsRestored']=True;report['overrideArraysAfter']={c.get_path_name():[text(v)for v in c.get_editor_property('override_materials')]for c,_,_,_ in bindings};report['overrideArrayExact']=report['overrideArraysBefore']==report['overrideArraysAfter'];return report
 return bind,restore,report
