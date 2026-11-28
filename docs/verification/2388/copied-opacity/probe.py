"""Private no-save #2388 copied-graph Opacity0 resource isolation. Root owns launch/guards.
prepare(world) -> (bind_original_or_graph_zero, restore, report).
Capture original, copied-graph Opacity0, then original again through the SAME existing canonical
patio camera; this is compiled-graph response isolation, never acceptance or PMREM parity.
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


def prepare(world):
 mel=u.MaterialEditingLibrary
 master=u.load_asset('/Game/Lunden/Materials/M_LundenGlass')
 original=u.load_asset('/Game/Lunden/Materials/MI_LundenWindowGlass')
 if not isinstance(master,u.Material) or not isinstance(original,u.MaterialInstanceConstant) or original.get_editor_property('parent')!=master:
  raise RuntimeError('Exact source window-glass master/MIC required')
 if master.get_editor_property('translucency_lighting_mode')!=u.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING:
  raise RuntimeError('Actual SurfaceForward glass required')
 if master.get_editor_property('shading_model')!=u.MaterialShadingModel.MSM_DEFAULT_LIT or master.get_editor_property('use_material_attributes'):
  raise RuntimeError('Legacy DefaultLit graph required')
 if u.SystemLibrary.get_console_variable_int_value('r.SSR.Quality')!=0:
  raise RuntimeError('SSR must already be off; do not change profile for this probe')
 bindings=[]
 for actor in u.GameplayStatics.get_all_actors_of_class(world,u.Actor):
  for comp in actor.get_components_by_class(u.StaticMeshComponent):
   for slot in range(comp.get_num_materials()):
    if comp.get_material(slot)==original:bindings.append((comp,slot))
 if len(bindings)!=35:raise RuntimeError('Expected actual original35 window bindings, got '+str(len(bindings)))
 folder='/Game/Lunden/Generated/Private2388CopyOpacity_'+uuid.uuid4().hex
 tools=u.AssetToolsHelpers.get_asset_tools()
 copied_master=tools.duplicate_asset('M_GlassCopyOpacity0',folder,master)
 copied=tools.duplicate_asset('MI_GlassCopyOpacity0',folder,original)
 if not copied_master or not copied:raise RuntimeError('Unsaved glass duplication failed')
 KEEP.extend([original,master,copied_master,copied])
 before=instance_state(original)
 mel.set_material_instance_parent(copied,copied_master)
 if instance_state(copied)!=before:raise RuntimeError('Copied MIC lost local/effective/static parameters')
 zero=mel.create_material_expression(copied_master,u.MaterialExpressionConstant,-800,800)
 zero.set_editor_property('r',0.0)
 if not mel.connect_material_property(zero,'',u.MaterialProperty.MP_OPACITY):raise RuntimeError('Cannot connect graph Opacity0')
 errors=list(map(str,mel.recompile_material(copied_master)))
 if errors:raise RuntimeError('Actual compiler errors '+str(errors))
 pin=mel.get_material_property_input_node(copied_master,u.MaterialProperty.MP_OPACITY)
 if pin!=zero or not isinstance(pin,u.MaterialExpressionConstant) or float(pin.get_editor_property('r'))!=0.:raise RuntimeError('Copied opacity pin must actually be Constant0')
 if instance_state(copied)!=before or instance_state(original)!=before:raise RuntimeError('Local/effective/static source parameters changed after compile')
 if float(mel.get_material_instance_scalar_parameter_value(original,'Opacity'))!=float(mel.get_material_instance_scalar_parameter_value(copied,'Opacity')) or abs(float(mel.get_material_instance_scalar_parameter_value(original,'Opacity'))-.1)>1e-7:raise RuntimeError('Both original/copy MIC Opacity scalar must remain source0.1')
 report={'classification':'private copied-graph Opacity0 resource response; not sourcePMREM/alpha product fix/acceptance','folder':folder,'original':original.get_path_name(),'copy':copied.get_path_name(),'compilerErrors':errors,'graphOpacityPin':{'class':pin.get_class().get_name(),'value':float(pin.get_editor_property('r'))},'MICOpacityScalar':float(mel.get_material_instance_scalar_parameter_value(copied,'Opacity')),'count':35,'bindings':[{'component':c.get_path_name(),'slot':slot,'mesh':c.get_editor_property('static_mesh').get_path_name()}for c,slot in bindings],'instanceState':before,'overrideArraysBefore':{c.get_path_name():[text(v)for v in c.get_editor_property('override_materials')]for c,_ in bindings},'nativeShaderPremise':'A new compiled Constant0 graph overrides MP_OPACITY while both inherited Opacity parameters stay0.1; compare prior actual transient-MID Opacity0 response', 'compiledMaterialCode':{'status':'not collected: no proven MaterialEditingLibrary compiled-HLSL Python getter','actualAOInput':'not GPU-observed; original graph remains unconnected/default1'},'globalPolicyNotModified':True}
 def bind(mode):
  if mode not in ('original','copygraph-opacity-zero'):raise ValueError(mode)
  target=original if mode=='original'else copied
  for c,slot in bindings:c.set_material(slot,target)
  if any(c.get_material(slot)!=target for c,slot in bindings):raise RuntimeError('Effective material binding failed')
 def restore():
  bind('original');report['effectiveBindingsRestored']=True
  report['overrideArraysAfter']={c.get_path_name():[text(v)for v in c.get_editor_property('override_materials')]for c,_ in bindings}
  report['overrideArrayExact']=report['overrideArraysBefore']==report['overrideArraysAfter']
  # []->[None] may differ internally: processdiscard plus exact disk guards required.
  return report
 return bind,restore,report
