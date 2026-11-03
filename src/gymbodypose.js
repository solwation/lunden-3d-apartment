// #1842: shared skeleton IK, no replacement geometry. Coordinates are model metres before avatar scale.
import {poseOlof} from './olof.js';
import {OUTDOOR_GYM as C} from './config.js';
import {gymPoseWire} from './gymposewire.js';
export function applyGymBodyPose(avatar,value,look=[0,0]){
 const gx=gymPoseWire(value);if(!gx)return;
 const[k,a]=gx,U=C.use,scale=avatar.object.scale.y,wide=avatar.object.scale.z,gaze={turn:look[0],head:look[1]},hand=(x,y,z)=>({at:[x,y,z],pole:[Math.sign(x),.5,-.2]});
 let hip=[U.hip,0],feet=[[0,U.ankle,0],[.12,.2,-.12]],hands=[hand(.65,1.25,0),hand(-.65,1.25,0)],lean=0;
 if(k===1||k===6){feet=[[.1,.12,-.08],[-.1,.12,-.08]];hands=[hand(.2,U.grip-(k===6?a*C.pullRise:0),U.hangBody*scale/wide),hand(-.2,U.grip-(k===6?a*C.pullRise:0),U.hangBody*scale/wide)];}
 if(k===3){hip=[.55,0];const reach=C.use.netBodyOffset*scale/wide;feet=[[.1,U.ankle,reach],[-.1,U.ankle,reach]];hands=[hand(.25,(C.landscape.course.net[3]-C.landscape.course.netInset-C.landscape.course.netBottom)/C.landscape.course.netRows*Math.min(C.landscape.course.netRows,Math.max(1,Math.floor(scale*C.landscape.course.netRows)))/scale,reach),hand(-.25,(C.landscape.course.net[3]-C.landscape.course.netInset-C.landscape.course.netBottom)/C.landscape.course.netRows*Math.min(C.landscape.course.netRows,Math.max(1,Math.floor(scale*C.landscape.course.netRows)))/scale,reach)];lean=-.08;}
 if(k===4){feet=[[.1,.35,-.2],[-.1,.35,-.2]];hands=[hand(.3,U.dipGrip+a*U.dip,(U.dipBody*scale-C.landscape.parallel.padR)/wide),hand(-.3,U.dipGrip+a*U.dip,(U.dipBody*scale-C.landscape.parallel.padR)/wide)];}
 if(k===5){const I=C.landscape.incline,slope=Math.atan2(I.high-I.low,I.run);lean=Math.PI/2-Math.atan(Math.tan(slope+a*U.crunch)*wide/scale);feet=[[.1,U.hip-U.legReach*Math.tan(slope)*wide/scale+U.ankle,U.legReach],[-.1,U.hip-U.legReach*Math.tan(slope)*wide/scale+U.ankle,U.legReach]];hands=[hand(.2,U.hip+.3,-.25),hand(-.2,U.hip+.3,-.25)];}
 if(k===7){const grip=U.hip+(C.geometry.press.logY-C.logRadius-C.bench-.08)/scale+a*C.stations.find(s=>s.id==='press').lift,foot=U.hip+(C.board/2-.08)/scale+U.ankle;lean=Math.PI/2-U.pressLean;feet=[[.1,foot,U.legReach],[-.1,foot,U.legReach]];hands=[hand(.3,grip,-C.geometry.press.logZ/wide),hand(-.3,grip,-C.geometry.press.logZ/wide)];}
 if(k===8){feet=[[-.08,U.ankle+(C.stepHeight*(1-a)+C.board/2)/scale,(C.geometry.step.eyeZ-a*C.stepTravel-U.stepFootZ)/wide],[.08,U.ankle,-.2]];}
 poseOlof(avatar,{hip,feet,hands,lean,...gaze,knee:[0,.25,1],can:null});
}
