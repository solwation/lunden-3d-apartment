// #1842: optional transient gym IK hint; old clients safely ignore this field.
export function gymPoseWire(value){return Array.isArray(value)&&value.length===2&&Number.isInteger(value[0])&&value[0]>=1&&value[0]<=8&&Number.isFinite(value[1])&&value[1]>=0&&value[1]<=1?[value[0],Math.round(value[1]*100)/100]:null;}
