import * as THREE from 'three';

/**
 * Premium whisky, wine and champagne bottles from Systembolaget (#471).
 * All 14 bottles replicate identifiable real products with custom bottle shapes,
 * glass colours, caps/foils, corks and canvas-rendered authentic labels.
 */

export const WHISKIES = [
  {
    id: 'tullamore',
    name: 'Tullamore D.E.W.',
    fullName: 'Tullamore D.E.W. 12 Years Special Reserve',
    sbUrl: 'https://www.systembolaget.se/produkt/sprit/tullamore-dew-50501/',
    shape: 'square',
    glassColor: 0x36210f,
    roughness: 0.12,
    capColor: 0x1a3824,
    corkColor: 0x8b5a2b,
    labelStyle: 'tullamore'
  },
  {
    id: 'lagavulin',
    name: 'Lagavulin 16',
    fullName: 'Lagavulin 16 Years',
    sbUrl: 'https://www.systembolaget.se/produkt/sprit/lagavulin-40001/',
    shape: 'islay',
    glassColor: 0x142214,
    roughness: 0.15,
    capColor: 0x1a1a1a,
    labelStyle: 'lagavulin'
  },
  {
    id: 'macallan',
    name: 'The Macallan 12',
    fullName: 'The Macallan Double Cask 12 Years',
    sbUrl: 'https://www.systembolaget.se/produkt/sprit/the-macallan-49602/',
    shape: 'conical',
    glassColor: 0x472b12,
    roughness: 0.1,
    capColor: 0x1b3c68,
    labelStyle: 'macallan'
  },
  {
    id: 'glenfiddich',
    name: 'Glenfiddich 18',
    fullName: 'Glenfiddich Small Batch Reserve 18 Years',
    sbUrl: 'https://www.systembolaget.se/produkt/sprit/glenfiddich-8356901/',
    shape: 'triangular',
    glassColor: 0x3d220d,
    roughness: 0.14,
    capColor: 0x7c542b,
    labelStyle: 'glenfiddich'
  },
  {
    id: 'ardbeg',
    name: 'Ardbeg Uigeadail',
    fullName: 'Ardbeg Uigeadail',
    sbUrl: 'https://www.systembolaget.se/produkt/sprit/ardbeg-1040701/',
    shape: 'ardbeg',
    glassColor: 0x0f180f,
    roughness: 0.16,
    capColor: 0x141414,
    labelStyle: 'ardbeg'
  },
  {
    id: 'balvenie',
    name: 'The Balvenie 12',
    fullName: 'The Balvenie DoubleWood 12 Years',
    sbUrl: 'https://www.systembolaget.se/produkt/sprit/the-balvenie-1047701/',
    shape: 'balvenie',
    glassColor: 0x3c2410,
    roughness: 0.13,
    capColor: 0x4a321e,
    labelStyle: 'balvenie'
  }
];

