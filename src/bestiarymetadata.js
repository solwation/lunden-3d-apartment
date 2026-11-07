import { CAT_CARD, OUTDOOR_CATS } from './config.js';
import { registerCreature, catEntryId, rarity, families } from './bestiary.js';
// Metadata lives with each source module's registrations. Measurements not measured by game logic are labelled guesses.
export function creature({ family, level = 0, ...entry }) {
 return registerCreature({ rarity: rarity(CAT_CARD.tiers, level), family: families[family], ...entry });
}
export function registerCats(breeds, numbers) {
 for (const b of breeds) for (const c of b.coats) {
  const key = `${b.name}/${c.name}`, pair = numbers[key]; if (!pair) throw new Error(`Unnumbered cat form ${key}`);
  const meta = CAT_CARD.breeds.find(v => v.key === b.name), outdoor = OUTDOOR_CATS.cats.filter(o => o.breed === b.name && o.coat === c.name), chain = pair.length === 2 ? [catEntryId(b,c,true),catEntryId(b,c,false)] : [catEntryId(b,c,false)];
  for (const [i,no] of pair.entries()) { const kitten = pair.length === 2 && i === 0;
   creature({ id:catEntryId(b,c,kitten), no, family:'cats', name:`${meta?.label ?? b.name}${kitten?' · kattunge':''}`, variant:c.name,
    level:b.superRare?4:b.name==='sphynx'?3:b.rare?2:b.name==='huskatt'?0:1, chain,
    info:{size:kitten?'Liten kattunge (modellens proportioner)':'Vuxen katt',weight:kitten?'Växer fortfarande':`${meta.weightKg.join('–')} kg (uppskattning)`,where:!kitten&&outdoor.length?`Ute: ${outdoor.map(o=>`${o.name} (${o.zone})`).join(', ')}; ibland hemma`:'Hemmet, gården och parkens stråk',when:'Olika tider på dygnet',likes:'Lugn närhet och klappar'},
    facts:[...(!kitten?outdoor.map(o=>`Utekatten ${o.name} brukar ströva ${o.roams??'kring '+o.zone}.`):[]),...(meta?.facts??[]),kitten?'Kattungen och den vuxna formen har var sin post.':'Utekatter och burna fjärrkatter använder samma ras- och pälsform.'], model:{kind:'cat',breed:b.name,coat:c.name,kitten} });
  }
 }
}
