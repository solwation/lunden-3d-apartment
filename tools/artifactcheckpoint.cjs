// Test artifacts only. Callers explicitly whitelist code files and safe completed result fields.
// No environment/URL/input dump, no resume/skip, and no earlier PASS can complete the CLI.
const fs=require('node:fs'),path=require('node:path');const{createHash,randomUUID}=require('node:crypto');const{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const errorKind=e=>['Error','TypeError','RangeError','TimeoutError','SyntaxError','AbortError'].includes(e?.name)?e.name:'Error';
class ArtifactCheckpoint {
 constructor({output,mode,scenario,sources,sourceTrees=[]}){
  this.file=path.join(output,'result.json');fs.mkdirSync(output,{recursive:true});
  let revision=null;try{revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
  const files={};for(const name of sources){if(path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw Error('Source whitelist requires repository-relative paths');files[name]=createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');}
  const treeHashes={};for(const tree of sourceTrees){if(path.isAbsolute(tree)||tree.split(/[\\/]/).includes('..'))throw Error('Tree whitelist requires repository-relative paths');const hash=createHash('sha256');let count=0;const walk=folder=>{for(const entry of fs.readdirSync(path.join(root,folder),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(entry.name.startsWith('.'))continue;const name=path.posix.join(folder,entry.name);if(entry.isDirectory())walk(name);else if(entry.isFile()&&/\.(?:js|mjs)$/.test(name)){hash.update(name+'\0').update(fs.readFileSync(path.join(root,name))).update('\0');count++;}}};walk(tree);treeHashes[tree]={sha256:hash.digest('hex'),files:count};}
  this.state={schema:1,runId:randomUUID(),provenance:{revision,files,treeHashes,mode,scenario},snapshots:[],result:null,stages:{logic:{status:'incomplete',passed:null},images:{status:'incomplete',captures:[]},cleanup:{status:'not-required'},cli:{status:'incomplete',exitCode:null}}};this.write();
 }
 write(){const json=JSON.stringify(this.state,null,2)+'\n',temp=this.file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temp,json);fs.renameSync(temp,this.file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
 snapshot(label,data){const item={label,data:JSON.parse(JSON.stringify(data))};this.state.snapshots.push(item);this.write();}
 resourcesAcquired(){this.state.stages.cleanup.status='incomplete';this.write();}
 async capture(label,filename,take){const item={label,file:path.basename(filename),status:'incomplete'};this.state.stages.images.captures.push(item);this.write();try{await take();item.status='complete';this.write();}catch(e){item.status='failed';item.errorKind=errorKind(e);this.state.stages.images.status='failed';this.write();throw e;}}
 logicComplete(result,passed=true){this.state.result=JSON.parse(JSON.stringify(result));this.state.stages.logic.status='complete';this.state.stages.logic.passed=passed;this.write();}
 imagesComplete(){if(this.state.stages.images.captures.some(x=>x.status!=='complete'))throw Error('Cannot complete unfinished images');this.state.stages.images.status='complete';this.write();}
 cleanupComplete(){this.state.stages.cleanup.status='complete';this.write();}
 finish(code,error){const s=this.state.stages;if(error){s.cli.errorKind=errorKind(error);}if(code===0&&(s.logic.status!=='complete'||s.logic.passed!==true||s.images.status!=='complete'||!['complete','not-required'].includes(s.cleanup.status)))throw Error('Cannot pass an incomplete checkpoint');s.cli.status=code===0?'passed':'failed';s.cli.exitCode=code;this.write();}
}
module.exports={ArtifactCheckpoint};
