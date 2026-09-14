// Aside REPL 검증: 비교 엔진, 이름·출처·백업 안전장치, 메모, 비교 모드, 반응형.
// 저장소 루트를 http://127.0.0.1:8769 로 제공한 뒤 실행한다. 이 origin의 docedit:* 저장소를 지운다.
const url='http://127.0.0.1:8769/examples/demo.html';
const found=(await listBrowserTabs()).find(t=>t.url===url);
if(found) await attachBrowserTab(found.targetId); else await openTab(url);
const results=[];
function check(name,pass){ if(!pass) throw new Error('FAIL: '+name); results.push(name); console.log('ok: '+name); }
async function stub(){ await page.evaluate(()=>{ window.__prompts=0; window.prompt=()=>{window.__prompts++; return '검토자';}; window.confirm=()=>true; window.__downloads=[]; HTMLAnchorElement.prototype.click=function(){window.__downloads.push(this.download);}; }); }
async function fresh(){ await page.evaluate(()=>{ Object.keys(localStorage).filter(k=>k.startsWith('docedit:')).forEach(k=>localStorage.removeItem(k)); }); await page.reload(); await stub(); }
await fresh();

// ---- A. 비교 엔진 (DocEditorDiff) ----
check('diff: compare counts', await page.evaluate(()=>{
  const D=window.DocEditorDiff;
  const base='<h2>제목</h2><p>하나 둘 셋</p><p>지울 문단</p><ul><li>항목 A</li><li>항목 B</li></ul><p style="text-align:left">정렬</p>';
  const cur='<h2>제목</h2><p>하나 넷 셋</p><ul><li>항목 A</li><li>항목 B</li><li>항목 C</li></ul><p style="text-align:center">정렬</p><p>새 문단</p>';
  const c=D.compare(base,cur);
  return c.counts.mod===1&&c.counts.del===1&&c.counts.ins===2&&c.counts.fmt===1&&!c.exceeded;
}));
check('diff: render marks blocks and words', await page.evaluate(()=>{
  const D=window.DocEditorDiff, cmp=D.compare('<p>하나 둘 셋</p><p>지울 문단</p>','<p>하나 넷 셋</p>');
  D.render(cmp); const html=cmp.cRoot.innerHTML;
  return cmp.changes.length===2 && html.startsWith('<p class="doc-ed-diff-mod" data-doc-change="0">하나 ') && html.includes('<del class="doc-ed-del">둘</del>') && html.includes('<ins class="doc-ed-ins">넷</ins>') && html.endsWith('<p class="doc-ed-diff-del" data-doc-change="1">지울 문단</p>');
}));
check('diff: revert each change type', await page.evaluate(()=>{
  const D=window.DocEditorDiff;
  const base='<p>하나 둘 셋</p><p>지울 문단</p><p style="text-align:left">정렬</p>';
  const cur='<p>하나 넷 셋</p><p style="text-align:center">정렬</p><p>새 문단</p>';
  function apply(i){ const cmp=D.compare(base,cur); D.render(cmp); const model=document.createElement('div'); model.innerHTML=cur; return D.revert(cmp,i,model)?model.innerHTML:null; }
  const types=(()=>{const cmp=D.compare(base,cur); D.render(cmp); return cmp.changes.map(o=>o.type).join(',');})();
  return types==='mod,del,fmt,ins'
    && apply(0)==='<p>하나 둘 셋</p><p style="text-align:center">정렬</p><p>새 문단</p>'
    && apply(1)==='<p>하나 넷 셋</p><p>지울 문단</p><p style="text-align:center">정렬</p><p>새 문단</p>'
    && apply(2)==='<p>하나 넷 셋</p><p style="text-align:left">정렬</p><p>새 문단</p>'
    && apply(3)==='<p>하나 넷 셋</p><p style="text-align:center">정렬</p>';
}));
check('diff: note marks are ignored and kept', await page.evaluate(()=>{
  const D=window.DocEditorDiff, cmp=D.compare('<p>하나 둘 셋</p>','<p>하나 <mark class="doc-ed-note" data-doc-note="n1">둘</mark> 셋</p>');
  D.render(cmp);
  return cmp.changes.length===0 && !!cmp.cRoot.querySelector('mark.doc-ed-note');
}));
check('diff: word change inside a note keeps the mark', await page.evaluate(()=>{
  const D=window.DocEditorDiff, cmp=D.compare('<p>하나 둘 셋</p>','<p>하나 <mark class="doc-ed-note" data-doc-note="n1">넷</mark> 셋</p>');
  D.render(cmp); const p=cmp.cRoot.querySelector('p');
  return cmp.counts.mod===1 && !!p.querySelector('mark.doc-ed-note ins.doc-ed-ins') && !!p.querySelector('del.doc-ed-del');
}));
check('diff: inline runs and table cells', await page.evaluate(()=>{
  const D=window.DocEditorDiff;
  const cmp=D.compare('<div>앞 텍스트<p>문단</p></div><table><tr><td>가</td><td>나</td></tr></table>','<div>앞 글<p>문단</p></div><table><tr><td>가</td><td>다</td></tr></table>');
  D.render(cmp); const html=cmp.cRoot.innerHTML;
  const run=cmp.cRoot.querySelector('span.doc-ed-diff-run.doc-ed-diff-mod[data-doc-change="0"]');
  const td=cmp.cRoot.querySelector('td.doc-ed-diff-mod[data-doc-change="1"]');
  return cmp.counts.mod===2 && !!run && run.innerHTML.includes('<del class="doc-ed-del">텍스트</del>') && run.innerHTML.includes('<ins class="doc-ed-ins">글</ins>') && !!td && td.innerHTML.includes('<del class="doc-ed-del">나</del>') && td.innerHTML.includes('<ins class="doc-ed-ins">다</ins>');
}));
check('diff: deleted last list item stays inside its list (render and revert)', await page.evaluate(()=>{
  const D=window.DocEditorDiff, base='<ul><li>남는 항목</li><li>지운 항목</li></ul><p>끝</p>', cur='<ul><li>남는 항목</li></ul><p>끝</p>';
  const cmp=D.compare(base,cur); D.render(cmp); const del=cmp.cRoot.querySelector('.doc-ed-diff-del');
  const model=document.createElement('div'); model.innerHTML=cur; const ok=D.revert(cmp,0,model);
  return cmp.counts.del===1 && !!del && del.tagName==='LI' && del.parentNode.tagName==='UL' && ok && model.innerHTML===base;
}));
check('diff: deleted cell stays in its row, deleted paragraph stays in its section', await page.evaluate(()=>{
  const D=window.DocEditorDiff;
  const t=D.compare('<table><tbody><tr><td>가</td><td>나</td></tr><tr><td>다</td></tr></tbody></table>','<table><tbody><tr><td>가</td></tr><tr><td>다</td></tr></tbody></table>'); D.render(t);
  const cell=t.cRoot.querySelector('td.doc-ed-diff-del'), rowOk=!!cell && cell.parentNode===t.cRoot.querySelector('tr');
  const s=D.compare('<section><p>A</p><p>B</p></section><p>C</p>','<section><p>A</p></section><p>C</p>'); D.render(s);
  const para=s.cRoot.querySelector('p.doc-ed-diff-del'), secOk=!!para && para.parentNode.tagName==='SECTION';
  const m=document.createElement('div'); m.innerHTML='<section><p>A</p></section><p>C</p>'; const revOk=D.revert(s,0,m) && m.innerHTML==='<section><p>A</p><p>B</p></section><p>C</p>';
  return rowOk && secOk && revOk;
}));
check('diff: empty sides and unchanged hr', await page.evaluate(()=>{
  const D=window.DocEditorDiff, a=D.compare('','<p>x</p>'), b=D.compare('<p>x</p>',''), c=D.compare('<p>a</p><hr><p>b</p>','<p>a</p><hr><p>b</p>');
  D.render(b);
  return a.counts.ins===1 && b.counts.del===1 && b.cRoot.innerHTML==='<p class="doc-ed-diff-del" data-doc-change="0">x</p>' && c.changes.length===0 && c.ops.every(o=>o.type==='eq');
}));
check('diff: exceeded budget falls back to whole replacement', await page.evaluate(()=>{
  const D=window.DocEditorDiff;
  const a=Array.from({length:1200},(_,i)=>'<p>a'+i+'</p>').join(''), b=Array.from({length:1200},(_,i)=>'<p>b'+i+'</p>').join('');
  const cmp=D.compare(a,b);
  return cmp.exceeded && cmp.counts.del===1200 && cmp.counts.ins===1200;
}));