export const WINES = [
  {
    id: 'tignanello',
    name: 'Tignanello',
    fullName: 'Tignanello 2022',
    kind: 'wine',
    sbUrl: 'https://www.systembolaget.se/produkt/vin/tignanello-3215201/',
    shape: 'bordeaux',
    glassColor: 0x101a11,
    capColor: 0x5a181d,
    labelStyle: 'tignanello'
  },
  {
    id: 'domperignon',
    name: 'Dom Pérignon',
    fullName: 'Dom Pérignon 2013',
    kind: 'champagne',
    sbUrl: 'https://www.systembolaget.se/produkt/vin/dom-perignon-9471906/',
    shape: 'champagne_dom',
    glassColor: 0x0d140d,
    capColor: 0x181818,
    foilGold: true,
    labelStyle: 'domperignon'
  },
  {
    id: 'sassicaia',
    name: 'Sassicaia',
    fullName: 'Sassicaia Tenuta San Guido 2021',
    kind: 'wine',
    sbUrl: 'https://www.systembolaget.se/produkt/vin/sassicaia-9532601/',
    shape: 'bordeaux',
    glassColor: 0x111c12,
    capColor: 0x1c355e,
    labelStyle: 'sassicaia'
  },
  {
    id: 'barolo',
    name: 'Barolo Ornato',
    fullName: 'Barolo Ornato Pio Cesare 2019',
    kind: 'wine',
    sbUrl: 'https://www.systembolaget.se/produkt/vin/barolo-ornato-9415401/',
    shape: 'piemonte',
    glassColor: 0x121d12,
    capColor: 0x6e1b24,
    labelStyle: 'barolo'
  },
  {
    id: 'penfolds',
    name: 'Penfolds Grange',
    fullName: 'Penfolds Grange 2020',
    kind: 'wine',
    sbUrl: 'https://www.systembolaget.se/produkt/vin/penfolds-9298801/',
    shape: 'bordeaux',
    glassColor: 0x0f1910,
    capColor: 0x8b1c26,
    labelStyle: 'penfolds'
  },
  {
    id: 'krug',
    name: 'Krug Grande Cuvée',
    fullName: 'Krug Grande Cuvée Edition 174',
    kind: 'champagne',
    sbUrl: 'https://www.systembolaget.se/produkt/vin/krug-grande-cuvee-749401/',
    shape: 'champagne_krug',
    glassColor: 0x0e150e,
    capColor: 0xc89e36,
    foilGold: true,
    labelStyle: 'krug'
  },
  {
    id: 'amarone',
    name: 'Masi Costasera Amarone',
    fullName: 'Masi Costasera Amarone Classico 2021',
    kind: 'wine',
    sbUrl: 'https://www.systembolaget.se/produkt/vin/costasera-234501/',
    shape: 'bordeaux',
    glassColor: 0x101a11,
    capColor: 0x1b1b1b,
    labelStyle: 'amarone'
  },
  {
    id: 'chateauneuf',
    name: 'Châteauneuf-du-Pape',
    fullName: 'Château Mont-Redon Châteauneuf-du-Pape 2021',
    kind: 'wine',
    sbUrl: 'https://www.systembolaget.se/produkt/vin/chateauneuf-du-pape-281101/',
    shape: 'rhone',
    glassColor: 0x121e13,
    capColor: 0x5c1620,
    labelStyle: 'chateauneuf'
  }
];

const labelCache = new Map();

