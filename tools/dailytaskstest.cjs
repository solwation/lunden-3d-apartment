// #993/#994: actual task/life/score modules and the real DOM/card canvas; no World or WebGL.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [base='http://localhost:8870',out='/tmp/lunden-priority-994/native']=process.argv.slice(2),root=path.resolve(__dirname,'..');
fs.mkdirSync(out,{recursive:true});
function processRecord(){
 const all=new Map();for(const id of fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x))){try{const raw=fs.readFileSync('/proc/'+id+'/stat','utf8'),fields=raw.slice(raw.lastIndexOf(')')+2).trim().split(/\s+/);all.set(+id,{pid:+id,ppid:+fields[1],startTicks:fields[19],cwd:fs.readlinkSync('/proc/'+id+'/cwd'),argv:fs.readFileSync('/proc/'+id+'/cmdline').toString().split('\0').filter(Boolean)});}catch{}}
 const own=new Set([process.pid]);for(let n=0;n<8;n++)for(const row of all.values())if(own.has(row.ppid))own.add(row.pid);
 const rows=[];for(const row of all.values())if(own.has(row.pid)||(row.cwd===root&&row.argv[0]==='python3'&&row.argv[1]==='tools/devserve.py'&&row.argv[2]==='8870')){row.sockets={};try{for(const fd of fs.readdirSync('/proc/'+row.pid+'/fd')){try{const v=fs.readlinkSync('/proc/'+row.pid+'/fd/'+fd);if(v.startsWith('socket:'))row.sockets[fd]=v;}catch{}}}catch{}rows.push(row);}
 fs.writeFileSync(`${out}/processes.json`,JSON.stringify({capturedUptime:require('node:os').uptime(),processes:rows,tcp:fs.readFileSync('/proc/net/tcp','utf8'),tcp6:fs.readFileSync('/proc/net/tcp6','utf8')},null,2));
}
const hashes=Object.fromEntries(cp.execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(p=>p&&fs.existsSync(path.join(root,p))).concat('tools/dailytaskstest.cjs').map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
fs.writeFileSync(`${out}/source.json`,JSON.stringify({head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),hashes},null,2));
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:900,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
await page.addInitScript(()=>{window.glRequests=0;const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){if(/webgl/i.test(k)){glRequests++;throw Error('daily task fixture forbids WebGL');}return get.call(this,k,...a);};});
await page.route('**/src/bootstrap.js*',r=>r.fulfill({contentType:'text/javascript',body:'// native component test'}));await page.goto(base);processRecord();
const result=await page.evaluate(async()=>{
 const T=await import('three'),{TasksManager}=await import('/src/tasks.js'),{Life}=await import('/src/life.js'),S=await import('/src/stats.js');const {TASK_POOL,SCORE}=await import('/src/config.js');
 const rows=[],check=(ok,label)=>rows.push({ok:!!ok,label});window.results=rows;
 for(const el of document.body.children)if(el.id!=='task-note'&&el.tagName!=='SCRIPT')el.style.display='none';
 S.resetStats();let date=new Date(2026,9,14,23,59,50),randomCalls=0;const scene=new T.Scene(),camera=new T.PerspectiveCamera();scene.add(camera);
 const life=new Life({scene,camera,persist:{key:'fixture.home',canSave:()=>true}});life.worktopAt=p=>p[0]===2&&p[2]===2;
 const tasks=new TasksManager({life,scene,now:()=>date,random:()=>{randomCalls++;return .999;}});window.tasks=tasks;window.life=life;
 const task=id=>tasks.tasks.find(t=>t.id===id),ids=()=>tasks.selected.join(),beforeIds=ids();
 check(tasks.localDay()==='2026-10-14','real local calendar key, independent of simulated game clock');
 check(tasks.selected.length===3&&new Set(tasks.selected).size===3,'fresh day selects three unique tasks');
 check(!tasks.isShown('tidyHall')&&!tasks.isShown('grillChicken'),'hidden tasks excluded before discovery');
 const persisted=JSON.parse(localStorage.getItem('lunden.stats'));check(persisted.taskDay.selected.join()===beforeIds,'initial daily set persists immediately without waiting for home timer');
 const modal=document.getElementById('task-note'),list=document.getElementById('task-list');tasks.bindUI({modalEl:modal,listEl:list,hintsBtn:document.getElementById('task-hints-btn'),closeBtn:document.getElementById('task-close'),onClose:()=>tasks.showUI(false)});
 tasks.showUI();check(!modal.hidden&&document.querySelectorAll('.task-card').length===3,'actual task panel opens with three cards');
 check(tasks.isShown('tidyHall')&&!tasks.isShown('grillChicken')&&ids()===beforeIds,'reading discovers hall without replacing fixed daily set or revealing chicken');
 tasks.discover('grillChicken');check(ids()===beforeIds&&tasks.isShown('grillChicken'),'chicken discovery remembered for later days without daily replacement');
 const cabinet={door:new T.Group(),innerFace:{x:0,width:.5,height:.8},isOpen:false};tasks.build3DCard(cabinet);const p0=tasks.card.object.getWorldPosition(new T.Vector3());check(tasks.card.blocked,'existing paper refuses reading through closed cabinet');cabinet.isOpen=true;cabinet.door.rotation.y=1;cabinet.door.updateMatrixWorld(true);check(!tasks.card.blocked&&tasks.card.object.getWorldPosition(new T.Vector3()).distanceTo(p0)>.01,'single paper follows unchanged cabinet hinge and opens with it');
 // Actual Cooking/Life actions, not hand-written task goal calls.
 const bread=life.create('breadSlice',{at:'world',pos:[2,.9,2],yaw:0});life.create('cheeseSlice',{at:'hand'});const row=(id,it)=>life.options(it?{item:life.view(it)}:{instance:life.items.held()}).find(o=>o.id===id);
 const topping=row('addTopping',bread);check(topping&&!topping.reason,'real sandwich topping action available');topping?.run();life.update(.1);check(task('makeSandwich').completedGoals.has('prep')&&!task('makeSandwich').isDone,'actual preparation only completes first subgoal');
 life.view(bread).take();for(let i=0;i<5&&life.items.get(bread.id);i++){row('eat')?.run();for(let n=0;n<10;n++)life.update(.1);}
 check(task('makeSandwich').isDone&&!life.items.get(bread.id),'actual last bite completes sandwich task');
 const count=S.stats.tasks,points=S.totalScore();life.emit('ate',{type:'breadSlice',parts:['cheese']});tasks.renderUI();tasks.update(3600*48);
 check(S.stats.tasks===count&&S.totalScore()===points&&ids()===beforeIds,'repeated events/rendering and simulated48hours cannot reroll or reward twice');
 check(task('makeSandwich').active&&list.querySelector('.task-card.done'),'completed task stays selected and visibly checked');
 const partial=tasks.save();life.emit('washed',{what:'cup'});const partial2=tasks.save();check(partial2.tasks.resetKitchen.goals.includes('dishes'),'ordinary domain event preserves kitchen partial goal');
 const scoreBefore=S.totalScore(),countsBefore=S.stats.tasks;tasks.load(partial2);check(S.totalScore()===scoreBefore&&S.stats.tasks===countsBefore&&task('makeSandwich').isDone,'v3 restore preserves progress and never replays reward');
 const calls=randomCalls;tasks.update(0);tasks.showUI();check(randomCalls===calls&&ids()===beforeIds,'same-day open/update/load does not use randomness again');
 const img=document.createElement('img');img.id='daily-paper';img.src=tasks.cardTexture.image.toDataURL();img.style.cssText='position:fixed;right:8px;top:8px;width:192px;z-index:100000';document.body.append(img);
 const originalHome=JSON.stringify(life.items.serialize());date=new Date(2026,9,15);tasks.random=()=>.999;tasks.update(0);check(tasks.day==='2026-10-15'&&tasks.selected.length===3&&tasks.tasks.every(t=>!t.completedGoals.size&&!t.isDone),'open session calendar midnight resets only daily progress');
 check(S.totalScore()===scoreBefore&&JSON.stringify(life.items.serialize())===originalHome,'daily rollover preserves total score and all home items');
 const r=S.taskReward('makeSandwich'),oldscore=S.totalScore();life.emit('ate',{type:'breadSlice',parts:['cheese']});check(task('makeSandwich').isDone&&S.totalScore()===oldscore+r&&r===SCORE.tasks.makeSandwich.again,'same task next real day earns defined repeat reward once');
 const future=tasks.save();date=new Date(2026,9,25);tasks.load(future);check(tasks.day==='2026-10-25'&&tasks.tasks.every(t=>!t.completedGoals.size&&!t.isDone),'return after ten days creates one current daily set without replaying absent days');
 // Valid small pool stays understandable and fixed on load.
 tasks.load({v:3,day:tasks.localDay(),selected:['washDish'],shown:tasks.shownIds(),tasks:{}});check(tasks.selected.length===1&&list.textContent.includes('1 tillgängliga'),'small available set is explicit and does not invent duplicates');
 tasks.load({v:3,day:tasks.localDay(),selected:['makeSandwich','makeSandwich','unknown'],shown:[],tasks:{makeSandwich:{goals:['prep','unknown']}}});check(new Set(tasks.selected).size===3&&!tasks.selected.includes('unknown')&&task('makeSandwich').completedGoals.size===1,'corrupt/newer ids repaired uniquely and unknown goals filtered');
 const receiptDay=tasks.localDay();life.emit('ate',{type:'breadSlice',parts:['cheese']});const paidScore=S.totalScore();tasks.load({v:3,day:receiptDay,selected:['makeSandwich','resetKitchen','snackClean'],shown:[],tasks:{}});check(task('makeSandwich').isDone&&S.totalScore()===paidScore,'independent score receipt prevents stale home from losing completion or paying twice');
 S.resetStats();tasks.load({v:2,elapsed:999,active:['makeSandwich','resetKitchen','snackClean'],shown:[],tasks:{makeSandwich:{goals:['prep','eat'],done:true,completions:1},resetKitchen:{goals:['dishes']}}});check(tasks.save().v===3&&task('makeSandwich').isDone&&task('resetKitchen').completedGoals.has('dishes')&&S.stats.tasks===0,'v2 migration retains completed and partial goals without retrospective reward');
 tasks.load({v:1,goals:{makeSandwich:['prep','unknown']}});check(task('makeSandwich').completedGoals.size===1&&S.stats.tasks===0,'v1 migration filters unknown goals and never awards');
 // Actual HallCare stock and ordinary Items action routes; no apartment meshes/renderer.
 const {HallCare}=await import('/src/hallcare.js');const hallRoot=new T.Group();hallRoot.userData.hallCare={jacket:[0,1,0],shoes:[0,0,0]};scene.add(hallRoot);
 life.storeTargets=[];const care=new HallCare(life,{looseItems:[],furniture:{movable:[{object:hallRoot}]}});tasks.read();life.emit('tasksShown',{ids:tasks.shownIds(),added:[]});
 const jacket=life.items.ofType('hallJacket')[0],shoes=life.items.ofType('hallShoes')[0];check(jacket&&shoes,'actual hall discovery restocks one original floor pair');
 tasks.load({v:3,day:tasks.localDay(),selected:['tidyHall','washDish','makeBed'],shown:tasks.shownIds(),tasks:{}});
 const act=(target,id)=>life.options(target).find(a=>a.id===id)?.run();act(life.view(jacket).takeTarget,'take');act(care.stores.get('hallCoatRack').target,'putIn');
 check(task('tidyHall').completedGoals.has('hallJacket')&&!task('tidyHall').isDone,'actual hall jacket action ticks only its real subgoal');act(life.view(shoes).takeTarget,'take');act(care.stores.get('hallShoeRack').target,'putIn');
 check(task('tidyHall').isDone&&!tasks.available(task('tidyHall')),'actual shoe action completes selected hall and makes already-tidy hall unavailable');
 const hallBefore=JSON.stringify(life.items.serialize());date=new Date(2026,9,28);tasks.update(0);check(!tasks.selected.includes('tidyHall')&&JSON.stringify(life.items.serialize())===hallBefore,'next day excludes completed hall without undoing tidying or moving items');
 // Seed actual reload acceptance for a separate new document/manager/stats module.
 S.resetStats();tasks.now=()=>new Date(2026,9,14);tasks.load({v:3,day:'2026-10-14',selected:['makeSandwich','resetKitchen','snackClean'],shown:[],tasks:{}});life.emit('ate',{type:'breadSlice',parts:['cheese']});life.emit('washed',{what:'cup'});life.flush();
 tasks.showUI();
 localStorage.setItem('fixture.expected',JSON.stringify({selected:tasks.selected,points:S.totalScore(),tasks:S.stats.tasks,record:tasks.save()}));
 tasks.showUI();img.src=tasks.cardTexture.image.toDataURL();check(glRequests===0,'all daily component and paper checks use zero WebGL');return rows;
});
await page.screenshot({path:`${out}/daily-progress.png`});fs.writeFileSync(`${out}/before-reload.json`,JSON.stringify(result,null,2));
await page.reload();const reload=await page.evaluate(async()=>{const T=await import('three'),{Life}=await import('/src/life.js'),{TasksManager}=await import('/src/tasks.js'),S=await import('/src/stats.js');const life=new Life({scene:new T.Scene(),camera:new T.PerspectiveCamera(),persist:{key:'fixture.home',canSave:()=>true}}),tasks=new TasksManager({life,now:()=>new Date(2026,9,14),random:()=>{throw Error('same-day restoration must not draw');}});life.restore();const e=JSON.parse(localStorage.getItem('fixture.expected'));const rows=[];const check=(ok,label)=>rows.push({ok:!!ok,label});check(JSON.stringify(tasks.selected)===JSON.stringify(e.selected)&&JSON.stringify(tasks.save())===JSON.stringify(e.record),'actual reload reconstructs same daily selection and goal progress');check(S.totalScore()===e.points&&S.stats.tasks===e.tasks,'actual reload preserves score without replay');life.emit('ate',{type:'breadSlice',parts:['cheese']});check(S.totalScore()===e.points&&S.stats.tasks===e.tasks,'actual reload duplicate completion event cannot repay');
for(const el of document.body.children)if(el.id!=='task-note'&&el.tagName!=='SCRIPT')el.style.display='none';
tasks.bindUI({modalEl:document.getElementById('task-note'),listEl:document.getElementById('task-list'),hintsBtn:document.getElementById('task-hints-btn'),closeBtn:document.getElementById('task-close'),onClose:()=>tasks.showUI(false)});tasks.showUI();life.worktopAt=()=>true;S.setBadgeElement(document.getElementById('badges'));
const {SCORE}=await import('/src/config.js');const due=S.taskReward('resetKitchen')+S.taskReward('snackClean');
life.emit('wipe',{point:{x:2,y:.9,z:2}});check(tasks.bonusPoints===null&&S.stats.taskBonusPoints===0,'first two daily completions cannot award whole-set bonus');
const writes=[],set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lunden.stats')writes.push(JSON.parse(v));return set.call(this,k,v);};
life.emit('vacuumed',{amount:1});Storage.prototype.setItem=set;
check(tasks.activeTasks().length===3&&tasks.activeTasks().every(t=>t.isDone),'all three completed tasks stay checked in fixed set');
check(S.totalScore()===e.points+due+SCORE.taskDayBonus&&S.stats.tasks===e.tasks+2,'third task gives its individual reward and exactly one configured whole-set bonus');
check(writes.length===1&&writes[0].taskBonusPoints===SCORE.taskDayBonus&&writes[0].taskDay.bonusPoints===SCORE.taskDayBonus&&writes[0].taskRewardDays[tasks.day].length===3,'third individual count/receipt and daily bonus commit together in one actual storage write');
check(document.querySelector('.task-bonus')?.textContent.includes('Alla uppdrag avklarade'),'actual existing panel shows exact completion phrase and bonus');
check(document.getElementById('badges').textContent.includes('Alla uppdrag avklarade'),'existing score badge carries exact completion phrase');
const done=S.totalScore();life.emit('vacuumed',{amount:1});life.emit('wipe',{point:{x:2,y:.9,z:2}});tasks.renderUI();tasks.update(3600*48);check(S.totalScore()===done,'completed full-set repeated events/rendering/simulated time do not repay');
tasks.build3DCard({door:new T.Group(),innerFace:{x:0,width:.5,height:.8},isOpen:true});const img=new Image();img.src=tasks.cardTexture.image.toDataURL();img.style.cssText='position:fixed;right:8px;top:8px;width:192px;z-index:100000';document.body.append(img);
localStorage.setItem('fixture.bonusExpected',JSON.stringify({score:done,individuals:S.stats.tasks,day:tasks.day,amount:SCORE.taskDayBonus,record:tasks.save(),write:writes[0]}));return rows;});
result.push(...reload);await page.screenshot({path:`${out}/daily-complete.png`});
await page.locator('#task-hints-btn').click();result.push({ok:await page.locator('#task-hints-btn').getAttribute('aria-pressed')==='false',label:'actual existing hint button works'});
await page.reload();const bonus=await page.evaluate(async()=>{
 const T=await import('three'),{Life}=await import('/src/life.js'),{TasksManager}=await import('/src/tasks.js'),S=await import('/src/stats.js'),{SCORE}=await import('/src/config.js');
 const life=new Life({scene:new T.Scene(),camera:new T.PerspectiveCamera()}),tasks=new TasksManager({life,now:()=>new Date(2026,9,14),random:()=>.999}),e=JSON.parse(localStorage.getItem('fixture.bonusExpected')),proof={first:e},rows=[],check=(ok,label)=>rows.push({ok:!!ok,label});
 check(tasks.bonusPoints===e.amount&&S.totalScore()===e.score&&S.stats.tasks===e.individuals,'actual second document reload preserves paid bonus and individual count');
 tasks.load({v:3,day:tasks.day,selected:['makeSandwich','resetKitchen','snackClean'],shown:[],tasks:{}});life.emit('ate',{type:'breadSlice',parts:['cheese']});life.emit('vacuumed',{amount:1});check(S.totalScore()===e.score&&tasks.bonusPoints===e.amount&&tasks.activeTasks().every(t=>t.isDone),'stale home record and duplicate events restore receipts without repayment');
 const original=SCORE.taskDayBonus;SCORE.taskDayBonus=99;check(S.totalScore()===e.score&&tasks.bonusPoints===e.amount&&S.taskBonusFor(tasks.day)===e.amount,'later bonus tuning preserves previously awarded total and displayed amount');
 tasks.now=()=>new Date(2026,9,15);tasks.update(0);life.worktopAt=()=>true;const individual=tasks.activeTasks().reduce((n,t)=>n+S.taskReward(t.id),0),before=S.totalScore();
 life.emit('ate',{type:'breadSlice',parts:['cheese']});life.emit('washed',{what:'cup'});life.emit('wipe',{point:{x:2,y:.9,z:2}});life.emit('vacuumed',{amount:1});
 check(tasks.bonusPoints===99&&S.totalScore()===before+individual+99&&S.stats.taskBonusPoints===e.amount+99,'next real day can award new bonus using new amount while retaining old earned points');
 proof.nextDay=JSON.parse(localStorage.getItem('lunden.stats'));const earned=S.totalScore();SCORE.taskDayBonus=original;check(S.totalScore()===earned,'restoring config cannot rewrite earned bonus points');
 tasks.now=()=>new Date(2026,9,16);tasks.load({v:3,day:tasks.localDay(),selected:['makeSandwich','snackClean'],shown:[],tasks:{}});const smallBefore=S.stats.taskBonusPoints;life.emit('ate',{type:'breadSlice',parts:['cheese']});life.emit('vacuumed',{amount:1});
 check(tasks.selected.length===2&&tasks.activeTasks().every(t=>t.isDone)&&tasks.bonusPoints===null&&S.stats.taskBonusPoints===smallBefore,'completed small pool below three never receives whole-set bonus');
 proof.smallPool=tasks.save();S.resetStats();const goals=Object.fromEntries(tasks.tasks.filter(t=>['makeSandwich','resetKitchen','snackClean'].includes(t.id)).map(t=>[t.id,{goals:t.goals.map(g=>g.id),done:true,completions:1}]));
 for(const v of [1,2]){tasks.load(v===1?{v:1,goals:Object.fromEntries(Object.entries(goals).map(([id,t])=>[id,t.goals]))}:{v:2,active:Object.keys(goals),tasks:goals});tasks.renderUI();tasks.update(3600);check(tasks.activeTasks().every(t=>t.isDone)&&tasks.bonusPoints===null&&S.stats.taskBonusPoints===0&&S.totalScore()===0,'legacy v'+v+' all-complete migration never retroactively awards bonus');}
 proof.legacy=JSON.parse(localStorage.getItem('lunden.stats'));
const prior=JSON.parse(JSON.stringify(e.write));delete prior.taskBonusDays;delete prior.taskBonusPoints;delete prior.taskDay.bonusPoints;localStorage.setItem('lunden.stats',JSON.stringify(prior));localStorage.setItem('fixture.upgradeExpected',JSON.stringify({score:e.score,individuals:e.individuals,amount:e.amount,record:prior.taskDay}));proof.pre994=prior;
check(glRequests===0,'bonus and reload checks use zero WebGL');return{rows,proof};});
result.push(...bonus.rows);fs.writeFileSync(`${out}/bonus-proof.json`,JSON.stringify(bonus.proof,null,2));
// Two real documents: legitimate already-paid #993 v3 set upgrades once, then stays paid.
for(const pass of [1,2]){await page.reload();const upgrade=await page.evaluate(async pass=>{
 const T=await import('three'),{Life}=await import('/src/life.js'),{TasksManager}=await import('/src/tasks.js'),S=await import('/src/stats.js'),e=JSON.parse(localStorage.getItem('fixture.upgradeExpected'));const writes=[],set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lunden.stats')writes.push(JSON.parse(v));return set.call(this,k,v);};
 const life=new Life({scene:new T.Scene(),camera:new T.PerspectiveCamera()}),tasks=new TasksManager({life,now:()=>new Date(2026,9,14),random:()=>{throw Error('upgrade cannot reroll existing daily set');}});Storage.prototype.setItem=set;
 const rows=[],check=(ok,label)=>rows.push({ok:!!ok,label});check(S.totalScore()===e.score&&S.stats.tasks===e.individuals&&tasks.bonusPoints===e.amount,'pre994 legitimate v3 upgrade/reload'+pass+' preserves individual counts and pays bonus once');
 check(pass===1?writes.length===1&&writes[0].taskBonusPoints===e.amount&&writes[0].taskDay.bonusPoints===e.amount:writes.length===0,'v3 upgrade/reload'+pass+' atomic bonus write is idempotent');
 tasks.load(e.record);tasks.update(3600*24);life.emit('vacuumed',{amount:1});check(S.totalScore()===e.score&&tasks.bonusPoints===e.amount,'v3 upgrade stalehome/update'+pass+' never replays either reward');return{rows,stored:JSON.parse(localStorage.getItem('lunden.stats')),writes};},pass);result.push(...upgrade.rows);fs.writeFileSync(`${out}/upgrade${pass}.json`,JSON.stringify(upgrade,null,2));}
// Existing independent compact-save and real Chicken/Grill fixtures, without rendering.
for(const name of ['savecompacttest','grilltasktest','statsresettest']){await page.goto(base);await page.evaluate(()=>localStorage.clear());await page.goto(`${base}/tools/${name}.html`);await page.waitForFunction(()=>/ALL PASS|SOME FAILED|^FAIL/.test(document.querySelector('#out')?.textContent||''),{timeout:20000});const text=await page.locator('#out').innerText();fs.writeFileSync(`${out}/${name}.txt`,text);result.push({ok:text.includes('ALL PASS')&&!text.split('\n').some(x=>x.startsWith('FAIL')),label:`existing ${name}`});if(name==='grilltasktest')await page.screenshot({path:`${out}/chicken-paper.png`});}
result.push({ok:!errors.length,label:'zero page errors'});fs.writeFileSync(`${out}/result.json`,JSON.stringify({checks:result.length,failures:result.filter(x=>!x.ok).length,errors,rows:result},null,2));console.log(JSON.stringify(result));process.exitCode=result.some(x=>!x.ok)?1:0;
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
