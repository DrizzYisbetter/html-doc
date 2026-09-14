/* ============================================================
   doc-diff: 본문 HTML 두 개를 문단 단위로 비교하고 표식을 그린다.
   (html-doc 스킬 · 문서에 그대로 인라인. 수정·요약 금지)

   순수 함수(myers, tokenize, dice, wordDiff, normText)는 Node에서도 동작한다.
   DOM 함수(units, compare, render, revert)는 브라우저에서만 동작한다.
   ============================================================ */
(function(global){
  'use strict';

  /* ---------- 순수 함수 ---------- */
  // Myers O(ND) diff. ops: {op:'eq',a,b} | {op:'del',a} | {op:'ins',b}. maxD를 넘으면 null.
  function myers(a,b,eq,maxD){
    var n=a.length,m=b.length,max=n+m;
    if(maxD==null||maxD>max)maxD=max;
    var off=max+1,v=new Int32Array(2*max+3),trace=[],d,k,x,y,snap;
    v[off+1]=0;
    for(d=0;d<=maxD;d++){
      snap=new Int32Array(2*d+3);
      for(k=-d-1;k<=d+1;k++)snap[k+d+1]=v[off+k];
      trace.push(snap);
      for(k=-d;k<=d;k+=2){
        if(k===-d||(k!==d&&v[off+k-1]<v[off+k+1]))x=v[off+k+1];else x=v[off+k-1]+1;
        y=x-k;
        while(x<n&&y<m&&eq(a[x],b[y])){x++;y++;}
        v[off+k]=x;
        if(x>=n&&y>=m)return backtrack(trace,n,m);
      }
    }
    return null;
  }
  function backtrack(trace,n,m){
    var ops=[],x=n,y=m,d,k,snap,prevK,prevX,prevY;
    for(d=trace.length-1;d>=0;d--){
      snap=trace[d];k=x-y;
      if(k===-d||(k!==d&&snap[k-1+d+1]<snap[k+1+d+1]))prevK=k+1;else prevK=k-1;
      prevX=snap[prevK+d+1];prevY=prevX-prevK;
      while(x>prevX&&y>prevY){ops.push({op:'eq',a:x-1,b:y-1});x--;y--;}
      if(d>0){if(x===prevX)ops.push({op:'ins',b:prevY});else ops.push({op:'del',a:prevX});}
      x=prevX;y=prevY;
    }
    return ops.reverse();
  }
  function tokenize(html){var re=/<[^>]*>|\s+|[^\s<]+/g,out=[],m;while((m=re.exec(html)))out.push(m[0]);return out;}
  function tokKind(t){return t.charCodeAt(0)===60?'tag':(/^\s+$/.test(t)?'ws':'word');}
  function tokKey(t){return tokKind(t)==='ws'?' ':t;}
  function normText(s){return (s||'').replace(/ /g,' ').replace(/\s+/g,' ').trim();}
  function dice(t1,t2){
    var a=t1?t1.split(' '):[],b=t2?t2.split(' '):[],bag={},inter=0,i;
    if(!a.length&&!b.length)return 1;
    for(i=0;i<a.length;i++)bag[a[i]]=(bag[a[i]]||0)+1;
    for(i=0;i<b.length;i++)if(bag[b[i]]){inter++;bag[b[i]]--;}
    return 2*inter/(a.length+b.length);
  }
  function isVoidVisual(tag){return /^<(img|hr)\b/i.test(tag);}
  // 두 인라인 HTML을 단어 단위로 비교해 ins/del 래퍼가 든 HTML을 만든다. 태그 구조는 항상 현재(C) 쪽을 따른다.
  function wordDiff(bHtml,cHtml){
    var A=tokenize(bHtml),B=tokenize(cHtml);
    var ops=myers(A.map(tokKey),B.map(tokKey),function(p,q){return p===q;},4000);
    if(!ops)return null;
    var out=[],open=null,pending=[],runs=[],i,j,run,tok,kind,src,field,onlyWs,next,keep;
    function close(){if(open){out.push('</'+open+'>');open=null;}}
    function flushPending(){out.push(pending.join(''));pending=[];}
    function openWrap(k){if(open!==k){close();out.push(k==='ins'?'<ins class="doc-ed-ins">':'<del class="doc-ed-del">');open=k;}out.push(pending.join(''));pending=[];}
    for(i=0;i<ops.length;i++){if(runs.length&&runs[runs.length-1].op===ops[i].op)runs[runs.length-1].items.push(ops[i]);else runs.push({op:ops[i].op,items:[ops[i]]});}
    for(i=0;i<runs.length;i++){
      run=runs[i];
      if(run.op==='eq'){
        onlyWs=run.items.every(function(o){return tokKind(B[o.b])==='ws';});
        next=runs[i+1];keep=open&&onlyWs&&next&&next.op===open;
        for(j=0;j<run.items.length;j++){
          tok=B[run.items[j].b];
          if(keep){out.push(tok);continue;}
          close();flushPending();out.push(tok);
        }
        continue;
      }
      src=run.op==='ins'?B:A;field=run.op==='ins'?'b':'a';
      for(j=0;j<run.items.length;j++){
        tok=src[run.items[j][field]];kind=tokKind(tok);
        if(kind==='tag'){
          if(run.op==='del'){if(isVoidVisual(tok)){openWrap('del');out.push(tok);}continue;}
          close();flushPending();out.push(tok);
        }else if(kind==='ws'){
          if(open===run.op)out.push(tok);else pending.push(tok);
        }else{openWrap(run.op);out.push(tok);}
      }
      if(!open)flushPending();
    }
    close();flushPending();
    return out.join('');
  }

  /* ---------- DOM 함수 ---------- */
  var BLOCK={address:1,article:1,aside:1,blockquote:1,caption:1,dd:1,details:1,div:1,dl:1,dt:1,fieldset:1,figcaption:1,figure:1,footer:1,form:1,h1:1,h2:1,h3:1,h4:1,h5:1,h6:1,header:1,hr:1,li:1,main:1,nav:1,ol:1,p:1,pre:1,section:1,summary:1,table:1,tbody:1,td:1,tfoot:1,th:1,thead:1,tr:1,ul:1};
  var BLOCK_SELECTOR=Object.keys(BLOCK).join(',');
  var NOTE_SELECTOR='mark.doc-ed-note';
  function parse(html){var d=document.createElement('div');d.innerHTML=html;return d;}
  function isBlock(n){return n.nodeType===1&&BLOCK[n.tagName.toLowerCase()]===1;}
  function nodesBox(nodes){var box=document.createElement('div');for(var i=0;i<nodes.length;i++)box.appendChild(nodes[i].cloneNode(true));return box;}
  function stripNotes(box){var marks=box.querySelectorAll(NOTE_SELECTOR),i,m,p;for(i=0;i<marks.length;i++){m=marks[i];p=m.parentNode;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m);}return box;}
  function tagSig(html){return tokenize(html).filter(function(t){return tokKind(t)==='tag';}).join('');}
  // 단위: 안에 블록이 없는 블록 요소(block) 또는 블록 사이의 인라인 조각(run). path는 부모 경로, start/end는 부모 childNodes 인덱스.
  function makeUnit(type,tag,nodes,path,start,end){
    var box=stripNotes(nodesBox(nodes)),text=normText(box.textContent),nhtml=normText(box.innerHTML);
    return {type:type,tag:tag,nodes:nodes,path:path,start:start,end:end,text:text,nhtml:nhtml,tsig:tag+'|'+tagSig(nhtml),sig:text?tag+'|'+text:tag+'||'+nhtml};
  }
  function units(root){
    var list=[];
    function flushRun(parent,path,start,end){
      var nodes=[],has=false,i,n;
      for(i=start;i<=end;i++){n=parent.childNodes[i];nodes.push(n);if(n.nodeType===1||(n.nodeType===3&&normText(n.nodeValue)))has=true;}
      if(has)list.push(makeUnit('run','run',nodes,path,start,end));
    }
    function walk(el,path){
      var kids=el.childNodes,runStart=-1,i,n;
      for(i=0;i<kids.length;i++){
        n=kids[i];
        if(isBlock(n)){
          if(runStart>=0){flushRun(el,path,runStart,i-1);runStart=-1;}
          if(n.querySelector(BLOCK_SELECTOR))walk(n,path.concat(i));
          else list.push(makeUnit('block',n.tagName.toLowerCase(),[n],path,i,i));
        }else if(runStart<0)runStart=i;
      }
      if(runStart>=0)flushRun(el,path,runStart,kids.length-1);
    }
    walk(root,[]);
    return list;
  }
  function similarity(u1,u2){if(!u1.text&&!u2.text)return u1.tag===u2.tag?1:0;return dice(u1.text,u2.text);}
  function classify(b,c){var t=b.text===c.text?'fmt':'mod';return {type:t,fmt:t==='fmt'||b.tsig!==c.tsig};}
  // replace 영역: del을 순서대로 보며 유사도 0.5 이상인 첫 ins와 짝짓는다. 1:1이고 태그가 같으면 유사도와 무관하게 짝짓는다.
  function pairRegion(dels,inss,ops){
    var assign=[],j=0,ptr=0,d,k,found,cls;
    for(d=0;d<dels.length;d++){
      found=-1;
      if(dels.length===1&&inss.length===1&&dels[0].tag===inss[0].tag)found=0;
      else for(k=j;k<inss.length;k++){if(similarity(dels[d],inss[k])>=0.5){found=k;break;}}
      assign.push(found);if(found>=0)j=found+1;
    }
    for(d=0;d<dels.length;d++){
      k=assign[d];
      if(k<0){ops.push({type:'del',b:dels[d]});continue;}
      while(ptr<k)ops.push({type:'ins',c:inss[ptr++]});
      cls=classify(dels[d],inss[k]);ops.push({type:cls.type,fmt:cls.fmt,b:dels[d],c:inss[k]});ptr=k+1;
    }
    while(ptr<inss.length)ops.push({type:'ins',c:inss[ptr++]});
  }
  function compare(baseHtml,curHtml){
    var bRoot=parse(baseHtml),cRoot=parse(curHtml),bu=units(bRoot),cu=units(cRoot);
    var ids=Object.create(null),next=0,ops=[],exceeded=false,i,dels,inss,raw;
    function id(s){if(!(s in ids))ids[s]=next++;return ids[s];}
    raw=myers(bu.map(function(u){return id(u.sig);}),cu.map(function(u){return id(u.sig);}),function(p,q){return p===q;},2000);
    if(!raw){exceeded=true;raw=bu.map(function(u,idx){return {op:'del',a:idx};}).concat(cu.map(function(u,idx){return {op:'ins',b:idx};}));}
    i=0;
    while(i<raw.length){
      if(raw[i].op==='eq'){
        if(bu[raw[i].a].nhtml===cu[raw[i].b].nhtml)ops.push({type:'eq',b:bu[raw[i].a],c:cu[raw[i].b]});
        else ops.push({type:'fmt',fmt:true,b:bu[raw[i].a],c:cu[raw[i].b]});
        i++;continue;
      }
      dels=[];inss=[];
      while(i<raw.length&&raw[i].op!=='eq'){if(raw[i].op==='del')dels.push(bu[raw[i].a]);else inss.push(cu[raw[i].b]);i++;}
      if(exceeded){dels.forEach(function(u){ops.push({type:'del',b:u});});inss.forEach(function(u){ops.push({type:'ins',c:u});});}
      else pairRegion(dels,inss,ops);
    }
    var counts={ins:0,del:0,mod:0,fmt:0};
    ops.forEach(function(o){if(o.type!=='eq')counts[o.type]++;});
    return {bRoot:bRoot,cRoot:cRoot,ops:ops,counts:counts,exceeded:exceeded,changes:[]};
  }
  function firstNode(u){return u.nodes[0];}
  function lastNode(u){return u.nodes[u.nodes.length-1];}
  function compatible(tag,parentTag){
    if(tag==='td'||tag==='th')return parentTag==='tr';
    if(tag==='li')return parentTag==='ul'||parentTag==='ol'||parentTag==='menu';
    if(tag==='dt'||tag==='dd')return parentTag==='dl';
    if(tag==='tr')return parentTag==='tbody'||parentTag==='thead'||parentTag==='tfoot'||parentTag==='table';
    if(tag==='caption')return parentTag==='table';
    return true;
  }
  function stripIds(el){if(el.nodeType!==1)return;el.removeAttribute('id');var all=el.querySelectorAll('[id]');for(var i=0;i<all.length;i++)all[i].removeAttribute('id');}
  function wrapNodes(nodes,cls){var span=document.createElement('span');span.className='doc-ed-diff-run '+cls;nodes[0].parentNode.insertBefore(span,nodes[0]);for(var i=0;i<nodes.length;i++)span.appendChild(nodes[i]);return span;}
  function markUnit(u,cls){if(u.type==='block'){u.nodes[0].classList.add(cls);return u.nodes[0];}return wrapNodes(u.nodes,cls);}
  function innerOf(u){return u.type==='block'?u.nodes[0].innerHTML:nodesBox(u.nodes).innerHTML;}
  function cloneDeleted(b,parentTag){
    var el,i;
    if(b.type==='block'&&compatible(b.tag,parentTag)){el=b.nodes[0].cloneNode(true);stripIds(el);el.classList.add('doc-ed-diff-del');return el;}
    el=document.createElement(b.type==='block'?'div':'span');
    el.className='doc-ed-diff-del '+(b.type==='block'?'doc-ed-diff-del-wrap':'doc-ed-diff-run');
    if(b.type==='block'){el.setAttribute('data-doc-tag',b.tag);el.innerHTML=b.nodes[0].innerHTML;}
    else for(i=0;i<b.nodes.length;i++)el.appendChild(b.nodes[i].cloneNode(true));
    stripIds(el);return el;
  }
  function samePath(u1,u2){var i;if(u1.path.length!==u2.path.length)return false;for(i=0;i<u1.path.length;i++)if(u1.path[i]!==u2.path[i])return false;return true;}
  function prevAligned(ops,from){for(var k=from-1;k>=0;k--)if(ops[k].b&&ops[k].c)return ops[k];return null;}
  function nextAligned(ops,from){for(var k=from+1;k<ops.length;k++)if(ops[k].b&&ops[k].c)return ops[k];return null;}
  // cRoot에 표식을 넣는다. 삭제 단위는 다음 C 단위 앞, 없으면 직전에 그린 노드 뒤, 없으면 root 끝에 복제해 넣는다.
  function render(cmp){
    var ops=cmp.ops,changes=[],cursor=null,i,o,el,next,parent,html,delEl,nextA,prevA,ref;
    function nextC(from){for(var k=from+1;k<ops.length;k++)if(ops[k].c)return ops[k].c;return null;}
    function tagOf(p){return p&&p.nodeType===1&&p!==cmp.cRoot?p.tagName.toLowerCase():'';}
    for(i=0;i<ops.length;i++){
      o=ops[i];
      if(o.type==='eq'){cursor=lastNode(o.c);continue;}
      if(o.type==='del'){
        // 삭제 단위의 원래 컨테이너를 B 트리의 부모 경로로 찾는다. 다음 정렬 단위(eq/mod/fmt)와 부모가 같으면 그 앞, 직전 정렬 단위와 같으면 그 뒤(그 사이에 같은 부모로 그린 노드가 있으면 그 뒤). 둘 다 아니면 다음 C 단위 앞, 없으면 마지막으로 그린 노드 뒤, 없으면 root 끝.
        nextA=nextAligned(ops,i);prevA=prevAligned(ops,i);
        if(nextA&&samePath(o.b,nextA.b)){ref=firstNode(nextA.c);el=cloneDeleted(o.b,tagOf(ref.parentNode));ref.parentNode.insertBefore(el,ref);}
        else if(prevA&&samePath(o.b,prevA.b)){ref=prevA.el||lastNode(prevA.c);if(cursor&&cursor.parentNode===ref.parentNode)ref=cursor;el=cloneDeleted(o.b,tagOf(ref.parentNode));ref.parentNode.insertBefore(el,ref.nextSibling);}
        else{next=nextC(i);parent=next?firstNode(next).parentNode:(cursor?cursor.parentNode:cmp.cRoot);el=cloneDeleted(o.b,tagOf(parent));if(next)parent.insertBefore(el,firstNode(next));else if(cursor)cursor.parentNode.insertBefore(el,cursor.nextSibling);else cmp.cRoot.appendChild(el);}
      }else if(o.type==='ins'){el=markUnit(o.c,'doc-ed-diff-ins');}
      else if(o.type==='mod'){
        html=wordDiff(innerOf(o.b),innerOf(o.c));
        if(html===null){
          parent=firstNode(o.c).parentNode;
          delEl=cloneDeleted(o.b,tagOf(parent));
          parent.insertBefore(delEl,firstNode(o.c));delEl.setAttribute('data-doc-change',String(changes.length));
          el=markUnit(o.c,'doc-ed-diff-ins');
        }else if(o.c.type==='block'){el=o.c.nodes[0];el.innerHTML=html;el.classList.add('doc-ed-diff-mod');}
        else{
          el=document.createElement('span');el.className='doc-ed-diff-run doc-ed-diff-mod';el.innerHTML=html;
          firstNode(o.c).parentNode.insertBefore(el,firstNode(o.c));
          o.c.nodes.forEach(function(n){n.parentNode.removeChild(n);});
        }
        if(o.fmt)el.classList.add('doc-ed-diff-fmt');
      }else{el=markUnit(o.c,'doc-ed-diff-fmt');}
      el.setAttribute('data-doc-change',String(changes.length));
      o.el=el;changes.push(o);cursor=el;
    }
    cmp.changes=changes;return changes;
  }
  function nodeAt(root,path){var n=root;for(var i=0;i<path.length;i++){n=n.childNodes[path[i]];if(!n)return null;}return n;}
  function unitRange(root,u){var parent=nodeAt(root,u.path),nodes=[],i,n;if(!parent)return null;for(i=u.start;i<=u.end;i++){n=parent.childNodes[i];if(!n)return null;nodes.push(n);}return {parent:parent,nodes:nodes};}
  function cloneNodes(u){return u.nodes.map(function(n){return n.cloneNode(true);});}
  // 원본 모델(같은 문자열을 파싱한 div)에 변경 하나를 기준 쪽으로 되돌린다. 삭제 단위의 위치 규칙은 render와 같다.
  function revert(cmp,index,model){
    var o=cmp.changes[index],ops=cmp.ops,r,ra,k,ref,clones,at,nextA,prevA,prevC=null;
    function insertAll(parent,before){for(var j=0;j<clones.length;j++)parent.insertBefore(clones[j],before);}
    if(!o)return false;
    if(o.type==='ins'){r=unitRange(model,o.c);if(!r)return false;r.nodes.forEach(function(n){r.parent.removeChild(n);});return true;}
    if(o.type==='mod'||o.type==='fmt'){
      r=unitRange(model,o.c);if(!r)return false;clones=cloneNodes(o.b);
      insertAll(r.parent,r.nodes[0]);r.nodes.forEach(function(n){r.parent.removeChild(n);});return true;
    }
    clones=cloneNodes(o.b);at=ops.indexOf(o);nextA=nextAligned(ops,at);prevA=prevAligned(ops,at);
    if(nextA&&samePath(o.b,nextA.b)){r=unitRange(model,nextA.c);if(!r)return false;insertAll(r.parent,r.nodes[0]);return true;}
    if(prevA&&samePath(o.b,prevA.b)){
      ra=unitRange(model,prevA.c);if(!ra)return false;ref=ra.nodes[ra.nodes.length-1];
      for(k=at-1;k>=0&&ops[k]!==prevA;k--)if(ops[k].c){prevC=ops[k];break;}
      if(prevC){r=unitRange(model,prevC.c);if(r&&r.parent===ra.parent)ref=r.nodes[r.nodes.length-1];}
      insertAll(ra.parent,ref.nextSibling);return true;
    }
    for(k=at+1;k<ops.length;k++)if(ops[k].c){r=unitRange(model,ops[k].c);if(!r)return false;insertAll(r.parent,r.nodes[0]);return true;}
    for(k=at-1;k>=0;k--)if(ops[k].c){r=unitRange(model,ops[k].c);if(!r)return false;insertAll(r.parent,r.nodes[r.nodes.length-1].nextSibling);return true;}
    insertAll(model,null);return true;
  }

  global.DocEditorDiff={myers:myers,tokenize:tokenize,dice:dice,wordDiff:wordDiff,normText:normText,units:units,compare:compare,render:render,revert:revert};
})(typeof window!=='undefined'?window:globalThis);
