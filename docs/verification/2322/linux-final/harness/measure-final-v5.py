from pathlib import Path
import json,hashlib,shutil,subprocess,os,copy
S=Path(__file__).resolve().parent
W=Path('/home/devcontainers/wt/codex-2322-integrate')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
contract=S/'corrected-reference-contract.json'
assert sha(contract)=='1f559812415bdc9a6bbfcd5030957bae510b208833318c45021d3a89545d47b6'
c=json.loads(contract.read_text());primary=json.loads((S/'upper/crops-with-upper.json').read_text());assert c['crops']==primary
crops=copy.deepcopy(primary);cab=json.loads((W/'tools/unreal-engine/tests/cabinet-crops.json').read_text())
for shot,rects in cab.items():
 for name,rect in rects.items():
  if name in crops[shot]:assert crops[shot][name]==rect
  crops[shot][name]=rect
assert sum(map(len,crops.values()))==14
p=S/'native-after-v5/captures/capture.json';assert json.loads(p.read_text())['completed']
out=S/'after-paired-v5';out.mkdir()
for shot,ref in c['references'].items():
 source=Path(ref['path']);assert sha(source)==ref['sha256'];shutil.copyfile(source,out/f'web-{shot}.jpg')
 shutil.copyfile(S/'native-after-v5/captures'/f'unreal-{shot}.png',out/f'unreal-{shot}.png')
(out/'crops.json').write_text(json.dumps(crops,indent=2)+'\n')
env=dict(os.environ,PLAYWRIGHT_MODULE='/home/devcontainers/kvarteret-lunden/node_modules/playwright',CHROME_PATH='/home/devcontainers/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome')
cmd=['node',str(W/'tools/unreal-engine/tests/crop-stats.cjs'),str(out),str(out/'crops.json'),'--check-curtains','--check-cabinet']
r=subprocess.run(cmd,env=env,text=True,capture_output=True);print(r.stdout);print(r.stderr);(out/'canonical-console.txt').write_text(r.stdout+r.stderr)
a=json.loads((out/'crop-stats.json').read_text());assert a['crops']==crops
rows=[]
for shot,rects in crops.items():
 for name,rect in rects.items():
  web=a['stats'][shot]['web'][name];native=a['stats'][shot]['unreal'][name]
  ratio=native['luminance']/web['luminance'];hues={n:(native['srgb'][i]/native['srgb'][1])/(web['srgb'][i]/web['srgb'][1]) for i,n in ((0,'R/G'),(2,'B/G'))}
  huepass=all(.9<=v<=1.1 for v in hues.values()) if name in ('curtain','cabinet-front') else None
  rows.append({'shot':shot,'family':name,'role':'primary' if name in primary[shot] else 'existing-cabinet-spot','rect':rect,'luminanceRatio':ratio,'luminancePassed':.8<=ratio<=1.25,'hueRatios':hues,'existingGuessedHueGuardPassed':huepass,'web':web,'native':native})
gate={'source':'c1de028da70d1947c59cd017826e4409baff511a','correctedWholeReferenceContractSha256':sha(contract),'canonicalCommand':cmd,'canonicalExitCode':r.returncode,'elevenUnchangedPrimaryRects':11,'threeUnchangedCabinetSpots':3,'rows':rows,'allLuminancePassed':all(x['luminancePassed'] for x in rows),'allExistingGuessedHueGuardsPassed':all(x['existingGuessedHueGuardPassed'] is not False for x in rows),'wholeOriginalVisualReview':'separate; numeric success alone cannot close'}
(out/'fourteen-crop-gate.json').write_text(json.dumps(gate,indent=2)+'\n')
assert r.returncode==0 and gate['allLuminancePassed'] and gate['allExistingGuessedHueGuardsPassed']
print('ALL14unchangedYandexistinghueguardsPASS; onecanonicalbrowser')
