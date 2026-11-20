import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createNesScoreReader } from '../src/nesboards.js';

const { NES, Controller } = createRequire(import.meta.url)('./retro2231/vendor/jsnes.js');
const rom = file => readFile(new URL(file, import.meta.url));

test('the real MIT cartridge scores one catch; any different ROM has no reader', async () => {
  const bytes = await rom('./retro2231/lightcatch.nes');
  const emulator = new NES({ emulateSound: false });
  emulator.loadROM(bytes.toString('latin1'));
  const reader = await createNesScoreReader(bytes);
  assert.equal(reader.game, 'nes-lightcatch');
  for (let i = 0; i < 220; i++) {
    if (i === 100) emulator.buttonDown(1, Controller.BUTTON_RIGHT);
    emulator.frame();
    reader.sample(emulator.cpu.mem);
  }
  assert.equal(reader.result().score, 1);
  assert.equal(reader.result().ms, Math.round(220000 / 60));
  bytes[bytes.length - 1] ^= 1;
  assert.equal(await createNesScoreReader(bytes), null);
});

test('Thwaite reads base-100 score only in ordinary solo play', async () => {
  const reader = await createNesScoreReader(await rom('../data/nes/homebrew/thwaite/thwaite.nes'));
  const ram = new Uint8Array(2048);
  ram[0x3c] = 2; ram[0x3d] = 1; ram[0x3d5] = 12; ram[0x3d6] = 34;
  ram[0x54] = 3; reader.sample(ram);
  assert.equal(reader.result(), null);
  ram[0x54] = 0; ram[0x3d] = 2; reader.sample(ram);
  assert.equal(reader.result(), null);
  ram[0x3d] = 1; reader.sample(ram);
  assert.equal(reader.result().score, 1234);
});

test('LAN Master credits a completed level, excluding password jumps', async () => {
  const reader = await createNesScoreReader(await rom('../data/nes/homebrew/lan-master/lan-master.nes'));
  const ram = new Uint8Array(2048);
  ram[0xb7] = 1; reader.sample(ram);
  ram[0xb7] = 0; ram[0xd7] = 18; reader.sample(ram);
  assert.equal(reader.result(), null);
  ram[0xbe] = 0xae; ram[0xbf] = 0xed; ram[0xc7] = 100; reader.sample(ram);
  assert.equal(reader.result(), null);
  ram[0xd7] = 1; reader.sample(ram);
  assert.equal(reader.result().score, 1);
});

test('Lawn Mower reads completed lawns; its built-in level skip invalidates the sample', async () => {
  const reader = await createNesScoreReader(await rom('../data/nes/homebrew/lawn-mower/lawn-mower.nes'));
  const ram = new Uint8Array(2048);
  ram[0xca] = 2; ram[0xb4] = 1; reader.sample(ram);
  assert.equal(reader.result(), null);
  ram[0xb4] = 0; reader.sample(ram);
  assert.equal(reader.result().score, 2);
  ram[0xca] = 0; reader.sample(ram);
  assert.equal(reader.result().score, 2);
});
