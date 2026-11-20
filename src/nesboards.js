// #2239: each board belongs to one unmodified cartridge. The digest is checked
// against the bytes loaded by the client and against the result posted to the Worker.
export const NES_BOARDS = {
  'nes-lightcatch': {
    sha256: '5fda8dc68af7b39acfb6bbe59e7dfce2b790c5be2a171fc0bc0f1e7316024306',
    label: 'Fångade ljus', max: 255, perSecond: 2,
  },
  'nes-thwaite': {
    sha256: '3543ebf804f80abb19acfde4630a909a7485e2d69487900fd93b5698c412adc5',
    label: 'Poäng · en spelare', max: 25599, perSecond: 100,
  },
  'nes-lan-master': {
    sha256: 'becfeafb80479c330333c9e9385417f68f3c88e85443dfb37b05ae9283f3ea45',
    label: 'Klarade banor från start', max: 50, perSecond: 1,
  },
  'nes-lawn-mower': {
    sha256: '181ef3ff1769a85ae98736e02809e65e5d758b453ebb43ec4b9fe60c93ad224c',
    label: 'Klarade gräsmattor', max: 10, perSecond: 1,
  },
};

// The byte counter in the prototype can rise once per 32 pixels after the
// first catch. Other time caps are generous plausibility bounds (guesses).
export function maxNesScore(game, sha256, ms) {
  if (!Object.hasOwn(NES_BOARDS, game)) return -1;
  const board = NES_BOARDS[game];
  if (sha256 !== board.sha256 || !Number.isFinite(ms) || ms < 0) return -1;
  return Math.min(board.max, Math.floor(ms / 1000 * board.perSecond));
}

/** One reader per loaded cartridge. Sample the CPU RAM once after each actual
 * emulated frame. Pausing or merely drawing the old screen spends no round time. */
export async function createNesScoreReader(bytes) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const game = Object.keys(NES_BOARDS).find(key => NES_BOARDS[key].sha256 === sha256);
  if (!game) return null;
  let frames = 0, best = 0, lanPlayingLevel = -1;
  return {
    game,
    sample(ram) {
      frames++;
      let score = 0;
      switch (game) {
        case 'nes-lightcatch':
          // OAM tile numbers written by make_rom.py after clearing zero page.
          if (ram[0x201] === 1 && ram[0x205] === 2) score = ram[2];
          break;
        case 'nes-thwaite':
          // main.s: single-player, no practice, active game state; bg.s:
          // score100s and score1s are plain binary, with low byte modulo 100.
          if (ram[0x3d] === 1 && ram[0x54] === 0 && ram[0x3c] >= 1 && ram[0x3c] <= 7 && ram[0x3d6] < 100) {
            score = 100 * ram[0x3d5] + ram[0x3d6];
          }
          break;
        case 'nes-lawn-mower':
          // levelClear increments GAME_LEVEL (ten lawns); disallow level skip.
          if (ram[0xb4] === 0) score = ram[0xca];
          break;
        case 'nes-lan-master': {
          // Password entry may set GAME_LEVEL directly. Observe actual play
          // and its completed level's table before crediting the next stage.
          const level = ram[0xd7];
          if (ram[0xb7] === 1) lanPlayingLevel = level;
          if (ram[0xb7] === 0 && ram[0xbe] === 0xae && ram[0xbf] === 0xed &&
              ram[0xc7] === 100 && level === lanPlayingLevel + 1 && level === best + 1) score = level;
          break;
        }
      }
      if (score > best && score <= NES_BOARDS[game].max) best = score;
    },
    result() {
      return best ? { score: best, ms: Math.round(frames * 1000 / 60), sha256 } : null;
    },
  };
}
