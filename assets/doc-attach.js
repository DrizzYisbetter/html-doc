/* 기존 HTML을 실행하지 않고 편집 가능한 사본으로 변환한다. */
(function(){
  'use strict';
  var chromeIds=['doc-controls','doc-editbar','doc-inspector','doc-editflag','doc-restore-banner','doc-history-modal','doc-toast'];

  function bundleFrom(doc){
    var style=doc.getElementById('doc-editor-style'), script=doc.getElementById('doc-editor-script');
    if(!style || !script) throw new Error('편집기 원본을 찾지 못했습니다. 최신 예시를 사용해 주세요.');
    var chrome=chromeIds.map(function(id){
      var source=doc.getElementById(id);
      if(!source) throw new Error('편집기 UI가 누락되었습니다: '+id);
      var el=source.cloneNode(true);
      el.classList.remove('show','open','doc-more-open');
      el.querySelectorAll('[aria-expanded]').forEach(function(b){b.setAttribute('aria-expanded','false');});
      el.querySelectorAll('.on').forEach(function(b){b.classList.remove('on');});
      el.querySelectorAll('#doc-hist-list,#doc-hist-preview').forEach(function(b){b.textContent='';});
      var toggle=el.querySelector('#doc-editToggle');if(toggle)toggle.textContent='✎ 편집';
      var save=el.querySelector('#doc-saveBtn');if(save)save.title='최초 저장 시 대상 파일 선택 (Cmd/Ctrl+S)';
      var attach=el.querySelector('#doc-attachBtn');if(attach)attach.disabled=false;
      var msg=el.querySelector('.msg');if(id==='doc-restore-banner' && msg)msg.textContent='자동저장본이 있습니다. 복구하시겠어요?';
      if(id==='doc-toast')el.textContent='';
      return el.outerHTML;
    }).join('\n');
    return {css:style.textContent,js:script.textContent,chrome:chrome};
  }

  function convert(source,bundle){
    if(typeof source!=='string' || !source.trim())throw new Error('비어 있는 HTML 파일입니다.');
    if(!bundle || !bundle.css || !bundle.js || !bundle.chrome)throw new Error('편집기 구성 파일이 누락되었습니다.');
    // 분리된 문서로만 파싱한다. 선택한 HTML을 현재 페이지나 미리보기 iframe에 넣지 않는다.
    var doc=new DOMParser().parseFromString(source,'text/html');
    if(doc.querySelector('frameset'))throw new Error('frameset 문서는 지원하지 않습니다. 본문 HTML 파일을 선택해 주세요.');
    var installed=doc.querySelector('#doc-editor-script,#doc-editor-style,#doc-history,#doc-controls');
    if(installed || Array.prototype.some.call(doc.scripts,function(s){return /window\.DocEditor\s*=/.test(s.textContent);})){
      throw new Error('이미 편집기가 있거나 편집기와 같은 ID를 쓰는 파일입니다. 중복으로 추가하지 않았습니다.');
    }
    var policy=Array.prototype.some.call(doc.querySelectorAll('meta[http-equiv]'),function(m){return m.httpEquiv.toLowerCase()==='content-security-policy';});
    if(policy)throw new Error('이 파일에는 CSP 보안 정책이 있습니다. 정책을 유지한 채 편집기를 실행할 수 있는지 별도 검토가 필요합니다.');
    var roots=doc.querySelectorAll('#doc-content');
    if(roots.length>1 || (roots.length && (!doc.body.contains(roots[0]) || roots[0]===doc.body || /^(SCRIPT|STYLE|TEMPLATE|INPUT|TEXTAREA|IMG|SVG|TABLE)$/.test(roots[0].tagName)))){
      throw new Error('doc-content ID가 중복되었거나 본문 컨테이너가 아닙니다. ID 충돌을 먼저 정리해 주세요.');
    }
    var chrome=doc.createElement('template');chrome.innerHTML=bundle.chrome;
    chrome.content.querySelectorAll('[id]').forEach(function(el){
      if(doc.getElementById(el.id))throw new Error('편집기 ID와 충돌합니다: '+el.id+'. 기존 문서는 변경하지 않았습니다.');
    });
    var root=roots[0];
    if(!root){
      root=doc.createElement('main');root.id='doc-content';
      // 새 박스를 만들지 않아 body의 flex/grid 자식 배치를 유지한다.
      root.style.display='contents';
      while(doc.body.firstChild)root.appendChild(doc.body.firstChild);
      doc.body.appendChild(root);
    }
    root.setAttribute('contenteditable','false');
    doc.body.removeAttribute('data-doc-id');
    // 입력 인코딩과 관계없이 다운로드는 UTF-8이다. 원래의 charset 선언만 갱신한다.
    doc.querySelectorAll('meta[charset]').forEach(function(m){m.setAttribute('charset','utf-8');});
    doc.querySelectorAll('meta[http-equiv]').forEach(function(m){if(m.httpEquiv.toLowerCase()==='content-type')m.setAttribute('content','text/html; charset=utf-8');});
    if(!doc.querySelector('meta[charset]')){var charset=doc.createElement('meta');charset.setAttribute('charset','utf-8');doc.head.prepend(charset);}
    if(!doc.querySelector('meta[name="viewport" i]')){var viewport=doc.createElement('meta');viewport.name='viewport';viewport.content='width=device-width, initial-scale=1';doc.head.appendChild(viewport);}
    var style=doc.createElement('style');style.id='doc-editor-style';style.textContent=bundle.css;doc.head.appendChild(style);
    doc.body.appendChild(chrome.content);
    var history=doc.createElement('script');history.type='application/json';history.id='doc-history';history.textContent='[]';doc.body.appendChild(history);
    var script=doc.createElement('script');script.id='doc-editor-script';script.textContent=bundle.js;doc.body.appendChild(script);
    var doctype=doc.doctype?new XMLSerializer().serializeToString(doc.doctype):'<!DOCTYPE html>';
    return doctype+'\n'+doc.documentElement.outerHTML;
  }

  async function readFile(file){
    if(!file || !/\.html?$/i.test(file.name))throw new Error('HTML 파일(.html 또는 .htm)을 선택해 주세요.');
    var bytes=new Uint8Array(await file.arrayBuffer()), encoding='utf-8';
    if(bytes[0]===0xff && bytes[1]===0xfe)encoding='utf-16le';
    else if(bytes[0]===0xfe && bytes[1]===0xff)encoding='utf-16be';
    else if(!(bytes[0]===0xef && bytes[1]===0xbb && bytes[2]===0xbf)){
      var prefix=new TextDecoder('windows-1252').decode(bytes.slice(0,4096));
      // 주석/본문의 charset 문자열은 무시하고 실제 meta 시작 태그만 검사한다.
      var sniffed=new DOMParser().parseFromString(prefix,'text/html');
      var tags=sniffed.querySelectorAll('meta[charset],meta[http-equiv]');
      for(var i=0;i<tags.length;i++){
        var charset=tags[i].getAttribute('charset');
        if(!charset && tags[i].httpEquiv.toLowerCase()==='content-type'){
          var match=(tags[i].getAttribute('content')||'').match(/\bcharset\s*=\s*["']?\s*([\w-]+)/i);
          if(match)charset=match[1];
        }
        if(charset){encoding=charset;break;}
      }
    }
    try{return new TextDecoder(encoding,{fatal:true}).decode(bytes);}
    catch(e){throw new Error('파일 인코딩을 읽지 못했습니다. UTF-8 HTML로 저장한 뒤 다시 선택해 주세요.');}
  }
  function filename(name){return (name||'문서.html').replace(/\.html?$/i,'').replace(/[\\/:*?"<>|]/g,'')+'-편집가능.html';}
  window.DocEditorAttach={convert:convert,bundleFrom:bundleFrom,readFile:readFile,filename:filename};
})();
