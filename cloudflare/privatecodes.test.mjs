import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { sha256, isPrivateCode, privateCodeCredential, isPrivateCredential, layoutWriteCredential } from '../src/privatecodes.js';
const { loadSecretTestInputs } = createRequire(import.meta.url)('../tools/secret-test-inputs.cjs');
const { codes } = loadSecretTestInputs();
const native = value => createHash('sha256').update(value,'utf8').digest('hex');
test('synchronous SHA-256 matches known answers, block boundaries and UTF-8 including surrogate replacement',()=>{
 assert.equal(sha256(''),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
 assert.equal(sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 for (const value of ['a'.repeat(55),'a'.repeat(56),'a'.repeat(63),'a'.repeat(64),'a'.repeat(65),'a'.repeat(1000000),'Lägenhet 🐈','\ud800','\udc00','a\ud800b']) assert.equal(sha256(value),native(value));
 assert.throws(()=>sha256(null),TypeError);
});
test('both explicitly provisioned real inputs match exact framed hashes, not normalization or coercion',()=>{
 for (const code of codes) {
  assert.equal(isPrivateCode(code),true,'real provisioned input must match');
  const credential=privateCodeCredential(code);
  assert.equal(credential.version,1);assert.equal(credential.digest,native('lunden/private-layout/v1\0'+code));
  assert.equal(isPrivateCredential(credential),true);
  for (const input of [null,42,{},'wrong',code.toUpperCase(),` ${code}`,`${code} `,code.replace(' ','  '),`/${code}`]) {
   assert.equal(isPrivateCode(input),false);assert.equal(privateCodeCredential(input),null);
  }
 }
 assert.equal(isPrivateCredential(layoutWriteCredential()),true);
 assert.deepEqual(layoutWriteCredential(),privateCodeCredential(codes[0]));
 const mutable=layoutWriteCredential();mutable.digest='wrong';assert.equal(isPrivateCredential(layoutWriteCredential()),true);
});
