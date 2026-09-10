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

  var editing=false, fileHandle=null, savedRange=null, saving=false;
  var lastSavedHtml=content.innerHTML;
  var history=loadHistory();
  var autosaveTimer=null;
  var lastBackedUpHtml=content.innerHTML;
  var originalPaddingTop=body.style.paddingTop;
  var originalPaddingPixels=parseFloat(getComputedStyle(body).paddingTop)||0;
  var layoutFrame=null;
  // 다른 문서에 붙일 때 현재 본문·히스토리·파일 연결이 섞이지 않도록 초기 UI만 캡처한다.
  var attachBundle=null;
  try{if(window.DocEditorAttach)attachBundle=window.DocEditorAttach.bundleFrom(document);}catch(e){}

  function loadHistory(){ try{ var h=JSON.parse(histEl.textContent||'[]'); return Array.isArray(h)?h.filter(function(v){return v && typeof v.html==='string' && typeof v.title==='string' && typeof v.ts==='string';}).slice(0,30):[]; }catch(e){ return []; } }
  function escForScript(s){ return s.replace(/</g,'\\u003c'); }
  function escapeHtml(s){ return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function toast(t){ var el=document.getElementById('doc-toast'); if(!el) return; el.textContent=t; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(function(){el.classList.remove('show');},2600); }
  function $(id){ return document.getElementById(id); }

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
    try{ localStorage.setItem(autosaveKey(), JSON.stringify({ts:new Date().toISOString(),html:content.innerHTML})); lastBackedUpHtml=content.innerHTML; return true; }
    catch(e){ toast('브라우저 백업을 저장하지 못했습니다. 파일로 저장해 주세요.'); return false; }
  }
  function doAutosave(){ clearTimeout(autosaveTimer); autosaveTimer=null; if(content.innerHTML!==lastBackedUpHtml) return writeBackup(); return true; }
  // 디바운스 중 문서를 닫아도 마지막 입력을 보존한다.
  window.addEventListener('pagehide', function(){ if(autosaveTimer!==null) doAutosave(); });
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='hidden' && autosaveTimer!==null) doAutosave(); });

  /* ---------- 편집 모드 ---------- */
  function setEdit(on){
    if(on && !editing){ originalPaddingTop=body.style.paddingTop; originalPaddingPixels=parseFloat(getComputedStyle(body).paddingTop)||0; }
    editing=on;
    content.setAttribute('contenteditable', on?'true':'false');
    body.classList.toggle('doc-editing', on);
    var t=$('doc-editToggle');
    if(t){ t.classList.toggle('on', on); t.textContent=on?'✎ 편집 중':'✎ 편집'; }
    try{ document.execCommand('styleWithCSS',false,true); }catch(e){}
    // 편집 툴바가 상단 고정이라 본문 상단이 가려지지 않게 스페이서 부여
    setMore(false);
    if(on) updateInspector();
    else { setInspector(false); body.style.paddingTop=originalPaddingTop; doAutosave(); }
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
    var controls=$('doc-controls'), bar=$('doc-editbar');
    var controlHeight=controls?controls.offsetHeight:60;
    body.style.setProperty('--doc-ed-controls-height',controlHeight+'px');
    body.style.setProperty('--doc-ed-controls-width',(controls?controls.offsetWidth:380)+'px');
    var bottom=editing?((mobile?controlHeight:0)+(bar?bar.offsetHeight:0)):(mobile?controlHeight:0);
    body.style.setProperty('--doc-ed-tools-bottom',bottom+'px');
    body.style.setProperty('--doc-ed-visible-height',(window.visualViewport?window.visualViewport.height:window.innerHeight)+'px');
    if(editing) body.style.paddingTop=(originalPaddingPixels+bottom)+'px';
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
    setMore(false);setInspector(this.getAttribute('aria-expanded')!=='true');
  });
  bind('doc-inspectorClose','click',function(){setInspector(false);var t=$('doc-inspectorToggle');if(t)t.focus();});
  document.addEventListener('pointerdown',function(e){
    var controls=$('doc-controls');if(controls && !controls.contains(e.target))setMore(false);
    if(content.contains(e.target))setInspector(false);
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
    if(s && s.rangeCount){ var r=s.getRangeAt(0); if(content.contains(r.commonAncestorContainer)){ savedRange=r.cloneRange(); updateInspector(); } }
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
  content.addEventListener('input', function(){ if(editing) scheduleAutosave(); });
  function bind(id,ev,fn){ var el=$(id); if(el) el.addEventListener(ev,fn); }

  /* ---------- 직렬화 / 저장 ---------- */
  function snapshotTitle(html){ var d=document.createElement('div'); d.innerHTML=html; var h=d.querySelector('h1,h2,h3'); return (h&&h.textContent.trim())||(document.title||'').trim()||'(제목 없음)'; }
  function pushHistoryIfChanged(){ var cur=content.innerHTML; if(cur!==lastSavedHtml){ history.unshift({ts:new Date().toISOString(), title:snapshotTitle(lastSavedHtml), html:lastSavedHtml}); history=history.slice(0,30); } }
  function serialize(){
    histEl.textContent=escForScript(JSON.stringify(history));
    var clone=document.documentElement.cloneNode(true);
    clone.querySelectorAll('[data-doc-editor-download]').forEach(function(el){el.remove();});
    var b=clone.querySelector('body'); if(b){ b.classList.remove('doc-editing','doc-inspector-open'); b.style.paddingTop=originalPaddingTop; ['--doc-ed-controls-height','--doc-ed-controls-width','--doc-ed-tools-bottom','--doc-ed-visible-height'].forEach(function(name){b.style.removeProperty(name);}); }
    var c=clone.querySelector('#doc-content'); if(c) c.setAttribute('contenteditable','false');
    ['#doc-restore-banner','#doc-toast'].forEach(function(s){ var el=clone.querySelector(s); if(el) el.classList.remove('show'); });
    var m=clone.querySelector('#doc-history-modal'); if(m) m.classList.remove('open');
    var hl=clone.querySelector('#doc-hist-list'); if(hl) hl.innerHTML='';
    var hp=clone.querySelector('#doc-hist-preview'); if(hp) hp.innerHTML='';
    var controls=clone.querySelector('#doc-controls');if(controls)controls.classList.remove('doc-more-open');
    ['#doc-moreToggle','#doc-inspectorToggle'].forEach(function(sel){var t=clone.querySelector(sel);if(t)t.setAttribute('aria-expanded','false');});
    var et=clone.querySelector('#doc-editToggle'); if(et){ et.classList.remove('on'); et.textContent='✎ 편집'; }
    var attach=clone.querySelector('#doc-attachBtn');if(attach)attach.disabled=false;
    return '<!DOCTYPE html>\n'+clone.outerHTML;
  }
  function suggestName(){ var t=snapshotTitle(content.innerHTML).replace(/[\\/:*?"<>|]/g,'').trim(); return (t||'문서')+'.html'; }
  function downloadHtml(html, filename){ var blob=new Blob([html],{type:'text/html;charset=utf-8'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename||suggestName(); a.setAttribute('data-doc-editor-download',''); document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1200); }

  /* ---------- 배포용 HTML (원본 상태를 바꾸지 않는 별도 사본) ---------- */
  function serializeReadOnly(){
    var clone=document.documentElement.cloneNode(true);
    var editorStyle=clone.querySelector('#doc-editor-style');
    var editorScript=clone.querySelector('#doc-editor-script');
    if(!editorStyle || !editorScript) throw new Error('편집 엔진의 style/script ID가 없습니다. 크롬과 엔진을 함께 업데이트하세요.');
    // 편집기로 삽입한 표의 보기 스타일만 남긴다. 툴바/패널 스타일은 내보내지 않는다.
    if(content.querySelector('.doc-ed-tablewrap,table.doc-ed-table')){
      var rules=Array.prototype.filter.call($('doc-editor-style').sheet.cssRules,function(rule){
        return rule.selectorText && rule.selectorText.split(',').every(function(selector){
          selector=selector.trim(); return selector==='.doc-ed-tablewrap' || selector.indexOf('#doc-content table.doc-ed-table')===0;
        });
      });
      if(rules.length){var tableStyle=document.createElement('style');tableStyle.textContent=rules.map(function(rule){return rule.cssText;}).join('\n');editorStyle.before(tableStyle);}
    }
    ['#doc-controls','#doc-editbar','#doc-inspector','#doc-editflag','#doc-restore-banner',
     '#doc-history-modal','#doc-toast','#doc-history','#doc-editor-style','#doc-editor-script',
     '[data-doc-editor-download]'].forEach(function(selector){clone.querySelectorAll(selector).forEach(function(el){el.remove();});});
    var b=clone.querySelector('body');
    if(b){
      b.classList.remove('doc-editing','doc-inspector-open');b.removeAttribute('data-doc-id');b.style.paddingTop=originalPaddingTop;
      ['--doc-ed-controls-height','--doc-ed-controls-width','--doc-ed-tools-bottom','--doc-ed-visible-height'].forEach(function(name){b.style.removeProperty(name);});
    }
    var c=clone.querySelector('#doc-content');if(c)c.removeAttribute('contenteditable');
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
    var oldId=body.dataset.docId, oldHistory=history.slice(), changedId=false;
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
      // 다른 이름으로 저장할 때만 새 문서 ID를 만든다. 기존 문서의 백업은 보존한다.
      if(forceNew){ body.dataset.docId=genId(); changedId=true; }
      var savedHtml=content.innerHTML;
      pushHistoryIfChanged();
      var output=serialize(), wroteFile=false;
      if(handle){
        try{ var w=await handle.createWritable(); await w.write(output); await w.close(); fileHandle=handle; wroteFile=true; }
        catch(e){
          if(e&&e.name==='NotFoundError'){
            if(!forceNew) fileHandle=null;
            if(!forceNew && rememberAtThisLocation) await fileLinkStore('delete');
            updateSaveHint();
            history=oldHistory;
            if(changedId){ if(oldId===undefined) delete body.dataset.docId; else body.dataset.docId=oldId; }
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
      writeBackup();
      var banner=$('doc-restore-banner'); if(banner) banner.classList.remove('show');
      toast(wroteFile?'저장되었습니다 · '+handle.name+(remembered?'':' · 파일 연결을 기억하지 못해 다음에 다시 선택해야 합니다.'):(pickerFailed?'파일 저장 실패. 다운로드를 시작했습니다.':'다운로드를 시작했습니다. 내려받은 파일을 확인해 주세요.'));
    }catch(e){
      history=oldHistory;
      if(changedId){ if(oldId===undefined) delete body.dataset.docId; else body.dataset.docId=oldId; }
      toast('저장하지 못했습니다. 다시 시도해 주세요.');
    }finally{ saving=false; }
  }

  /* ---------- 히스토리 ---------- */
  function fmtTs(iso){ try{ return new Date(iso).toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }catch(e){ return iso; } }
  function openHistory(){
    var list=$('doc-hist-list'); if(!list) return; list.innerHTML='';
    if(!history.length){ list.innerHTML='<p class="doc-ed-muted" style="font-size:13px">저장 히스토리가 없습니다.<br>저장하면 직전 내용이 쌓입니다.</p>'; }
    history.forEach(function(h,i){ var b=document.createElement('button'); b.className='doc-ed-hist-item'; b.innerHTML='<strong>'+escapeHtml(h.title)+'</strong><span>'+fmtTs(h.ts)+'</span>'; b.onclick=function(){ previewHistory(i); }; list.appendChild(b); });
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
    var target=history[i].html;
    history.unshift({ts:new Date().toISOString(), title:'복원 전: '+snapshotTitle(content.innerHTML), html:content.innerHTML}); history=history.slice(0,30);
    content.innerHTML=target; savedRange=null; var m=$('doc-history-modal'); if(m) m.classList.remove('open'); scheduleAutosave();
    toast('해당 버전으로 복원했습니다. 파일에 반영하려면 [저장]을 누르세요.');
  }

  /* ---------- 자동저장 복구 ---------- */
  function checkAutosave(){
    try{ var raw=localStorage.getItem(autosaveKey()); if(!raw) return; var a=JSON.parse(raw);
      if(a && typeof a.html==='string' && a.html!==content.innerHTML){
        var banner=$('doc-restore-banner'); if(!banner) return;
        var msg=banner.querySelector('.msg'); if(msg) msg.textContent='자동저장본 ('+fmtTs(a.ts)+')이 있습니다. 복구하시겠어요?';
        banner.classList.add('show');
        var rb=$('doc-rb-restore'); if(rb) rb.onclick=function(){ content.innerHTML=a.html; savedRange=null; lastBackedUpHtml=a.html; banner.classList.remove('show'); updateInspector(); toast('자동저장본을 복구했습니다. 파일에 반영하려면 저장을 누르세요.'); };
        var ig=$('doc-rb-ignore'); if(ig) ig.onclick=function(){ banner.classList.remove('show'); };
        var keep=$('doc-rb-keep-current'); if(keep) keep.onclick=function(){
          clearTimeout(autosaveTimer); autosaveTimer=null;
          if(writeBackup()){
            banner.classList.remove('show');
            toast('현재 버전으로 백업을 확정했습니다. 이전 복구 알림은 다시 표시되지 않습니다.');
          }
        };
      }
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
  var hm=$('doc-history-modal'); if(hm) hm.addEventListener('mousedown', function(e){ if(e.target===this) this.classList.remove('open'); });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape'){setMore(false);setInspector(false);var m=$('doc-history-modal');if(m)m.classList.remove('open');}
    if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&(e.key==='s'||e.key==='S')){ e.preventDefault(); saveToFile(false); }
    if((e.metaKey||e.ctrlKey)&&(e.key==='e'||e.key==='E')){ e.preventDefault(); setEdit(!editing); }
  });

  /* ---------- 창 크기 변경 시 상단 스페이서 갱신 (툴바 줄바꿈 대응) ---------- */
  window.addEventListener('resize',scheduleLayout);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',scheduleLayout);
  if(window.ResizeObserver){var layoutObserver=new ResizeObserver(scheduleLayout);['doc-controls','doc-editbar'].forEach(function(id){var el=$(id);if(el)layoutObserver.observe(el);});}

  /* ---------- 초기화 ---------- */
  try{ document.execCommand('styleWithCSS',false,true); }catch(e){}
  updateEditorLayout();
  checkAutosave();

  // 외부에서 쓸 수 있는 최소 API
  window.DocEditor={
    toggle:function(){ setEdit(!editing); },
    edit:function(on){ setEdit(!!on); },
    save:function(){ return saveToFile(false); },
    isEditing:function(){ return editing; },
    getReadOnlyHTML:function(){ return serializeReadOnly(); },
    attachToHTML:attachToHTML,
    getHTML:function(){ return serialize(); }   // 편집 흔적 제거된 자체완결 HTML 문자열
  };
})();
