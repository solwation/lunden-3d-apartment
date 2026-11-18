import test from 'node:test';
import assert from 'node:assert/strict';
import { parquetLayout, fibreAt } from '../src/parquet.js';
import { FINISH, STANDARD, PARQUET_SURFACE as S } from '../src/config.js';

for (const [name, P] of [['Ek Chalk',FINISH.parquet],['standard three-stave',STANDARD.parquet]]) {
  test(`${name}: original metre repeat, stagger, dimensions and deterministic bounded tints`, () => {
    const L = parquetLayout(P), staves = P.staves ?? 1;
    assert.deepEqual(L,parquetLayout(P));
    assert.deepEqual(L.repeat,[1/(P.width*6),1/(P.length*2)]);
    assert.equal(L.width,Math.round(P.width*300)*6);assert.equal(L.height,Math.round(P.length*300)*2);
    for (const b of L.boards) {
      assert.ok(Object.values(b).every(Number.isFinite));
      assert.equal(b.w,Math.round(P.width*300)/staves);
      assert.equal(b.h,staves>1?Math.round(Math.round(P.length*300)/staves):Math.round(P.length*300));
      assert.ok(b.tint>=.93&&b.tint<=1.05);
    }
    for (let col=0;col<6*staves;col++) {
      const rows=L.boards.filter(b=>Math.abs(b.x-col*L.pw/staves)<1e-8);
      const offset=Math.round(((col*(staves>1?.53:.37))%1)*rows[0].h);
      assert.ok(rows[0].y===-offset);
      // The partial boards cut by the repeat edges carry the same tint and fibre seed.
      assert.equal(rows[0].tint,rows.at(-1).tint);assert.equal(rows[0].seed,rows.at(-1).seed);
      assert.equal(rows.at(-1).y-rows[0].y,L.height);
    }
  });
}

test('fibre paths are finite, smoothly curved, deterministic and limited to a few millimetres',()=>{
  for(const phase of [0,1,2,5]) {
    let curved=false;
    for(let i=0;i<100;i++) {
      const t=i/100,v=fibreAt(t,phase);
      assert.equal(v,fibreAt(t,phase));assert.ok(Number.isFinite(v)&&Math.abs(v)<=S.wave[1]+S.wave[4]);
      if(i>0&&i<99)curved ||= Math.abs(fibreAt(t+.01,phase)-2*v+fibreAt(t-.01,phase))>1e-7;
    }
    assert.ok(curved);
  }
});
