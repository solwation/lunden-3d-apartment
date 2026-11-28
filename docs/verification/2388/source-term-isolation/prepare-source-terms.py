"""Private #2388 candidate assembly, no launch/worldload/global activation. No import/readback/save: reuse exact actual-v3 verified atlas; two private0/1 term gates only."""
from pathlib import Path
import hashlib,importlib.util,json,sys,uuid,math,ast
import unreal as u
KEEP=[]
def load(name,p):
 spec=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(spec);sys.modules[name]=m;KEEP.append(m);spec.loader.exec_module(m);return m
def text(v):
 if hasattr(v,'get_path_name'):return v.get_path_name()
 if hasattr(v,'export_text'):return v.export_text()
 if isinstance(v,(list,tuple)):return[text(x)for x in v]
 return str(v)
def instance_state(mi):
 mel=u.MaterialEditingLibrary
 state={'local':{p:([text(x)for x in mi.get_editor_property(p)]if p.endswith('_values')else text(mi.get_editor_property(p)))for p in('scalar_parameter_values','vector_parameter_values','texture_parameter_values','base_property_overrides')},'effective':{}}
 for kind in('scalar','vector','texture','static_switch'):state['effective'][kind]={str(n):text(getattr(mel,'get_material_instance_'+kind+'_parameter_value')(mi,n))for n in getattr(mel,'get_'+kind+'_parameter_names')(mi)}
 return state

