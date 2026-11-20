import { avatarTriangles } from '../src/avatar.js';
for (const legs of [0,1,2,3,4]) { try { console.log(legs, avatarTriangles(0, legs, 0), avatarTriangles(0, legs, 4)); } catch (e) { console.log(legs, 'ERR', e.message); } }