/** Render authentic labels onto high-res canvas textures. */
export function getLabelTexture(style) {
  if (labelCache.has(style)) return labelCache.get(style);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  const w = 256, h = 320;

  // Clear background
  ctx.clearRect(0, 0, w, h);

  switch (style) {
    case 'tullamore': {
      // Dark green base with fine gold borders
      ctx.fillStyle = '#173623';
      ctx.fillRect(10, 10, w - 20, h - 20);
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 3;
      ctx.strokeRect(14, 14, w - 28, h - 28);
      ctx.lineWidth = 1;
      ctx.strokeRect(18, 18, w - 36, h - 36);

      // Gold Irish harp emblem
      ctx.fillStyle = '#d4af37';
      ctx.beginPath();
      ctx.arc(w / 2, 50, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f5e8c8';
      ctx.font = 'bold 22px serif';
      ctx.textAlign = 'center';
      ctx.fillText('TULLAMORE', w / 2, 90);

      ctx.font = 'bold 30px sans-serif';
      ctx.fillStyle = '#d4af37';
      ctx.fillText('D.E.W.', w / 2, 126);

      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#e8d5a8';
      ctx.fillText('IRISH WHISKEY', w / 2, 148);

      // 12 Years badge
      ctx.fillStyle = '#9c2a1a';
      ctx.beginPath();
      ctx.roundRect(w / 2 - 45, 168, 90, 48, 8);
      ctx.fill();
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px serif';
      ctx.fillText('12', w / 2, 204);

      ctx.fillStyle = '#d4af37';
      ctx.font = 'bold 12px serif';
      ctx.fillText('SPECIAL RESERVE', w / 2, 246);
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#a6c2ab';
      ctx.fillText('TRIPLE DISTILLED', w / 2, 272);
      ctx.fillText('PRODUCT OF IRELAND', w / 2, 290);
      break;
    }

    case 'lagavulin': {
      // Cream parchment base with classic dual borders
      ctx.fillStyle = '#f4ede0';
      ctx.fillRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = '#1b261a';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, w - 32, h - 32);
      ctx.lineWidth = 1;
      ctx.strokeRect(20, 20, w - 40, h - 40);

      ctx.fillStyle = '#1b261a';
      ctx.font = 'bold 23px serif';
      ctx.textAlign = 'center';
      ctx.fillText('LAGAVULIN', w / 2, 68);

      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('SINGLE ISLAY MALT WHISKY', w / 2, 88);

      // Red royal seal
      ctx.fillStyle = '#a32420';
      ctx.beginPath();
      ctx.arc(w / 2, 125, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px serif';
      ctx.fillText('1816', w / 2, 129);

      // 16 Years
      ctx.fillStyle = '#1b261a';
      ctx.font = 'bold 44px serif';
      ctx.fillText('16', w / 2, 186);

      ctx.font = 'italic 13px serif';
      ctx.fillText('Aged Sixteen Years', w / 2, 214);

      ctx.font = '10px serif';
      ctx.fillText('Port Ellen · Isle of Islay', w / 2, 246);
      ctx.fillText('WHITE HORSE DISTILLERS', w / 2, 274);
      break;
    }

    case 'macallan': {
      // Crisp white with blue header and gold frame
      ctx.fillStyle = '#faf8f5';
      ctx.fillRect(10, 10, w - 20, h - 20);
      ctx.strokeStyle = '#1b3c68';
      ctx.lineWidth = 3;
      ctx.strokeRect(14, 14, w - 28, h - 28);

      // Distillery estate silhouette sketch
      ctx.fillStyle = '#1b3c68';
      ctx.fillRect(w / 2 - 30, 30, 60, 20);

      ctx.font = 'italic 12px serif';
      ctx.textAlign = 'center';
      ctx.fillText('The', w / 2, 68);
      ctx.font = 'bold 22px serif';
      ctx.fillText('MACALLAN', w / 2, 92);

      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('HIGHLAND SINGLE MALT SCOTCH WHISKY', w / 2, 110);

      // Blue Double Cask box
      ctx.fillStyle = '#1b3c68';
      ctx.fillRect(25, 126, w - 50, 36);
      ctx.fillStyle = '#d4af37';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('DOUBLE CASK', w / 2, 149);

      // 12 Years Old
      ctx.fillStyle = '#1b3c68';
      ctx.font = 'bold 38px serif';
      ctx.fillText('12', w / 2, 208);
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('YEARS OLD', w / 2, 230);

      ctx.font = '10px serif';
      ctx.fillStyle = '#555555';
      ctx.fillText('OAK CASKS FROM JEREZ, SPAIN', w / 2, 264);
      ctx.fillText('EASTER ELCHIES · CRAIGELLACHIE', w / 2, 286);
      break;
    }

    case 'glenfiddich': {
      // Rich copper / chocolate background
      ctx.fillStyle = '#2d1c14';
      ctx.fillRect(10, 10, w - 20, h - 20);
      ctx.strokeStyle = '#c68d4a';
      ctx.lineWidth = 2;
      ctx.strokeRect(15, 15, w - 30, h - 30);

      // Golden stag
      ctx.fillStyle = '#c68d4a';
      ctx.beginPath();
      ctx.arc(w / 2, 48, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'italic 25px serif';
      ctx.textAlign = 'center';
      ctx.fillText('Glenfiddich', w / 2, 92);

      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('SINGLE MALT SCOTCH WHISKY', w / 2, 114);

      // Large 18 badge
      ctx.font = 'bold 44px serif';
      ctx.fillText('18', w / 2, 175);

      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('SMALL BATCH RESERVE', w / 2, 205);

      ctx.font = '10px serif';
      ctx.fillStyle = '#dfba85';
      ctx.fillText('Oloroso Sherry & Bourbon Casks', w / 2, 235);
      ctx.fillText('DUFFTOWN · SCOTLAND', w / 2, 275);
      break;
    }

    case 'ardbeg': {
      // Matte charcoal / black with Celtic gold
      ctx.fillStyle = '#141715';
      ctx.fillRect(10, 10, w - 20, h - 20);
      ctx.strokeStyle = '#c8a64d';
      ctx.lineWidth = 2;
      ctx.strokeRect(15, 15, w - 30, h - 30);

      // Celtic knot A
      ctx.fillStyle = '#c8a64d';
      ctx.font = 'bold 36px serif';
      ctx.textAlign = 'center';
      ctx.fillText('A', w / 2, 65);

      ctx.font = 'bold 26px serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Ardbeg', w / 2, 106);

      // Uigeadail in deep red
      ctx.fillStyle = '#b82828';
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText('UIGEADAIL', w / 2, 140);

      ctx.fillStyle = '#c8a64d';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('ISLAY SINGLE MALT SCOTCH WHISKY', w / 2, 172);

      ctx.fillStyle = '#aaaaaa';
      ctx.font = '10px serif';
      ctx.fillText('BOTTLED AT CASK STRENGTH', w / 2, 214);
      ctx.fillText('NON CHILL-FILTERED', w / 2, 238);
      ctx.fillText('THE ULTIMATE ISLAY MALT', w / 2, 276);
      break;
    }

    case 'balvenie': {
      // Warm ivory parchment
      ctx.fillStyle = '#f5efe0';
      ctx.fillRect(10, 10, w - 20, h - 20);
      ctx.strokeStyle = '#3d2b1f';
      ctx.lineWidth = 2;
      ctx.strokeRect(15, 15, w - 30, h - 30);

      ctx.fillStyle = '#2b1d14';
      ctx.font = 'italic 25px serif';
      ctx.textAlign = 'center';
      ctx.fillText('The Balvenie', w / 2, 70);

      ctx.font = 'bold 18px serif';
      ctx.fillText('DoubleWood', w / 2, 104);

      // Banner for Aged 12 Years
      ctx.fillStyle = '#8f2d22';
      ctx.fillRect(35, 126, w - 70, 32);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px serif';
      ctx.fillText('AGED 12 YEARS', w / 2, 148);

      ctx.fillStyle = '#2b1d14';
      ctx.font = '10px serif';
      ctx.fillText('Matured in two distinct casks', w / 2, 195);
      ctx.fillText('Traditional Oak & Sherry Oak', w / 2, 218);
      ctx.fillText('DISTILLED AT THE BALVENIE DISTILLERY', w / 2, 256);
      ctx.fillText('BANFFSHIRE · SCOTLAND', w / 2, 278);
      break;
    }

    case 'domperignon': {
      // The iconic baroque shield
      ctx.fillStyle = '#111512';
      ctx.beginPath();
      ctx.moveTo(w / 2, 20);
      ctx.lineTo(w - 25, 60);
      ctx.lineTo(w - 25, 180);
      ctx.quadraticCurveTo(w - 30, 280, w / 2, 305);
      ctx.quadraticCurveTo(30, 280, 25, 180);
      ctx.lineTo(25, 60);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#cda94a';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Inner gold line
      ctx.strokeStyle = '#9d7f30';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w / 2, 28);
      ctx.lineTo(w - 33, 66);
      ctx.lineTo(w - 33, 175);
      ctx.quadraticCurveTo(w - 38, 270, w / 2, 295);
      ctx.quadraticCurveTo(38, 270, 33, 175);
      ctx.lineTo(33, 66);
      ctx.closePath();
      ctx.stroke();

      // Eight-point star
      ctx.fillStyle = '#cda94a';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', w / 2, 65);

      ctx.font = 'italic 13px serif';
      ctx.fillText('Champagne', w / 2, 102);

      ctx.font = 'bold 22px serif';
      ctx.fillText('Dom Pérignon', w / 2, 142);

      ctx.font = '15px serif';
      ctx.fillText('Vintage 2013', w / 2, 184);

      ctx.font = '9px sans-serif';
      ctx.fillText('ALTUM VILLARE · ÉPERNAY', w / 2, 230);
      ctx.fillText('FRANCE', w / 2, 248);
      break;
    }

    case 'krug': {
      // Deep burgundy oval with polished gold rim
      ctx.fillStyle = '#480e18';
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w / 2 - 20, h / 2 - 25, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w / 2 - 26, h / 2 - 31, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#d4af37';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CHAMPAGNE', w / 2, 100);

      ctx.font = 'bold 36px serif';
      ctx.fillText('KRUG', w / 2, 150);

      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('GRANDE CUVÉE', w / 2, 185);

      ctx.font = 'italic 12px serif';
      ctx.fillText('174 Ème Édition', w / 2, 215);

      ctx.font = '9px sans-serif';
      ctx.fillText('REIMS · FRANCE', w / 2, 248);
      break;
    }

    case 'tignanello': {
      // Fine ivory parchment with gold radiant sun
      ctx.fillStyle = '#f8f5eb';
      ctx.fillRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = '#c49a45';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, w - 32, h - 32);

      // Gold sun motif
      ctx.fillStyle = '#c49a45';
      ctx.beginPath();
      ctx.arc(w / 2, 60, 16, 0, Math.PI * 2);
      ctx.fill();

      // Signature Tignanello script
      ctx.fillStyle = '#5c1722';
      ctx.font = 'bold italic 24px serif';
      ctx.textAlign = 'center';
      ctx.fillText('TIGNANELLO', w / 2, 118);

      ctx.fillStyle = '#1b1b1b';
      ctx.font = '12px serif';
      ctx.fillText('2022', w / 2, 148);

      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#c49a45';
      ctx.fillText('TOSCANA', w / 2, 180);

      ctx.font = '10px serif';
      ctx.fillStyle = '#333333';
      ctx.fillText('INDICAZIONE GEOGRAFICA TIPICA', w / 2, 205);
      ctx.fillText('IMBOTTIGLIATO DA MARCHESI ANTINORI', w / 2, 240);
      ctx.fillText('FIRENZE · ITALIA', w / 2, 262);
      break;
    }

    case 'sassicaia': {
      // Pure white with gold ring and iconic blue compass-sun
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = '#c49a45';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, w - 32, h - 32);

      // Blue 8-point sun / compass rose
      ctx.fillStyle = '#1c355e';
      ctx.beginPath();
      ctx.arc(w / 2, 70, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c49a45';
      ctx.beginPath();
      ctx.arc(w / 2, 70, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1c355e';
      ctx.font = 'bold 24px serif';
      ctx.textAlign = 'center';
      ctx.fillText('SASSICAIA', w / 2, 134);

      ctx.font = '13px serif';
      ctx.fillStyle = '#111111';
      ctx.fillText('2021', w / 2, 160);

      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#c49a45';
      ctx.fillText('BOLGHERI SASSICAIA', w / 2, 192);

      ctx.font = '11px serif';
      ctx.fillStyle = '#1c355e';
      ctx.fillText('TENUTA SAN GUIDO', w / 2, 228);
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#444444';
      ctx.fillText('CASTAGNETO CARDUCCI · ITALIA', w / 2, 255);
      break;
    }

    case 'barolo': {
      // Historic parchment with coats of arms and medals
      ctx.fillStyle = '#f3e9d2';
      ctx.fillRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = '#2b2318';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, w - 32, h - 32);

      ctx.fillStyle = '#2b2318';
      ctx.font = 'bold 18px serif';
      ctx.textAlign = 'center';
      ctx.fillText('PIO CESARE', w / 2, 60);

      ctx.font = 'bold 28px serif';
      ctx.fillText('BAROLO', w / 2, 108);

      ctx.fillStyle = '#8f242d';
      ctx.font = 'bold 16px serif';
      ctx.fillText('ORNATO', w / 2, 138);

      ctx.fillStyle = '#2b2318';
      ctx.font = '12px serif';
      ctx.fillText('2019', w / 2, 166);

      ctx.font = '10px serif';
      ctx.fillText('DENOMINAZIONE DI ORIGINE CONTROLLATA', w / 2, 200);
      ctx.fillText('E GARANTITA', w / 2, 216);

      ctx.fillStyle = '#7a5a2e';
      ctx.font = '9px sans-serif';
      ctx.fillText('ALBA · PIEMONTE · ITALIA', w / 2, 255);
      break;
    }

    case 'penfolds': {
      // Off-white with distinctive red script
      ctx.fillStyle = '#fafaf8';
      ctx.fillRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = '#8f1c24';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, w - 32, h - 32);

      // Red Penfolds script
      ctx.fillStyle = '#8f1c24';
      ctx.font = 'bold italic 28px serif';
      ctx.textAlign = 'center';
      ctx.fillText('Penfolds', w / 2, 70);

      ctx.font = 'bold 22px serif';
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText('Grange', w / 2, 110);

      ctx.fillStyle = '#8f1c24';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('BIN 95', w / 2, 140);

      ctx.fillStyle = '#1a1a1a';
      ctx.font = '12px serif';
      ctx.fillText('VINTAGE 2020', w / 2, 168);

      ctx.font = '10px sans-serif';
      ctx.fillText('SOUTH AUSTRALIA SHIRAZ', w / 2, 204);

      ctx.font = '9px serif';
      ctx.fillStyle = '#555555';
      ctx.fillText('BOTTLED BY PENFOLDS WINES', w / 2, 240);
      ctx.fillText('MAGILL ESTATE · AUSTRALIA', w / 2, 260);
      break;
    }

    case 'amarone': {
      // Ornate engraving frame
      ctx.fillStyle = '#f4ede0';
      ctx.fillRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = '#2b261f';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, w - 32, h - 32);

      ctx.fillStyle = '#2b261f';
      ctx.font = 'bold 22px serif';
      ctx.textAlign = 'center';
      ctx.fillText('MASI', w / 2, 65);

      ctx.font = 'bold 18px serif';
      ctx.fillText('COSTASERA', w / 2, 98);

      ctx.font = 'bold 23px serif';
      ctx.fillText('AMARONE', w / 2, 138);

      ctx.font = 'italic 11px serif';
      ctx.fillText('della Valpolicella Classico', w / 2, 162);

      ctx.font = '12px serif';
      ctx.fillText('2021', w / 2, 192);

      ctx.font = '9px sans-serif';
      ctx.fillText('AGRICOLA MASI · S. AMBROGIO', w / 2, 235);
      ctx.fillText('VERONA · ITALIA', w / 2, 255);
      break;
    }

    case 'chateauneuf': {
      // Elegant French domaine label
      ctx.fillStyle = '#fbfbfa';
      ctx.fillRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = '#5a1622';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, w - 32, h - 32);

      // Papal coat of arms motif
      ctx.fillStyle = '#5a1622';
      ctx.beginPath();
      ctx.arc(w / 2, 50, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 17px serif';
      ctx.textAlign = 'center';
      ctx.fillText('CHÂTEAU MONT-REDON', w / 2, 92);

      ctx.font = 'bold 18px serif';
      ctx.fillText('CHÂTEAUNEUF-DU-PAPE', w / 2, 126);

      ctx.font = '12px serif';
      ctx.fillStyle = '#111111';
      ctx.fillText('2021', w / 2, 156);

      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#5a1622';
      ctx.fillText('APPELLATION D\'ORIGINE CONTRÔLÉE', w / 2, 190);

      ctx.fillStyle = '#444444';
      ctx.font = '10px serif';
      ctx.fillText('MIS EN BOUTEILLE AU CHÂTEAU', w / 2, 230);
      ctx.fillText('CHÂTEAUNEUF-DU-PAPE · FRANCE', w / 2, 252);
      break;
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  labelCache.set(style, texture);
  return texture;
}

