// #1848: reuse on an ALREADY OPEN real app/panel; never starts a world or fabricates discoveries.
const path=require('path');
module.exports=async function bestiaryNative(page,{out,entryId,touch=false}){
 const prefix=touch?'touch':'desktop',choose=async locator=>touch?locator.tap():locator.click();
 await page.waitForSelector('#binder-view:not([hidden]) .dex-tile');
 const waitImages=()=>page.waitForFunction(()=>{const root=document.querySelector('#binder-view .dex-body').getBoundingClientRect();return [...document.querySelectorAll('#binder-view .dex-body .dex-art')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.height&&r.bottom>root.top&&r.top<root.bottom&&r.right>root.left&&r.left<root.right;}).every(n=>n.classList.contains('loaded'));},null,{timeout:60000});
 await waitImages();await page.locator('#binder-view .binder').screenshot({path:path.join(out,prefix+'-grid.png')});
 const index=await page.locator('#binder-view [data-act=entry]').evaluateAll((nodes,id)=>nodes.findIndex(n=>n.dataset.id===id),entryId);if(index<0)throw Error('Real discovered entry absent from grid');await choose(page.locator('#binder-view [data-act=entry]').nth(index));await waitImages();
 const detail=await page.evaluate(()=>({cards:[...document.querySelectorAll('#binder-view .dex-card')].filter(n=>n.getClientRects().length).length,stats:document.querySelector('#binder-view .dex-stats')?.textContent,photos:document.querySelectorAll('#binder-view [data-act=photo]').length,chain:document.querySelectorAll('#binder-view .dex-chain-link').length}));
 if(!detail.stats||detail.photos<1)throw Error('Actual interaction statistics/photo not present');await page.locator('#binder-view .binder').screenshot({path:path.join(out,prefix+'-detail.png')});
 await page.locator('#binder-view .dex-chain').first().scrollIntoViewIfNeeded();await waitImages();await page.locator('#binder-view .binder').screenshot({path:path.join(out,prefix+'-chain-photos.png')});
 await choose(page.locator('#binder-view [data-act=photo]').first());await page.waitForSelector('#binder-view .dex-photo:not([hidden])');await page.keyboard.press('Escape');if(await page.locator('#binder-view .dex-photo').isVisible())throw Error('Photo escape failed');
 await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape');await page.waitForSelector('#binder-view .dex-grid');return detail;
};
