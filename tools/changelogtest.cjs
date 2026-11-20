// #2226: exercise the actual dependency-free functions and loader, without a browser/Three scene.
const fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
  const source = fs.readFileSync('src/changelog.js','utf8').replace(/^import .*;\n/gm,'');
  const { summarizeChangelog: group, markNew, loadChangelog } = await import('data:text/javascript;base64,'+Buffer.from('const CHANGELOG_NOTE={limit:100};\n'+source).toString('base64'));
  let checks=0;
  const check=(value,name)=>{ assert.ok(value,name); checks++; console.log('PASS '+name); };
  const mem=(o={})=>({o,getItem:k=>o[k]??null,setItem:(k,v)=>o[k]=String(v)});
  const raw=[{id:4,t:400,date:'2026-11-20',text:'Newest duck',group:'ducks',issues:[2202,2126]},
    {id:90,t:200,date:'2026-11-18',text:'Old duck',group:'ducks',issues:[2126,1921]},
    {id:3,t:100,date:'2026-11-17',text:'One cat',group:'cats',issues:[2125]},
    {id:2,t:90,date:'2026-11-16',text:'Unknown',group:'constructor'},
    {id:1,t:80,date:'2026-11-15',text:'Other'}];
  const freeze=JSON.stringify(raw), store=mem({'lunden.changelogSeen':'90'}), display=group(markNew(raw,store));
  check(display.length===4&&display[0].text==='Förbättrade ankor: utseende, läten och beteende (#1921, #2126, #2202)','same topic collapses with every unique sorted reference');
  check(display[0].id===4&&display[0].t===400&&display[0].date==='2026-11-20'&&display[0].isNew,'newest publication member supplies metadata; lower id can be new');
  check(display[1].text==='One cat'&&display[2].text==='Unknown'&&display[3].text==='Other','singleton, unknown and missing topic retain ordinary text and order');
  check(['constructor','toString','__proto__'].every(groupName=>group([{text:'Keep',group:groupName}])[0].text==='Keep'),'prototype names are unknown topics');
  check(JSON.stringify(group(display))===JSON.stringify(display),'presentation is idempotent including issue references');
  check(JSON.stringify(raw)===freeze,'original history untouched');
  check(!group(markNew(raw,mem())).some(e=>e.isNew),'first visit has no badges');
  check(!group(markNew(raw,store)).some(e=>e.isNew),'repeat visit has no badges');
  check(store.o['lunden.changelogSeen']==='90'&&store.o['lunden.changelogSeenT']==='400','seen markers track original history');
  check(group([{...raw[0],isNew:false},{...raw[1],isNew:true}])[0].isNew,'any member may supply New');
  const multi=group([...raw,{id:5,text:'Cat 2',group:'cats',issues:[2192]}]);
  check(multi.length===4&&multi[1].issues.join(',')==='2125,2192','separate topics each produce their own union');
  check(group([{text:'Legacy',group:'head-hits'}])[0].text==='Förbättringar för huvudträffar.','legacy singleton remains summarized');
  check(group([{...raw[0],issues:[1,1,-2,'9',null]},{...raw[1],issues:[2]}])[0].issues.join(',')==='1,2','invalid references cannot enter a summary');
  global.localStorage=mem({'lunden.changelogSeen':'90'});
  global.fetch=async()=>({ok:true,json:async()=>raw});
  const live=await loadChangelog();
  check(live.fresh&&live[0].isNew&&live.length===4,'real loader marks before grouping');
  check(localStorage.o['lunden.changelogCache']===freeze,'offline cache stores exact original rows with group/issues');
  let tries=0;global.fetch=async()=>{tries++;return {ok:false};};
  const offline=await loadChangelog();
  check(tries===3&&!offline.fresh&&!offline.some(e=>e.isNew),'existing three fetch attempts and offline return badge behavior');
  check(JSON.stringify(offline.map(e=>e.text))===JSON.stringify(live.map(e=>e.text)),'offline summaries match available cached history');
  localStorage.setItem('lunden.changelogSeen','999');await loadChangelog();
  check(localStorage.o['lunden.changelogSeen']==='999','partial cache never regresses seen id');
  const actual=JSON.parse(fs.readFileSync('data/changelog.json'));
  check(new Set(actual.map(e=>e.id)).size===actual.length&&actual.every((e,i)=>!i||actual[i-1].id>e.id),'history ids unique and descending');
  check(JSON.stringify(group(group(actual)))===JSON.stringify(group(actual)),'full real history projection is idempotent');
  const day=actual.filter(e=>e.date==='2026-11-18');
  check(group(day).length<day.length*0.8,'real November 18 window is substantially shorter');
  console.log(`ALL PASS ${checks}; Nov18 ${day.length} -> ${group(day).length} rows`);
})().catch(e=>{console.error(e);process.exitCode=1;});