// ---- B. 이름·출처·첫 저장 ID·백업 안전장치 ----
await fresh();
check('author: prompt once on first save and remembered', await page.evaluate(async()=>{
  window.__writes=[];
  window.showSaveFilePicker=async()=>({name:'t.html',queryPermission:async()=>'granted',createWritable:async()=>({write:async h=>window.__writes.push(h),close:async()=>{}})});
  const c=document.getElementById('doc-content');
  window.DocEditor.edit(true); c.innerHTML='<p>첫 저장</p>'; c.dispatchEvent(new Event('input',{bubbles:true}));
  await window.DocEditor.save(); await window.DocEditor.save();
  return window.__prompts===1 && localStorage.getItem('docedit:author')==='검토자' && window.DocEditor.author()==='검토자';
}));
check('provenance: saved-by/at and history author are written, export strips them', await page.evaluate(()=>{
  const docs=window.__writes.map(h=>new DOMParser().parseFromString(h,'text/html'));
  const b=docs[1].body, hist=JSON.parse(docs[1].getElementById('doc-history').textContent);
  const ro=new DOMParser().parseFromString(window.DocEditor.getReadOnlyHTML(),'text/html').body;
  return docs.length===2 && b.dataset.docSavedBy==='검토자' && /^\d{4}-/.test(b.dataset.docSavedAt||'') && hist.length===1 && hist[0].author==='' && !!b.dataset.docId && !ro.hasAttribute('data-doc-saved-by') && !ro.hasAttribute('data-doc-saved-at');
}));
check('backup: first save assigns id and drops the path-keyed backup', await page.evaluate(()=>{
  const pathKey='docedit:autosave:url:'+location.origin+location.pathname, idKey='docedit:autosave:'+document.body.dataset.docId;
  const a=JSON.parse(localStorage.getItem(idKey));
  return localStorage.getItem(pathKey)===null && a && a.savedBy==='검토자' && a.savedAt===document.body.dataset.docSavedAt && Array.isArray(a.notes) && typeof a.title==='string';
}));
check('author: API setter updates storage', await page.evaluate(()=>{ window.DocEditor.author('바뀐 이름'); return localStorage.getItem('docedit:author')==='바뀐 이름' && window.DocEditor.author()==='바뀐 이름'; }));
await page.evaluate(()=>{ Object.keys(localStorage).filter(k=>k.startsWith('docedit:autosave:')).forEach(k=>localStorage.removeItem(k)); localStorage.setItem('docedit:autosave:url:'+location.origin+location.pathname, JSON.stringify({ts:new Date().toISOString(),html:'<p>다른 저장본에서 만든 백업</p>',title:'다른 문서',savedBy:'누군가',savedAt:'2026-01-01T00:00:00.000Z'})); });
await page.reload(); await stub();
check('backup: mismatched provenance shows the warning text', await page.evaluate(()=>{ const b=document.getElementById('doc-restore-banner'), m=b.querySelector('.msg').textContent; return b.classList.contains('show') && /다른 저장본에서 만든/.test(m) && /다른 문서/.test(m) && /누군가|저장 기록 없음/.test(m); }));
check('backup: restore keeps the current body in history', await page.evaluate(()=>{
  const before=document.getElementById('doc-content').innerHTML; document.getElementById('doc-rb-restore').click();
  const hist=JSON.parse(new DOMParser().parseFromString(window.DocEditor.getHTML(),'text/html').getElementById('doc-history').textContent);
  return document.getElementById('doc-content').innerHTML==='<p>다른 저장본에서 만든 백업</p>' && hist.length===1 && hist[0].html===before && /^복구 전: /.test(hist[0].title);
}));
check('history: modal lists author and time', await page.evaluate(()=>{ document.getElementById('doc-historyBtn').click(); const s=document.querySelector('#doc-hist-list .doc-ed-hist-item span'); const ok=!!s && /이름 없음/.test(s.textContent); document.getElementById('doc-hist-close').click(); return ok; }));
await page.evaluate(()=>{ localStorage.setItem('docedit:autosave:url:'+location.origin+location.pathname, JSON.stringify({ts:new Date().toISOString(),html:'<p>같은 출처</p>',title:'같은 출처',savedBy:'',savedAt:''})); });
await page.reload(); await stub();
check('backup: matching provenance shows the normal prompt', await page.evaluate(()=>{ const m=document.querySelector('#doc-restore-banner .msg').textContent; return document.getElementById('doc-restore-banner').classList.contains('show') && /복구하시겠어요/.test(m) && /같은 출처/.test(m) && !/다른 저장본/.test(m); }));
await page.evaluate(()=>localStorage.removeItem('docedit:autosave:url:'+location.origin+location.pathname));
check('open hint: toast when the file was saved by someone else', await page.evaluate(async()=>{
  let src=await (await fetch('/assets/skeleton.html')).text();
  src=src.replace('<body>','<body data-doc-saved-by="김검토" data-doc-saved-at="2026-09-12T05:03:00.000Z">').replace('id="doc-history">[]','id="doc-history">[{"ts":"2026-09-11T00:00:00.000Z","title":"이전","html":"<p>이전</p>","author":"나"}]');
  const f=document.createElement('iframe'); f.srcdoc=src; document.body.appendChild(f); await new Promise(r=>f.onload=r);
  const t=f.contentDocument.getElementById('doc-toast').textContent; f.remove();
  return /김검토/.test(t) && /변경 사항/.test(t);
}));

console.log(JSON.stringify({pass:true,count:results.length,results}));
