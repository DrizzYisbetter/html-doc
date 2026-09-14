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

  /* ---------- DOM 함수 (Task 2에서 추가) ---------- */

  global.DocEditorDiff={myers:myers,tokenize:tokenize,dice:dice,wordDiff:wordDiff,normText:normText};
})(typeof window!=='undefined'?window:globalThis);
