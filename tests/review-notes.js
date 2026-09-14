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
check('diff: deleted list item outside a list is wrapped', await page.evaluate(()=>{
  const D=window.DocEditorDiff, cmp=D.compare('<ul><li>남는 항목</li><li>지운 항목</li></ul><p>끝</p>','<ul><li>남는 항목</li></ul><p>끝</p>');
  D.render(cmp); const del=cmp.cRoot.querySelector('.doc-ed-diff-del');
  return cmp.counts.del===1 && del.tagName==='LI' && del.parentNode.tagName==='UL';
}));
check('diff: exceeded budget falls back to whole replacement', await page.evaluate(()=>{
  const D=window.DocEditorDiff;
  const a=Array.from({length:1200},(_,i)=>'<p>a'+i+'</p>').join(''), b=Array.from({length:1200},(_,i)=>'<p>b'+i+'</p>').join('');
  const cmp=D.compare(a,b);
  return cmp.exceeded && cmp.counts.del===1200 && cmp.counts.ins===1200;
}));
console.log(JSON.stringify({pass:true,count:results.length,results}));
