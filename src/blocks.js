import { BLOCKS as C } from './config.js';

// #1577 Klossar: a classic falling-block game for one player per computer. Pure rules, no DOM; src/arcadeview.js draws it.
export const SHAPES = {
  I:[[0,1],[1,1],[2,1],[3,1]], O:[[1,0],[2,0],[1,1],[2,1]], T:[[1,0],[0,1],[1,1],[2,1]],
  S:[[1,0],[2,0],[0,1],[1,1]], Z:[[0,0],[1,0],[1,1],[2,1]], J:[[0,0],[0,1],[1,1],[2,1]], L:[[2,0],[0,1],[1,1],[2,1]],
};
export const COLORS = { I:'#58d9ec', O:'#ffd25e', T:'#c89aff', S:'#73e66b', Z:'#f17a7a', J:'#6f8cff', L:'#ffa65a' };
const BOX = { I:4, O:4 };
const KICKS = [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1]];

/** Line clears score lineScores[n] × level; the level rises every linesPerLevel lines and gravity speeds up. */
export class BlocksGame {
  constructor(random=Math.random) { this.random=random;this.reset(); }
  reset() {
    this.board=Array.from({length:C.rows},()=>Array(C.cols).fill(''));
    this.bag=[];this.score=0;this.lines=0;this.level=1;this.pieces=0;this.ms=0;this.fall=0;
    this.running=false;this.over=false;this.piece=null;this.next=this.draw();
  }
  start() { this.reset();this.running=true;this.spawn(); }
  draw() { if(!this.bag.length){this.bag=Object.keys(SHAPES);for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}}return this.bag.pop(); }
  spawn() {
    const type=this.next;this.next=this.draw();
    this.piece={type,cells:SHAPES[type].map(c=>c.slice()),x:Math.floor((C.cols-(BOX[type]??3))/2),y:0};
    if(!this.fits(this.piece.cells,this.piece.x,this.piece.y)){this.piece=null;this.end();}
  }
  end() { this.running=false;this.over=true; }
  get interval() { return Math.max(C.minMs,C.startMs*C.levelFactor**(this.level-1)); }
  fits(cells,x,y) { return cells.every(([cx,cy])=>{const bx=x+cx,by=y+cy;return bx>=0&&bx<C.cols&&by<C.rows&&(by<0||!this.board[by][bx]);}); }
  move(dx) { const p=this.piece;if(!this.running||!p||!this.fits(p.cells,p.x+dx,p.y))return false;p.x+=dx;return true; }
  rotate(dir=1) {
    const p=this.piece;if(!this.running||!p||p.type==='O')return false;
    const n=BOX[p.type]??3,cells=p.cells.map(([x,y])=>dir>0?[n-1-y,x]:[y,n-1-x]);
    for(const [kx,ky]of KICKS)if(this.fits(cells,p.x+kx,p.y+ky)){p.cells=cells;p.x+=kx;p.y+=ky;return true;}
    return false;
  }
  /** One row down; a piece that cannot fall locks. Player drops earn softDrop per row. */
  down(player=false) {
    const p=this.piece;if(!this.running||!p)return false;
    if(this.fits(p.cells,p.x,p.y+1)){p.y++;if(player)this.score+=C.softDrop;this.fall=0;return true;}
    this.lock();return false;
  }
  hard() { const p=this.piece;if(!this.running||!p)return 0;let rows=0;while(this.fits(p.cells,p.x,p.y+1)){p.y++;rows++;}this.score+=rows*C.hardDrop;this.lock();return rows; }
  ghost() { const p=this.piece;if(!p)return 0;let y=p.y;while(this.fits(p.cells,p.x,y+1))y++;return y; }
  lock() {
    const p=this.piece;this.piece=null;this.pieces++;
    for(const [cx,cy]of p.cells){const y=p.y+cy;if(y<0){this.end();return;}this.board[y][p.x+cx]=p.type;}
    const full=this.board.filter(r=>r.every(Boolean)).length;
    if(full){
      this.board=[...Array.from({length:full},()=>Array(C.cols).fill('')),...this.board.filter(r=>!r.every(Boolean))];
      this.score+=C.lineScores[full]*this.level;this.lines+=full;this.level=1+Math.floor(this.lines/C.linesPerLevel);
    }
    this.fall=0;this.spawn();
  }
  /** Gravity for `ms` of game time; capped so a background tab never drops a whole stack at once. */
  step(ms) {
    if(!this.running)return;
    ms=Math.min(ms,250);this.ms+=ms;this.fall+=ms;
    while(this.running&&this.fall>=this.interval){this.fall-=this.interval;this.down();}
  }
  result() { return {score:this.score,lines:this.lines,level:this.level,ms:Math.round(this.ms)}; }
}
