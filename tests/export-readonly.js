// Aside REPL test; uses dedicated QA origin with the bundled demo and skeleton.
await openTab('http://127.0.0.1:8769/');
console.log((await snapshot(page)).tree);
const summary=await page.evaluate(async()=>{
 const results=[];
 const frame=async html=>{const f=document.createElement('iframe');f.style.cssText='width:390px;height:844px';const ready=new Promise(r=>f.onload=r);f.srcdoc=html;document.body.appendChild(f);await ready;return f;};
 const check=(name,pass)=>results.push({name,pass:!!pass});
 for(const name of ['examples/demo.html','assets/skeleton.html']){
  let src=await(await fetch(name)).text();
  src=src.replace('<body>','<body data-doc-id="qa-export-'+name+'" style="padding-top:11px">');
  src=src.replace('<script type="application/json" id="doc-history">[]</script>','<script type="application/json" id="doc-history">[{"ts":"2026-09-10","title":"HISTORY_ONLY_SECRET","html":"<p>HISTORY_ONLY_SECRET</p>"}]</script>');
  src=src.replace('</body>','<script>window.documentFeatureWorks=true;</script></body>');
  const f=await frame(src),w=f.contentWindow,d=w.document,c=d.getElementById('doc-content');
  w.DocEditor.edit(true);
  c.insertAdjacentHTML('beforeend','<p>아직 원본 파일에 저장하지 않은 최신 내용</p><div class="doc-ed-tablewrap"><table class="doc-ed-table"><thead><tr><th>머리글</th></tr></thead><tbody><tr><td>값</td></tr></tbody></table></div>');
  d.getElementById('doc-inspectorToggle').click();
  const before={body:c.innerHTML,history:d.getElementById('doc-history').textContent,padding:d.body.style.paddingTop,id:d.body.dataset.docId,backup:localStorage.getItem('docedit:autosave:'+d.body.dataset.docId)};
  const sourceDesign=d.querySelector('style').textContent;
  const beforeTable=w.getComputedStyle(c.querySelector('table.doc-ed-table th'));
  const tableStyle={padding:beforeTable.padding,border:beforeTable.borderTop,background:beforeTable.backgroundColor};
  const html=w.DocEditor.getReadOnlyHTML(),out=new DOMParser().parseFromString(html,'text/html');
  check(name+': editor UI/code/history stripped',!out.querySelector('#doc-controls,#doc-editbar,#doc-inspector,#doc-editflag,#doc-restore-banner,#doc-history-modal,#doc-toast,#doc-history,#doc-editor-style,#doc-editor-script') && !html.includes('HISTORY_ONLY_SECRET'));
  check(name+': current body and original design retained',out.getElementById('doc-content').innerHTML===before.body && out.querySelector('style').textContent===sourceDesign);
  check(name+': edit state stripped',!out.querySelector('#doc-content[contenteditable]') && !out.body.hasAttribute('data-doc-id') && !out.body.classList.contains('doc-editing') && out.body.style.paddingTop==='11px' && !out.body.style.getPropertyValue('--doc-ed-tools-bottom'));
  check(name+': original stays editable and unchanged',w.DocEditor.isEditing() && c.innerHTML===before.body && d.getElementById('doc-history').textContent===before.history && d.body.style.paddingTop===before.padding && d.body.dataset.docId===before.id && localStorage.getItem('docedit:autosave:'+before.id)===before.backup);
  const exported=await frame(html),ew=exported.contentWindow,ed=ew.document;
  check(name+': export reopens without editor and keeps document script',!ew.DocEditor && ew.documentFeatureWorks===true && ed.getElementById('doc-content').innerHTML===before.body);
  const afterTable=ew.getComputedStyle(ed.querySelector('table.doc-ed-table th'));
  check(name+': inserted table styling retained',afterTable.padding===tableStyle.padding && afterTable.borderTop===tableStyle.border && afterTable.backgroundColor===tableStyle.background);
  // Exercise the actual button without sending files outside the test browser.
  let captured=[];w.HTMLAnchorElement.prototype.click=function(){captured.push({name:this.download,url:this.href});};
  d.getElementById('doc-exportBtn').click();
  d.getElementById('doc-exportBtn').click();
  const blobs=await Promise.all(captured.map(async a=>({name:a.name,html:await(await w.fetch(a.url)).text()})));
  check(name+': button downloads separate clean copies',blobs.length===2 && blobs.every(b=>b.name.endsWith('-배포용.html') && !b.html.includes('data-doc-editor-download') && !new DOMParser().parseFromString(b.html,'text/html').querySelector('#doc-editor-script')));
  check(name+': regular save still includes editor',new DOMParser().parseFromString(w.DocEditor.getHTML(),'text/html').querySelector('#doc-editor-script'));
  exported.remove();f.remove();localStorage.removeItem('docedit:autosave:'+before.id);
 }
 return {pass:results.every(r=>r.pass),count:results.length,failures:results.filter(r=>!r.pass)};
});
console.log(JSON.stringify(summary));if(!summary.pass)throw new Error('Read-only export failed');
console.log((await snapshot(page)).diff);
