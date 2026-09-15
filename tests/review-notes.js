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
  let src=await (await fetch('/assets/skeleton.html',{cache:'no-store'})).text();
  src=src.replace('<body>','<body data-doc-saved-by="김검토" data-doc-saved-at="2026-09-12T05:03:00.000Z">').replace('id="doc-history">[]','id="doc-history">[{"ts":"2026-09-11T00:00:00.000Z","title":"이전","html":"<p>이전</p>","author":"나"}]');
  const f=document.createElement('iframe'); f.srcdoc=src; document.body.appendChild(f); await new Promise(r=>f.onload=r);
  const t=f.contentDocument.getElementById('doc-toast').textContent; f.remove();
  return /김검토/.test(t) && /변경 사항/.test(t);
}));

// ---- C. 메모: 저장소·앵커·API ----
await fresh();
check('notes: anchored note wraps the selection and records a quote', await page.evaluate(()=>{
  const c=document.getElementById('doc-content'); c.innerHTML='<p id="qa-p1">첫째 문장입니다. 둘째 문장입니다.</p><p id="qa-p2">셋째 문장입니다.</p>';
  const t=document.getElementById('qa-p1').firstChild, r=document.createRange(); r.setStart(t,3); r.setEnd(t,9);
  const id=window.DocEditor.notes.add('근거를 보강해 주세요',{range:r});
  const mark=c.querySelector('mark.doc-ed-note'), list=window.DocEditor.notes.list();
  return !!id && window.__prompts===1 && !!mark && mark.getAttribute('data-doc-note')===id && mark.textContent==='문장입니다.' && document.getElementById('qa-p1').textContent==='첫째 문장입니다. 둘째 문장입니다.' && list.length===1 && list[0].anchored && list[0].quote==='문장입니다.' && list[0].author==='검토자' && list[0].resolved===false;
}));
check('notes: multi-paragraph selection creates marks with one id', await page.evaluate(()=>{
  const p1=document.getElementById('qa-p1'), p2=document.getElementById('qa-p2'), r=document.createRange();
  r.setStart(p1.lastChild,p1.lastChild.nodeValue.length-6); r.setEnd(p2.firstChild,2);
  const id=window.DocEditor.notes.add('두 문단에 걸친 메모',{range:r});
  const marks=document.querySelectorAll('mark.doc-ed-note[data-doc-note="'+id+'"]');
  return marks.length===2 && marks[0].closest('p')===p1 && marks[1].closest('p')===p2 && marks[0].textContent==='문장입니다.' && marks[1].textContent==='셋째';
}));
check('notes: element-boundary range wraps the text and the inline element', await page.evaluate(()=>{
  const c=document.getElementById('doc-content'); c.insertAdjacentHTML('beforeend','<p id="qa-p3">가나다<b>라</b>마바사</p>');
  const p=document.getElementById('qa-p3'), r=document.createRange(); r.setStart(p.firstChild,1); r.setEnd(p,2);
  const id=window.DocEditor.notes.add('경계 메모',{range:r});
  const marks=[...document.querySelectorAll('mark[data-doc-note="'+id+'"]')].map(m=>m.textContent);
  const n=window.DocEditor.notes.list().find(x=>x.id===id);
  return marks.join('|')==='나다|라' && !!p.querySelector('b > mark') && p.textContent==='가나다라마바사' && n.quote==='나다라' && n.anchored && [...p.childNodes].every(x=>x.nodeType!==3||x.nodeValue!=='');
}));
check('notes: whole-document note has no anchor', await page.evaluate(()=>{ const id=window.DocEditor.notes.add('전체 의견'); const n=window.DocEditor.notes.list().find(x=>x.id===id); return !!n && !n.anchored && n.quote==='' && document.querySelectorAll('mark.doc-ed-note').length===5; }));
check('notes: reply, resolve, reopen', await page.evaluate(()=>{
  const id=window.DocEditor.notes.list()[0].id;
  const ok1=window.DocEditor.notes.reply(id,'반영했습니다'), ok2=window.DocEditor.notes.resolve(id,true);
  const resolvedMark=document.querySelector('mark[data-doc-note="'+id+'"]').classList.contains('doc-ed-note-resolved');
  const n=window.DocEditor.notes.list()[0];
  const ok3=window.DocEditor.notes.resolve(id,false);
  return ok1 && ok2 && ok3 && resolvedMark && n.replies.length===1 && n.replies[0].text==='반영했습니다' && n.replies[0].author==='검토자' && n.resolved===true && !document.querySelector('mark[data-doc-note="'+id+'"]').classList.contains('doc-ed-note-resolved');
}));
check('notes: saved file carries store and marks, export strips both', await page.evaluate(()=>{
  const d=new DOMParser().parseFromString(window.DocEditor.getHTML(),'text/html'), store=JSON.parse(d.getElementById('doc-notes').textContent);
  const ro=new DOMParser().parseFromString(window.DocEditor.getReadOnlyHTML(),'text/html');
  return store.length===4 && d.querySelectorAll('#doc-content mark.doc-ed-note').length===5 && !ro.getElementById('doc-notes') && !ro.querySelector('mark.doc-ed-note') && ro.getElementById('doc-content').textContent.includes('첫째 문장입니다. 둘째 문장입니다.') && !ro.body.hasAttribute('data-doc-saved-by');
}));
check('notes: remove unwraps marks and merges text', await page.evaluate(()=>{
  const id=window.DocEditor.notes.list()[0].id, ok=window.DocEditor.notes.remove(id), p1=document.getElementById('qa-p1');
  return ok && document.querySelectorAll('mark[data-doc-note="'+id+'"]').length===0 && window.DocEditor.notes.list().length===3 && p1.childNodes.length===2 && p1.childNodes[0].nodeValue==='첫째 문장입니다. 둘째 ';
}));
check('notes: marks without a stored note are unwrapped', await page.evaluate(()=>{
  const c=document.getElementById('doc-content');
  c.insertAdjacentHTML('beforeend','<p>고아 <mark class="doc-ed-note" data-doc-note="ghost">표시</mark></p>');
  const id=window.DocEditor.notes.list()[0].id;
  document.querySelectorAll('mark[data-doc-note="'+id+'"]').forEach(m=>m.replaceWith(...m.childNodes));
  window.DocEditor.notes.resolve(window.DocEditor.notes.list()[1].id,false);
  return !c.querySelector('mark[data-doc-note="ghost"]') && c.textContent.includes('고아 표시') && window.DocEditor.notes.list()[0].anchored===true;
}));
check('notes: browser backup includes notes', await page.evaluate(async()=>{
  await new Promise(r=>setTimeout(r,900));
  const a=JSON.parse(localStorage.getItem('docedit:autosave:url:'+location.origin+location.pathname));
  return !!a && Array.isArray(a.notes) && a.notes.length===3 && a.notes[0].text==='두 문단에 걸친 메모';
}));
await page.reload(); await stub();
check('notes: recovery restores notes with the body', await page.evaluate(()=>{ const b=document.getElementById('doc-restore-banner'); if(!b.classList.contains('show')) return false; document.getElementById('doc-rb-restore').click(); return window.DocEditor.notes.list().length===3 && document.getElementById('doc-content').textContent.includes('고아 표시'); }));
await page.evaluate(()=>localStorage.removeItem('docedit:autosave:url:'+location.origin+location.pathname));

