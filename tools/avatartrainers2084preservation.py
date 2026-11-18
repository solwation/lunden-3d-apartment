"""Exact inverse of the named trainer additions, preserving unrelated source bytes."""
import hashlib,json,pathlib,subprocess
base='a366067a79ab90a67abc5a66b3db205f67788506'
old=lambda f:subprocess.check_output(['git','show',base+':'+f]).decode()
read=lambda f:pathlib.Path(f).read_text()
s=read('src/avatar.js');s=s.replace("import { trainerDetails } from './avatartrainers.js'; // #2084\n",'',1)
s=s.replace('  const trainerParts = []; // appended together: all pre-existing vertices retain their order\n','',1)
s=s.replace("""    const upper = shape(sphere(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.105, 0.18, 0.27), (v) => {
      v.y *= 1 - 0.58 * smoothstep(-0.02, 0.12, v.z); v.y += -0.442; v.z += 0.055;
    });
    trainerParts.push(...trainerDetails(upper).map(part => ({ ...part, side: s })));
    add(upper, 'fixed', 'foot' + s, [0, SHIN, 0], 1, 0);""","""    add(shape(sphere(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.105, 0.18, 0.27), (v) => {
      v.y *= 1 - 0.58 * smoothstep(-0.02, 0.12, v.z); v.y += -0.442; v.z += 0.055;
    }), 'fixed', 'foot' + s, [0, SHIN, 0], 1, 0);""",1)
s=s.replace("""  for (const part of trainerParts) {
    add(part.geometry, 'fixed', 'foot' + part.side, [0, SHIN, 0], part.shade, part.colour ?? 0);
    if (part.colour === undefined) shoePart();
  }
""",'',1)
s=s.replace('const c = pal[r], s = base3[i * 3]; // #2084: old upper is exactly1; new panels inherit the chosen shoe tone','const c = pal[r], s = r === 5 ? 1 : base3[i * 3];',1)
assert s==old('src/avatar.js'),'avatar inverse'
s=read('src/config.js');a=s.index('// #2084: AVATAR_TRAINERS');b=s.index('export const AVATAR_CLOTHES',a);assert s[:a]+s[b:]==old('src/config.js')
a=json.loads(read('data/changelog.json'));b=json.loads(old('data/changelog.json'));assert a[1:]==b and a[0]['id']==1614
sha=lambda f:hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest()
files=['src/avatar.js','src/avatartrainers.js','src/config.js','src/avatarselfview.js','src/olof.js','src/ghosts.js','src/main.js','src/rest.js','src/remote-pose.js','src/reflections.js','src/hand.js','src/furniture.js','tools/avatartrainerstest.mjs','tools/avatartrainers2084.html','tools/avatartrainers2084browser.cjs']
proof={'baseline':base,'exactAvatarInverse':True,'exactConfigInverse':True,'originalChangelogRowsPreserved':len(b),'onlyNewChangelogId':1614,'sourceSha256':{f:sha(f) for f in files},'captureSha256':{str(p):sha(str(p)) for p in pathlib.Path('docs/verification/2084').glob('*.png')}}
pathlib.Path('docs/verification/2084/source.json').write_text(json.dumps(proof,indent=2)+'\n')
print('Exact avatar/config inverse; all original changelog rows preserved.')
