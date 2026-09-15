/* ============================================================
   doc-editor: 임의 HTML 문서에 얹는 편집 엔진
   (html-doc 스킬 · 문서에 그대로 인라인. 수정·요약 금지)

   제공: 보기↔편집 토글(⌘/Ctrl+E), 서식 툴바, "현재 서식" 속성 패널,
         같은 파일 저장(⌘/Ctrl+S · File System Access), 히스토리, 자동저장.
   계약: 편집 대상은 #doc-content 안의 내용. 크롬 마크업(고정 id)과
         <script id="doc-history"> 가 문서에 존재해야 함.
   ============================================================ */
(function(){
  'use strict';
  var content=document.getElementById('doc-content');
  var histEl=document.getElementById('doc-history');
  var body=document.body;
  if(!content){ console.warn('[doc-editor] #doc-content 를 찾지 못했습니다. 편집할 콘텐츠를 <main id="doc-content"> 안에 넣으세요.'); return; }
  if(!histEl){ histEl=document.createElement('script'); histEl.type='application/json'; histEl.id='doc-history'; histEl.textContent='[]'; document.body.appendChild(histEl); }
  var notesEl=document.getElementById('doc-notes');
  if(!notesEl){ notesEl=document.createElement('script'); notesEl.type='application/json'; notesEl.id='doc-notes'; notesEl.textContent='[]'; histEl.parentNode.insertBefore(notesEl,histEl.nextSibling); }

  var editing=false, fileHandle=null, savedRange=null, saving=false;
  var lastSavedHtml=content.innerHTML;
  var history=loadHistory();
  var autosaveTimer=null;
  var lastBackedUpHtml=content.innerHTML;
  var lastBackedUpNotes='[]';
  var notes=loadNotes();
  var comparing=false, pristineHtml=null; // 비교 모드 (Task 6). 비교 중에는 화면 대신 원본 문자열이 진짜 본문이다.
  function getContentHtml(){
    if(comparing) return pristineHtml;
    if(!blockTarget) return content.innerHTML;
    // 삭제 대상 임시 외곽선은 저장본·백업·히스토리 어디에도 남기지 않는다.
    var had=blockTarget.getAttribute('class');
    blockTarget.classList.remove('doc-ed-block-target');
    if(!blockTarget.className) blockTarget.removeAttribute('class');
    var html=content.innerHTML;
    if(had!==null) blockTarget.setAttribute('class',had);
    return html;
  }
  function sanitizeNotes(arr){
    if(!Array.isArray(arr)) return [];
    var seen=Object.create(null);
    return arr.filter(function(v){ if(!(v && typeof v.id==='string' && /^[A-Za-z0-9_-]+$/.test(v.id) && typeof v.text==='string') || seen[v.id]) return false; seen[v.id]=true; return true; }).map(function(v){
      return {id:v.id, author:typeof v.author==='string'?v.author:'', ts:typeof v.ts==='string'?v.ts:'', text:v.text, quote:typeof v.quote==='string'?v.quote:'', anchored:!!v.anchored, resolved:!!v.resolved,
        replies:Array.isArray(v.replies)?v.replies.filter(function(r){ return r && typeof r.text==='string'; }).map(function(r){ return {author:typeof r.author==='string'?r.author:'', ts:typeof r.ts==='string'?r.ts:'', text:r.text}; }):[]};
    });
  }
  function loadNotes(){ try{ return sanitizeNotes(JSON.parse(notesEl.textContent||'[]')); }catch(e){ return []; } }
  function afterContentReplaced(){ markTarget(null); pendingDelete=null; reconcileNotes(); renderNotes(); }
  var originalPaddingTop=body.style.paddingTop;
  var originalPaddingPixels=parseFloat(getComputedStyle(body).paddingTop)||0;
  var layoutFrame=null;
  // 다른 문서에 붙일 때 현재 본문·히스토리·파일 연결이 섞이지 않도록 초기 UI만 캡처한다.
  var attachBundle=null;
  try{if(window.DocEditorAttach)attachBundle=window.DocEditorAttach.bundleFrom(document);}catch(e){}

  function loadHistory(){ try{ var h=JSON.parse(histEl.textContent||'[]'); return Array.isArray(h)?h.filter(function(v){return v && typeof v.html==='string' && typeof v.title==='string' && typeof v.ts==='string';}).slice(0,30).map(function(v){return {ts:v.ts,title:v.title,html:v.html,author:typeof v.author==='string'?v.author:''};}):[]; }catch(e){ return []; } }
  function escForScript(s){ return s.replace(/</g,'\\u003c'); }
  function escapeHtml(s){ return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function toast(t,ms,action){
    var el=document.getElementById('doc-toast'); if(!el) return;
    el.textContent=t;
    if(action){
      var b=document.createElement('button'); b.type='button'; b.className='doc-ed-toast-act'; b.textContent=action.label;
      b.onclick=function(){ el.classList.remove('show'); clearTimeout(el._t); action.fn(); };
      el.appendChild(b);
    }
    el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(function(){el.classList.remove('show');},ms||2600);
  }
  function $(id){ return document.getElementById(id); }

  /* ---------- 작성자 이름 (브라우저별로 기억, 문서에는 넣지 않음) ---------- */
  var AUTHOR_KEY='docedit:author', sessionAuthor=null;
  function readAuthor(){ var v=null; try{ v=localStorage.getItem(AUTHOR_KEY); }catch(e){} if(v===null) v=sessionAuthor; return v; }
  function storeAuthor(v){ sessionAuthor=v; try{ localStorage.setItem(AUTHOR_KEY,v); }catch(e){} var inp=$('doc-notesAuthor'); if(inp && inp.value!==v) inp.value=v; }
  function currentAuthor(){ return readAuthor()||''; }
  // 처음 한 번만 묻는다. 취소·빈 값은 ''로 기억해 다시 묻지 않는다.
  function ensureAuthor(){ var v=readAuthor(); if(v===null){ var r=null; try{ r=window.prompt('이름을 입력하세요. 메모와 저장 기록에 표시됩니다. 비워 두면 이름 없이 남깁니다.',''); }catch(e){} v=(r===null?'':String(r)).trim(); storeAuthor(v); } return v; }

  /* ---------- 저장 파일 연결 기억 (브라우저별 IndexedDB) ---------- */
  // 문서 ID만으로 연결하면 복사한 HTML이 원본 파일을 덮어쓸 수 있어 열었던 경로로 구분한다.
  var fileLinkKey=location.origin+location.pathname;
  var rememberAtThisLocation=true;
  function fileLinkStore(mode, handle){
    return new Promise(function(resolve){
      var db=null, tx=null, finished=false, value=null;
      var timer=setTimeout(function(){ if(tx) try{tx.abort();}catch(e){} finish(false); },1800);
      function finish(ok){ if(finished) return; finished=true; clearTimeout(timer); if(db) db.close(); resolve({ok:ok,value:value}); }
      try{
        var req=indexedDB.open('docedit-file-links',1);
        req.onupgradeneeded=function(){ if(!req.result.objectStoreNames.contains('files')) req.result.createObjectStore('files'); };
        req.onerror=function(){ finish(false); };
        req.onblocked=function(){ finish(false); };
        req.onsuccess=function(){
          db=req.result; if(finished){db.close();return;}
          db.onversionchange=function(){db.close();};
          try{
            tx=db.transaction('files',mode==='get'?'readonly':'readwrite');
            var store=tx.objectStore('files');
            var op=mode==='get'?store.get(fileLinkKey):(mode==='put'?store.put(handle,fileLinkKey):store.delete(fileLinkKey));
            op.onsuccess=function(){value=op.result;};
            tx.oncomplete=function(){finish(true);};
            tx.onerror=tx.onabort=function(){finish(false);};
          }catch(e){finish(false);}
        };
      }catch(e){finish(false);}
    });
  }
  function updateSaveHint(){
    var b=$('doc-saveBtn');
    if(b) b.title=fileHandle?'저장 대상: '+fileHandle.name+' (Cmd/Ctrl+S)':'최초 저장 시 대상 파일 선택 (Cmd/Ctrl+S)';
  }
  var fileLinkReady=fileLinkStore('get').then(function(result){
    var h=result.value;
    if(h && h.kind==='file' && typeof h.createWritable==='function' && typeof h.queryPermission==='function') fileHandle=h;
    updateSaveHint();
  });

  /* ---------- 자동저장 ---------- */
  function genId(){ return 'doc-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8); }
  function autosaveKey(){ var id=body.dataset.docId; return 'docedit:autosave:'+(id||('url:'+location.origin+location.pathname)); }
  function scheduleAutosave(){ clearTimeout(autosaveTimer); autosaveTimer=setTimeout(doAutosave,700); }
  function writeBackup(){
    try{ var html=getContentHtml(); localStorage.setItem(autosaveKey(), JSON.stringify({ts:new Date().toISOString(),html:html,notes:notes,title:snapshotTitle(html),savedBy:body.dataset.docSavedBy||'',savedAt:body.dataset.docSavedAt||''})); lastBackedUpHtml=html; lastBackedUpNotes=JSON.stringify(notes); return true; }
    catch(e){ toast('브라우저 백업을 저장하지 못했습니다. 파일로 저장해 주세요.'); return false; }
  }
  function doAutosave(){ clearTimeout(autosaveTimer); autosaveTimer=null; if(getContentHtml()!==lastBackedUpHtml || JSON.stringify(notes)!==lastBackedUpNotes) return writeBackup(); return true; }
  // 디바운스 중 문서를 닫아도 마지막 입력을 보존한다.
  window.addEventListener('pagehide', function(){ if(autosaveTimer!==null) doAutosave(); });
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='hidden' && autosaveTimer!==null) doAutosave(); });

  /* ---------- 메모 (저장소 #doc-notes + 본문 mark 앵커) ---------- */
  var noteTarget=null, locateTimer=null;
  function normText(s){ return (s||'').replace(/ /g,' ').replace(/\s+/g,' ').trim(); }
  function findNote(id){ for(var i=0;i<notes.length;i++) if(notes[i].id===id) return notes[i]; return null; }
  function noteMarks(id,root){ return (root||content).querySelectorAll('mark.doc-ed-note[data-doc-note="'+id+'"]'); }
  function unwrapMark(m){ var p=m.parentNode; while(m.firstChild) p.insertBefore(m.firstChild,m); p.removeChild(m); p.normalize(); }
  function unwrapMarks(id,root){ var marks=noteMarks(id,root); for(var i=0;i<marks.length;i++) unwrapMark(marks[i]); }
  // 선택 범위 안의 텍스트 노드를 같은 ID의 mark로 감싼다. 경계 텍스트는 잘라 선택한 부분만 감싼다.
  // range는 live Range여야 한다. splitText 뒤 경계는 브라우저가 따라 움직이므로 자른 뒤에 다시 읽는다.
  function wrapRange(range,id){
    var sc=range.startContainer, so=range.startOffset, ec=range.endContainer, eo=range.endOffset, r, walker, nodes=[], t, i, m;
    if(ec.nodeType===3 && eo>0 && eo<ec.nodeValue.length) ec.splitText(eo);
    if(sc.nodeType===3 && so>0 && so<sc.nodeValue.length) sc.splitText(so);
    r=range.cloneRange();
    if(r.startContainer.nodeType===3 && r.startOffset>=r.startContainer.nodeValue.length) r.setStartAfter(r.startContainer);
    if(r.endContainer.nodeType===3 && r.endOffset===0) r.setEndBefore(r.endContainer);
    walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT,null);
    while((t=walker.nextNode())) if(r.intersectsNode(t)) nodes.push(t);
    while(nodes.length && !normText(nodes[0].nodeValue)) nodes.shift();
    while(nodes.length && !normText(nodes[nodes.length-1].nodeValue)) nodes.pop();
    if(!nodes.length) return false;
    for(i=0;i<nodes.length;i++){ m=document.createElement('mark'); m.className='doc-ed-note'; m.setAttribute('data-doc-note',id); nodes[i].parentNode.insertBefore(m,nodes[i]); m.appendChild(nodes[i]); }
    return true;
  }
  function quoteOf(range){ var q=normText(range.toString()); return q.length>80?q.slice(0,80)+'…':q; }
  function targetFrom(range){ if(!range || range.collapsed || !content.contains(range.commonAncestorContainer)) return null; var q=quoteOf(range); return q?{range:range.cloneRange(),quote:q}:null; }
  function addNote(text,target){
    text=(text||'').trim(); if(!text) return null;
    if(comparing){ toast('비교를 닫고 메모를 남겨 주세요.'); return null; }
    var author=ensureAuthor(), id='n-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6), anchored=false, quote='', ok=false;
    if(target && target.range){ try{ ok=wrapRange(target.range,id); }catch(e){ ok=false; } if(ok){ anchored=true; quote=target.quote; } else toast('선택한 부분을 표시할 수 없어 문서 전체 메모로 남겼습니다.'); }
    var note={id:id,author:author,ts:new Date().toISOString(),text:text,quote:quote,anchored:anchored,resolved:false,replies:[]};
    notes.push(note); savedRange=null; afterNotesChange(); return note;
  }
  function replyNote(id,text){ var n=findNote(id); text=(text||'').trim(); if(!n||!text) return false; n.replies.push({author:ensureAuthor(),ts:new Date().toISOString(),text:text}); afterNotesChange(); return true; }
  function resolveNote(id,on){ var n=findNote(id); if(!n) return false; n.resolved=!!on; afterNotesChange(); return true; }
  function removeNote(id){
    var i; for(i=0;i<notes.length;i++) if(notes[i].id===id) break; if(i>=notes.length) return false;
    notes.splice(i,1); unwrapMarks(id,content);
    if(comparing){ var model=document.createElement('div'); model.innerHTML=pristineHtml; unwrapMarks(id,model); pristineHtml=model.innerHTML; renderCompare(); }
    afterNotesChange(); return true;
  }
  function openCount(){ var n=0; for(var i=0;i<notes.length;i++) if(!notes[i].resolved) n++; return n; }
  // 저장소에 없는 mark는 풀고, 빈 mark는 지우고, 해결 상태를 mark 클래스에 맞춘다. 비교 중에는 화면(렌더)의 클래스만 맞춘다.
  function reconcileNotes(){
    var marks=content.querySelectorAll('mark.doc-ed-note'), i, m, n;
    for(i=0;i<marks.length;i++){ m=marks[i]; n=findNote(m.getAttribute('data-doc-note')||'');
      if(!comparing && (!n || !normText(m.textContent))){ unwrapMark(m); continue; }
      m.classList.toggle('doc-ed-note-resolved', !!(n && n.resolved)); }
  }
  function noteHasAnchor(id){ return noteMarks(id).length>0; }
  function afterNotesChange(){ reconcileNotes(); renderNotes(); scheduleAutosave(); }

  /* ---------- 메모 패널 ---------- */
  var targetCleared=false;
  function setNotes(on){
    body.classList.toggle('doc-notes-open',on);
    var t=$('doc-notesBtn'); if(t){ t.setAttribute('aria-expanded',String(on)); t.classList.toggle('on',on); }
    if(on){ setInspector(false); setMore(false); captureTarget(); renderNotes(); }
  }
  // 작성 상자에 포커스가 올 때의 본문 선택을 메모 대상으로 잡는다. 선택이 없거나 ×로 지웠으면 문서 전체. 새로 선택하면 다시 잡는다.
  function captureTarget(){ noteTarget=(comparing||targetCleared)?null:targetFrom(savedRange); showTarget(); }
  function clearTarget(){ noteTarget=null; targetCleared=true; showTarget(); }
  function showTarget(){
    var t=$('doc-notesTarget'), hint=$('doc-notesHint'), input=$('doc-notesInput'), add=$('doc-notesAdd'), q, x;
    if(t){ q=t.querySelector('.q'); x=$('doc-notesTargetClear'); t.classList.toggle('has',!!noteTarget); if(q) q.textContent=noteTarget?('“'+noteTarget.quote+'”'):'문서 전체'; if(x) x.hidden=!noteTarget; }
    if(hint) hint.hidden=!comparing; if(input) input.disabled=comparing; if(add) add.disabled=comparing;
  }
  function locateNote(id){
    var marks=noteMarks(id), i;
    content.querySelectorAll('.doc-ed-note-active').forEach(function(m){m.classList.remove('doc-ed-note-active');});
    if(!marks.length){ toast('본문에서 이 메모의 위치를 찾을 수 없습니다.'); return; }
    for(i=0;i<marks.length;i++) marks[i].classList.add('doc-ed-note-active');
    marks[0].scrollIntoView({block:'center',behavior:'smooth'});
    clearTimeout(locateTimer); locateTimer=setTimeout(function(){ content.querySelectorAll('.doc-ed-note-active').forEach(function(m){m.classList.remove('doc-ed-note-active');}); },1500);
  }
  function highlightCard(id){
    var list=$('doc-notesList'), chk=$('doc-notesShowResolved'), card; if(!list) return;
    card=list.querySelector('[data-note-id="'+id+'"]');
    if(!card && chk && !chk.checked){ chk.checked=true; renderNotes(); card=list.querySelector('[data-note-id="'+id+'"]'); }
    if(!card) return;
    list.querySelectorAll('.doc-ed-note-card.active').forEach(function(c){c.classList.remove('active');});
    card.classList.add('active'); card.classList.add('open'); card.scrollIntoView({block:'nearest'});
  }
  function noteCard(n){
    var card=document.createElement('article'), orphan=n.anchored&&!noteHasAnchor(n.id), where;
    card.className='doc-ed-note-card'+(n.resolved?' resolved':''); card.setAttribute('data-note-id',n.id);
    where=n.anchored?(orphan?'<span class="doc-ed-note-badge">위치 없음</span> ':''):'<span class="doc-ed-note-badge">문서 전체</span>';
    card.innerHTML='<div class="doc-ed-note-head"><strong>'+escapeHtml(n.author||'이름 없음')+'</strong><span>'+escapeHtml(fmtTs(n.ts))+'</span>'+(n.resolved?'<span class="doc-ed-note-badge ok">해결됨</span>':'')+'</div>'
      +'<div class="doc-ed-note-where">'+where+(n.quote?'<q>'+escapeHtml(n.quote)+'</q>':'')+'</div>'
      +'<div class="doc-ed-note-text">'+escapeHtml(n.text)+'</div>'
      +(n.replies.length?'<div class="doc-ed-note-replies">'+n.replies.map(function(r){ return '<div class="doc-ed-note-reply"><strong>'+escapeHtml(r.author||'이름 없음')+'</strong><span>'+escapeHtml(fmtTs(r.ts))+'</span><div>'+escapeHtml(r.text)+'</div></div>'; }).join('')+'</div>':'')
      +'<div class="doc-ed-note-actions"><button type="button" class="doc-ed-btn" data-act="reply">답글</button><button type="button" class="doc-ed-btn" data-act="resolve">'+(n.resolved?'다시 열기':'해결')+'</button><button type="button" class="doc-ed-btn ghost" data-act="remove">삭제</button></div>'
      +'<div class="doc-ed-note-replybox" hidden><textarea rows="2" placeholder="답글"></textarea><button type="button" class="doc-ed-btn primary" data-act="send">남기기</button></div>';
    return card;
  }
  function renderNotes(){
    var open=openCount(), count=$('doc-notesCount'), btn=$('doc-notesBtn'), list=$('doc-notesList'), chk=$('doc-notesShowResolved'), showResolved=!!(chk&&chk.checked), shown=[], i, keep=Object.create(null), drafts=Object.create(null), card, box, state;
    if(count) count.textContent=open?String(open):''; if(btn) btn.title=open?('미해결 메모 '+open+'개'):'메모 보기·남기기';
    showTarget();
    if(!list) return;
    // 다시 그리기 전에 쓰다 만 답글(열린 상자 전부)과 카드의 펼침·선택 상태를 보존한다.
    list.querySelectorAll('.doc-ed-note-replybox:not([hidden])').forEach(function(b){ var c=b.closest('.doc-ed-note-card'), t=b.querySelector('textarea'); if(c) drafts[c.getAttribute('data-note-id')]=t?t.value:''; });
    list.querySelectorAll('.doc-ed-note-card.open,.doc-ed-note-card.active').forEach(function(c){ keep[c.getAttribute('data-note-id')]=(c.classList.contains('open')?'o':'')+(c.classList.contains('active')?'a':''); });
    list.innerHTML='';
    for(i=0;i<notes.length;i++) if(showResolved||!notes[i].resolved) shown.push(notes[i]);
    if(!shown.length){ list.innerHTML='<p class="doc-ed-muted" style="font-size:13px;margin:6px 4px">'+(notes.length?'해결되지 않은 메모가 없습니다.':'메모가 없습니다. 본문을 선택하고 위에 남겨 보세요.')+'</p>'; return; }
    for(i=0;i<shown.length;i++){
      card=noteCard(shown[i]); state=keep[shown[i].id]||'';
      if(state.indexOf('o')>=0) card.classList.add('open'); if(state.indexOf('a')>=0) card.classList.add('active');
      if(shown[i].id in drafts){ box=card.querySelector('.doc-ed-note-replybox'); box.hidden=false; box.querySelector('textarea').value=drafts[shown[i].id]; }
      list.appendChild(card);
    }
  }
  bind('doc-notesBtn','click',function(){ setNotes(!body.classList.contains('doc-notes-open')); });
  bind('doc-notesClose','click',function(){ setNotes(false); var t=$('doc-notesBtn'); if(t) t.focus(); });
  bind('doc-ebNote','click',function(){ setNotes(true); var input=$('doc-notesInput'); if(input && !input.disabled) input.focus(); });
  bind('doc-notesInput','focus',captureTarget);
  bind('doc-notesTargetClear','click',clearTarget);
  bind('doc-notesAdd','click',function(){ var input=$('doc-notesInput'); if(!input) return; if(!normText(input.value)){ toast('메모 내용을 입력해 주세요.'); return; } var n=addNote(input.value,noteTarget); if(n){ input.value=''; noteTarget=null; targetCleared=false; showTarget(); highlightCard(n.id); } });
  bind('doc-notesShowResolved','change',renderNotes);
  bind('doc-notesAuthor','change',function(){ storeAuthor(this.value.trim()); });
  (function(){
    var panel=$('doc-notes-panel'), list=$('doc-notesList'); if(!panel) return;
    panel.addEventListener('mousedown',function(e){ if(e.target.closest('button')) e.preventDefault(); });
    if(list) list.addEventListener('click',function(e){
      var card=e.target.closest('.doc-ed-note-card'), act, id, a, box, ta, n, ok;
      if(!card) return; id=card.getAttribute('data-note-id'); act=e.target.closest('[data-act]');
      if(!act){ if(e.target.closest('textarea')) return; card.classList.toggle('open'); locateNote(id); return; }
      a=act.getAttribute('data-act');
      if(a==='reply'){ box=card.querySelector('.doc-ed-note-replybox'); box.hidden=!box.hidden; if(!box.hidden) box.querySelector('textarea').focus(); }
      else if(a==='send'){ box=card.querySelector('.doc-ed-note-replybox'); ta=box.querySelector('textarea'); var text=ta.value; if(!normText(text)){ toast('답글 내용을 입력해 주세요.'); return; } ta.value=''; box.hidden=true; if(replyNote(id,text)) highlightCard(id); }
      else if(a==='resolve'){ n=findNote(id); if(n) resolveNote(id,!n.resolved); }
      else if(a==='remove'){ ok=true; try{ ok=window.confirm('이 메모와 답글을 삭제할까요?'); }catch(err){} if(ok) removeNote(id); }
    });
  })();
  content.addEventListener('click',function(e){ var m=e.target.closest?e.target.closest('mark.doc-ed-note'):null; if(m && content.contains(m)){ setNotes(true); highlightCard(m.getAttribute('data-doc-note')); } });

  /* ---------- 변경 사항 비교 (보기 전용 · 원본은 pristineHtml 문자열) ---------- */
  var cmp=null, baseline=null, changeIndex=-1, fileBaseline=null;
  function withPristine(fn){ if(!comparing) return fn(); var rendered=content.innerHTML; content.innerHTML=pristineHtml; try{ return fn(); } finally{ content.innerHTML=rendered; } }
  function baselineCandidates(){
    var list=[], cur=getContentHtml();
    if(cur!==lastSavedHtml) list.push({kind:'session',label:'마지막 저장 이후 (미저장 수정)',html:lastSavedHtml});
    else if(baseline&&baseline.kind==='session') list.push(baseline);
    history.forEach(function(h,i){ list.push({kind:'history',index:i,label:(h.author||'이름 없음')+' · '+fmtTs(h.ts)+' · '+h.title,html:h.html}); });
    if(fileBaseline) list.push(fileBaseline);
    return list;
  }
  // 기본 기준: 미저장 수정이 있으면 마지막 저장, 아니면 현재 저장자와 다른 사람이 저장한 가장 최근 저장본, 없으면 최근 저장본.
  function pickDefaultBaseline(){
    var c=baselineCandidates(), me=body.dataset.docSavedBy||'', i, k;
    if(!c.length) return null;
    if(c[0].kind==='session') return c[0];
    for(i=0;i<history.length;i++) if((history[i].author||'')!==me){ for(k=0;k<c.length;k++) if(c[k].kind==='history'&&c[k].index===i) return c[k]; }
    for(k=0;k<c.length;k++) if(c[k].kind==='history'&&c[k].index===0) return c[k];
    return null;
  }
  function changeElements(){ return content.querySelectorAll('[data-doc-change]'); }
  function changeTotal(){ return cmp?cmp.changes.length:0; }
  function updateChangeButtons(){
    var total=changeTotal(), prev=$('doc-changesPrev'), next=$('doc-changesNext'), rv=$('doc-changesRevert');
    if(prev) prev.disabled=total===0; if(next) next.disabled=total===0; if(rv) rv.disabled=changeIndex<0||changeIndex>=total;
  }
  function selectChange(i,scroll){
    var els=changeElements(), k, target=null;
    for(k=0;k<els.length;k++) els[k].classList.remove('doc-ed-diff-active');
    changeIndex=(cmp&&i>=0&&i<cmp.changes.length)?i:-1;
    if(changeIndex>=0){ for(k=0;k<els.length;k++) if(els[k].getAttribute('data-doc-change')===String(changeIndex)){ els[k].classList.add('doc-ed-diff-active'); if(!target) target=els[k]; } }
    if(target&&scroll) target.scrollIntoView({block:'center',behavior:'smooth'});
    updateChangeButtons();
  }
  function stepChange(dir){ var total=changeTotal(); if(!total) return; selectChange(((changeIndex<0?(dir>0?-1:0):changeIndex)+dir+total)%total,true); }
  function renderCompare(){
    if(!comparing) return;
    var summary=$('doc-changesSummary'), n, total;
    if(!baseline){ content.innerHTML=pristineHtml; cmp=null; changeIndex=-1; if(summary) summary.textContent='비교할 저장본이 없습니다. 파일을 선택해 비교할 수 있습니다.'; updateChangeButtons(); reconcileNotes(); return; }
    cmp=window.DocEditorDiff.compare(baseline.html,pristineHtml);
    window.DocEditorDiff.render(cmp);
    content.innerHTML=cmp.cRoot.innerHTML;
    n=cmp.counts; total=cmp.changes.length;
    if(summary) summary.textContent=total?('추가 '+n.ins+' · 삭제 '+n.del+' · 수정 '+n.mod+' · 서식 '+n.fmt+(cmp.exceeded?' · 변경이 많아 전체 교체로 표시':'')):'차이 없음';
    if(changeIndex>=total) changeIndex=total-1;
    selectChange(changeIndex,false);
    reconcileNotes();
  }
  function baselineValue(b){ return b.kind==='history'?('history:'+b.index):b.kind; }
  function useBaseline(b){ if(!comparing) return; baseline=b; var sel=$('doc-changesBase'); if(sel&&b) sel.value=baselineValue(b); renderCompare(); }
  function setCompare(on){
    if(on){
      if(comparing) return;
      if(!window.DocEditorDiff){ toast('비교 엔진이 없습니다. 크롬과 엔진을 함께 업데이트하세요.'); return; }
      if(editing) setEdit(false);
      captureBasePadding();
      markTarget(null); pendingDelete=null;
      pristineHtml=content.innerHTML; comparing=true; changeIndex=-1; body.classList.add('doc-changes');
      baseline=pickDefaultBaseline(); fillBaseOptions(); renderCompare();
    }else{
      if(!comparing) return;
      content.innerHTML=pristineHtml; comparing=false; pristineHtml=null; cmp=null; changeIndex=-1; baseline=null; body.classList.remove('doc-changes');
      reconcileNotes(); savedRange=null; if(!editing) restoreBasePadding();
    }
    var b=$('doc-changesBtn'); if(b) b.classList.toggle('on',on);
    showTarget(); updateEditorLayout();
  }
  function fillBaseOptions(){
    var sel=$('doc-changesBase'), c, i, o; if(!sel) return; sel.innerHTML='';
    c=baselineCandidates();
    for(i=0;i<c.length;i++){ o=document.createElement('option'); o.value=baselineValue(c[i]); o.textContent=c[i].label; sel.appendChild(o); }
    o=document.createElement('option'); o.value='pick'; o.textContent=fileBaseline?'다른 파일 선택…':'파일 선택…'; sel.appendChild(o);
    sel.value=baseline?baselineValue(baseline):'pick';
  }
  function revertChange(i){
    if(!comparing||!cmp) return false;
    if(typeof i==='number'){ if(i<0||i>=cmp.changes.length) return false; changeIndex=i; }
    if(changeIndex<0||changeIndex>=cmp.changes.length) return false;
    var model=document.createElement('div'); model.innerHTML=pristineHtml;
    if(!window.DocEditorDiff.revert(cmp,changeIndex,model)){ toast('되돌리지 못했습니다.'); return false; }
    pristineHtml=model.innerHTML; renderCompare(); scheduleAutosave();
    toast('원래대로 되돌렸습니다. 파일에 반영하려면 저장을 누르세요.');
    return true;
  }
  async function loadBaselineFile(file){
    var html=await window.DocEditorAttach.readFile(file), doc=new DOMParser().parseFromString(html,'text/html'), root=doc.getElementById('doc-content')||doc.body;
    fileBaseline={kind:'file',label:'파일: '+file.name,html:root?root.innerHTML:''};
    fillBaseOptions(); useBaseline(fileBaseline);
  }

  /* ---------- 블록 삭제 ---------- */
  // 브라우저 기본 삭제는 이웃 블록과 병합하면서 살아남은 쪽의 class를 잃고, 표의 행은 지우지 못한다.
  // 그래서 DOM에서 직접 떼어내고 되돌리기를 직접 붙인다(원시 제거는 Ctrl+Z 대상이 아니다).
  var blockTarget=null, pendingDelete=null;
  function isBlockish(el){
    if(!el || el.nodeType!==1 || el===content) return false;
    if(el.parentElement===content) return true;
    var d=getComputedStyle(el).display;
    return d==='block'||d==='flex'||d==='grid'||d==='list-item'||d==='flow-root'||d.indexOf('table')===0;
  }
  function nearestBlock(el){ var n=el; while(n && n!==content){ if(isBlockish(n)) return n; n=n.parentElement; } return null; }
  // 표 칸만 지우면 열이 어긋나므로 행 단위로 올린다. 행 묶음(tbody 등)은 건너뛴다.
  function resolveBlock(el){
    var n=nearestBlock(el), tr;
    if(n && (n.tagName==='TD'||n.tagName==='TH')){ tr=n.closest('tr'); if(tr && content.contains(tr)) n=tr; }
    while(n && (n.tagName==='TBODY'||n.tagName==='THEAD'||n.tagName==='TFOOT')) n=nearestBlock(n.parentElement);
    // 박스가 없는 요소(display:contents 등)는 외곽선이 보이지 않아 대상으로 삼지 않는다.
    while(n && n!==content && !n.getClientRects().length) n=nearestBlock(n.parentElement);
    return (n && n!==content && content.contains(n))?n:null;
  }
  function markTarget(el){
    if(blockTarget){ blockTarget.classList.remove('doc-ed-block-target'); if(!blockTarget.className) blockTarget.removeAttribute('class'); }
    blockTarget=el||null;
    if(blockTarget) blockTarget.classList.add('doc-ed-block-target');
  }
  function blockName(el){
    if(!el) return '블록';
    var map={H1:'제목 1',H2:'제목 2',H3:'제목 3',H4:'제목 4',H5:'제목 5',H6:'제목 6',P:'본문',
             LI:'목록 항목',BLOCKQUOTE:'인용',TR:'표 행',TABLE:'표',UL:'목록',OL:'목록',DL:'목록',
             DT:'용어',DD:'설명',FIGURE:'그림',FIGCAPTION:'그림 설명',PRE:'코드',
             SECTION:'구역',ARTICLE:'구역',HEADER:'머리 구역',FOOTER:'꼬리 구역',ASIDE:'보조 구역'};
    return map[el.tagName]||'블록';
  }
  function pickBlock(){
    if(!editing){ toast('편집 모드에서 사용할 수 있습니다.'); return null; }
    var next=blockTarget?resolveBlock(blockTarget.parentElement):resolveBlock(curEl());
    if(!next){ toast(blockTarget?'더 넓힐 상위 블록이 없습니다.':'커서를 삭제할 블록 안에 두세요.'); return null; }
    markTarget(next);
    next.scrollIntoView({block:'nearest'});
    toast(blockName(next)+' 블록을 지정했습니다. 다시 누르면 상위 블록으로 넓힙니다.');
    return next;
  }
  function removeBlock(){
    if(comparing){ toast('비교를 닫고 편집 모드에서 삭제할 수 있습니다.'); return false; }
    if(!editing){ toast('편집 모드에서 사용할 수 있습니다.'); return false; }
    var el=blockTarget||resolveBlock(curEl());
    if(!el){ toast('커서를 삭제할 블록 안에 두세요.'); return false; }
    var parent=el.parentElement, next=el.nextSibling, prev=el.previousSibling, label=blockName(el);
    markTarget(null);
    el.classList.remove('doc-ed-block-target'); if(!el.className) el.removeAttribute('class');
    parent.removeChild(el);
    pendingDelete={node:el,parent:parent,next:next,prev:prev};
    savedRange=null; placeCaretAfterRemoval(parent,next,prev);
    reconcileNotes(); renderNotes(); updateInspector(); scheduleAutosave();
    toast(label+' 블록을 삭제했습니다.',8000,{label:'되돌리기',fn:undoBlock});
    return true;
  }
  // 삭제 직후 커서가 엉뚱한 곳에 남지 않게 인접 블록으로 옮긴다.
  function placeCaretAfterRemoval(parent,next,prev){
    var at=(next&&next.parentNode===parent)?next:((prev&&prev.parentNode===parent)?prev:null), target=at||parent;
    if(!target || !(target===content||content.contains(target))) return;
    try{
      var r=document.createRange(); r.selectNodeContents(target); r.collapse(at===next);
      var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); savedRange=r.cloneRange();
    }catch(e){}
  }
  function undoBlock(){
    if(!pendingDelete){ toast('되돌릴 블록 삭제가 없습니다.'); return false; }
    var d=pendingDelete, parent=d.parent; pendingDelete=null;
    if(!parent || !(parent===content || content.contains(parent))) content.appendChild(d.node);
    else if(d.next && d.next.parentNode===parent) parent.insertBefore(d.node,d.next);
    else if(d.prev && d.prev.parentNode===parent) parent.insertBefore(d.node,d.prev.nextSibling);
    else parent.appendChild(d.node);
    savedRange=null;
    reconcileNotes(); renderNotes(); updateInspector(); scheduleAutosave();
    toast('삭제한 블록을 되돌렸습니다.');
    return true;
  }

  /* ---------- 편집 모드 ---------- */
  function captureBasePadding(){ if(!editing && !comparing){ originalPaddingTop=body.style.paddingTop; originalPaddingPixels=parseFloat(getComputedStyle(body).paddingTop)||0; } }
  function restoreBasePadding(){ body.style.paddingTop=originalPaddingTop; }
  // display:contents 인 편집 루트는 박스가 없어 포커스를 받지 못하고 키 입력이 버려진다.
  // 편집 중에만 박스를 만들고, 보기 모드로 돌아가면 원래 값을 되돌린다(배포본·저장본은 그대로).
  var contentsDisplay=null;
  function applyEditDisplay(on){
    if(on){
      if(contentsDisplay===null && getComputedStyle(content).display==='contents'){
        contentsDisplay=content.style.display||'';
        content.style.setProperty('display','block','important');
      }
    }else if(contentsDisplay!==null){
      content.style.removeProperty('display');
      if(contentsDisplay) content.style.display=contentsDisplay;
      contentsDisplay=null;
    }
  }
  // 편집 중 직렬화하면 임시 display 가 사본에 남으므로 복제본에서 되돌린다.
  function restoreCloneDisplay(clone){
    if(contentsDisplay===null) return;
    var c=clone.querySelector('#doc-content'); if(!c) return;
    c.style.removeProperty('display');
    if(contentsDisplay) c.style.display=contentsDisplay;
  }
  function setEdit(on){
    if(on && comparing) setCompare(false);
    if(on && !editing) captureBasePadding();
    editing=on;
    applyEditDisplay(on);
    content.setAttribute('contenteditable', on?'true':'false');
    body.classList.toggle('doc-editing', on);
    var t=$('doc-editToggle');
    if(t){ t.classList.toggle('on', on); t.textContent=on?'✎ 편집 중':'✎ 편집'; }
    try{ document.execCommand('styleWithCSS',false,true); }catch(e){}
    setMore(false);
    if(on) updateInspector();
    else { setInspector(false); markTarget(null); pendingDelete=null; if(!comparing) restoreBasePadding(); doAutosave(); }
    updateEditorLayout();
  }

  /* ---------- 좁은 화면의 편집 UI ---------- */
  function setMore(on){
    var controls=$('doc-controls'), toggle=$('doc-moreToggle');
    if(controls) controls.classList.toggle('doc-more-open',on);
    if(toggle) toggle.setAttribute('aria-expanded',String(on));
  }
  function setInspector(on){
    body.classList.toggle('doc-inspector-open',on && editing);
    var toggle=$('doc-inspectorToggle'); if(toggle) toggle.setAttribute('aria-expanded',String(on && editing));
  }
  function updateEditorLayout(){
    var mobile=window.matchMedia('(max-width:900px)').matches;
    var controls=$('doc-controls'), bar=$('doc-editbar'), cbar=$('doc-changes-bar');
    var controlHeight=controls?controls.offsetHeight:60;
    body.style.setProperty('--doc-ed-controls-height',controlHeight+'px');
    body.style.setProperty('--doc-ed-controls-width',(controls?controls.offsetWidth:380)+'px');
    var toolsHeight=editing?(bar?bar.offsetHeight:0):(comparing?(cbar?cbar.offsetHeight:0):0);
    var bottom=(mobile?controlHeight:0)+toolsHeight;
    body.style.setProperty('--doc-ed-tools-bottom',bottom+'px');
    body.style.setProperty('--doc-ed-visible-height',(window.visualViewport?window.visualViewport.height:window.innerHeight)+'px');
    if(editing||comparing) body.style.paddingTop=(originalPaddingPixels+bottom)+'px';
    if(!mobile){setMore(false);setInspector(false);}
  }
  function scheduleLayout(){
    if(layoutFrame!==null) return;
    layoutFrame=requestAnimationFrame(function(){layoutFrame=null;updateEditorLayout();});
  }
  bind('doc-moreToggle','click',function(){
    setInspector(false); setMore(this.getAttribute('aria-expanded')!=='true');
  });
  bind('doc-inspectorToggle','click',function(){
    setMore(false);setNotes(false);setInspector(this.getAttribute('aria-expanded')!=='true');
  });
  bind('doc-inspectorClose','click',function(){setInspector(false);var t=$('doc-inspectorToggle');if(t)t.focus();});
  document.addEventListener('pointerdown',function(e){
    var controls=$('doc-controls');if(controls && !controls.contains(e.target))setMore(false);
    if(content.contains(e.target))setInspector(false);
    if(content.contains(e.target) && window.matchMedia('(max-width:900px)').matches) setNotes(false);
  });
  var moreActions=$('doc-more-actions');if(moreActions)moreActions.addEventListener('click',function(e){if(e.target.closest('button'))setMore(false);});

  /* ---------- 선택 / 명령 ---------- */
  function focusContent(){ content.focus({preventScroll:true}); if(savedRange){ var s=window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); } }
  function styleCss(){ try{ document.execCommand('styleWithCSS',false,true); }catch(e){} }
  function afterEdit(){ updateInspector(); scheduleAutosave(); }
  function exec(name,val){ if(!editing) return; focusContent(); styleCss(); document.execCommand(name,false,val); afterEdit(); }
  function applyFontSize(px){
    if(!editing) return; focusContent();
    try{ document.execCommand('styleWithCSS',false,false); }catch(e){}
    document.execCommand('fontSize',false,'7');
    try{ document.execCommand('styleWithCSS',false,true); }catch(e){}
    var f=content.querySelectorAll('font[size="7"]');
    for(var i=0;i<f.length;i++){ f[i].removeAttribute('size'); f[i].style.fontSize=px+'px'; }
    afterEdit();
  }
  function applyBack(c){ if(!editing) return; focusContent(); styleCss(); if(!document.execCommand('hiliteColor',false,c)){ document.execCommand('backColor',false,c); } afterEdit(); }
  function insertTable(){
    if(!editing) return; focusContent();
    var h='<div class="doc-ed-tablewrap"><table class="doc-ed-table"><thead><tr><th>항목</th><th>항목</th><th>항목</th></tr></thead><tbody>'+
      '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table></div><p>&nbsp;</p>';
    document.execCommand('insertHTML',false,h); afterEdit();
  }

  document.addEventListener('selectionchange', function(){
    var s=window.getSelection();
    if(s && s.rangeCount){ var r=s.getRangeAt(0); if(content.contains(r.commonAncestorContainer)){ savedRange=r.cloneRange(); if(!r.collapsed) targetCleared=false; if(blockTarget && !blockTarget.contains(r.commonAncestorContainer)) markTarget(null); updateInspector(); } }
  });

  /* ---------- 속성 패널 ---------- */
  function rgbToHex(c){ var m=(c||'').match(/\d+(\.\d+)?/g); if(!m) return ''; return '#'+[m[0],m[1],m[2]].map(function(n){return (+n).toString(16).padStart(2,'0');}).join('').toUpperCase(); }
  function firstFont(s){ return ((s||'').split(',')[0]||'').trim().replace(/^['"]|['"]$/g,''); }
  function curEl(){ var n=savedRange?savedRange.startContainer:(window.getSelection().anchorNode); if(!n) return content; if(n.nodeType===3) n=n.parentElement; if(!n||!content.contains(n)) return content; return n; }
  function q(c){ try{ return document.queryCommandState(c); }catch(e){ return false; } }
  function blockLabel(el){ var n=el, map={H1:'제목 1',H2:'제목 2',H3:'제목 3',H4:'제목 4',BLOCKQUOTE:'인용',P:'본문',LI:'목록',TD:'표 칸',TH:'표 머리글'}; while(n&&n!==content){ if(map[n.tagName]) return map[n.tagName]; n=n.parentElement; } return '본문'; }
  function optHas(sel,v){ if(!sel) return false; for(var i=0;i<sel.options.length;i++){ if(sel.options[i].value===v) return true; } return false; }
  function setText(id,v){ var el=$(id); if(el) el.textContent=v; }
  function updateInspector(){
    if(!editing) return;
    var el=curEl(); if(!el) return; var cs=getComputedStyle(el);
    setText('doc-i-size', Math.round(parseFloat(cs.fontSize))+'px');
    setText('doc-i-font', firstFont(cs.fontFamily)||'기본');
    var fsw=$('doc-i-fore-sw'); if(fsw) fsw.style.background=cs.color;
    setText('doc-i-fore-tx', rgbToHex(cs.color)||'-');
    var bg=cs.backgroundColor, sw=$('doc-i-back-sw'), tx=$('doc-i-back-tx');
    if(sw&&tx){ if(!bg||bg==='transparent'||bg==='rgba(0, 0, 0, 0)'){ sw.style.background=''; tx.textContent='없음'; } else { sw.style.background=bg; tx.textContent=rgbToHex(bg); } }
    var chips=document.querySelectorAll('#doc-i-chips .doc-ed-ichip'); for(var i=0;i<chips.length;i++){ chips[i].classList.toggle('on', q(chips[i].getAttribute('data-st'))); }
    setText('doc-i-block', blockLabel(el));
    // 툴바 동기화
    var tag='P', n=el; while(n&&n!==content){ if(/^(H1|H2|H3|P|BLOCKQUOTE)$/.test(n.tagName)){ tag=n.tagName; break; } n=n.parentElement; }
    var bsel=$('doc-ebBlock'); if(bsel) bsel.value=tag.toLowerCase();
    var px=String(Math.round(parseFloat(cs.fontSize))), ss=$('doc-ebSize'); if(ss) ss.value=optHas(ss,px)?px:'';
    var col=$('doc-ebColor'); if(col) col.value=rgbToHex(cs.color)||'#1f2937';
    ['bold','italic','underline','strikeThrough'].forEach(function(cmd){
      var b=document.querySelector('#doc-editbar [data-cmd="'+cmd+'"]'); if(b) b.classList.toggle('active',q(cmd));
    });
  }

  /* ---------- 툴바 연결 ---------- */
  var editbar=$('doc-editbar');
  if(editbar){
    editbar.addEventListener('mousedown', function(e){ if(e.target.closest('button')) e.preventDefault(); });
    editbar.querySelectorAll('[data-cmd]').forEach(function(b){ b.addEventListener('click', function(){ exec(b.getAttribute('data-cmd')); }); });
  }
  bind('doc-ebBlock','change', function(){ exec('formatBlock','<'+this.value+'>'); });
  bind('doc-ebFont','change', function(){ if(this.value) exec('fontName', this.value); });
  bind('doc-ebSize','change', function(){ if(this.value) applyFontSize(this.value); });
  bind('doc-ebColor','input', function(){ exec('foreColor', this.value); });
  bind('doc-ebBg','input', function(){ applyBack(this.value); });
  bind('doc-ebBgClear','click', function(){ applyBack('transparent'); });
  bind('doc-ebTable','click', insertTable);
  bind('doc-ebBlockPick','click', pickBlock);
  bind('doc-ebBlockDel','click', removeBlock);
  content.addEventListener('input', function(){ pendingDelete=null; if(editing) scheduleAutosave(); });
  function bind(id,ev,fn){ var el=$(id); if(el) el.addEventListener(ev,fn); }

  /* ---------- 직렬화 / 저장 ---------- */
  function snapshotTitle(html){ var d=document.createElement('div'); d.innerHTML=html; var h=d.querySelector('h1,h2,h3'); return (h&&h.textContent.trim())||(document.title||'').trim()||'(제목 없음)'; }
  function pushHistoryIfChanged(){ var cur=getContentHtml(); if(cur!==lastSavedHtml && !(history[0] && history[0].html===lastSavedHtml)){ history.unshift({ts:body.dataset.docSavedAt||new Date().toISOString(), title:snapshotTitle(lastSavedHtml), html:lastSavedHtml, author:body.dataset.docSavedBy||''}); history=history.slice(0,30); } }
  function serialize(){
    histEl.textContent=escForScript(JSON.stringify(history));
    notesEl.textContent=escForScript(JSON.stringify(notes));
    var clone=withPristine(function(){ return document.documentElement.cloneNode(true); });
    restoreCloneDisplay(clone);
    clone.querySelectorAll('[data-doc-editor-download]').forEach(function(el){el.remove();});
    var b=clone.querySelector('body'); if(b){ b.classList.remove('doc-editing','doc-inspector-open','doc-notes-open','doc-changes'); b.style.paddingTop=originalPaddingTop; ['--doc-ed-controls-height','--doc-ed-controls-width','--doc-ed-tools-bottom','--doc-ed-visible-height'].forEach(function(name){b.style.removeProperty(name);}); }
    var c=clone.querySelector('#doc-content'); if(c) c.setAttribute('contenteditable','false');
    ['#doc-restore-banner','#doc-toast'].forEach(function(s){ var el=clone.querySelector(s); if(el) el.classList.remove('show'); });
    var m=clone.querySelector('#doc-history-modal'); if(m) m.classList.remove('open');
    var hl=clone.querySelector('#doc-hist-list'); if(hl) hl.innerHTML='';
    var hp=clone.querySelector('#doc-hist-preview'); if(hp) hp.innerHTML='';
    var controls=clone.querySelector('#doc-controls');if(controls)controls.classList.remove('doc-more-open');
    ['#doc-moreToggle','#doc-inspectorToggle'].forEach(function(sel){var t=clone.querySelector(sel);if(t)t.setAttribute('aria-expanded','false');});
    var et=clone.querySelector('#doc-editToggle'); if(et){ et.classList.remove('on'); et.textContent='✎ 편집'; }
    var attach=clone.querySelector('#doc-attachBtn');if(attach)attach.disabled=false;
    clone.querySelectorAll('#doc-content .doc-ed-note-active').forEach(function(m){m.classList.remove('doc-ed-note-active');});
    clone.querySelectorAll('#doc-content .doc-ed-block-target').forEach(function(m){m.classList.remove('doc-ed-block-target'); if(!m.className) m.removeAttribute('class');});
    var ct=clone.querySelector('#doc-toast'); if(ct) ct.textContent='';
    ['#doc-notesList','#doc-changesSummary','#doc-changesBase'].forEach(function(s){var el=clone.querySelector(s); if(el) el.innerHTML='';});
    var nt=clone.querySelector('#doc-notesTarget'); if(nt){ nt.classList.remove('has'); var nq=nt.querySelector('.q'); if(nq) nq.textContent='문서 전체'; var nx=nt.querySelector('#doc-notesTargetClear'); if(nx) nx.hidden=true; }
    var ni=clone.querySelector('#doc-notesInput'); if(ni) ni.textContent='';
    var na=clone.querySelector('#doc-notesAuthor'); if(na) na.removeAttribute('value');
    var nh=clone.querySelector('#doc-notesHint'); if(nh) nh.hidden=true;
    var nbt=clone.querySelector('#doc-notesBtn'); if(nbt){ nbt.setAttribute('aria-expanded','false'); nbt.classList.remove('on'); }
    var cbt=clone.querySelector('#doc-changesBtn'); if(cbt) cbt.classList.remove('on');
    var rv=clone.querySelector('#doc-changesRevert'); if(rv) rv.disabled=true;
    return '<!DOCTYPE html>\n'+clone.outerHTML;
  }
  function suggestName(){ var t=snapshotTitle(getContentHtml()).replace(/[\\/:*?"<>|]/g,'').trim(); return (t||'문서')+'.html'; }
  function downloadHtml(html, filename){ var blob=new Blob([html],{type:'text/html;charset=utf-8'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename||suggestName(); a.setAttribute('data-doc-editor-download',''); document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1200); }

  /* ---------- 배포용 HTML (원본 상태를 바꾸지 않는 별도 사본) ---------- */
  function serializeReadOnly(){
    var clone=withPristine(function(){ return document.documentElement.cloneNode(true); });
    restoreCloneDisplay(clone);
    var editorStyle=clone.querySelector('#doc-editor-style');
    var editorScript=clone.querySelector('#doc-editor-script');
    if(!editorStyle || !editorScript) throw new Error('편집 엔진의 style/script ID가 없습니다. 크롬과 엔진을 함께 업데이트하세요.');
    // 편집기로 삽입한 표의 보기 스타일만 남긴다. 툴바/패널 스타일은 내보내지 않는다.
    if(/class="[^"]*doc-ed-table/.test(getContentHtml())){
      var rules=Array.prototype.filter.call($('doc-editor-style').sheet.cssRules,function(rule){
        return rule.selectorText && rule.selectorText.split(',').every(function(selector){
          selector=selector.trim(); return selector==='.doc-ed-tablewrap' || selector.indexOf('#doc-content table.doc-ed-table')===0;
        });
      });
      if(rules.length){var tableStyle=document.createElement('style');tableStyle.textContent=rules.map(function(rule){return rule.cssText;}).join('\n');editorStyle.before(tableStyle);}
    }
    ['#doc-controls','#doc-editbar','#doc-inspector','#doc-editflag','#doc-restore-banner',
     '#doc-history-modal','#doc-toast','#doc-history','#doc-notes-panel','#doc-changes-bar','#doc-notes','#doc-editor-style','#doc-editor-script',
     '[data-doc-editor-download]'].forEach(function(selector){clone.querySelectorAll(selector).forEach(function(el){el.remove();});});
    var b=clone.querySelector('body');
    if(b){
      b.classList.remove('doc-editing','doc-inspector-open','doc-notes-open','doc-changes');b.removeAttribute('data-doc-id');b.removeAttribute('data-doc-saved-by');b.removeAttribute('data-doc-saved-at');b.style.paddingTop=originalPaddingTop;
      ['--doc-ed-controls-height','--doc-ed-controls-width','--doc-ed-tools-bottom','--doc-ed-visible-height'].forEach(function(name){b.style.removeProperty(name);});
    }
    var c=clone.querySelector('#doc-content');
    if(c){ c.removeAttribute('contenteditable'); c.querySelectorAll('.doc-ed-block-target').forEach(function(m){m.classList.remove('doc-ed-block-target'); if(!m.className) m.removeAttribute('class');}); var marks=c.querySelectorAll('mark.doc-ed-note'); for(var k=0;k<marks.length;k++) unwrapMark(marks[k]); }
    var comments=[],walker=document.createTreeWalker(clone,NodeFilter.SHOW_COMMENT),node;
    while((node=walker.nextNode()))if(/doc-editor/.test(node.data) && !(c&&c.contains(node)))comments.push(node);
    comments.forEach(function(comment){comment.remove();});
    return '<!DOCTYPE html>\n'+clone.outerHTML;
  }
  function exportReadOnly(){
    try{
      downloadHtml(serializeReadOnly(),suggestName().replace(/\.html$/i,'-배포용.html'));
      toast('편집기 없는 배포용 HTML 다운로드를 시작했습니다.');
    }catch(e){toast('배포용 HTML을 만들지 못했습니다. 크롬과 엔진을 함께 업데이트했는지 확인해 주세요.');}
  }

  /* ---------- 다른 HTML에 편집기 추가 ---------- */
  function attachToHTML(html){
    if(!window.DocEditorAttach || !attachBundle)throw new Error('편집기 추가 도구가 없습니다. 최신 예시를 사용해 주세요.');
    return window.DocEditorAttach.convert(html,attachBundle);
  }
  bind('doc-attachBtn','click',function(){var input=$('doc-attachFile');if(input)input.click();});
  bind('doc-attachFile','change',async function(){
    var file=this.files && this.files[0];this.value='';if(!file)return;
    var button=$('doc-attachBtn');if(button)button.disabled=true;
    try{
      var source=await window.DocEditorAttach.readFile(file);
      downloadHtml(attachToHTML(source),window.DocEditorAttach.filename(file.name));
      toast('편집 가능한 사본 다운로드를 시작했습니다. 내려받은 HTML을 열어 사용하세요.');
    }catch(e){toast(e.message||'편집기를 추가하지 못했습니다.');}
    finally{if(button)button.disabled=false;}
  });

  async function saveToFile(forceNew){
    if(saving) return;
    saving=true;
    var oldId=body.dataset.docId, oldHistory=history.slice(), oldSavedBy=body.dataset.docSavedBy, oldSavedAt=body.dataset.docSavedAt, changedId=false, wasPathKeyed=!body.dataset.docId;
    function rollback(){
      history=oldHistory;
      if(changedId){ if(oldId===undefined) delete body.dataset.docId; else body.dataset.docId=oldId; }
      if(oldSavedBy===undefined) delete body.dataset.docSavedBy; else body.dataset.docSavedBy=oldSavedBy;
      if(oldSavedAt===undefined) delete body.dataset.docSavedAt; else body.dataset.docSavedAt=oldSavedAt;
    }
    try{
      if(editing) setEdit(false);
      await fileLinkReady;
      var handle=forceNew?null:fileHandle, pickerFailed=false;
      if(window.showSaveFilePicker){
        try{
          if(forceNew || !handle){ handle=await window.showSaveFilePicker({ suggestedName:suggestName(), types:[{description:'HTML 문서', accept:{'text/html':['.html','.htm']}}] }); }
          else { var p=await handle.queryPermission({mode:'readwrite'}); if(p!=='granted' && (await handle.requestPermission({mode:'readwrite'}))!=='granted'){ toast('쓰기 권한이 허용되지 않아 저장하지 않았습니다. 다시 저장하거나 다른 이름으로 저장해 주세요.'); return; } }
        }catch(e){ if(e&&e.name==='AbortError') return; if(handle){ toast('저장 파일의 쓰기 권한을 확인하지 못했습니다. 저장 버튼을 다시 눌러 주세요.'); return; } handle=null; pickerFailed=true; }
      }
      // 이름은 파일 선택기가 끝난 뒤에 묻는다(선택기 앞의 prompt는 사용자 동작 유효 시간을 소모한다). 선택기를 취소하면 묻지 않는다.
      var author=ensureAuthor();
      // 첫 저장에서 문서 ID를 만들어 백업을 경로가 아닌 문서별로 구분한다. 다른 이름으로 저장하면 새 ID.
      if(forceNew || !body.dataset.docId){ body.dataset.docId=genId(); changedId=true; }
      var savedHtml=getContentHtml();
      pushHistoryIfChanged();
      body.dataset.docSavedBy=author; body.dataset.docSavedAt=new Date().toISOString();
      var output=serialize(), wroteFile=false;
      if(handle){
        try{ var w=await handle.createWritable(); await w.write(output); await w.close(); fileHandle=handle; wroteFile=true; }
        catch(e){
          if(e&&e.name==='NotFoundError'){
            if(!forceNew) fileHandle=null;
            if(!forceNew && rememberAtThisLocation) await fileLinkStore('delete');
            updateSaveHint();
            rollback();
            toast('연결한 파일을 찾지 못했습니다. 저장을 다시 누르면 파일을 선택할 수 있습니다.'); return;
          }
          pickerFailed=true;
        }
      }
      if(!wroteFile){ downloadHtml(output); if(forceNew) fileHandle=null; }
      // 다른 이름으로 저장한 파일은 이 탭에서 계속 사용하지만, 원래 경로의 연결은 덮어쓰지 않는다.
      if(forceNew) rememberAtThisLocation=false;
      var remembered=true;
      if(wroteFile && rememberAtThisLocation) remembered=(await fileLinkStore('put',handle)).ok;
      updateSaveHint();
      lastSavedHtml=savedHtml;
      if(comparing) fillBaseOptions();
      // 일반 저장에서 경로 키가 ID 키로 바뀌었으면 새 키 백업에 성공한 뒤 경로 키 백업을 지운다. 다른 이름으로 저장할 때는 원래 경로의 백업을 건드리지 않는다.
      if(writeBackup() && wasPathKeyed && !forceNew){ try{ localStorage.removeItem('docedit:autosave:url:'+location.origin+location.pathname); }catch(e){} }
      var banner=$('doc-restore-banner'); if(banner) banner.classList.remove('show');
      toast(wroteFile?'저장되었습니다 · '+handle.name+(remembered?'':' · 파일 연결을 기억하지 못해 다음에 다시 선택해야 합니다.'):(pickerFailed?'파일 저장 실패. 다운로드를 시작했습니다.':'다운로드를 시작했습니다. 내려받은 파일을 확인해 주세요.'));
    }catch(e){
      rollback();
      toast('저장하지 못했습니다. 다시 시도해 주세요.');
    }finally{ saving=false; }
  }

  /* ---------- 히스토리 ---------- */
  function fmtTs(iso){ try{ return new Date(iso).toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }catch(e){ return iso; } }
  function openHistory(){
    var list=$('doc-hist-list'); if(!list) return; list.innerHTML='';
    if(!history.length){ list.innerHTML='<p class="doc-ed-muted" style="font-size:13px">저장 히스토리가 없습니다.<br>저장하면 직전 내용이 쌓입니다.</p>'; }
    history.forEach(function(h,i){ var b=document.createElement('button'); b.className='doc-ed-hist-item'; b.innerHTML='<strong>'+escapeHtml(h.title)+'</strong><span>'+escapeHtml(h.author||'이름 없음')+' · '+escapeHtml(fmtTs(h.ts))+'</span>'; b.onclick=function(){ previewHistory(i); }; list.appendChild(b); });
    var pv=$('doc-hist-preview'); if(pv) pv.innerHTML='<p class="doc-ed-muted" style="font-size:13px">왼쪽에서 버전을 선택하면 미리보기가 표시됩니다.</p>';
    var m=$('doc-history-modal'); if(m) m.classList.add('open');
  }
  function previewHistory(i){
    var h=history[i], pv=$('doc-hist-preview'); if(!pv) return; pv.innerHTML='';
    var bar=document.createElement('div'); bar.className='doc-ed-hist-actions';
    var btn=document.createElement('button'); btn.className='doc-ed-btn primary'; btn.textContent='이 버전으로 복원'; btn.onclick=function(){ restoreHistory(i); };
    bar.appendChild(btn); pv.appendChild(bar);
    var f=document.createElement('div'); f.className='doc-ed-hist-doc'; f.innerHTML=h.html; pv.appendChild(f);
  }
  function restoreHistory(i){
    if(comparing) setCompare(false);
    var target=history[i].html, cur=getContentHtml();
    if(!(history[0] && history[0].html===cur)){ history.unshift({ts:body.dataset.docSavedAt||new Date().toISOString(), title:'복원 전: '+snapshotTitle(cur), html:cur, author:body.dataset.docSavedBy||''}); history=history.slice(0,30); }
    content.innerHTML=target; savedRange=null; var m=$('doc-history-modal'); if(m) m.classList.remove('open'); afterContentReplaced(); scheduleAutosave();
    toast('해당 버전으로 복원했습니다. 파일에 반영하려면 [저장]을 누르세요.');
  }

  /* ---------- 자동저장 복구 ---------- */
  function checkAutosave(){
    try{ var raw=localStorage.getItem(autosaveKey()); if(!raw) return; var a=JSON.parse(raw);
      if(!a || typeof a.html!=='string') return;
      var notesDiffer=Array.isArray(a.notes) && JSON.stringify(sanitizeNotes(a.notes))!==JSON.stringify(notes);
      if(a.html===content.innerHTML && !notesDiffer) return;
      var banner=$('doc-restore-banner'); if(!banner) return;
      var fileBy=body.dataset.docSavedBy||'', fileAt=body.dataset.docSavedAt||'';
      // 백업이 지금 연 파일과 같은 저장본에서 만들어졌는지 출처로 확인한다. 같은 이름의 다른 문서를 열었을 때 잘못 복구하지 않게 한다.
      var mismatch=(a.savedBy||'')!==fileBy || (a.savedAt||'')!==fileAt;
      var label='자동저장본 ('+(a.title?a.title+' · ':'')+fmtTs(a.ts)+')';
      var msg=banner.querySelector('.msg');
      if(msg) msg.textContent=mismatch
        ? '이 위치의 '+label+'은 지금 연 파일과 다른 저장본에서 만든 것입니다. 파일: '+(fileBy||'이름 없음')+' · '+(fileAt?fmtTs(fileAt)+' 저장':'저장 기록 없음')+'. 복구하면 현재 본문은 히스토리에 남습니다.'
        : label+'이 있습니다. 복구하시겠어요?';
      banner.classList.add('show');
      var rb=$('doc-rb-restore'); if(rb) rb.onclick=function(){
        if(comparing) setCompare(false);
        var cur=content.innerHTML;
        if(!(history[0] && history[0].html===cur)){ history.unshift({ts:fileAt||new Date().toISOString(), title:'복구 전: '+snapshotTitle(cur), html:cur, author:fileBy}); history=history.slice(0,30); }
        content.innerHTML=a.html; if(Array.isArray(a.notes)) notes=sanitizeNotes(a.notes);
        savedRange=null; lastBackedUpHtml=a.html; lastBackedUpNotes=JSON.stringify(notes); banner.classList.remove('show'); afterContentReplaced(); updateInspector();
        toast('자동저장본을 복구했습니다. 파일에 반영하려면 저장을 누르세요.');
      };
      var ig=$('doc-rb-ignore'); if(ig) ig.onclick=function(){ banner.classList.remove('show'); };
      var keep=$('doc-rb-keep-current'); if(keep) keep.onclick=function(){
        clearTimeout(autosaveTimer); autosaveTimer=null;
        if(writeBackup()){ banner.classList.remove('show'); toast('현재 버전으로 백업을 확정했습니다. 이전 복구 알림은 다시 표시되지 않습니다.'); }
      };
    }catch(e){}
  }

  /* ---------- 버튼 / 단축키 ---------- */
  bind('doc-editToggle','click', function(){ setEdit(!editing); });
  bind('doc-saveBtn','click', function(){ saveToFile(false); });
  bind('doc-saveAsBtn','click', function(){ saveToFile(true); });
  bind('doc-exportBtn','click',exportReadOnly);
  bind('doc-historyBtn','click', openHistory);
  bind('doc-hist-close','click', function(){ var m=$('doc-history-modal'); if(m) m.classList.remove('open'); });
  bind('doc-printBtn','click', function(){ if(editing) setEdit(false); window.print(); });
  bind('doc-changesBtn','click',function(){ setCompare(!comparing); });
  bind('doc-changesClose','click',function(){ setCompare(false); });
  bind('doc-changesPrev','click',function(){ stepChange(-1); });
  bind('doc-changesNext','click',function(){ stepChange(1); });
  bind('doc-changesRevert','click',function(){ revertChange(); });
  bind('doc-changesBase','change',function(){
    var v=this.value, c=baselineCandidates(), i;
    if(v==='pick'){ var input=$('doc-changesFile'); this.value=baseline?baselineValue(baseline):'pick'; if(input) input.click(); return; }
    for(i=0;i<c.length;i++){ if(baselineValue(c[i])===v){ useBaseline(c[i]); return; } }
  });
  bind('doc-changesFile','change',async function(){
    var file=this.files&&this.files[0]; this.value=''; if(!file) return;
    try{ await loadBaselineFile(file); toast('파일과 비교합니다: '+file.name); }catch(e){ toast(e.message||'파일을 읽지 못했습니다.'); }
  });
  content.addEventListener('click',function(e){ if(!comparing) return; var el=e.target.closest?e.target.closest('[data-doc-change]'):null; if(el && content.contains(el)) selectChange(+el.getAttribute('data-doc-change'),false); });
  var hm=$('doc-history-modal'); if(hm) hm.addEventListener('mousedown', function(e){ if(e.target===this) this.classList.remove('open'); });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape'){setMore(false);setInspector(false);setNotes(false);setCompare(false);var m=$('doc-history-modal');if(m)m.classList.remove('open');}
    if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&(e.key==='s'||e.key==='S')){ e.preventDefault(); saveToFile(false); }
    if((e.metaKey||e.ctrlKey)&&(e.key==='e'||e.key==='E')){ e.preventDefault(); setEdit(!editing); }
    // 직전 동작이 블록 삭제였을 때만 가로챈다. 그 뒤 다른 편집이 있었으면 브라우저 기본 되돌리기로 넘긴다.
    if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&(e.key==='z'||e.key==='Z')&&pendingDelete){
      var tn=e.target&&e.target.tagName;   // 메모 입력칸 등 폼 필드의 되돌리기는 브라우저에 맡긴다
      if(tn!=='INPUT'&&tn!=='TEXTAREA'){ e.preventDefault(); undoBlock(); }
    }
  });

  /* ---------- 창 크기 변경 시 상단 스페이서 갱신 (툴바 줄바꿈 대응) ---------- */
  window.addEventListener('resize',scheduleLayout);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',scheduleLayout);
  if(window.ResizeObserver){var layoutObserver=new ResizeObserver(scheduleLayout);['doc-controls','doc-editbar','doc-changes-bar'].forEach(function(id){var el=$(id);if(el)layoutObserver.observe(el);});}

  /* ---------- 초기화 ---------- */
  try{ document.execCommand('styleWithCSS',false,true); }catch(e){}
  updateEditorLayout();
  var authorInput=$('doc-notesAuthor'); if(authorInput) authorInput.value=currentAuthor();
  reconcileNotes(); renderNotes(); lastSavedHtml=content.innerHTML; lastBackedUpHtml=lastSavedHtml; lastBackedUpNotes=JSON.stringify(notes);
  checkAutosave();
  (function(){ var by=body.dataset.docSavedBy||''; if(by && by!==currentAuthor() && history.length) toast(by+'이(가) 저장한 문서입니다. 변경 사항으로 수정된 부분을 볼 수 있습니다.',6000); })();

  // 외부에서 쓸 수 있는 최소 API
  window.DocEditor={
    toggle:function(){ setEdit(!editing); },
    edit:function(on){ setEdit(!!on); },
    save:function(){ return saveToFile(false); },
    isEditing:function(){ return editing; },
    author:function(name){ if(typeof name==='string'){ storeAuthor(name.trim()); } return currentAuthor(); },
    getReadOnlyHTML:function(){ return serializeReadOnly(); },
    attachToHTML:attachToHTML,
    getHTML:function(){ return serialize(); },   // 편집 흔적 제거된 자체완결 HTML 문자열
    compare:function(on){ setCompare(on!==false); },
    isComparing:function(){ return comparing; },
    compareWith:function(kind,index){ if(!comparing) setCompare(true); if(!comparing) return; var c=baselineCandidates(), i; for(i=0;i<c.length;i++){ if(c[i].kind===kind && (kind!=='history'||c[i].index===index)){ useBaseline(c[i]); return; } } },
    revertChange:function(i){ return revertChange(i); },
    changes:function(){ return {counts:cmp?cmp.counts:{ins:0,del:0,mod:0,fmt:0}, total:changeTotal(), index:changeIndex, baseline:baseline?baseline.label:''}; },
    blocks:{
      pick:function(){ var el=pickBlock(); return el?blockName(el):null; },
      remove:function(){ return removeBlock(); },
      undo:function(){ return undoBlock(); }
    },
    notes:{
      list:function(){ return JSON.parse(JSON.stringify(notes)); },
      add:function(text,opts){ opts=opts||{}; var target=null; if(opts.range) target=targetFrom(opts.range); else if(opts.anchor) target=targetFrom(savedRange); var n=addNote(text,target); return n?n.id:null; },
      reply:replyNote, resolve:resolveNote, remove:removeNote
    }
  };
})();