def prepare(world,c,out):
 out=Path(out);out.mkdir(parents=True,exist_ok=True)
 # Explicit source checkout/module pins are enforced by caller's frozen dependencies.
 source_dir=Path(c['glassModule']).parent
 for name in ('source_ambient','build_source_ambient'):
  if name in sys.modules and Path(sys.modules[name].__file__).resolve()!=source_dir/(name+'.py'):raise RuntimeError('Wrong alreadyloaded source helper '+name)
  if name not in sys.modules:load(name,source_dir/(name+'.py'))
 source=sys.modules['source_ambient'];glass=load('private2388_glass_indirect',c['glassModule'])
 if source.policy()['enabled']is not False:raise RuntimeError('Global source policy must stay OFF')
 data=json.loads((Path(c['root'])/'unreal/Lunden/Import/measurements.json').read_text());export=json.loads(Path(c['sourceExport']).read_text());raw=glass.half_atlas(export)
 if hashlib.sha256(raw).hexdigest()!=c['sourceRawHalfSHA256']:raise RuntimeError('Actual exported raw half pin differs')
 ref=json.loads(Path(c['runtimeReference']).read_text())['views']['day14-clear']
 if ref['date']!=[2026,6,21]or ref['hour']!=14 or any(ref[k]!=v for k,v in [('dayShare',1),('overcast',0),('dim',0),('under',0)]):raise RuntimeError('Source runtime not frozen clear day')
 state=source.uniforms(data['site']['sourceAmbient'],day=ref['dayShare'],overcast=ref['overcast'],dim=ref['dim'],under=ref['under'])
 for key,actual in [('hemiIntensityActual',state['hemiIntensity']),('ambientIntensityActual',state['ambientIntensity']),('fill',state['fillIntensity'])]:
  if abs(float(ref[key])-actual)>1e-9:raise RuntimeError('Source uniform/reference mismatch '+key)
 if max(abs(a-b)for a,b in zip(ref['skyRgb'],state['skyColor']))>1e-9 or max(abs(a-b)for a,b in zip(ref['fillRgb'],state['fillColor']))>1e-9:raise RuntimeError('Source sky/fill color reference mismatch')
 folder=c['privateFolder']
 if not folder.startswith('/Game/Lunden/Generated/Private2388')or u.EditorAssetLibrary.does_directory_exist(folder):raise RuntimeError('Fresh owned privateFolder required')
 atlas_path='/Game/Lunden/Generated/Private2388SourceDay_20261128_v3/T_SourceGlassAtlas'
 if c['atlasAsset']!=atlas_path:raise RuntimeError('Only the actual verified v3 atlas may be reused')
 atlas_file=Path(c['root'])/'unreal/Lunden/Content'/((atlas_path[len('/Game/'):])+'.uasset')
 if hashlib.sha256(atlas_file.read_bytes()).hexdigest()!='578aa960c1269dc422e1f810742d1835245bd36336f8aad7c1c7b43f80058f13':raise RuntimeError('Actual saved atlas bytes differ from verified v3')
 proof_path=Path(c['atlasProof']);proof=json.loads(proof_path.read_text())
 prior_result=json.loads(Path(c['atlasRunResult']).read_text())
 if not prior_result.get('passed')or prior_result.get('exitCode')!=0 or not u.SystemLibrary.get_engine_version().startswith(prior_result['engine']):raise RuntimeError('Actual successful same-engine atlas run proof required')
 if proof.get('nativeRGBA16FTexelsExact')is not True or proof.get('sourceRawHalfSHA256')!=hashlib.sha256(raw).hexdigest():raise RuntimeError('Actual exact native uploaded-atlas proof missing')
 atlas=u.EditorAssetLibrary.load_asset(atlas_path)
 u.SystemLibrary.execute_console_command(world,'Editor.AsyncTextureCompilationFinishAll')
 if not isinstance(atlas,u.Texture2D)or proof.get('nativeTexturePath')!=atlas.get_path_name():raise RuntimeError('Actual saved atlas object differs')
 for name,value in [('compression_settings',u.TextureCompressionSettings.TC_HDR),('srgb',False),('mip_gen_settings',u.TextureMipGenSettings.TMGS_NO_MIPMAPS),('filter',u.TextureFilter.TF_BILINEAR),('address_x',u.TextureAddress.TA_CLAMP),('address_y',u.TextureAddress.TA_CLAMP)]:
  if atlas.get_editor_property(name)!=value:raise RuntimeError('Verified atlas sampling/property changed '+name)
 if [atlas.blueprint_get_size_x(),atlas.blueprint_get_size_y()]!=[336,256]:raise RuntimeError('Verified atlas dimensions changed')
 original=u.load_asset('/Game/Lunden/Materials/MI_LundenWindowGlass');master=u.load_asset('/Game/Lunden/Materials/M_LundenGlass');original_mpc=u.load_asset('/Game/Lunden/Lighting/MPC_LundenWeather')
 if not isinstance(original,u.MaterialInstanceConstant)or original.get_editor_property('parent')!=master:raise RuntimeError('Exact original glass chain required')
 tools=u.AssetToolsHelpers.get_asset_tools();mpc=tools.duplicate_asset('MPC_PrivateGlass',folder,original_mpc)
 if not isinstance(mpc,u.MaterialParameterCollection):raise RuntimeError('Actual private collection clone unavailable')
 scalars={'SourceAmbientEnabled':0.,'SourceHemiIntensity':state['hemiIntensity'],'SourceAmbientIntensity':state['ambientIntensity'],'SourceFillIntensity':state['fillIntensity'],'SourceDayShare':ref['dayShare'],'SourceWindowSkyStrength':ref['skyStrength'],'WindowSunStrength':ref['sunIntensity'],'Source2388Proof':0.,'Source2388PMREM':0.,'Source2388Ambient':0.}
 vector=lambda v:u.LinearColor(*v,1)
 sun=ref['sunDirWeb'];fill=state['fillDirection']
 vectors={'SourceAmbientColor':vector(data['site']['sourceAmbient']['colors']['ambient']),'SourceHemiSky':vector(state['skyColor']),'SourceHemiGround':vector(data['site']['sourceAmbient']['colors']['ground']),'SourceFillColor':vector(state['fillColor']),'SourceFillDirection':vector([fill[0],fill[2],fill[1]]),'SunDir':vector([sun[0],sun[2],sun[1]])}
 for prop,kind,values in [('scalar_parameters',u.CollectionScalarParameter,scalars),('vector_parameters',u.CollectionVectorParameter,vectors)]:
  old={str(e.get_editor_property('parameter_name')):e for e in mpc.get_editor_property(prop)}
  for name,value in values.items():
   entry=old.get(name)or kind();entry.set_editor_property('parameter_name',name);entry.set_editor_property('default_value',value);old[name]=entry
  mpc.set_editor_property(prop,list(old.values()))
 for name,value in scalars.items():u.MaterialLibrary.set_scalar_parameter_value(world,mpc,name,value)
 for name,value in vectors.items():u.MaterialLibrary.set_vector_parameter_value(world,mpc,name,value)
 actual={name:float(u.MaterialLibrary.get_scalar_parameter_value(world,mpc,name))for name in scalars}
 if any(abs(actual[n]-v)>1e-6 for n,v in scalars.items()):raise RuntimeError('Actual private collection scalar initialization failed')
 # One same-invocation Canvas sentinel proves the actual private collection GPU buffer, no standalone control start.
 mel=u.MaterialEditingLibrary;sentinel=tools.create_asset('M_MPCProof',folder,u.Material,u.MaterialFactoryNew());sentinel.set_editor_property('shading_model',u.MaterialShadingModel.MSM_UNLIT)
 custom=mel.create_material_expression(sentinel,u.MaterialExpressionCustom,0,0);custom.set_editor_property('code','return float3(Hemi,Ambient,Sky);');custom.set_editor_property('output_type',u.CustomMaterialOutputType.CMOT_FLOAT3)
 fields=[]
 for name in ('Hemi','Ambient','Sky'):
  f=u.CustomInput();f.set_editor_property('input_name',name);fields.append(f)
 custom.set_editor_property('inputs',fields)
 for name,param in [('Hemi','SourceHemiIntensity'),('Ambient','SourceAmbientIntensity'),('Sky','SourceWindowSkyStrength')]:
  n=mel.create_material_expression(sentinel,u.MaterialExpressionCollectionParameter,-300,0);n.set_editor_property('collection',mpc);n.set_editor_property('parameter_name',param)
  if not mel.connect_material_expressions(n,'',custom,name):raise RuntimeError('MPC sentinel binding failed')
 if not mel.connect_material_property(custom,'',u.MaterialProperty.MP_EMISSIVE_COLOR):raise RuntimeError('MPC sentinel output failed')
 errors=list(map(str,mel.recompile_material(sentinel)))
 if errors:raise RuntimeError('MPC sentinel compiler errors '+str(errors))
 rt=u.RenderingLibrary.create_render_target2d(world,1,1,u.TextureRenderTargetFormat.RTF_RGBA16F);rt.set_editor_property('target_gamma',1.0);u.AutomationLibrary.finish_loading_before_screenshot();u.RenderingLibrary.draw_material_to_render_target(world,rt,sentinel)
 proof_pixels=u.RenderingLibrary.read_render_target_raw_pixel_area(world,rt,0,0,1,1,False)
 if len(proof_pixels)!=1:raise RuntimeError('MPC proof requires exactly one raw pixel')
 p=proof_pixels[0]
 import struct
 sentinel_actual=[p.r,p.g,p.b];sentinel_expected=[state['hemiIntensity'],state['ambientIntensity'],ref['skyStrength']]
 if [struct.pack('<e',v)for v in sentinel_actual]!=[struct.pack('<e',v)for v in sentinel_expected]:raise RuntimeError('Actual private MPC GPU sentinel mismatch '+str(sentinel_actual))
 copied_master=tools.duplicate_asset('M_SourceGlass',folder,master);copied=tools.duplicate_asset('MI_SourceGlass',folder,original);mel.set_material_instance_parent(copied,copied_master)
 before=instance_state(original)
 if instance_state(copied)!=before:raise RuntimeError('Copied local/effective/static PBR lost')
 reference={**ref,'dayShare':ref['dayShare']}
 exposure_tree=ast.parse((Path(c['root'])/'tools/unreal-engine/python/build_lighting.py').read_text())
 exposure_bias=next(ast.literal_eval(n.value)for n in exposure_tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='EXPOSURE_BIAS'for t in n.targets))
 if c.get('exposureBiasConstant',exposure_bias)!=exposure_bias:raise RuntimeError('Exposure unit constant differs from actual frozen source')
 actual_sun=u.MaterialLibrary.get_vector_parameter_value(world,original_mpc,'SunDir')
 expected_sun=[sun[0],sun[2],sun[1]]
 if max(abs(a-b)for a,b in zip([actual_sun.r,actual_sun.g,actual_sun.b],expected_sun))>1e-5:raise RuntimeError('Current native source SunDir differs from actual web reference')
 for name,value in [('WindowSkyStrength',ref['skyStrength']),('WindowSunStrength',ref['sunIntensity'])]:
  if abs(u.MaterialLibrary.get_scalar_parameter_value(world,original_mpc,name)-value)>1e-5:raise RuntimeError('Current actual source MPC differs '+name)
 attachment=glass.attach(copied_master,atlas,mpc,data['site']['windowDaylight'],atlas_proof=proof,source_export=export,reference=reference,exposure_bias=exposure_bias)
 # Literal0/1 term isolation; source formula code is untouched beneath each early-zero gate.
 term_nodes=[];seen=set()
 for node in mel.get_material_expressions(copied_master):
  if not isinstance(node,u.MaterialExpressionCustom):continue
  code=node.get_editor_property('code')
  if 'float routedAO = 0.0;'not in code:continue
  term='PMREM'if 'SourceGlassEnvironment'in code else'Ambient'if 'WebWindowDaylight win;'in code else None
  if term is None or term in seen:raise RuntimeError('Unexpected/duplicate actual source term custom')
  seen.add(term);param='Source2388'+term
  node.set_editor_property('code','if (TermEnabled == 0.0) return float3(0,0,0);\n'+code)
  fields=list(node.get_editor_property('inputs'));f=u.CustomInput();f.set_editor_property('input_name','TermEnabled');fields.append(f);node.set_editor_property('inputs',fields)
  n=mel.create_material_expression(copied_master,u.MaterialExpressionCollectionParameter,-800,1200);n.set_editor_property('collection',mpc);n.set_editor_property('parameter_name',param)
  if not mel.connect_material_expressions(n,'',node,'TermEnabled'):raise RuntimeError('Term gate collection input unavailable')
  term_nodes.append({'node':node.get_path_name(),'term':term,'privateParameter':param,'sourceFormulaSHA256':hashlib.sha256(code.encode()).hexdigest()})
 if seen!={'PMREM','Ambient'}:raise RuntimeError('Exact two source term customs required')
 errors=list(map(str,mel.recompile_material(copied_master)))
 if errors:raise RuntimeError('Source term-gate compile errors '+str(errors))
 if instance_state(copied)!=before:raise RuntimeError('Source candidate altered inherited PBR parameters')
 bindings=[(comp,i)for actor in u.GameplayStatics.get_all_actors_of_class(world,u.Actor)for comp in actor.get_components_by_class(u.StaticMeshComponent)for i in range(comp.get_num_materials())if comp.get_material(i)==original]
 if len(bindings)!=35:raise RuntimeError('Actual35 glass slots required')
 KEEP.extend([original,master,copied,copied_master,mpc,atlas,sentinel,rt])
 report={'classification':'private separatePMREM/ambient day terms; no global activation/product acceptance','original':original.get_path_name(),'copy':copied.get_path_name(),'folder':folder,'atlasProof':proof,'privateMPC':mpc.get_path_name(),'sourceUniforms':state,'privateScalars':actual,'MPCSentinel':{'expected':sentinel_expected,'actual':sentinel_actual,'halfBitsExact':True},'attachment':attachment,'compilerErrors':errors,'termNodes':term_nodes,'termSelections':[],'atlasImportedOrReadbackRepeatedHere':False,'atlasRunResult':c['atlasRunResult'],'atlasProofPath':c['atlasProof'],'literalTermValuesOnly':[0.0,1.0],'sourceReference':reference,'count':35,'instanceState':before}
 def bind(mode):
  if mode not in ('original','pmrem-only','ambient-only'):raise ValueError(mode)
  expected={'Source2388PMREM':1. if mode=='pmrem-only'else 0.,'Source2388Ambient':1. if mode=='ambient-only'else 0.,'Source2388Proof':0.}
  for name,value in expected.items():u.MaterialLibrary.set_scalar_parameter_value(world,mpc,name,value)
  actual_terms={name:float(u.MaterialLibrary.get_scalar_parameter_value(world,mpc,name))for name in expected}
  if actual_terms!=expected:raise RuntimeError('Actual private0/1 term selection differs')
  report['termSelections'].append({'mode':mode,'actualScalars':actual_terms})
  target=original if mode=='original'else copied
  for comp,i in bindings:comp.set_material(i,target)
  if any(comp.get_material(i)!=target for comp,i in bindings):raise RuntimeError('Actual35 candidate binding failed')
  if instance_state(original)!=before or instance_state(copied)!=before:raise RuntimeError('Actual source PBR changed')
 def restore():
  bind('original');report['effectiveBindingsRestored']=all(comp.get_material(i)==original for comp,i in bindings)
  if not report['effectiveBindingsRestored']:raise RuntimeError('Actual original binding restoration failed')
  return report
 return bind,restore,report
