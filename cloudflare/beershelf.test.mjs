import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchShelf, selectBeers, imageData, beerShelfFetch } from './beershelf.js';
import { validBeerShelf } from '../src/beershelfschema.js';
const prepared = JSON.parse(await readFile(new URL('../data/beer-shelf-default.json', import.meta.url)));
function fixture() {
  const rows = prepared.beers.map(b => ({ ...b })), top = { version: 1, updatedAt: prepared.sourceUpdatedAt, globalByStyle: {} };
  for (const row of rows) (top.globalByStyle[row.style] ??= []).push(row);
  const entries = rows.map(b => ({ pid: b.pid, pn: b.pn, pk: b.type === 'can' ? 'Burk' : 'Glasflaska', v: b.ml, im: b.labelKind === 'product' ? b.imageURL : '' }));
  const products = [{ version: 1, entries }, { version: 1, entries: [] }], labels = [{ entries: rows.map(b => ({ pid: b.pid, i: b.imageURL })) }, null];
  return { rows, top, products, labels };
}
function mock(f) {
  return async url => {
    if (url.endsWith('/top-lists')) return Response.json(f.top);
    if (url.includes('/sb-products/')) return Response.json(url.includes('Imperial') ? f.products[0] : f.products[1]);
    if (url.includes('/enrichment/')) return Response.json(url.includes('Imperial') ? f.labels[0] : f.labels[1]);
    const row = prepared.beers.find(b => b.imageURL === url);
    return row ? new Response(Buffer.from(row.image.split(',')[1], 'base64')) : new Response('', { status: 404 });
  };
}
test('global ranking uses both IPA styles and normalised score, never personal/raw ranking', () => {
  const f = fixture(), extra = { ...f.rows[0], pn: '123456', pid: '987654', name: 'lower global, higher raw', rating: 4.9, normalizedRating: 3 };
  f.top.globalByStyle[extra.style].push(extra);f.products[0].entries.push({ ...f.products[0].entries[0], pn: extra.pn, pid: extra.pid });
  const rows = selectBeers(f.top, f.products, f.labels);
  assert.deepEqual(rows.map(b => b.pn), prepared.beers.map(b => b.pn));assert.deepEqual(rows.map(b => b.group), ['DIPA','DIPA','TIPA','TIPA']);
});
test('metadata determines actual can/bottle type and volume; missing SB photo uses its real Untappd label', () => {
  const f=fixture();f.products[0].entries[0].pk='Glasflaska';f.products[0].entries[0].v=330;
  const rows=selectBeers(f.top,f.products,f.labels);assert.equal(rows[0].type,'bottle');assert.equal(rows[0].ml,330);assert.equal(rows[3].labelKind,'label');assert.equal(rows[3].imageURL,prepared.beers[3].imageURL);
});
test('complete response includes all metadata and validated image bytes from fixed allowed source hosts', async()=>{
  const f=fixture(), result=await fetchShelf({fetcher:mock(f)});assert.ok(validBeerShelf(result));assert.ok(result.fetchedAt>0);
  assert.deepEqual(result.beers.map(b=>b.image),prepared.beers.map(b=>b.image));
});
test('missing category, malformed rank, changed product id, unknown packaging or untrusted image never yields a partial selection',()=>{
  for(const damage of [f=>delete f.top.globalByStyle[f.rows[3].style],f=>f.top.globalByStyle[f.rows[0].style][0].normalizedRating=NaN,
    f=>f.products[0].entries[0].pid='111',f=>f.products[0].entries[0].pk='unknown',f=>f.products[0].entries[0].im='http://localhost/internal']){
    const f=fixture();damage(f);assert.throws(()=>selectBeers(f.top,f.products,f.labels));}
});
test('one failed/truncated/oversized image rejects the entire update',async()=>{
  const f=fixture(), good=mock(f), image=prepared.beers[0].imageURL;
  for(const response of [()=>new Response('',{status:404}),()=>new Response(new Uint8Array(10)),()=>new Response(new Uint8Array(300001))]){
    await assert.rejects(fetchShelf({fetcher:url=>url===image?response():good(url)}));}
  assert.throws(()=>imageData(new Uint8Array(24)));
});
test('an aborted or failed upstream is retryable and does not write a successful Worker day-cache',async()=>{
  const original=globalThis.fetch;let requests=0,writes=0;
  try{globalThis.fetch=async()=>{requests++;throw Error('offline')};const req=new Request('https://lunden/beer-shelf'),env={LUNDEN:{put:async()=>writes++}};
    assert.equal((await beerShelfFetch(req,env,{})).status,503);const first=requests;
    assert.equal((await beerShelfFetch(req,env,{})).status,503);assert.ok(requests>first);assert.equal(writes,0);
    assert.equal((await beerShelfFetch(new Request(req.url,{method:'POST'}),env,{})).status,405);
  }finally{globalThis.fetch=original;}
});


test('source redirects fail the batch without following another host (edge-compatible manual mode)', async () => {
  await assert.rejects(fetchShelf({fetcher: async (url, options) => {
    assert.equal(options.redirect, 'manual');
    return new Response('', {status: 302, headers: {Location: 'https://example.com'}});
  }}), /source response 302/);
});
