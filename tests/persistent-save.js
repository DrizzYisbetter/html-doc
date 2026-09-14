// Aside REPL, local test server on port 8769. Actual IndexedDB + OPFS handles,
// never user files. Native picker, permission denial and NotFoundError are simulated.
const url='http://127.0.0.1:8769/examples/demo.html';
const found=(await listBrowserTabs()).find(t=>t.url===url);
if(found) await attachBrowserTab(found.targetId); else await openTab(url);
console.log((await snapshot(page,{interactive:true})).tree);
const names=['doc-editor-qa-'+Date.now()+'.html','doc-editor-copy-'+Date.now()+'.html'];
const results=[];
function check(name,ok){if(typeof ok==='object'){console.log(ok);ok=ok.pass;}if(!ok)throw new Error(name);results.push(name);}
await page.evaluate(async()=>{
 await new Promise((resolve,reject)=>{const r=indexedDB.open('docedit-file-links',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('files','readwrite');t.objectStore('files').delete(location.origin+location.pathname);t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};r.onerror=()=>reject(r.error);});
});
await page.reload();console.log((await snapshot(page,{interactive:true})).diff);
check('first choice writes and persists native handle',await page.evaluate(async name=>{
 window.prompt=()=>'QA';
 const root=await navigator.storage.getDirectory();const h=await root.getFileHandle(name,{create:true});
 let calls=0;window.showSaveFilePicker=async()=>{calls++;return h;};
 await window.DocEditor.save();await window.DocEditor.save();
 const saved=await (await h.getFile()).text();
 const stored=await new Promise((resolve,reject)=>{const r=indexedDB.open('docedit-file-links',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('files','readonly');const q=t.objectStore('files').get(location.origin+location.pathname);q.onsuccess=()=>resolve(q.result);t.oncomplete=()=>db.close();};r.onerror=()=>reject(r.error);});
 return calls===1 && saved.startsWith('<!DOCTYPE html>') && stored && await stored.isSameEntry(h);
},names[0]));
await closeTab(page);await openTab(url);console.log((await snapshot(page,{interactive:true})).tree);
check('close and reopen reuses handle without picker',await page.evaluate(async name=>{
 window.prompt=()=>'QA';
 let calls=0;window.showSaveFilePicker=async()=>{calls++;throw new Error('Unexpected picker');};
 document.getElementById('doc-content').innerHTML='<p>재열기 후 저장</p>';
 await window.DocEditor.save();
 const root=await navigator.storage.getDirectory();const h=await root.getFileHandle(name);const html=await(await h.getFile()).text();
 return calls===0 && html.includes('<p>재열기 후 저장</p>');
},names[0]));
check('permission denial neither writes nor downloads',await page.evaluate(async name=>{
 const proto=FileSystemHandle.prototype, q=proto.queryPermission, r=proto.requestPermission;
 const root=await navigator.storage.getDirectory(),h=await root.getFileHandle(name), before=await(await h.getFile()).text();
 let asks=0,downloads=0;const click=HTMLAnchorElement.prototype.click;
 proto.queryPermission=async()=> 'prompt';proto.requestPermission=async()=>{asks++;return 'denied';};HTMLAnchorElement.prototype.click=()=>{downloads++;};
 document.getElementById('doc-content').innerHTML='<p>권한 거부 수정</p>';await window.DocEditor.save();
 proto.queryPermission=q;proto.requestPermission=r;HTMLAnchorElement.prototype.click=click;
 return asks===1 && downloads===0 && await(await h.getFile()).text()===before && document.getElementById('doc-toast').textContent.includes('허용되지');
},names[0]));
await page.evaluate(async name=>{window.prompt=()=>'QA';const root=await navigator.storage.getDirectory();const h=await root.getFileHandle(name,{create:true});window.__qaPickerCalls=0;window.showSaveFilePicker=async()=>{window.__qaPickerCalls++;return h;};},names[1]);
await page.locator('#doc-saveAsBtn').click();console.log((await snapshot(page,{interactive:true})).diff);
check('save as selects new file but preserves original path binding',await page.evaluate(async names=>{
 const root=await navigator.storage.getDirectory(),copy=await root.getFileHandle(names[1]);
 // Await the UI completion, without a timing assumption about disk/IDB latency.
 await new Promise(resolve=>{if(document.getElementById('doc-toast').textContent.includes(names[1]))return resolve();const ob=new MutationObserver(()=>{if(document.getElementById('doc-toast').textContent.includes(names[1])){ob.disconnect();resolve();}});ob.observe(document.getElementById('doc-toast'),{childList:true,subtree:true,characterData:true});});
 const stored=await new Promise(resolve=>{const r=indexedDB.open('docedit-file-links',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('files','readonly');const q=t.objectStore('files').get(location.origin+location.pathname);q.onsuccess=()=>resolve(q.result);t.oncomplete=()=>db.close();};});
 return window.__qaPickerCalls===1 && (await(await copy.getFile()).text()).startsWith('<!DOCTYPE html>') && stored.name===names[0];
},names));
await page.reload();console.log((await snapshot(page,{interactive:true})).diff);
check('deleted file detaches and next save allows a new choice',await page.evaluate(async names=>{
 window.prompt=()=>'QA';
 const root=await navigator.storage.getDirectory();
 const proto=FileSystemFileHandle.prototype, writable=proto.createWritable;
 proto.createWritable=async function(){throw new DOMException('File removed','NotFoundError');};
 let calls=0;window.showSaveFilePicker=async()=>{calls++;return root.getFileHandle(names[1]);};
 await window.DocEditor.save();proto.createWritable=writable;const notified=document.getElementById('doc-toast').textContent.includes('찾지 못했습니다');
 await window.DocEditor.save();return {pass:notified && calls===1,notified,calls,toast:document.getElementById('doc-toast').textContent};
},names));
// Clean up only this test's own handles, backup keys and OPFS files.
await page.evaluate(async names=>{
 const root=await navigator.storage.getDirectory();for(const name of names)try{await root.removeEntry(name);}catch(e){}
 for(const key of Object.keys(localStorage))if(key.startsWith('docedit:autosave:'))localStorage.removeItem(key);
 await new Promise(resolve=>{const r=indexedDB.open('docedit-file-links',1);r.onsuccess=()=>{const db=r.result;const t=db.transaction('files','readwrite');t.objectStore('files').delete(location.origin+location.pathname);t.oncomplete=()=>{db.close();resolve();};};});
},names);
await page.reload();console.log((await snapshot(page,{interactive:true})).diff);
console.log(JSON.stringify({pass:true,count:results.length,results}));
