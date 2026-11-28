"""Root-only #2405 UNSAVED AO0 + shared source indirect car-glass candidate.
prepare(world,c,out) -> bind(original|ao-zero|source-ambient), restore, report.
No persistence wrappers, canonical activation, file writes, light/profile changes.
SourceFill is a SEPARATE direct-light requirement owned by capture coordinator.
"""
import ast
import copy
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
import unreal as u
KEEP=[]

def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module);KEEP.append(module);return module

def emitters(builder_path,source):
 """Compile ONLY the existing shared node-emission blocks, never their save/cache wrappers."""
 tree=ast.parse(Path(builder_path).read_text());functions={n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)}
 fn=functions['build_function'];start=next(i for i,n in enumerate(fn.body)if isinstance(n,ast.FunctionDef)and n.name=='expr');stop=next(i for i,n in enumerate(fn.body)if ast.unparse(n)=='mel.update_material_function(function)')
 material=functions['copy_material'];a=next(i for i,n in enumerate(material.body)if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='call'for t in n.targets));b=next(i for i,n in enumerate(material.body)if ast.unparse(n)=='mel.recompile_material(material)')
 blocks={'emit_function':(['function','code'],fn.body[start:stop+1]),'emit_material':(['material','function','mpc','display_gain','layers'],material.body[a:b])}
 inputs=next(ast.literal_eval(n.value)for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='INPUTS'for t in n.targets))
 namespace={'u':u,'mel':u.MaterialEditingLibrary,'source':source,'INPUTS':inputs};proof={}
 for name,(args,body)in blocks.items():
  definition=ast.FunctionDef(name=name,args=ast.arguments(posonlyargs=[],args=[ast.arg(arg=n)for n in args],kwonlyargs=[],kw_defaults=[],defaults=[]),body=copy.deepcopy(body),decorator_list=[])
  module=ast.fix_missing_locations(ast.Module(body=[definition],type_ignores=[]));exec(compile(module,str(builder_path)+':private-unsaved-'+name,'exec'),namespace)
  proof[name]={'first':ast.unparse(body[0]).splitlines()[0],'last':ast.unparse(body[-1]).splitlines()[0],'ASTSHA256':hashlib.sha256(ast.dump(ast.Module(body=body,type_ignores=[]),include_attributes=False).encode()).hexdigest(),'statementCount':len(body)}
 return namespace['emit_function'],namespace['emit_material'],inputs,proof

