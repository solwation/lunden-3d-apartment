// Deterministic 60 Hz production sequence, sampled at 12 fps. Encode in a separate
// blank page with its native clock: the consumer fixture deliberately controls performance.now.
const fs=require('fs'),path=require('path');
module.exports=async(page,out,browser)=>{
 const result=await page.evaluate(()=>captureFrames());
 for(const [label,n]of[['start',21],['stop',40],['turn',64],['sit',100],['stand',112]])fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(result.frames[n],'base64'));
 fs.writeFileSync(path.join(out,'sequence.json'),JSON.stringify(result.data));
 const encoder=await browser.newPage();
 try{
 await encoder.goto('about:blank');
 const data=await encoder.evaluate(async frames=>{
  const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=735;document.body.append(canvas);
  const ctx=canvas.getContext('2d'),images=await Promise.all(frames.map(s=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.src='data:image/png;base64,'+s;})));
  const chunks=[],stream=canvas.captureStream(12),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2800000});recorder.ondataavailable=e=>chunks.push(e.data);const end=new Promise(resolve=>recorder.onstop=resolve);
  recorder.start();for(const image of images){ctx.drawImage(image,0,0);await new Promise(r=>setTimeout(r,1000/12));}recorder.stop();await end;stream.getTracks().forEach(t=>t.stop());
  const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);
 },result.frames);
 fs.writeFileSync(path.join(out,'sequence.webm'),Buffer.from(data,'base64'));
 }finally{await encoder.close();}
 return {simulatedSeconds:11,dataFrames:result.data.length,videoFrames:result.frames.length,samplingHz:12};
};
