// Run with Aside REPL against a local server serving the skill on port 8769.
// Uses only the test server's backup keys; does not change source files.
const url = 'http://127.0.0.1:8769/examples/demo.html';
const found = (await listBrowserTabs()).find(t => t.url === url);
if (found) await attachBrowserTab(found.targetId); else await openTab(url);
console.log((await snapshot(page, {interactive:true})).tree);
const results = [];
function check(name, pass) { if (!pass) throw new Error(name); results.push(name); }
const shown = () => page.evaluate(() => document.getElementById('doc-restore-banner').classList.contains('show'));
await page.evaluate(() => {
  window.__qaKey='docedit:autosave:url:'+location.origin+location.pathname;
  localStorage.setItem(window.__qaKey, JSON.stringify({ts:new Date().toISOString(),html:'<p>이전 백업</p>'}));
});
await page.reload(); console.log((await snapshot(page, {interactive:true})).diff);
check('old backup prompts', await shown());
await page.locator('#doc-rb-ignore').click(); console.log((await snapshot(page, {interactive:true})).diff);
check('ignore hides prompt', !(await shown()));
await page.reload(); console.log((await snapshot(page, {interactive:true})).diff);
check('ignore preserves prompt on reload', await shown());
await page.evaluate(() => { window.__qaSet=Storage.prototype.setItem; Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');}; });
await page.locator('#doc-rb-keep-current').click(); console.log((await snapshot(page, {interactive:true})).diff);
check('backup failure leaves banner visible', await shown());
check('backup failure reported', await page.evaluate(() => document.getElementById('doc-toast').textContent.includes('저장하지 못했습니다')));
await page.evaluate(() => {Storage.prototype.setItem=window.__qaSet;});
await page.locator('#doc-rb-keep-current').click(); console.log((await snapshot(page, {interactive:true})).diff);
check('confirm hides prompt', !(await shown()));
check('confirm replaces backup with current content', await page.evaluate(() => JSON.parse(localStorage.getItem('docedit:autosave:url:'+location.origin+location.pathname)).html===document.getElementById('doc-content').innerHTML));
await closeTab(page); await openTab(url); console.log((await snapshot(page, {interactive:true})).tree);
check('close and reopen stays quiet', !(await shown()));
check('static serialization and edit UI', await page.evaluate(() => {
 const ed=window.DocEditor; ed.edit(true);
 const visible=getComputedStyle(document.getElementById('doc-editbar')).display!=='none' && getComputedStyle(document.getElementById('doc-inspector')).display!=='none';
 const html=ed.getHTML(), d=new DOMParser().parseFromString(html,'text/html');
 ed.edit(false);
 return visible && d.querySelectorAll('#doc-content').length===1 && !d.body.classList.contains('doc-editing') && d.querySelector('#doc-content').getAttribute('contenteditable')==='false' && html.includes('window.DocEditor=') && getComputedStyle(document.getElementById('doc-editbar')).display==='none';
}));
await page.locator('#doc-editToggle').click(); console.log((await snapshot(page, {interactive:true})).diff);
await page.locator('#doc-content').fill('새 미저장 수정');
await page.reload(); console.log((await snapshot(page, {interactive:true})).diff);
check('new edits prompt after immediate reload', await shown());
await page.locator('#doc-rb-restore').click(); console.log((await snapshot(page, {interactive:true})).diff);
check('new edits recover', await page.evaluate(() => document.getElementById('doc-content').textContent.trim()==='새 미저장 수정'));
await page.evaluate(() => localStorage.setItem('docedit:autosave:url:'+location.origin+location.pathname, JSON.stringify({ts:new Date().toISOString(),html:''})));
await page.reload(); console.log((await snapshot(page, {interactive:true})).diff);
check('empty backup prompts', await shown());
await page.locator('#doc-rb-restore').click(); console.log((await snapshot(page, {interactive:true})).diff);
check('empty backup recovers', await page.evaluate(() => document.getElementById('doc-content').innerHTML===''));
await page.evaluate(() => localStorage.removeItem('docedit:autosave:url:'+location.origin+location.pathname));
await page.reload(); console.log((await snapshot(page, {interactive:true})).diff);
// Save API mocks exercise serialization, cancellation and failed writes without overwriting files.
check('save cancellation preserves history and identity', await page.evaluate(async () => {
 const before=window.DocEditor.getHTML();
 window.showSaveFilePicker=async () => {throw new DOMException('cancel','AbortError');};
 await window.DocEditor.save();
 return window.DocEditor.getHTML()===before;
}));
check('save then repeat does not duplicate history', await page.evaluate(async () => {
 window.__qaWrites=[];
 window.showSaveFilePicker=async () => ({name:'test.html', queryPermission:async ()=>'granted', createWritable:async () => ({write:async html=>window.__qaWrites.push(html),close:async()=>{}})});
 window.DocEditor.edit(true);
 document.getElementById('doc-content').innerHTML='<p>저장 검증</p>';
 document.getElementById('doc-content').dispatchEvent(new Event('input',{bubbles:true}));
 await window.DocEditor.save(); await window.DocEditor.save();
 const outputs=window.__qaWrites.map(h=>new DOMParser().parseFromString(h,'text/html'));
 return outputs.length===2 && outputs.every(d=>JSON.parse(d.getElementById('doc-history').textContent).length===1) && !document.body.dataset.docId;
}));
check('save failure download updates baseline once', await page.evaluate(async () => {
 // Use an isolated frame to reset the previously chosen file handle.
 const source=await (await fetch('/assets/skeleton.html')).text();
 const frame=document.createElement('iframe');
 frame.srcdoc=source; document.body.appendChild(frame);
 await new Promise(resolve=>frame.onload=resolve);
 const w=frame.contentWindow, c=w.document.getElementById('doc-content');
 w.showSaveFilePicker=async()=>({name:'fail.html',createWritable:async()=>{throw new Error('disk');}});
 const downloads=[]; w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
 c.innerHTML='<p>실패 후 다운로드</p>'; await w.DocEditor.save(); await w.DocEditor.save();
 const d=new DOMParser().parseFromString(w.DocEditor.getHTML(),'text/html');
 const ok=downloads.length===2 && JSON.parse(d.getElementById('doc-history').textContent).length===1;
 frame.remove(); return ok;
}));
await page.evaluate(() => localStorage.removeItem('docedit:autosave:url:'+location.origin+location.pathname));
await page.reload(); console.log((await snapshot(page, {interactive:true})).diff);
console.log(JSON.stringify({pass:true,count:results.length,results}));