def prepare(world,c,out):
 root=Path(c['root']);directory=root/'tools/unreal-engine/python';mel=u.MaterialEditingLibrary;tools=u.AssetToolsHelpers.get_asset_tools()
 for name in ('source_ambient','build_source_ambient'):
  if name in sys.modules and Path(sys.modules[name].__file__).resolve()!=(directory/(name+'.py')).resolve():raise RuntimeError('Wrong shared source module '+name)
 if 'source_ambient'not in sys.modules:load('source_ambient',directory/'source_ambient.py')
 source=sys.modules['source_ambient']
 if source.policy()['enabled']is not False:raise RuntimeError('Global source policy must remain OFF')
 data=json.loads((root/'unreal/Lunden/Import/measurements.json').read_text());targets=json.loads(Path(c['targets']).read_text());ref=c['sourceReference']
 if ref['date']!=[2026,6,21]or ref['hour']!=14 or any(ref[k]!=v for k,v in [('dayShare',1),('overcast',0),('dim',0),('under',0)]):raise RuntimeError('Require actual frozen clear outdoor day contract')
 contract=data['site']['sourceAmbient'];window=data['site']['windowDaylight'];layer=source.layer_for_key(data['materials'],targets['glassKey']);layers=source.layer_bindings(layer)
 if layer['physical']or layer['model']!='MeshStandardMaterial'or layer['ownEnvironmentMap']:raise RuntimeError('Only actual Standard/env-null car-glass source contract supported')
 state=source.uniforms(contract,day=ref['dayShare'],overcast=ref['overcast'],dim=ref['dim'],under=ref['under'],flash=0,garage_lit=0)
 for name,value in [('ambientIntensityActual',state['ambientIntensity']),('hemiIntensityActual',state['hemiIntensity']),('fill',state['fillIntensity'])]:
  if abs(float(ref[name])-value)>1e-6:raise RuntimeError('Source runtime mismatch '+name)
 for name,value in [('skyRgb',state['skyColor']),('fillRgb',state['fillColor'])]:
  if len(ref[name])!=3 or max(abs(a-b)for a,b in zip(ref[name],value))>1e-6:raise RuntimeError('Source runtime colour mismatch '+name)
 bias_tree=ast.parse((directory/'build_lighting.py').read_text());bias=next(ast.literal_eval(n.value)for n in bias_tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='EXPOSURE_BIAS'for t in n.targets));gain=2.**(-bias)
 emit_function,emit_material,inputs,emitter_proof=emitters(directory/'build_source_ambient.py',source)
 ao=load('private2405_ao_base',c['aoProbe']);bind_ao,restore_ao,ao_report=ao.prepare(world,c['targets']);folder=ao_report['folder']+'_Source'
 # All objects below remain unsaved in a fresh private package; originals untouched.
 original_mpc=u.load_asset('/Game/Lunden/Lighting/MPC_LundenWeather');mpc=tools.duplicate_asset('MPC_PrivateCarGlass',folder,original_mpc)
 if not isinstance(mpc,u.MaterialParameterCollection):raise RuntimeError('Private MPC duplication failed')
 scalars={'SourceAmbientEnabled':0.,'SourceHemiIntensity':state['hemiIntensity'],'SourceAmbientIntensity':state['ambientIntensity'],'SourceFillIntensity':state['fillIntensity'],'SourceDayShare':ref['dayShare'],'SourceWindowSkyStrength':ref['skyStrength'],'WindowSunStrength':ref['sunIntensity']}
 color=lambda v:u.LinearColor(*v,1)
 sun=ref['sunDirWeb'];fill=state['fillDirection'];vectors={'SourceAmbientColor':color(contract['colors']['ambient']),'SourceHemiSky':color(state['skyColor']),'SourceHemiGround':color(contract['colors']['ground']),'SourceFillColor':color(state['fillColor']),'SourceFillDirection':color([fill[0],fill[2],fill[1]]),'SunDir':color([sun[0],sun[2],sun[1]])}
 for prop,kind,values in [('scalar_parameters',u.CollectionScalarParameter,scalars),('vector_parameters',u.CollectionVectorParameter,vectors)]:
  entries={str(e.get_editor_property('parameter_name')):e for e in mpc.get_editor_property(prop)}
  for name,value in values.items():
   entry=entries.get(name)or kind();entry.set_editor_property('parameter_name',name);entry.set_editor_property('default_value',value);entries[name]=entry
  mpc.set_editor_property(prop,list(entries.values()))
 for name,value in scalars.items():u.MaterialLibrary.set_scalar_parameter_value(world,mpc,name,value)
 for name,value in vectors.items():u.MaterialLibrary.set_vector_parameter_value(world,mpc,name,value)
 actual_scalars={n:float(u.MaterialLibrary.get_scalar_parameter_value(world,mpc,n))for n in scalars};actual_vectors={n:u.MaterialLibrary.get_vector_parameter_value(world,mpc,n)for n in vectors}
 if any(abs(actual_scalars[n]-v)>1e-6 for n,v in scalars.items())or any(max(abs(getattr(actual_vectors[n],k)-getattr(v,k))for k in 'rgba')>1e-6 for n,v in vectors.items()):raise RuntimeError('Private MPC initialization differs')
 function=tools.create_asset('MF_PrivateCarAmbient',folder,u.MaterialFunction,u.MaterialFunctionFactoryNew())
 if not function:raise RuntimeError('Private shared MF creation failed')
 code=source.material_hlsl(window);emit_function(function,code)
 originals={o.get_path_name():o for o in ao.KEEP if hasattr(o,'get_path_name')};copies={};masters=[]
 def copied(obj):
  path=obj.get_path_name()
  if path in copies:return copies[path]
  new=tools.duplicate_asset('Source_'+obj.get_name()+'_'+str(len(copies)),folder,obj)
  if not new:raise RuntimeError('Source chain copy failed '+path)
  copies[path]=new;KEEP.extend([obj,new])
  if isinstance(obj,u.MaterialInstanceConstant):
   before=ao.instance_state(obj);mel.set_material_instance_parent(new,copied(obj.get_editor_property('parent')))
   if ao.instance_state(new)!=before:raise RuntimeError('Source copy changed effective/local/static PBR')
  elif isinstance(obj,u.Material):
   zero=mel.get_material_property_input_node(new,u.MaterialProperty.MP_AMBIENT_OCCLUSION)
   if not isinstance(zero,u.MaterialExpressionConstant)or float(zero.get_editor_property('r'))!=0:raise RuntimeError('Actual copied native AO0 missing')
   emit_material(new,function,mpc,gain,layers);errors=list(map(str,mel.recompile_material(new)))
   if errors:raise RuntimeError('Actual source compiler errors '+str(errors))
   if mel.get_material_property_input_node(new,u.MaterialProperty.MP_AMBIENT_OCCLUSION)!=zero:raise RuntimeError('Source attachment altered native AO routing')
   masters.append({'AOcopy':path,'sourceCopy':new.get_path_name(),'compilerErrors':errors,'nativeAO':0,'sourceAO':1})
  else:raise RuntimeError('Unknown copied chain type '+path)
  return new
 for row in ao_report['bindings']:copied(originals[row['copy']])
 components={comp.get_path_name():comp for a in u.GameplayStatics.get_all_actors_of_class(world,u.Actor)for comp in a.get_components_by_class(u.StaticMeshComponent)}
 bindings=[(components[r['component']],r['slot'],originals[r['copy']],copies[r['copy']],r['state'])for r in ao_report['bindings']]
 report={'classification':'Private day/env-null opaque car-glass indirect replacement; not product acceptance','AOIsolation':ao_report,'folder':folder,'function':function.get_path_name(),'privateMPC':mpc.get_path_name(),'sourceReference':ref,'sourceUniforms':state,'privateScalars':actual_scalars,'privateVectors':{n:[getattr(v,k)for k in 'rgba']for n,v in actual_vectors.items()},'sharedHLSLSHA256':hashlib.sha256(code.encode()).hexdigest(),'sharedInputs':inputs,'exactSourceEmitterBlocks':emitter_proof,'copiedMasters':masters,'displayUnitGain':gain,'exposureBias':bias,'globalPolicyEnabled':False,'sourceEnvironment':None,'sourceFill':{'includedByThisHelper':False,'required':'Separate actual source DirectionalLight; kernel contains window subtraction only. Coordinator must document external Fill binding before claiming complete source lighting.'},'runtimeLimits':['Frozen outdoor June21@14 clear context only; garage_lit=0','AO0 suppresses native indirect under verified current DefaultLit/SSR0/staticlighting0/black-sky-tint premises; full runtime interpretation requires actual images','PrivateMPC scalar/vector CPU readback; GPU binding requires actual candidate render']}
 def bind(mode):
  if mode in ('original','ao-zero'):return bind_ao(mode)
  if mode!='source-ambient':raise ValueError(mode)
  for comp,slot,ao_copy,candidate,before in bindings:
   comp.set_material(slot,candidate)
   if comp.get_material(slot)!=candidate or ao.instance_state(candidate)!=before or ao.instance_state(ao_copy)!=before:raise RuntimeError('Source candidate effective binding/PBR mismatch')
  return [{'component':comp.get_path_name(),'slot':slot,'material':candidate.get_path_name()}for comp,slot,_,candidate,_ in bindings]
 def restore():
  restore_ao();report['effectiveBindingsRestored']=ao_report['effectiveBindingsRestored'];return report
 KEEP.extend([ao,function,mpc,*copies.values(),*components.values()])
 return bind,restore,report
