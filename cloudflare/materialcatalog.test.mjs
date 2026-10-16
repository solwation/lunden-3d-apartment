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
