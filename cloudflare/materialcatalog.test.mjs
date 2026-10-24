import test from 'node:test';
import assert from 'node:assert/strict';

test('neutral textile shades validate per family while existing choices still resolve (#1070)', async () => {
 const M=await import('../src/materialcatalog.js');
 const shades=['white','cream','greige','taupe','lightgrey','midgrey','charcoal','black'];
 for(const [list,prefix] of [[M.MATERIAL_CHOICES,'rug'],[M.CURTAIN_MATERIAL_CHOICES,'curtain'],[M.UPHOLSTERY_MATERIAL_CHOICES,'upholstery']]){
  const ids=list.map(c=>c.id);assert.equal(new Set(ids).size,ids.length);
  for(const s of shades)assert.ok(ids.includes(`${prefix}-${s}`),`${prefix}-${s}`);
  for(const c of list.filter(c=>c.id!=='original'))assert.match(c.color,/^#[0-9a-f]{6}$/);
 }
 for(const id of ['rug-sand','rug-check','curtain-sand','upholstery-stripe','upholstery-check'])assert.ok(M.materialChoice(id));
 const sofa=M.UPHOLSTERY_MATERIAL_IDS[0],rug=M.RUG_MATERIAL_IDS[0],curtain=M.CURTAIN_MATERIAL_IDS[0];
 assert.ok(M.validMaterialChoice(sofa,'textile','upholstery-charcoal'));assert.ok(M.validMaterialChoice(rug,'textile','rug-greige'));
 assert.ok(M.validMaterialChoice(curtain,'textile','curtain-white'));assert.ok(!M.validMaterialChoice(rug,'textile','curtain-white'));
 const [towel,[surface]]=Object.entries(M.TOWEL_MATERIAL_SURFACES)[0];assert.ok(M.validMaterialChoice(towel,surface,'upholstery-black'));
});

test('every rug accepts a short/long pile surface; other families and choices do not (#1086)', async () => {
 const M=await import('../src/materialcatalog.js');
 assert.deepEqual(M.materialChoices('lugg').map(c=>c.id),['original','pile-long']);
 assert.equal(M.RUG_MATERIAL_IDS.length,6);
 for(const rug of M.RUG_MATERIAL_IDS){
  for(const c of ['original','pile-long'])assert.ok(M.validMaterialChoice(rug,'pile',c),`${rug} ${c}`);
  for(const c of ['rug-sand','pile-short','upholstery-black',undefined])assert.ok(!M.validMaterialChoice(rug,'pile',c));
  assert.ok(M.validMaterialChoice(rug,'textile','rug-sand')); // colour choices stay on the textile surface
 }
 for(const id of [M.CURTAIN_MATERIAL_IDS[0],M.UPHOLSTERY_MATERIAL_IDS[0],'f-rug-0-9-9-0-0'])assert.ok(!M.validMaterialChoice(id,'pile','pile-long'));
 assert.equal(M.materialChoice('pile-long').name,'Lång lugg');
});

test("Olof's desk shape is a 'variant' surface of the actual desk only (#1569)", async () => {
 const M=await import('../src/materialcatalog.js');
 assert.deepEqual(M.DESK_VARIANT_IDS,['f-tillydesk-1-2.292-9.43-0-0']);
 const desk=M.DESK_VARIANT_IDS[0];
 for(const c of ['original','corner'])assert.ok(M.validMaterialChoice(desk,'variant',c),c);
 for(const c of ['straight','upholstery-black',undefined])assert.ok(!M.validMaterialChoice(desk,'variant',c));
 for(const id of [M.RUG_MATERIAL_IDS[0],M.UPHOLSTERY_MATERIAL_IDS[0],'f-tillydesk-1-0-0-0-0'])assert.ok(!M.validMaterialChoice(id,'variant','corner'));
 assert.ok(!M.validMaterialChoice(desk,'textile','upholstery-black')); // a shape, never a material-library surface
});
