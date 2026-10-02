import * as THREE from 'three';
import { Holdable } from './holdable.js';
import { sfx } from './audio.js';
import { BOOK as B } from './config.js';

// The book on the side table by the armchair (#140), a Holdable: E takes it, a click / the "Läs" touch button
// opens it — a two-page spread in #book-panel (A D / ← → / ◀ ▶ turn the page with a rustle, E / Esc / × close
// it). It can be put down like the other things and goes back with E on the side table.

const TITLE = 'Katten på Karpvägen';
const AUTHOR = 'Agnes Lund';
// An original short story (ours), one string per page.
const PAGES = [
  `<h3>1. Flyttlådorna</h3><p>Det första katten gjorde när familjen flyttade in var att försvinna. Ena stunden satt den på en flyttlåda märkt KÖK – ÖMTÅLIGT, nästa stund fanns där bara ett par vita hår kvar.</p><p>– Den kommer tillbaka, sa pappa. Katter gör alltid det.</p>`,
  `<p>Men katten kom inte tillbaka den kvällen, och inte nästa morgon heller. Tilly letade under sängarna. Walter och Kian letade i garderoberna, och Livia och Tuva ritade en efterlysning med kritor som de satte upp på kylskåpet.</p><p><i>SAKNAS: KATT. RANDIG. SVARAR INTE PÅ NAMN.</i></p>`,
  `<h3>2. Ljud i väggarna</h3><p>Den andra natten vaknade Tilly av att något tassade. Inte på golvet, utan någonstans bakom väggen, där trappan svängde runt.</p><p>Hon smög upp och tände ficklampan. Ljuset föll på det vita trappräcket, på ekstegen, på en dörr som stod på glänt.</p>`,
  `<p>Bakom dörren satt katten. Fast det var inte samma katt. Den här var svart som natten utanför och hade ögon som två små måndiskar.</p><p>– Vem är du? viskade Tilly.</p><p>Katten blinkade långsamt, så som katter gör när de tycker om någon, och gick därifrån.</p>`,
  `<h3>3. Fler katter</h3><p>Efter det dök det upp katter överallt. En grå i tvättstugan. En vit med en svart fläck över ena ögat bakom badrumsdörren. En lurvig rödaktig en som låg och sov i klädkammaren som om den alltid hade bott där.</p>`,
  `<p>Ingen visste var de kom ifrån. Och när man stängde dörren och öppnade den igen var de ofta borta – eller så satt de någon helt annanstans och tvättade tassarna som om ingenting hade hänt.</p><p>– Det är huset, sa mamma. Nya hus är fulla av hemligheter.</p>`,
  `<h3>4. Tavlan i köket</h3><p>Tuva var den som kom på idén. Varje gång någon fick klappa en katt tog de ett foto och satte upp det på korktavlan under köksklockan. Snart var tavlan full av katter med namn som Smulan, Doris och Herr Knut.</p>`,
  `<p>Det var något märkligt med fotona. Ingen av katterna tittade någonsin in i kameran. De tittade alltid lite åt sidan, mot fönstret, som om de väntade på någon.</p><p>– På vem då? sa Livia.</p><p>Det visste ingen.</p>`,
  `<h3>5. Den randiga</h3><p>En kväll i oktober, när löven på andra sidan gatan hade blivit gula och röda, satt någon på uteplatsen och tittade in genom altandörren.</p><p>Den var randig. Den svarade inte på namn. Den hade varit borta i nästan en månad.</p>`,
  `<p>Tilly öppnade dörren och katten gick rakt in, förbi soffan, förbi fåtöljen med den lilla blomman bredvid, och upp för trappan som om den alltid hade vetat vägen.</p><p>Bakom den, en efter en, kom de andra.</p>`,
  `<h3>6. Hemma</h3><p>Det blev trångt i sängarna den natten. Den svarta låg i kojen, den grå hos Walter, den vita med fläcken hos Kian och den lurviga på Tillys kudde. Den randiga gick runt och nosade på var och en, som för att räkna dem.</p>`,
  `<p>Sedan lade den sig vid fotänden hos pappa, som alltid hade sagt att katter kommer tillbaka.</p><p>– Ser man på, sa han. Du hade visst bara gått och hämtat dina vänner.</p><p>Katten blinkade långsamt.</p><p style="text-align:center;margin-top:2em">SLUT</p>`,
];

function coverTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 384;
  const g = c.getContext('2d');
  g.fillStyle = '#2f4f6b'; g.fillRect(0, 0, 256, 384);
  g.strokeStyle = '#e9d9a8'; g.lineWidth = 4; g.strokeRect(14, 14, 228, 356);
  g.fillStyle = '#e9d9a8'; g.textAlign = 'center';
  g.font = 'bold 30px Georgia, serif'; g.fillText('Katten på', 128, 120); g.fillText('Karpvägen', 128, 158);
  g.font = 'italic 20px Georgia, serif'; g.fillText(AUTHOR, 128, 330);
  // a cat silhouette
  g.beginPath(); g.ellipse(128, 240, 34, 26, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(128, 202, 18, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(113, 195); g.lineTo(116, 176); g.lineTo(124, 190); g.moveTo(143, 195); g.lineTo(140, 176); g.lineTo(132, 190); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bookModel() {
  const g = new THREE.Group(); // lying flat, spine along local z at −x
  const { w, l, h } = B;
  const paper = new THREE.MeshStandardMaterial({ color: 0xf4eedc, roughness: 0.9 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2f4f6b, roughness: 0.7 });
  const cover = new THREE.MeshStandardMaterial({ map: coverTexture(), roughness: 0.7 });
  const pages = new THREE.Mesh(new THREE.BoxGeometry(w - 0.006, h - 0.004, l - 0.008), paper);
  pages.position.set(0.002, h / 2, 0);
  const board = (y, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, 0.003, l), [cloth, cloth, m, cloth, cloth, cloth]); o.position.y = y; return o; };
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.004, h, l), cloth);
  spine.position.set(-w / 2, h / 2, 0);
  g.add(pages, board(0.0015, cloth), board(h - 0.0015, cover), spine);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

export class Book extends Holdable {
  /** panel: the #book-panel element; onRead(show) — main.js switches its reading mode. */
  constructor(scene, camera, panel, onRead) {
    const home = new THREE.Vector3(B.x, B.y, B.z);
    super(scene, camera, {
      name: 'boken', verb: 'ta', backName: 'sidobordet', backVerb: 'lägga tillbaka boken på', placeVerb: 'lägga ner',
      model: bookModel(), home: { pos: home, rot: new THREE.Euler(0, THREE.MathUtils.degToRad(B.turn), 0) },
      heldPose: { pos: new THREE.Vector3(B.held.x, B.held.y, B.held.z), rot: new THREE.Euler(1.1, 0.2, -0.15) }, // standing up in the hand, cover to you
      pick: { pos: home.clone().setY(B.y + 0.02), size: [0.26, 0.06, 0.3] }, cooldown: 0.3, useLabel: 'Läs',
    });
    Object.assign(this, { panel, onRead, spread: 0, reading: false });
    this.left = panel.querySelector('.left');
    this.right = panel.querySelector('.right');
    this.info = panel.querySelector('.info');
    panel.querySelector('[data-act=prev]').addEventListener('click', () => this.turn(-1));
    panel.querySelector('[data-act=next]').addEventListener('click', () => this.turn(1));
    panel.querySelector('[data-act=close]').addEventListener('click', () => this.onRead(false));
  }

  get spreads() { return Math.ceil((PAGES.length + 1) / 2); } // the title page first

  render() {
    const page = (i) => (i < 0 ? `<div class="titlepage"><h2>${TITLE}</h2><p>${AUTHOR}</p></div>` : PAGES[i] ?? '');
    const a = this.spread * 2 - 1;
    this.left.innerHTML = page(a) + (a >= 0 ? `<span class="no">${a + 1}</span>` : '');
    this.right.innerHTML = page(a + 1) + (PAGES[a + 1] ? `<span class="no">${a + 2}</span>` : '');
    this.info.textContent = `Uppslag ${this.spread + 1} av ${this.spreads}`;
  }

  /** Open / close the spread view (main.js's reading mode). */
  show(v) {
    this.reading = v;
    this.panel.hidden = !v;
    if (v) { this.render(); sfx.paper(this.where()); }
  }

  turn(d) {
    const s = Math.max(0, Math.min(this.spreads - 1, this.spread + d));
    if (s === this.spread) return false;
    this.spread = s;
    this.render();
    sfx.paper(this.where());
    return true;
  }

  /** A key while reading: true if it was ours. */
  key(code) {
    if (code === 'KeyA' || code === 'ArrowLeft') { this.turn(-1); return true; }
    if (code === 'KeyD' || code === 'ArrowRight') { this.turn(1); return true; }
    return false;
  }

  onTake() { sfx.paper(this.where()); }
  onPut() { if (this.reading) this.onRead(false); }
  onUse() { this.onRead(true); }
}