// ---- C2. 메모 패널 UI ----
await fresh();
check('notes ui: button opens the panel and hides the inspector while editing', await page.evaluate(()=>{
  const shown=id=>getComputedStyle(document.getElementById(id)).display!=='none';
  window.DocEditor.edit(true); document.getElementById('doc-notesBtn').click();
  const ok=document.body.classList.contains('doc-notes-open') && shown('doc-notes-panel') && !shown('doc-inspector');
  document.getElementById('doc-notesClose').click();
  const ok2=!document.body.classList.contains('doc-notes-open') && shown('doc-inspector');
  window.DocEditor.edit(false); return ok && ok2;
}));
check('notes ui: compose captures the selection as target', await page.evaluate(async()=>{
  const c=document.getElementById('doc-content'); c.innerHTML='<p id="qa-u1">패널에서 남기는 메모 대상 문장</p>';
  const t=document.getElementById('qa-u1').firstChild, r=document.createRange(); r.setStart(t,0); r.setEnd(t,3);
  const s=getSelection(); s.removeAllRanges(); s.addRange(r); await new Promise(res=>setTimeout(res,80));
  document.getElementById('doc-notesBtn').click();
  const target=document.getElementById('doc-notesTarget'), had=target.classList.contains('has') && target.querySelector('.q').textContent.includes('패널에');
  const input=document.getElementById('doc-notesInput'); input.focus(); input.value='패널 메모';
  document.getElementById('doc-notesAdd').click();
  const card=document.querySelector('#doc-notesList .doc-ed-note-card'), mark=c.querySelector('mark.doc-ed-note');
  return had && !target.classList.contains('has') && !!mark && mark.textContent==='패널에' && !!card && card.querySelector('.doc-ed-note-text').textContent==='패널 메모' && card.querySelector('.doc-ed-note-where q').textContent==='패널에' && document.getElementById('doc-notesCount').textContent==='1';
}));
check('notes ui: card click locates the mark, mark click opens the card', await page.evaluate(()=>{
  document.querySelector('#doc-notesList .doc-ed-note-card').click();
  const active=!!document.querySelector('#doc-content mark.doc-ed-note-active');
  document.getElementById('doc-notesClose').click();
  document.querySelector('#doc-content mark.doc-ed-note').click();
  return active && document.body.classList.contains('doc-notes-open') && !!document.querySelector('#doc-notesList .doc-ed-note-card.active');
}));
check('notes ui: reply, resolve filter, reopen, delete', await page.evaluate(()=>{
  const list=document.getElementById('doc-notesList');
  list.querySelector('[data-act="reply"]').click(); list.querySelector('.doc-ed-note-replybox textarea').value='답글입니다'; list.querySelector('[data-act="send"]').click();
  const replied=!!list.querySelector('.doc-ed-note-reply') && list.querySelector('.doc-ed-note-reply div').textContent==='답글입니다';
  list.querySelector('[data-act="resolve"]').click();
  const hiddenWhenResolved=!list.querySelector('.doc-ed-note-card') && document.getElementById('doc-notesCount').textContent==='';
  const chk=document.getElementById('doc-notesShowResolved'); chk.checked=true; chk.dispatchEvent(new Event('change'));
  const card=list.querySelector('.doc-ed-note-card.resolved'), collapsed=!!card && getComputedStyle(card.querySelector('.doc-ed-note-text')).display==='none';
  card.click(); const opened=getComputedStyle(card.querySelector('.doc-ed-note-text')).display!=='none';
  list.querySelector('[data-act="resolve"]').click();
  const reopened=!!list.querySelector('.doc-ed-note-card:not(.resolved)');
  list.querySelector('[data-act="remove"]').click();
  return replied && hiddenWhenResolved && collapsed && opened && reopened && window.DocEditor.notes.list().length===0 && !document.querySelector('#doc-content mark.doc-ed-note');
}));
check('notes ui: a note that lost its mark shows a badge', await page.evaluate(()=>{
  const c=document.getElementById('doc-content'), t=c.querySelector('p').firstChild, r=document.createRange(); r.setStart(t,0); r.setEnd(t,2);
  const id=window.DocEditor.notes.add('곧 위치를 잃을 메모',{range:r});
  document.querySelectorAll('mark[data-doc-note="'+id+'"]').forEach(m=>m.replaceWith(...m.childNodes));
  document.getElementById('doc-notesShowResolved').dispatchEvent(new Event('change'));
  return /위치 없음/.test(document.querySelector('#doc-notesList .doc-ed-note-card').textContent);
}));
check('notes ui: name field shows and stores the author', await page.evaluate(()=>{ const i=document.getElementById('doc-notesAuthor'), shown=i.value==='검토자'; i.value='새 이름'; i.dispatchEvent(new Event('change')); return shown && localStorage.getItem('docedit:author')==='새 이름'; }));
check('notes ui: saved html has no open panel state or typed text', await page.evaluate(()=>{ document.getElementById('doc-notesInput').value='임시'; const d=new DOMParser().parseFromString(window.DocEditor.getHTML(),'text/html'), ro=new DOMParser().parseFromString(window.DocEditor.getReadOnlyHTML(),'text/html'); return !d.body.classList.contains('doc-notes-open') && d.getElementById('doc-notesList').innerHTML==='' && d.getElementById('doc-notesInput').textContent==='' && !d.getElementById('doc-notesAuthor').hasAttribute('value') && d.getElementById('doc-notesBtn').getAttribute('aria-expanded')==='false' && !d.getElementById('doc-notesBtn').classList.contains('on') && !ro.body.classList.contains('doc-notes-open'); }));
check('notes ui: toolbar button opens the panel and Escape closes it', await page.evaluate(()=>{
  window.DocEditor.edit(true); document.getElementById('doc-ebNote').click();
  const opened=document.body.classList.contains('doc-notes-open') && document.activeElement===document.getElementById('doc-notesInput') && document.getElementById('doc-notesBtn').classList.contains('on');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  const closed=!document.body.classList.contains('doc-notes-open') && !document.getElementById('doc-notesBtn').classList.contains('on');
  window.DocEditor.edit(false); return opened && closed;
}));
check('notes ui: a half-typed reply survives another card changing', await page.evaluate(()=>{
  const a=window.DocEditor.notes.add('첫 메모'), b=window.DocEditor.notes.add('둘째 메모');
  document.getElementById('doc-notesBtn').click();
  const list=document.getElementById('doc-notesList'), cardA=list.querySelector('[data-note-id="'+a+'"]'), cardB=list.querySelector('[data-note-id="'+b+'"]');
  cardA.querySelector('[data-act="reply"]').click(); cardA.querySelector('.doc-ed-note-replybox textarea').value='쓰다 만 답글';
  cardB.querySelector('[data-act="resolve"]').click();
  const after=list.querySelector('[data-note-id="'+a+'"] .doc-ed-note-replybox');
  const kept=!!after && !after.hidden && after.querySelector('textarea').value==='쓰다 만 답글';
  after.querySelector('[data-act="send"]').click();
  const sent=window.DocEditor.notes.list().find(n=>n.id===a).replies.length===1 && list.querySelector('[data-note-id="'+a+'"] .doc-ed-note-replybox').hidden;
  window.DocEditor.notes.remove(a); window.DocEditor.notes.remove(b);
  return kept && sent;
}));
await page.evaluate(()=>{ document.getElementById('doc-notesInput').value=''; document.getElementById('doc-notesClose').click(); window.DocEditor.notes.list().forEach(n=>window.DocEditor.notes.remove(n.id)); localStorage.removeItem('docedit:autosave:url:'+location.origin+location.pathname); });

