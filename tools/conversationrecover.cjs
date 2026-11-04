// Resume the existing held Page after choosing the native start control it actually displays.
const fs=require('node:fs'),source=fs.readFileSync('tools/conversationbrowser.cjs','utf8');
const defsStart=source.indexOf("const peer=page.frameLocator('#conversation-peer')"),defsEnd=source.indexOf("phase='keyboard';"),from=source.indexOf("phase='touch';"),to=source.indexOf("fs.writeFileSync(control+'.ready'");if([defsStart,defsEnd,from,to].some(x=>x<0))throw Error('missing scoped conversation anchors');
fs.writeFileSync(process.argv[2]||'/tmp/1867-browser.command','(async()=>{'+source.slice(defsStart,defsEnd)+'let s=await state();'+source.slice(from,to)+'return {checks,errors,phase};})()');
