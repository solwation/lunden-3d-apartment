import { REPORTS } from './config.js';

/** Display data only; remove control/formatting characters and freeze a bounded name. */
export function reportPlayerName(value) {
  if(typeof value!=='string')return REPORTS.unknownPlayer;
  const name=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,' ').replace(/\s+/g,' ').trim();
  return Array.from(name).slice(0,REPORTS.playerNameChars).join('')||REPORTS.unknownPlayer;
}