/** Construct a 3D bottle mesh group for a specific whisky product. */
export function buildWhiskyBottle(itemIndex) {
  const spec = WHISKIES[itemIndex % WHISKIES.length];
  const bg = new THREE.Group();
  bg.name = spec.id;

  const glassMat = new THREE.MeshStandardMaterial({
    color: spec.glassColor,
    roughness: spec.roughness,
    metalness: 0.15
  });

  const capMat = new THREE.MeshStandardMaterial({
    color: spec.capColor,
    roughness: 0.4,
    metalness: 0.3
  });

  const corkMat = new THREE.MeshStandardMaterial({
    color: spec.corkColor ?? 0xb8925f,
    roughness: 0.85
  });

  const labelTex = getLabelTexture(spec.labelStyle);
  const labelMat = new THREE.MeshStandardMaterial({
    map: labelTex,
    roughness: 0.7,
    side: THREE.DoubleSide
  });

  if (spec.shape === 'square') {
    // Tullamore D.E.W.: rectangular rounded profile
    const bodyW = 0.076, bodyD = 0.054, bodyH = 0.155;
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), glassMat);
    body.position.set(0, bodyH / 2, 0);
    bg.add(body);

    const shoulderH = 0.035;
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.015, bodyD / 2, shoulderH, 16), glassMat);
    shoulder.position.set(0, bodyH + shoulderH / 2, 0);
    bg.add(shoulder);

    const neckH = 0.06;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0145, neckH, 16), glassMat);
    neck.position.set(0, bodyH + shoulderH + neckH / 2, 0);
    bg.add(neck);

    // Green collar + wood cap
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.024, 16), capMat);
    cap.position.set(0, bodyH + shoulderH + neckH - 0.005, 0);
    bg.add(cap);

    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.012, 16), corkMat);
    cork.position.set(0, bodyH + shoulderH + neckH + 0.009, 0);
    bg.add(cork);

    // Front label
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.075), labelMat);
    label.position.set(0, 0.082, bodyD / 2 + 0.0006);
    bg.add(label);

  } else if (spec.shape === 'triangular') {
    // Glenfiddich: rounded triangular profile
    const profile = [
      [0, 0], [0.038, 0], [0.041, 0.16], [0.033, 0.19],
      [0.014, 0.22], [0.013, 0.27], [0.015, 0.275]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), glassMat);
    // Subtle triangular scaling
    body.scale.set(1.08, 1, 0.92);
    bg.add(body);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0155, 0.025, 16), capMat);
    cap.position.set(0, 0.275, 0);
    bg.add(cap);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0405, 0.0405, 0.075, 16, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
      labelMat
    );
    label.position.set(0, 0.09, 0);
    bg.add(label);

  } else if (spec.shape === 'conical') {
    // The Macallan: elegant wide-shouldered tapered profile
    const profile = [
      [0, 0], [0.035, 0], [0.042, 0.17], [0.036, 0.20],
      [0.014, 0.23], [0.0135, 0.285], [0.0155, 0.29]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), glassMat);
    bg.add(body);

    // Blue foil neck sleeve
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.045, 16), capMat);
    cap.position.set(0, 0.275, 0);
    bg.add(cap);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.041, 0.039, 0.082, 16, 1, true, -Math.PI / 3.2, (2 * Math.PI) / 3.2),
      labelMat
    );
    label.position.set(0, 0.098, 0);
    bg.add(label);

  } else if (spec.shape === 'islay') {
    // Lagavulin: sturdy wide cylinder with neck bulge
    const profile = [
      [0, 0], [0.042, 0], [0.0425, 0.145], [0.036, 0.18],
      [0.016, 0.20], [0.014, 0.245], [0.0165, 0.26], [0.015, 0.27]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), glassMat);
    bg.add(body);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.024, 16), capMat);
    cap.position.set(0, 0.268, 0);
    bg.add(cap);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.043, 0.043, 0.076, 16, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
      labelMat
    );
    label.position.set(0, 0.082, 0);
    bg.add(label);

  } else if (spec.shape === 'ardbeg') {
    // Ardbeg: dark olive cylinder with pronounced collar
    const profile = [
      [0, 0], [0.039, 0], [0.0395, 0.155], [0.033, 0.185],
      [0.016, 0.205], [0.014, 0.25], [0.0175, 0.262], [0.015, 0.272]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), glassMat);
    bg.add(body);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0155, 0.026, 16), capMat);
    cap.position.set(0, 0.268, 0);
    bg.add(cap);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.040, 0.040, 0.08, 16, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
      labelMat
    );
    label.position.set(0, 0.088, 0);
    bg.add(label);

  } else {
    // Balvenie: compact stout profile with soft curves
    const profile = [
      [0, 0], [0.041, 0], [0.0415, 0.14], [0.036, 0.175],
      [0.016, 0.20], [0.014, 0.245], [0.016, 0.255]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), glassMat);
    bg.add(body);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.022, 16), capMat);
    cap.position.set(0, 0.255, 0);
    bg.add(cap);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.042, 0.076, 16, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
      labelMat
    );
    label.position.set(0, 0.082, 0);
    bg.add(label);
  }

  bg.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return {
    model: bg,
    kind: 'whisky',
    name: spec.name,
    fullName: spec.fullName,
    spec
  };
}

