"""#2403: actual imported canopy and production patio-lamp functions in PIE.

Run Editor.Python.Lunden.test_parasol after lighting build and world composition.
Records 108 exact month/sun/cloud boundaries, intermediate/manual poses and a real
Tick/MPC transition. No substituted clock scheduler or weakened lighting test.
"""
import json
import math
from pathlib import Path
import sys
import time
import unreal as u

PROJECT=Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
sys.path.insert(0,str(PROJECT.parents[1]/'tools/unreal-engine/tests'))
import save_isolation
M=json.loads((PROJECT/'Import/measurements.json').read_text())
ROWS=M.get('furnishing',{}).get('parasols',[])
if len(ROWS)!=1:raise RuntimeError('Exactly one actual exported patio canopy required')
ROW=ROWS[0];RULE=ROW['rule']
editor=u.get_editor_subsystem(u.UnrealEditorSubsystem);levels=u.get_editor_subsystem(u.LevelEditorSubsystem)
if not u.EditorLoadingAndSavingUtils.load_map('/Game/Lunden/Maps/L_Lunden'):raise RuntimeError('Composed L_Lunden required')
saved_slot=save_isolation.isolate();levels.editor_request_begin_play()
RESULT={'completed':False,'boundaries':[],'manual':[],'tick':None}


def pose(actor,fraction):
    comp=actor.root_component;s=comp.get_editor_property('relative_scale3d');r=comp.get_editor_property('relative_rotation');location=comp.get_editor_property('relative_location')
    e=fraction*fraction*(3-2*fraction);radius=RULE['radius']+(ROW['radius']-RULE['radius'])*e;height=RULE['height']+(RULE['openHeight']-RULE['height'])*e
    actual=[s.x,s.y,s.z,r.roll,r.pitch,r.yaw,location.x,location.y,location.z]
    expected=[radius,radius,height,math.degrees(ROW['tilt'])*e,0,0,100*ROW['position'][0],100*ROW['position'][2],100*ROW['position'][1]]
    if max(abs(a-b)for a,b in zip(actual,expected))>1e-4:raise RuntimeError(f'Actual canopy pose differs: {actual}, expected {expected}')
    parent=actor.get_attach_parent_actor()
    if not parent or ROW['id']not in[str(t)for t in parent.tags]:raise RuntimeError('Folding changed the source furniture parent')
    return {'fraction':fraction,'actualNativeScaleRollPitchYawPosition':actual,'parent':parent.get_path_name()}


@u.AutomationScheduler.add_latent_command
def parasol_test():
    try:
        deadline=time.monotonic()+60;game=None
        while True:
            game=editor.get_game_world()
            found=u.GameplayStatics.get_all_actors_with_tag(game,'patio:string-driver')if game else []
            canopies=u.GameplayStatics.get_all_actors_with_tag(game,ROW['mesh'])if game else []
            skies=u.GameplayStatics.get_all_actors_with_tag(game,'lunden:sky')if game else []
            if len(found)==len(canopies)==len(skies)==1:break
            if time.monotonic()>deadline:raise RuntimeError('PIE did not load exactly one patio driver/canopy/sky')
            yield
        driver,canopy,sky=found[0],canopies[0],skies[0]
        driver.set_actor_tick_enabled(False)
        sky.set_editor_property('UseClock',False);sky.set_editor_property('TimeScale',0.0)
        original_mesh=canopy.get_component_by_class(u.StaticMeshComponent).static_mesh
        for month in range(1,13):
            for sun in(RULE['sunThreshold']-1e-6,RULE['sunThreshold'],RULE['sunThreshold']+1e-6):
                for overcast in(RULE['maxOvercast']-1e-6,RULE['maxOvercast'],RULE['maxOvercast']+1e-6):
                    expected=float(month in RULE['months']and sun>RULE['sunThreshold']and overcast<=RULE['maxOvercast'])
                    driver.set_editor_property('ParasolManual',False)
                    driver.call_method('AdvanceParasol',(0.0,month,sun,overcast,True))
                    actual=driver.get_editor_property('ParasolOpen')
                    if abs(actual-expected)>1e-8:raise RuntimeError(f'Automatic parasol rule differs at {month,sun,overcast}: {actual} != {expected}')
                    RESULT['boundaries'].append({'month':month,'sunHeight':sun,'overcast':overcast,'expected':expected,**pose(canopy,expected)})
        # First arrival snaps; manual holds through weather/time changes that leave auto unchanged.
        driver.call_method('AdvanceParasol',(0.0,1,1.0,0.0,True));driver.call_method('ToggleParasol')
        for fraction in(.25,.5,.75,1.0):
            driver.call_method('AdvanceParasol',(.1,1,1.0,0.0,False))
            if abs(driver.get_editor_property('ParasolOpen')-fraction)>1e-7:raise RuntimeError('Manual source speed differs')
            RESULT['manual'].append(pose(canopy,fraction))
        driver.call_method('AdvanceParasol',(.1,1,0.0,1.0,False));pose(canopy,1.0)
        if not driver.get_editor_property('ParasolManual'):raise RuntimeError('Manual choice cleared while automatic answer remained folded')
        driver.call_method('AdvanceParasol',(0.0,6,1.0,0.0,False))
        if driver.get_editor_property('ParasolManual'):raise RuntimeError('Automatic state change failed to release manual override')
        driver.call_method('AdvanceParasol',(0.0,1,1.0,0.0,True));driver.call_method('AdvanceParasol',(.5,6,1.0,0.0,False));pose(canopy,.25)
        driver.call_method('AdvanceParasol',(100.0,6,1.0,0.0,False));pose(canopy,1.0)
        driver.call_method('AdvanceParasol',(1.0,6,1.0,0.0,False));pose(canopy,1.0)  # settled stays settled
        # Real Tick reads actual sky-updated MPC Month/SunDir/Overcast, rather than direct function inputs.
        for name,value in(('Year',2026),('Month',6),('Day',21),('Hour',14.0),('Rain',1.0),('Snow',0.0)):
            sky.set_editor_property(name,value)
        sky.call_method('UpdateSky');driver.set_actor_tick_enabled(True)
        started=time.monotonic();initial=driver.get_editor_property('ParasolOpen')
        while driver.get_editor_property('ParasolOpen')>1e-6:
            if time.monotonic()-started>20:raise RuntimeError('Actual patio Tick failed to close the parasol from the overcast MPC input')
            yield
        RESULT['tick']={'initial':initial,'actualFinal':driver.get_editor_property('ParasolOpen'),'wallSeconds':time.monotonic()-started,'pose':pose(canopy,0.0)}
        if canopy.get_component_by_class(u.StaticMeshComponent).static_mesh!=original_mesh:raise RuntimeError('Folding replaced the source mesh/UVs')
        RESULT['completed']=True
        (PROJECT/'Saved/parasol-result.json').write_text(json.dumps(RESULT,indent=2)+'\n')
        u.log('LUNDEN_PARASOL_TEST_OK 108 boundaries + manual/intermediate poses + actual Tick/MPC')
    finally:
        levels.editor_request_end_play()
        yield from save_isolation.restore_after_play(saved_slot,editor)
