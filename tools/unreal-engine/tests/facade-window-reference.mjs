// Sample the web's clock, hall light and TV against the exact generated Unreal material.
import fs from 'node:fs';
import { windowLevel, tvOn, windowRgb, tvFlicker } from '../../../src/windowschedule.js';
const spec = JSON.parse(fs.readFileSync(process.argv[2])).site.facadeLighting;
const cfg = spec.schedule, samples = [];
const lerp = (a,b,t) => a+(b-a)*t;
const smooth = (a,b,v) => { const t = Math.max(0,Math.min(1,(v-a)/(b-a))); return t*t*(3-2*t); };
const frac = (x) => x-Math.floor(x);
for (const [index,w] of spec.windows.entries()) {
  const habit = cfg.routines[w.routine];
  for (const [hour, night, power] of [[14,0,1],[18.25,.95,1],[22.25,1,1],[.25,1,1],[6.25,.64,1],[habit.on+.03,.5,1],[22,1,0]]) {
    const gx=.27, gy=.77, gs=w.glowSeed, g=cfg.glow;
    const lamp = Math.exp(-3 * (((gx-.25-.5*frac(gs*7.1))*1.6)**2+((gy-.92)*1.1)**2));
    let gl = (g.base+g.lamp*lamp)*lerp(1,g.floor,smooth(.35,0,gy));
    if (gs < .3) { const c=.12+.3*frac(gs*13); gl *= lerp(1,g.curtain,1-smooth(c-.03,c,Math.min(gx,1-gx))); }
    else if (gs < .55) { const d=.2+.7*frac(gs*11); gl *= lerp(1,g.curtain+.3*smooth(.1,.4,frac(gy*18)),1-smooth(d-.02,d,1-gy)); }
    const sec = 14.53, level = (power || !w.localPower) ? (w.hall ? .85*night : windowLevel(habit,hour)*(.25+.75*night)) : 0;
    const rgb = w.hall ? [1,.84,.6] : windowRgb(habit,hour);
    const flicker = !w.hall && tvOn(habit,hour) ? tvFlicker(habit,Math.floor(sec/cfg.tv.step)*cfg.tv.step) : 1;
    samples.push([index,hour,night,power,sec,gx,gy,rgb.map((v) => v*level*flicker*gl)]);
  }
}
console.log(JSON.stringify(samples));