// ---- D. 비교 모드 (API) ----
await fresh();
check('compare: session baseline shows unsaved edits and keeps saves clean', await page.evaluate(()=>{
  const c=document.getElementById('doc-content'); const original=c.innerHTML;
  c.innerHTML='<h2>제목</h2><p>하나 둘 셋</p><p>지울 문단</p><p style="text-align:left">정렬</p>';
  window.DocEditor.edit(true); c.dispatchEvent(new Event('input',{bubbles:true})); window.DocEditor.edit(false);
  // 저장 없이 본문을 다시 바꾼다: 마지막 저장(열었을 때) 기준과 비교해야 하므로 lastSavedHtml은 원본이다.
  window.__base=original;
  c.innerHTML='<h2>제목</h2><p>하나 넷 셋</p><p style="text-align:center">정렬</p><p>새 문단</p>'; window.__cur=c.innerHTML;
  window.DocEditor.compare(true);
  const s=window.DocEditor.changes();
  const saved=new DOMParser().parseFromString(window.DocEditor.getHTML(),'text/html').getElementById('doc-content');
  const ro=new DOMParser().parseFromString(window.DocEditor.getReadOnlyHTML(),'text/html').getElementById('doc-content');
  return window.DocEditor.isComparing() && document.body.classList.contains('doc-changes') && /마지막 저장 이후/.test(s.baseline) && s.total>0 && c.querySelector('[data-doc-change]')!==null && saved.innerHTML===window.__cur && !saved.querySelector('[data-doc-change],ins.doc-ed-ins,del.doc-ed-del') && ro.innerHTML===window.__cur;
}));
check('compare: closing restores the exact body', await page.evaluate(()=>{ window.DocEditor.compare(false); return !window.DocEditor.isComparing() && document.getElementById('doc-content').innerHTML===window.__cur && !document.body.classList.contains('doc-changes'); }));
check('compare: history baseline against a specific version', await page.evaluate(async()=>{
  window.showSaveFilePicker=async()=>({name:'t.html',queryPermission:async()=>'granted',createWritable:async()=>({write:async()=>{},close:async()=>{}})});
  await window.DocEditor.save();                       // history[0] = 열었을 때 본문(author '')
  window.DocEditor.compareWith('history',0);
  const s=window.DocEditor.changes();
  return window.DocEditor.isComparing() && s.total>0 && /이름 없음/.test(s.baseline);
}));
check('compare: default baseline prefers a version saved by someone else', await page.evaluate(async()=>{
  window.DocEditor.compare(false);
  const c=document.getElementById('doc-content');
  // 지금 문서는 검토자가 저장했다. 다른 사람이 저장한 항목을 히스토리에 넣고 기본 기준을 확인한다.
  const d=new DOMParser().parseFromString(window.DocEditor.getHTML(),'text/html');
  const hist=JSON.parse(d.getElementById('doc-history').textContent);
  hist.unshift({ts:'2026-09-12T00:00:00.000Z',title:'검토자 중간 저장',html:'<p>검토자 중간</p>',author:'검토자'});
  hist.forEach(h=>{ h.author='검토자'; });   // 지금까지의 항목은 모두 검토자가 저장한 것으로 둔다
  hist.push({ts:'2026-09-11T00:00:00.000Z',title:'작성자 버전',html:'<h2>제목</h2><p>작성자가 보낸 문단</p>',author:'작성자'});
  document.getElementById('doc-history').textContent=JSON.stringify(hist);
  // 히스토리는 로드 시 읽으므로, 같은 본문·출처로 새 프레임에서 확인한다.
  let src=window.DocEditor.getHTML().replace('id="doc-history">'+d.getElementById('doc-history').textContent.replace(/</g,'\\u003c'),'id="doc-history">'+JSON.stringify(hist).replace(/</g,'\\u003c'));
  const f=document.createElement('iframe'); f.srcdoc=src; document.body.appendChild(f); await new Promise(r=>f.onload=r);
  const w=f.contentWindow; w.DocEditor.compare(true); const s=w.DocEditor.changes(); f.remove();
  return /작성자 · /.test(s.baseline) && s.total>0;
}));
check('compare: revert each change type through the API', await page.evaluate(()=>{
  const c=document.getElementById('doc-content'); const base='<p>하나 둘 셋</p><p>지울 문단</p><p style="text-align:left">정렬</p>';
  const cur='<p>하나 넷 셋</p><p style="text-align:center">정렬</p><p>새 문단</p>';
  // history[0]를 base로 만들기 위해 프레임을 쓴다.
  return (async()=>{
    let src=await (await fetch('/assets/skeleton.html',{cache:'no-store'})).text();
    src=src.replace('id="doc-history">[]','id="doc-history">[{"ts":"2026-09-11T00:00:00.000Z","title":"기준","html":"'+base.replace(/"/g,'\\"').replace(/</g,'\\u003c')+'","author":"작성자"}]');
    const f=document.createElement('iframe'); f.srcdoc=src; document.body.appendChild(f); await new Promise(r=>f.onload=r);
    const w=f.contentWindow, d=w.document, cc=d.getElementById('doc-content'); cc.innerHTML=cur;
    w.DocEditor.compareWith('history',0);
    const before=w.DocEditor.changes(); // mod, del, fmt, ins = 4
    const order=[...cc.querySelectorAll('[data-doc-change]')].map(el=>el.className.match(/doc-ed-diff-(ins|del|mod|fmt)/)[1]);
    w.DocEditor.revertChange(0); const afterMod=w.DocEditor.changes();
    w.DocEditor.revertChange(0); w.DocEditor.revertChange(0); w.DocEditor.revertChange(0);
    const none=w.DocEditor.changes();
    w.DocEditor.compare(false); const body=cc.innerHTML; f.remove();
    return before.total===4 && order.join(',')==='mod,del,fmt,ins' && afterMod.total===3 && none.total===0 && body===base;
  })();
}));
check('compare: entering edit mode closes the comparison', await page.evaluate(()=>{ window.DocEditor.compare(true); const on=window.DocEditor.isComparing(); window.DocEditor.edit(true); const off=!window.DocEditor.isComparing() && !document.querySelector('#doc-content [data-doc-change]'); window.DocEditor.edit(false); return on && off; }));
check('compare: notes cannot be added while comparing but replies work', await page.evaluate(()=>{
  const c=document.getElementById('doc-content'), t=c.querySelector('p').firstChild, r=document.createRange(); r.setStart(t,0); r.setEnd(t,2);
  const id=window.DocEditor.notes.add('비교 전 메모',{range:r});
  window.DocEditor.compare(true);
  const blocked=window.DocEditor.notes.add('비교 중 메모')===null;
  const kept=!!c.querySelector('mark[data-doc-note="'+id+'"]');
  const replied=window.DocEditor.notes.reply(id,'비교 중 답글');
  window.DocEditor.compare(false);
  return blocked && kept && replied && window.DocEditor.notes.list()[0].replies.length===1 && !!c.querySelector('mark[data-doc-note="'+id+'"]');
}));
check('compare: removing a note while comparing keeps revert accurate', await page.evaluate(async()=>{
  let src=await (await fetch('/assets/skeleton.html',{cache:'no-store'})).text();
  const base='<p>하나 둘 셋</p>앞 외톨이 뒤<p>둘째 문단</p>';
  src=src.replace('id="doc-history">[]','id="doc-history">[{"ts":"2026-09-11T00:00:00.000Z","title":"기준","html":"'+base.replace(/"/g,'\\"').replace(/</g,'\\u003c')+'","author":"작성자"}]');
  const f=document.createElement('iframe'); f.srcdoc=src; document.body.appendChild(f); await new Promise(r=>f.onload=r);
  const w=f.contentWindow, d=w.document, cc=d.getElementById('doc-content'); w.prompt=()=>'검토자';
  cc.innerHTML='<p>하나 둘 셋</p>앞 외톨이 뒤<p>둘째 문장</p>';
  const r=d.createRange(); r.setStart(cc.childNodes[1],2); r.setEnd(cc.childNodes[1],5);
  const id=w.DocEditor.notes.add('외톨이 메모',{range:r});
  w.DocEditor.compareWith('history',0);
  const before=w.DocEditor.changes().total;
  w.DocEditor.notes.remove(id);
  const ok=w.DocEditor.revertChange(0);
  w.DocEditor.compare(false); const body=cc.innerHTML; f.remove();
  return before===1 && ok && body===base;
}));
check('compare: Escape and history restore close the comparison', await page.evaluate(()=>{
  const c=document.getElementById('doc-content'); c.innerHTML='<p>하나</p><p>둘</p>';
  window.DocEditor.compareWith('session'); const on1=window.DocEditor.isComparing();
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); const off1=!window.DocEditor.isComparing() && c.innerHTML==='<p>하나</p><p>둘</p>';
  window.DocEditor.compareWith('session'); document.getElementById('doc-historyBtn').click();
  const item=document.querySelector('#doc-hist-list .doc-ed-hist-item'); if(!item) return false; item.click();
  document.querySelector('#doc-hist-preview .doc-ed-btn.primary').click();
  return on1 && off1 && !window.DocEditor.isComparing() && !document.querySelector('#doc-content [data-doc-change]') && !document.body.classList.contains('doc-changes');
}));
await page.evaluate(()=>{ window.DocEditor.notes.list().forEach(n=>window.DocEditor.notes.remove(n.id)); Object.keys(localStorage).filter(k=>k.startsWith('docedit:autosave:')).forEach(k=>localStorage.removeItem(k)); });

// ---- D2. 비교 바 UI ----
await fresh();
check('compare ui: bar summary, baseline select, navigation, revert, close', await page.evaluate(async()=>{
  let src=await (await fetch('/assets/skeleton.html',{cache:'no-store'})).text();
  const base='<p>하나 둘 셋</p><p>지울 문단</p><p style="text-align:left">정렬</p>';
  src=src.replace('id="doc-history">[]','id="doc-history">[{"ts":"2026-09-11T00:00:00.000Z","title":"기준","html":"'+base.replace(/"/g,'\\"').replace(/</g,'\\u003c')+'","author":"작성자"}]');
  const f=document.createElement('iframe'); f.style.cssText='width:1280px;height:900px'; f.srcdoc=src; document.body.appendChild(f); await new Promise(r=>f.onload=r);
  const w=f.contentWindow, d=w.document, c=d.getElementById('doc-content'); c.innerHTML='<p>하나 넷 셋</p><p style="text-align:center">정렬</p><p>새 문단</p>';
  const shown=id=>w.getComputedStyle(d.getElementById(id)).display!=='none';
  d.getElementById('doc-changesBtn').click();
  const barShown=shown('doc-changes-bar') && d.body.classList.contains('doc-changes') && d.getElementById('doc-changesBtn').classList.contains('on');
  const sel=d.getElementById('doc-changesBase'), opts=[...sel.options].map(o=>o.value).join(',');
  sel.value='history:0'; sel.dispatchEvent(new w.Event('change'));
  const summary=d.getElementById('doc-changesSummary').textContent;
  d.getElementById('doc-changesNext').click(); const first=d.querySelector('#doc-content .doc-ed-diff-active');
  const revertEnabled=!d.getElementById('doc-changesRevert').disabled;
  d.getElementById('doc-changesRevert').click(); const after=d.getElementById('doc-changesSummary').textContent;
  const nextActive=d.querySelector('#doc-content .doc-ed-diff-active');
  d.getElementById('doc-changesClose').click();
  const closed=!shown('doc-changes-bar') && !d.body.classList.contains('doc-changes') && c.innerHTML==='<p>하나 둘 셋</p><p style="text-align:center">정렬</p><p>새 문단</p>' && d.body.style.paddingTop==='';
  f.remove();
  return barShown && opts==='session,history:0,pick' && summary==='추가 1 · 삭제 1 · 수정 1 · 서식 1' && !!first && first.classList.contains('doc-ed-diff-mod') && revertEnabled && after==='추가 1 · 삭제 1 · 수정 0 · 서식 1' && !!nextActive && nextActive.classList.contains('doc-ed-diff-del') && closed;
}));
check('compare ui: file baseline through the hidden input', await page.evaluate(async()=>{
  const c=document.getElementById('doc-content'); c.innerHTML='<p>현재 본문</p>';
  window.DocEditor.compare(true);
  const input=document.getElementById('doc-changesFile'), dt=new DataTransfer();
  dt.items.add(new File(['<!DOCTYPE html><html><body><main id="doc-content"><p>파일 본문</p></main></body></html>'],'기준.html',{type:'text/html'}));
  input.files=dt.files; input.dispatchEvent(new Event('change'));
  await new Promise(r=>setTimeout(r,300));
  const s=window.DocEditor.changes(), sel=document.getElementById('doc-changesBase');
  const ok=s.baseline==='파일: 기준.html' && s.counts.mod===1 && sel.value==='file' && /다른 파일 선택/.test(sel.options[sel.options.length-1].textContent);
  window.DocEditor.compare(false); return ok;
}));
check('compare ui: clicking a change selects it and Escape closes', await page.evaluate(()=>{
  const c=document.getElementById('doc-content'); c.innerHTML='<p>하나</p><p>둘</p><p>셋</p>';
  window.DocEditor.compareWith('session');
  const el=c.querySelector('[data-doc-change]'); el.click();
  const selected=el.classList.contains('doc-ed-diff-active') && window.DocEditor.changes().index===0;
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  return selected && !window.DocEditor.isComparing() && c.innerHTML==='<p>하나</p><p>둘</p><p>셋</p>';
}));
// ---- E. 반응형 ----
check('responsive: notes panel and changes bar fit narrow screens', await page.evaluate(async()=>{
  const source=await (await fetch('/examples/demo.html',{cache:'no-store'})).text(), out=[];
  for(const [width,height] of [[320,640],[390,844],[768,1024]]){
    const f=document.createElement('iframe'); f.style.cssText=`position:fixed;left:0;top:0;width:${width}px;height:${height}px;z-index:2147483647;background:#fff;border:0`;
    const loaded=new Promise(r=>f.onload=r); f.srcdoc=source.replace('<body>','<body data-doc-id="qa-review-'+width+'">'); document.body.appendChild(f); await loaded;
    const w=f.contentWindow, d=w.document, settle=()=>new Promise(r=>w.requestAnimationFrame(()=>w.requestAnimationFrame(r)));
    const rect=id=>d.getElementById(id).getBoundingClientRect(), shown=id=>w.getComputedStyle(d.getElementById(id)).display!=='none';
    await settle();
    const controls=rect('doc-controls');
    const rowOk=controls.height<70 && rect('doc-notesBtn').right<=width && rect('doc-notesBtn').height>=44;
    d.getElementById('doc-notesBtn').click(); await settle();
    const panel=rect('doc-notes-panel');
    const panelOk=shown('doc-notes-panel') && panel.left>=0 && panel.right<=width+1 && panel.top>=controls.bottom-1 && panel.bottom<=height+1;
    d.getElementById('doc-notesClose').click();
    d.getElementById('doc-editToggle').click(); await settle();
    const editOk=!shown('doc-notesBtn') && rect('doc-controls').height<70 && d.documentElement.scrollWidth<=width+1;
    d.getElementById('doc-ebNote').click(); await settle();
    const editPanelOk=shown('doc-notes-panel') && rect('doc-notes-panel').top>=rect('doc-editbar').bottom-1;
    d.getElementById('doc-notesClose').click(); d.getElementById('doc-editToggle').click(); await settle();
    d.getElementById('doc-moreToggle').click(); d.getElementById('doc-changesBtn').click(); await settle();
    const bar=rect('doc-changes-bar');
    const barOk=shown('doc-changes-bar') && bar.top>=controls.bottom-1 && bar.width<=width+1 && parseFloat(d.body.style.paddingTop)>=bar.bottom-1 && d.documentElement.scrollWidth<=width+1;
    d.getElementById('doc-changesClose').click(); await settle();
    out.push({width,rowOk,panelOk,editOk,editPanelOk,barOk});
    w.localStorage.removeItem('docedit:autosave:qa-review-'+width); f.remove();
  }
  console.log(JSON.stringify(out));
  return out.every(o=>o.rowOk&&o.panelOk&&o.editOk&&o.editPanelOk&&o.barOk);
}));
check('responsive: desktop panel sits below the controls and the bar avoids them', await page.evaluate(async()=>{
  const source=await (await fetch('/examples/demo.html',{cache:'no-store'})).text();
  const f=document.createElement('iframe'); f.style.cssText='position:fixed;left:0;top:0;width:1280px;height:900px;z-index:2147483647;background:#fff;border:0';
  const loaded=new Promise(r=>f.onload=r); f.srcdoc=source.replace('<body>','<body data-doc-id="qa-review-desktop">'); document.body.appendChild(f); await loaded;
  const w=f.contentWindow, d=w.document, settle=()=>new Promise(r=>w.requestAnimationFrame(()=>w.requestAnimationFrame(r)));
  const rect=id=>d.getElementById(id).getBoundingClientRect();
  await settle(); d.getElementById('doc-notesBtn').click(); await settle();
  const panelOk=rect('doc-notes-panel').top>=rect('doc-controls').bottom && rect('doc-notes-panel').right<=1280;
  d.getElementById('doc-notesClose').click(); d.getElementById('doc-changesBtn').click(); await settle();
  const bar=d.getElementById('doc-changes-bar'), items=[...bar.children].map(el=>el.getBoundingClientRect());
  const barOk=w.getComputedStyle(bar).display!=='none' && items.every(r=>r.width===0 || r.right<=rect('doc-controls').left || r.top>=rect('doc-controls').bottom);
  d.getElementById('doc-changesClose').click(); w.localStorage.removeItem('docedit:autosave:qa-review-desktop'); f.remove();
  return panelOk && barOk;
}));


// ---- F. 블록 삭제 ----
await fresh();
const FIX='<div class="card"><h3 id="f-h3">제목</h3><p id="f-p">본문 문단</p><p class="tag" id="f-tag">TAG</p></div>'
        +'<table><tbody><tr id="f-r1"><td id="f-c1">가</td><td>나</td></tr><tr id="f-r2"><td>다</td><td>라</td></tr></tbody></table>';
const setup=()=>page.evaluate(html=>{
  const c=document.getElementById('doc-content'); c.innerHTML=html;
  window.DocEditor.edit(true);
  window.__put=function(id){const el=document.getElementById(id),t=el.firstChild,r=document.createRange();
    r.setStart(t,0);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));};
  window.__target=function(){const el=c.querySelector('.doc-ed-block-target');return el?el.tagName+(el.className.replace(/\s*doc-ed-block-target\s*/,'')?'.'+el.className.replace(/\s*doc-ed-block-target\s*/,'').split(' ')[0]:''):null;};
},FIX);

await setup();
check('block: 블록 선택이 커서가 있는 문단을 대상으로 잡는다', await page.evaluate(()=>{
  window.__put('f-p'); document.getElementById('doc-ebBlockPick').click();
  return window.__target()==='P';
}));
check('block: 블록 선택을 다시 누르면 상위 블록으로 넓어진다', await page.evaluate(()=>{
  document.getElementById('doc-ebBlockPick').click();
  return window.__target()==='DIV.card';
}));
await setup();
check('block: 삭제해도 이웃 블록의 클래스가 보존된다', await page.evaluate(()=>{
  window.__put('f-p'); document.getElementById('doc-ebBlockDel').click();
  const tag=document.getElementById('f-tag');
  return !document.getElementById('f-p') && !!tag && tag.className==='tag' && tag.textContent==='TAG';
}));
check('block: 토스트의 되돌리기가 원래 자리에 복원한다', await page.evaluate(()=>{
  const b=document.querySelector('#doc-toast button'); if(!b) return false; b.click();
  const card=document.querySelector('.card');
  return [...card.children].map(x=>x.id).join(',')==='f-h3,f-p,f-tag';
}));
await setup();
check('block: 표 칸에서 삭제하면 그 행만 사라지고 표는 남는다', await page.evaluate(()=>{
  window.__put('f-c1'); document.getElementById('doc-ebBlockDel').click();
  const c=document.getElementById('doc-content');
  return !document.getElementById('f-r1') && !!document.getElementById('f-r2') && c.querySelectorAll('table tr').length===1;
}));
await setup();
await page.evaluate(()=>{ window.__put('f-p'); document.getElementById('doc-ebBlockDel').click(); });
await page.keyboard.press('ControlOrMeta+z');
check('block: Ctrl+Z로도 복원된다', await page.evaluate(()=>{
  const card=document.querySelector('.card');
  return !!document.getElementById('f-p') && [...card.children].map(x=>x.id).join(',')==='f-h3,f-p,f-tag';
}));
await setup();
check('block: 삭제된 블록의 메모는 위치 없음으로 남는다', await page.evaluate(()=>{
  const p=document.getElementById('f-p'), t=p.firstChild, r=document.createRange();
  r.setStart(t,0); r.setEnd(t,2);
  const id=window.DocEditor.notes.add('이 블록 메모',{range:r});
  window.__put('f-p'); document.getElementById('doc-ebBlockDel').click();
  const n=window.DocEditor.notes.list().find(x=>x.id===id);
  const gone=!document.querySelector('mark[data-doc-note="'+id+'"]');
  window.DocEditor.notes.remove(id);
  return !!n && n.text==='이 블록 메모' && n.anchored===true && gone;
}));
await setup();
check('block: 저장본과 배포본에 대상 표시가 남지 않는다', await page.evaluate(()=>{
  window.__put('f-p'); document.getElementById('doc-ebBlockPick').click();
  // 저장본에는 엔진 CSS/JS가 인라인돼 문자열은 늘 존재한다. DOM으로 확인한다.
  const parse=h=>new DOMParser().parseFromString(h,'text/html');
  const saved=parse(window.DocEditor.getHTML()), ro=parse(window.DocEditor.getReadOnlyHTML());
  return window.__target()==='P'
    && saved.querySelectorAll('#doc-content .doc-ed-block-target').length===0
    && ro.querySelectorAll('#doc-content .doc-ed-block-target').length===0
    && !!document.querySelector('#doc-content .doc-ed-block-target');
}));
await setup();
check('block: 비교 모드에서는 블록 삭제가 거부된다', await page.evaluate(()=>{
  window.DocEditor.edit(false); window.DocEditor.compare(true);
  const before=window.DocEditor.getHTML();
  const apiRefused=window.DocEditor.blocks.remove()===false;
  document.getElementById('doc-ebBlockDel').click();
  const bodyUnchanged=window.DocEditor.getHTML()===before, stillComparing=window.DocEditor.isComparing();
  window.DocEditor.compare(false);
  return apiRefused && bodyUnchanged && stillComparing;
}));
await setup();
check('block: 토스트의 되돌리기 버튼이 실제로 눌리는 위치에 있다', await page.evaluate(()=>{
  window.__put('f-p'); document.getElementById('doc-ebBlockDel').click();
  const b=document.querySelector('#doc-toast button'); if(!b) return false;
  const r=b.getBoundingClientRect(), hit=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
  return hit===b || b.contains(hit);   // pointer-events:none 이면 토스트/문서가 잡힌다
}));
await setup();
check('block: 첫 자식 블록도 제자리에 복원된다', await page.evaluate(()=>{
  window.__put('f-h3'); document.getElementById('doc-ebBlockDel').click();
  document.querySelector('#doc-toast button').click();
  const card=document.querySelector('.card');
  return [...card.children].map(x=>x.id).join(',')==='f-h3,f-p,f-tag';
}));
await setup();
check('block: 외곽선 표시는 자동저장 백업에 남지 않는다', await page.evaluate(async()=>{
  window.__put('f-p'); document.getElementById('doc-ebBlockPick').click();
  document.getElementById('doc-content').dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(r=>setTimeout(r,900));
  const id=document.body.dataset.docId, key='docedit:autosave:'+(id||('url:'+location.origin+location.pathname));
  const a=JSON.parse(localStorage.getItem(key)||'{}');
  return typeof a.html==='string' && !/doc-ed-block-target/.test(a.html) && !!document.querySelector('#doc-content .doc-ed-block-target');
}));
await setup();
await page.evaluate(()=>{ window.__put('f-p'); document.getElementById('doc-ebBlockDel').click();
  document.getElementById('doc-notesBtn').click(); document.getElementById('doc-notesInput').focus(); });
await page.keyboard.press('ControlOrMeta+z');
check('block: 메모 입력칸에서 누른 Ctrl+Z는 블록을 되살리지 않는다', await page.evaluate(()=>{
  const gone=!document.getElementById('f-p');
  document.getElementById('doc-notesClose').click();
  return gone;
}));
await setup();
await page.evaluate(async()=>{
  window.prompt=()=>'T';
  window.showSaveFilePicker=async()=>({name:'t.html',queryPermission:async()=>'granted',createWritable:async()=>({write:async()=>{},close:async()=>{}})});
  await window.DocEditor.save();
  document.getElementById('doc-content').innerHTML='<p id="f-x">바뀐 본문</p>';
  await window.DocEditor.save();
  window.DocEditor.edit(true);
  window.__put('f-x'); document.getElementById('doc-ebBlockDel').click();
  document.getElementById('doc-historyBtn').click();
  document.querySelector('#doc-hist-list .doc-ed-hist-item').click();
  document.querySelector('#doc-hist-preview .doc-ed-btn.primary').click();
});
await page.keyboard.press('ControlOrMeta+z');
check('block: 히스토리 복원 뒤 Ctrl+Z가 버려진 블록을 되살리지 않는다', await page.evaluate(()=>{
  const c=document.getElementById('doc-content');
  return !document.getElementById('f-x') && !!document.querySelector('.card') && c.querySelectorAll('.card > *').length===3;
}));
await page.evaluate(()=>{ window.DocEditor.edit(false); Object.keys(localStorage).filter(k=>k.startsWith('docedit:')).forEach(k=>localStorage.removeItem(k)); });

console.log(JSON.stringify({pass:true,count:results.length,results}));
