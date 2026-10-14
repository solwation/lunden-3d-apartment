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
    liquidColor: 0xd08422,
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
    liquidColor: 0xc4781c,
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
    liquidColor: 0xb86214,
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
    liquidColor: 0xd68e28,
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
    liquidColor: 0xcca038,
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
    liquidColor: 0xd28a24,
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
    liquidColor: 0x3a050e,
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
    liquidColor: 0xd8b456,
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
    liquidColor: 0x3a050e,
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
    liquidColor: 0x3a050e,
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
    liquidColor: 0x38040d,
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
    liquidColor: 0xd8b456,
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
    liquidColor: 0x3a050e,
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
    liquidColor: 0x3a050e,
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

/** Construct rounded rectangular lofted geometry for Tullamore D.E.W. */
function buildTullamoreGeometry(isLiquid = false) {
  const w = 0.076 * (isLiquid ? 0.93 : 1.0);
  const d = 0.054 * (isLiquid ? 0.93 : 1.0);
  const cr = 0.012 * (isLiquid ? 0.93 : 1.0);
  const segments = 32;
  const hw = w / 2 - cr, hd = d / 2 - cr;
  const segPerCorner = segments / 4;
  const corners = [
    { cx: hw, cz: hd, a0: 0 },
    { cx: -hw, cz: hd, a0: Math.PI / 2 },
    { cx: -hw, cz: -hd, a0: Math.PI },
    { cx: hw, cz: -hd, a0: 3 * Math.PI / 2 }
  ];
  const baseRing = [];
  for (const c of corners) {
    for (let i = 0; i < segPerCorner; i++) {
      const a = c.a0 + (i / segPerCorner) * (Math.PI / 2);
      baseRing.push([c.cx + cr * Math.cos(a), c.cz + cr * Math.sin(a)]);
    }
  }

  const slices = isLiquid ? [
    { y: 0.006, scale: 0.95, t: 0, r: 0 },
    { y: 0.030, scale: 1.00, t: 0, r: 0 },
    { y: 0.080, scale: 1.00, t: 0, r: 0 },
    { y: 0.140, scale: 1.00, t: 0, r: 0 },
    { y: 0.155, scale: 0.96, t: 0.15, r: 0.013 },
    { y: 0.165, scale: 0.88, t: 0.40, r: 0.013 },
    { y: 0.170, scale: 0.00, t: 0.00, r: 0 }
  ] : [
    { y: 0.000, scale: 0.94, t: 0, r: 0 },
    { y: 0.004, scale: 1.00, t: 0, r: 0 },
    { y: 0.030, scale: 1.00, t: 0, r: 0 },
    { y: 0.080, scale: 1.00, t: 0, r: 0 },
    { y: 0.120, scale: 1.00, t: 0, r: 0 },
    { y: 0.150, scale: 1.00, t: 0, r: 0 },
    { y: 0.158, scale: 0.95, t: 0.18, r: 0.0145 },
    { y: 0.168, scale: 0.85, t: 0.45, r: 0.0145 },
    { y: 0.178, scale: 0.65, t: 0.75, r: 0.0145 },
    { y: 0.188, scale: 0.00, t: 1.00, r: 0.0145 },
    { y: 0.205, scale: 0.00, t: 1.00, r: 0.0140 },
    { y: 0.225, scale: 0.00, t: 1.00, r: 0.0140 },
    { y: 0.238, scale: 0.00, t: 1.00, r: 0.0155 },
    { y: 0.244, scale: 0.00, t: 1.00, r: 0.0142 },
    { y: 0.249, scale: 0.00, t: 1.00, r: 0.0150 },
    { y: 0.250, scale: 0.00, t: 1.00, r: 0.0115 }
  ];

  const positions = [];
  const uvs = [];
  const indices = [];

  positions.push(0, isLiquid ? 0.006 : 0.008, 0);
  uvs.push(0.5, 0.5);

  const numSlices = isLiquid ? slices.length - 1 : slices.length;
  for (let s = 0; s < numSlices; s++) {
    const sl = slices[s];
    const y = sl.y;
    for (let i = 0; i < segments; i++) {
      const bp = baseRing[i];
      const ang = Math.atan2(bp[1], bp[0]);
      const circX = sl.r * Math.cos(ang);
      const circZ = sl.r * Math.sin(ang);
      const rectX = bp[0] * sl.scale;
      const rectZ = bp[1] * sl.scale;
      const x = (1 - sl.t) * rectX + sl.t * circX;
      const z = (1 - sl.t) * rectZ + sl.t * circZ;
      positions.push(x, y, z);
      uvs.push(i / segments, y / 0.25);
    }
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(0, 1 + next, 1 + i);
  }

  for (let s = 0; s < numSlices - 1; s++) {
    const r0 = 1 + s * segments;
    const r1 = 1 + (s + 1) * segments;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(r0 + i, r0 + next, r1 + next);
      indices.push(r0 + i, r1 + next, r1 + i);
    }
  }

  if (isLiquid) {
    const topIdx = positions.length / 3;
    positions.push(0, 0.170, 0);
    uvs.push(0.5, 0.5);
    const lastRow = 1 + (numSlices - 1) * segments;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(topIdx, lastRow + i, lastRow + next);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Construct a 3D bottle mesh group for a specific whisky product. */
export function buildWhiskyBottle(itemIndex) {
  const spec = WHISKIES[itemIndex % WHISKIES.length];
  const bg = new THREE.Group();
  bg.name = spec.id;

  const glassMat = new THREE.MeshStandardMaterial({
    color: spec.glassColor,
    roughness: spec.roughness ?? 0.08,
    metalness: 0.12,
    transparent: true,
    opacity: 0.90,
    depthWrite: true
  });

  const liquidMat = new THREE.MeshStandardMaterial({
    color: spec.liquidColor ?? 0xd68524,
    roughness: 0.15,
    metalness: 0.05
  });

  const capMat = new THREE.MeshStandardMaterial({
    color: spec.capColor,
    roughness: 0.35,
    metalness: 0.45
  });

  const corkMat = new THREE.MeshStandardMaterial({
    color: spec.corkColor ?? 0xb8925f,
    roughness: 0.85
  });

  const labelTex = getLabelTexture(spec.labelStyle);
  const labelMat = new THREE.MeshStandardMaterial({
    map: labelTex,
    roughness: 0.65,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide
  });

  if (spec.shape === 'square') {
    // Tullamore D.E.W.: smooth lofted rectangular-to-round profile with punt and collar
    const bodyD = 0.054;
    const body = new THREE.Mesh(buildTullamoreGeometry(false), glassMat);
    bg.add(body);

    const liquid = new THREE.Mesh(buildTullamoreGeometry(true), liquidMat);
    bg.add(liquid);

    // Green collar + wood cork cap
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0152, 0.0152, 0.024, 20), capMat);
    cap.position.set(0, 0.238, 0);
    bg.add(cap);

    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.012, 20), corkMat);
    cork.position.set(0, 0.255, 0);
    bg.add(cork);

    // Front label
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.058, 0.075), labelMat);
    label.position.set(0, 0.082, bodyD / 2 + 0.0004);
    bg.add(label);

  } else if (spec.shape === 'triangular') {
    // Glenfiddich: rounded tricorn profile with punt, smooth shoulder, collar and lip
    const profile = [
      [0, 0.010], [0.015, 0.005], [0.033, 0.000], [0.038, 0.004],
      [0.041, 0.155], [0.0395, 0.172], [0.0350, 0.188], [0.0280, 0.204],
      [0.0190, 0.220], [0.0145, 0.235], [0.0135, 0.258], [0.0160, 0.268],
      [0.0150, 0.275], [0.0115, 0.275]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), glassMat);
    body.scale.set(1.08, 1, 0.92);
    bg.add(body);

    const liquidProfile = [
      [0, 0.008], [0.030, 0.004], [0.036, 0.006], [0.037, 0.155],
      [0.032, 0.185], [0.022, 0.205], [0, 0.205]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidProfile, 20), liquidMat);
    liquid.scale.set(1.07, 1, 0.93);
    bg.add(liquid);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0160, 0.025, 20), capMat);
    cap.position.set(0, 0.275, 0);
    bg.add(cap);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0412, 0.0412, 0.075, 32, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
      labelMat
    );
    label.position.set(0, 0.09, 0);
    bg.add(label);

  } else if (spec.shape === 'conical') {
    // The Macallan: elegant wide-shouldered tapered profile, punt, collar and lip
    const profile = [
      [0, 0.010], [0.015, 0.005], [0.028, 0.000], [0.035, 0.004],
      [0.042, 0.165], [0.0415, 0.180], [0.0385, 0.195], [0.0325, 0.210],
      [0.0235, 0.225], [0.0160, 0.240], [0.0135, 0.255], [0.0135, 0.275],
      [0.0160, 0.283], [0.0155, 0.290], [0.0115, 0.290]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), glassMat);
    bg.add(body);

    const liquidProfile = [
      [0, 0.008], [0.030, 0.004], [0.038, 0.165], [0.035, 0.190],
      [0.025, 0.215], [0, 0.215]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidProfile, 20), liquidMat);
    bg.add(liquid);

    // Blue foil neck sleeve
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0165, 0.045, 20), capMat);
    cap.position.set(0, 0.275, 0);
    bg.add(cap);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0402, 0.0378, 0.082, 32, 1, true, -Math.PI / 3.2, (2 * Math.PI) / 3.2),
      labelMat
    );
    label.position.set(0, 0.098, 0);
    bg.add(label);

  } else if (spec.shape === 'islay') {
    // Lagavulin: sturdy wide cylinder with punt, neck bulge and collar finish
    const profile = [
      [0, 0.010], [0.015, 0.005], [0.035, 0.000], [0.042, 0.004],
      [0.0425, 0.145], [0.0415, 0.160], [0.0385, 0.175], [0.0330, 0.188],
      [0.0240, 0.200], [0.0175, 0.210], [0.0155, 0.225], [0.0165, 0.245],
      [0.0150, 0.258], [0.0170, 0.264], [0.0160, 0.270], [0.0120, 0.270]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), glassMat);
    bg.add(body);

    const liquidProfile = [
      [0, 0.008], [0.034, 0.004], [0.039, 0.145], [0.033, 0.175],
      [0.020, 0.200], [0, 0.200]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidProfile, 20), liquidMat);
    bg.add(liquid);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0162, 0.0162, 0.024, 20), capMat);
    cap.position.set(0, 0.268, 0);
    bg.add(cap);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0428, 0.0428, 0.076, 32, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
      labelMat
    );
    label.position.set(0, 0.082, 0);
    bg.add(label);

  } else if (spec.shape === 'ardbeg') {
    // Ardbeg: dark olive cylinder with punt, soft shoulder and pronounced collar
    const profile = [
      [0, 0.010], [0.015, 0.005], [0.032, 0.000], [0.039, 0.004],
      [0.0395, 0.150], [0.0385, 0.165], [0.0350, 0.180], [0.0280, 0.195],
      [0.0195, 0.210], [0.0155, 0.225], [0.0145, 0.245], [0.0175, 0.258],
      [0.0175, 0.264], [0.0160, 0.272], [0.0120, 0.272]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), glassMat);
    bg.add(body);

    const liquidProfile = [
      [0, 0.008], [0.032, 0.004], [0.036, 0.150], [0.031, 0.180],
      [0.018, 0.205], [0, 0.205]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidProfile, 20), liquidMat);
    bg.add(liquid);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0158, 0.026, 20), capMat);
    cap.position.set(0, 0.268, 0);
    bg.add(cap);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0398, 0.0398, 0.08, 32, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
      labelMat
    );
    label.position.set(0, 0.088, 0);
    bg.add(label);

  } else {
    // Balvenie: compact stout profile with soft curves, punt and collar
    const profile = [
      [0, 0.010], [0.015, 0.005], [0.034, 0.000], [0.041, 0.004],
      [0.0415, 0.135], [0.0405, 0.150], [0.0370, 0.168], [0.0300, 0.185],
      [0.0210, 0.200], [0.0155, 0.215], [0.0142, 0.238], [0.0165, 0.248],
      [0.0155, 0.255], [0.0118, 0.255]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), glassMat);
    bg.add(body);

    const liquidProfile = [
      [0, 0.008], [0.033, 0.004], [0.038, 0.135], [0.032, 0.168],
      [0.019, 0.195], [0, 0.195]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidProfile, 20), liquidMat);
    bg.add(liquid);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0162, 0.0162, 0.022, 20), capMat);
    cap.position.set(0, 0.255, 0);
    bg.add(cap);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0418, 0.0418, 0.076, 32, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
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
    roughness: spec.roughness ?? 0.08,
    metalness: 0.12,
    transparent: true,
    opacity: 0.90,
    depthWrite: true
  });

  const liquidMat = new THREE.MeshStandardMaterial({
    color: spec.liquidColor ?? 0x3a050e,
    roughness: 0.15,
    metalness: 0.05
  });

  const capMat = new THREE.MeshStandardMaterial({
    color: spec.capColor,
    roughness: spec.foilGold ? 0.28 : 0.40,
    metalness: spec.foilGold ? 0.85 : 0.40
  });

  const corkMat = new THREE.MeshStandardMaterial({
    color: 0xb8925f,
    roughness: 0.9
  });

  const labelTex = getLabelTexture(spec.labelStyle);
  const labelMat = new THREE.MeshStandardMaterial({
    map: labelTex,
    roughness: 0.65,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide
  });

  if (spec.shape === 'champagne_dom') {
    // Dom Pérignon: wide sloping champagne bottle with deep punt, smooth neck transition and foil
    const profile = [
      [0, 0.016], [0.018, 0.009], [0.036, 0.000], [0.044, 0.004],
      [0.046, 0.100], [0.045, 0.130], [0.041, 0.165], [0.035, 0.195],
      [0.027, 0.220], [0.020, 0.245], [0.016, 0.265], [0.015, 0.285],
      [0.0175, 0.298], [0.0185, 0.306], [0.0145, 0.310], [0.0115, 0.310]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), glassMat);
    bg.add(body);

    const liquidProfile = [
      [0, 0.012], [0.034, 0.004], [0.042, 0.100], [0.038, 0.160],
      [0.024, 0.215], [0, 0.215]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidProfile, 20), liquidMat);
    bg.add(liquid);

    // Black/gold foil sleeve
    const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0215, 0.085, 20), capMat);
    foil.position.set(0, 0.270, 0);
    bg.add(foil);

    // Dom Pérignon shield
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0458, 0.0442, 0.088, 32, 1, true, -Math.PI / 3.2, (2 * Math.PI) / 3.2),
      labelMat
    );
    label.position.set(0, 0.11, 0);
    bg.add(label);

  } else if (spec.shape === 'champagne_krug') {
    // Krug: high-shouldered champagne bottle with deep punt and gold foil
    const profile = [
      [0, 0.018], [0.018, 0.010], [0.034, 0.000], [0.042, 0.004],
      [0.043, 0.120], [0.042, 0.150], [0.038, 0.180], [0.031, 0.210],
      [0.023, 0.235], [0.017, 0.258], [0.015, 0.280], [0.0175, 0.302],
      [0.0180, 0.310], [0.0140, 0.315], [0.0115, 0.315]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), glassMat);
    bg.add(body);

    const liquidProfile = [
      [0, 0.014], [0.033, 0.004], [0.039, 0.120], [0.034, 0.180],
      [0.020, 0.230], [0, 0.230]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidProfile, 20), liquidMat);
    bg.add(liquid);

    const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0205, 0.085, 20), capMat);
    foil.position.set(0, 0.272, 0);
    bg.add(foil);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0434, 0.0422, 0.084, 32, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
      labelMat
    );
    label.position.set(0, 0.115, 0);
    bg.add(label);

  } else if (spec.shape === 'piemonte' || spec.shape === 'rhone') {
    // Sloping shoulder profile (Burgundy/Rhône/Piedmont) with punt and collar
    const profile = [
      [0, 0.012], [0.016, 0.007], [0.032, 0.000], [0.040, 0.004],
      [0.041, 0.130], [0.039, 0.155], [0.035, 0.180], [0.029, 0.205],
      [0.022, 0.230], [0.0165, 0.252], [0.0138, 0.270], [0.0135, 0.295],
      [0.0152, 0.302], [0.0152, 0.310], [0.0145, 0.315], [0.0115, 0.315]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), glassMat);
    bg.add(body);

    const liquidProfile = [
      [0, 0.009], [0.032, 0.004], [0.037, 0.130], [0.032, 0.175],
      [0.019, 0.225], [0, 0.225]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidProfile, 20), liquidMat);
    bg.add(liquid);

    // Foil capsule
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0150, 0.045, 20), capMat);
    cap.position.set(0, 0.292, 0);
    bg.add(cap);

    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.0118, 0.0118, 0.01, 16), corkMat);
    cork.position.set(0, 0.318, 0);
    bg.add(cork);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0414, 0.0414, 0.085, 32, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
      labelMat
    );
    label.position.set(0, 0.105, 0);
    bg.add(label);

  } else {
    // Bordeaux profile: straight cylinder with high graceful shoulder, punt and collar
    const profile = [
      [0, 0.012], [0.016, 0.007], [0.030, 0.000], [0.0375, 0.004],
      [0.038, 0.180], [0.0375, 0.195], [0.0355, 0.210], [0.0315, 0.225],
      [0.0250, 0.240], [0.0180, 0.252], [0.0145, 0.262], [0.0135, 0.272],
      [0.0135, 0.295], [0.0155, 0.302], [0.0155, 0.312], [0.0140, 0.314],
      [0.0150, 0.318], [0.0115, 0.320]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), glassMat);
    bg.add(body);

    const liquidProfile = [
      [0, 0.009], [0.030, 0.004], [0.035, 0.180], [0.032, 0.205],
      [0.020, 0.235], [0, 0.235]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liquidProfile, 20), liquidMat);
    bg.add(liquid);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0150, 0.045, 20), capMat);
    cap.position.set(0, 0.295, 0);
    bg.add(cap);

    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.0118, 0.0118, 0.01, 16), corkMat);
    cork.position.set(0, 0.322, 0);
    bg.add(cork);

    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0384, 0.0384, 0.088, 32, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
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