/** Construct a 3D bottle mesh group for a specific wine / champagne product. */
export function buildWineBottle(itemIndex) {
  const spec = WINES[itemIndex % WINES.length];
  const bg = new THREE.Group();
  bg.name = spec.id;

  const glassMat = new THREE.MeshStandardMaterial({
    color: spec.glassColor,
    roughness: 0.14,
    metalness: 0.2
  });

  const capMat = new THREE.MeshStandardMaterial({
    color: spec.capColor,
    roughness: spec.foilGold ? 0.3 : 0.45,
    metalness: spec.foilGold ? 0.8 : 0.35
  });

  const corkMat = new THREE.MeshStandardMaterial({
    color: 0xb8925f,
    roughness: 0.9
  });

  const labelTex = getLabelTexture(spec.labelStyle);
  const labelMat = new THREE.MeshStandardMaterial({
    map: labelTex,
    roughness: 0.75,
    side: THREE.DoubleSide
  });

  if (spec.shape === 'champagne_dom') {
    // Dom Pérignon: wide sloping champagne bottle
    const profile = [
      [0, 0], [0.044, 0], [0.045, 0.12], [0.038, 0.19],
      [0.018, 0.24], [0.015, 0.30], [0.0175, 0.31]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), glassMat);
    bg.add(body);

    // Black/gold foil sleeve
    const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.021, 0.085, 16), capMat);
    foil.position.set(0, 0.27, 0);
    bg.add(foil);

    // Dom Pérignon shield
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0455, 0.044, 0.088, 16, 1, true, -Math.PI / 3.2, (2 * Math.PI) / 3.2),
      labelMat
    );
    label.position.set(0, 0.11, 0);
    bg.add(label);

  } else if (spec.shape === 'champagne_krug') {
    // Krug: high-shouldered champagne bottle
    const profile = [
      [0, 0], [0.042, 0], [0.043, 0.14], [0.036, 0.20],
      [0.017, 0.245], [0.015, 0.305], [0.017, 0.315]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), glassMat);
    bg.add(body);

    const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.020, 0.085, 16), capMat);
    foil.position.set(0, 0.272, 0);
    bg.add(foil);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0435, 0.042, 0.084, 16, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
      labelMat
    );
    label.position.set(0, 0.115, 0);
    bg.add(label);

  } else if (spec.shape === 'piemonte' || spec.shape === 'rhone') {
    // Sloping shoulder profile (Burgundy/Rhône/Piedmont)
    const profile = [
      [0, 0], [0.040, 0], [0.041, 0.14], [0.032, 0.21],
      [0.015, 0.25], [0.0135, 0.31], [0.0155, 0.315]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), glassMat);
    bg.add(body);

    // Foil capsule
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.015, 0.045, 16), capMat);
    cap.position.set(0, 0.292, 0);
    bg.add(cap);

    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 10), corkMat);
    cork.position.set(0, 0.318, 0);
    bg.add(cork);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0415, 0.0415, 0.085, 16, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
      labelMat
    );
    label.position.set(0, 0.105, 0);
    bg.add(label);

  } else {
    // Bordeaux profile: straight cylinder with high shoulder
    const profile = [
      [0, 0], [0.0375, 0], [0.038, 0.19], [0.030, 0.23],
      [0.014, 0.26], [0.0135, 0.315], [0.0155, 0.32]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), glassMat);
    bg.add(body);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.015, 0.045, 16), capMat);
    cap.position.set(0, 0.295, 0);
    bg.add(cap);

    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 10), corkMat);
    cork.position.set(0, 0.322, 0);
    bg.add(cork);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0386, 0.0386, 0.088, 16, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
      labelMat
    );
    label.position.set(0, 0.105, 0);
    bg.add(label);
  }

  bg.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return {
    model: bg,
    kind: spec.kind,
    name: spec.name,
    fullName: spec.fullName,
    spec
  };
}
