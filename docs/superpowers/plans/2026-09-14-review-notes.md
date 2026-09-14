# 변경 사항 비교·메모 (html-doc 1.6.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 돌아온 HTML 문서에서 바뀐 문단을 겹쳐 보여 주고 되돌릴 수 있게 하며, 본문에 붙는 메모(답글·해결)와 작성자 이름·저장 출처를 파일 안에 남긴다.

**Architecture:** 비교 엔진은 새 파일 `assets/doc-diff.js`(순수 함수 + DOM 렌더)로 분리하고 빌드가 `doc-attach.js + doc-diff.js + doc-editor.js` 순서로 한 `<script>`에 인라인한다. 메모·이름·출처·비교 모드 상태는 기존 IIFE `assets/doc-editor.js`에 추가한다. 크롬 마크업은 `assets/skeleton-src.html`, 스타일은 `assets/doc-editor.css`에 두고 `python3 assets/build-template.py`로 골격·예시·변환 도구를 재조립한다.

**Tech Stack:** 순수 브라우저 JS(ES5 문법 유지, 라이브러리 없음), CSS, Python 3 빌드 스크립트, Node 24 `node:test`(순수 함수 단위 테스트), Aside REPL 브라우저 회귀 테스트(`aside repl`).

**Spec:** `docs/superpowers/specs/2026-09-14-review-notes-design.md` (아래 절 번호는 스펙 절 번호).

## Global Constraints

- 엔진 파일(`assets/doc-editor.js`, `assets/doc-diff.js`, `assets/doc-attach.js`, `assets/doc-editor.css`)은 ES5 문법(`var`, `function`)으로 쓴다. 화살표 함수·`const`·템플릿 문자열은 테스트 파일에서만 쓴다.
- 모든 새 id·클래스·변수는 `doc-*` / `doc-ed-*` / `--doc-ed-*` 네임스페이스를 따른다.
- 문서 어디에도 줄표(`—`, `–`)를 쓰지 않는다. 쉼표·콜론·괄호로 바꾼다.
- 파일 안 마크다운·코드에 `/Users/...` 같은 개인 절대 경로를 넣지 않는다(`scripts/check-release.py`가 거부한다). 홈 경로는 `~/...`로 쓴다.
- UI 문구는 한국어. 브라우저 저장소 키는 `docedit:author`, 백업 키는 기존 `docedit:autosave:<id 또는 url:origin+path>`.
- 크롬 UI 블록 9개: `doc-controls`, `doc-editbar`, `doc-inspector`, `doc-notes-panel`, `doc-changes-bar`, `doc-editflag`, `doc-restore-banner`, `doc-history-modal`, `doc-toast`. 저장소 2개: `doc-history`, `doc-notes`.
- 빌드 후 `python3 assets/build-template.py --check`와 `python3 scripts/check-release.py`가 통과해야 한다. 생성물(`assets/skeleton.html`, `examples/demo.html`, `tools/add-editor.html`)은 손으로 고치지 않는다.
- 브라우저 테스트는 저장소 루트에서 `python3 -m http.server 8769 --bind 127.0.0.1`을 띄운 뒤 `aside repl "$(cat tests/<name>.js)"`로 실행한다(먼저 `aside-browser` 스킬을 읽는다). 결과 마지막 줄의 `"pass":true`를 확인한다. 사용자 문서 URL에는 실행하지 않는다.
- 커밋은 작업 브랜치 `feature/review-notes`에 한다. push는 사용자 확인 후.

## File Map

| 파일 | 역할 |
|---|---|
| `assets/doc-diff.js` (신규) | 비교 엔진. 순수 함수 `myers`, `tokenize`, `dice`, `wordDiff`, `normText`와 DOM 함수 `units`, `compare`, `render`, `revert`. `window.DocEditorDiff`(Node에서는 `globalThis.DocEditorDiff`). |
| `assets/doc-editor.js` | 편집 엔진 IIFE. 이름·출처·ID 부여·백업 안전장치(7, 8절), 메모 저장소·앵커·패널(6절), 비교 모드 상태·바·되돌리기(5절), 직렬화 정리(10절), 공개 API(11절). |
| `assets/doc-editor.css` | 메모 패널·카드·mark, 비교 바·diff 표식, 모바일·인쇄 규칙. |
| `assets/skeleton-src.html` | 크롬 마크업(컨트롤 버튼 2개, 툴바 메모 버튼, `#doc-notes-panel`, `#doc-changes-bar`, `#doc-notes` 저장소). |
| `assets/doc-attach.js` | `chromeIds` 9개, `bundleFrom` 정리, `convert`의 출처 속성 제거·`#doc-notes` 생성·충돌 검사. |
| `assets/build-template.py`, `scripts/check-release.py` | JS 연결 순서에 `doc-diff.js` 추가, 필수 id 추가. |
| `examples/demo-src.html` | `#doc-notes` 저장소 한 줄 추가(본문·디자인은 그대로). |
| `tests/unit/diff-core.test.js` (신규) | Node 단위 테스트(순수 함수). |
| `tests/review-notes.js` (신규) | Aside 브라우저 회귀(비교 엔진, 이름·출처·백업, 메모, 비교 모드, 반응형). |
| `tests/browser-regression.js`, `tests/export-readonly.js`, `tests/attach-editor.js`, `tests/mobile-layout.js` | 새 크롬·저장소·출처·ID 정책 반영. |
| `SKILL.md`, `references/guide.ko.md`, `README.ko.md`, `README.en.md`, `CHANGELOG.md`, `tests/README.md` | 1.6.0 문서. |

---

### Task 1: 비교 엔진의 순수 함수 (`doc-diff.js` 1부) + 빌드 연결

**Files:**
- Create: `assets/doc-diff.js`
- Create: `tests/unit/diff-core.test.js`
- Modify: `assets/build-template.py:13-14` (js 연결), `scripts/check-release.py:55,88-90` (js 연결·node --check)

**Interfaces:**
- Produces: `DocEditorDiff.myers(a, b, eq, maxD)` → `[{op:'eq',a,b}|{op:'del',a}|{op:'ins',b}]` 또는 `null`(maxD 초과). `DocEditorDiff.tokenize(html)` → 토큰 배열. `DocEditorDiff.dice(textA, textB)` → 0..1. `DocEditorDiff.wordDiff(bHtml, cHtml)` → ins/del 래퍼가 든 HTML 문자열 또는 `null`. `DocEditorDiff.normText(s)`.

- [ ] **Step 1: 단위 테스트 작성 (실패 확인용)**

`tests/unit/diff-core.test.js`:

```js
// Node 24: node --test tests/unit/  (순수 함수만. DOM 함수는 tests/review-notes.js에서 검증)
const test = require('node:test');
const assert = require('node:assert/strict');
require('../../assets/doc-diff.js');
const D = globalThis.DocEditorDiff;
const eq = (a, b) => a === b;

test('myers: equal sequences', () => {
  assert.deepEqual(D.myers(['a', 'b'], ['a', 'b'], eq).map(o => o.op), ['eq', 'eq']);
});
test('myers: delete and insert with indexes', () => {
  const ops = D.myers(['a', 'b', 'c'], ['a', 'c', 'd'], eq);
  assert.deepEqual(ops.map(o => o.op), ['eq', 'del', 'eq', 'ins']);
  assert.equal(ops[1].a, 1);
  assert.equal(ops[3].b, 2);
});
test('myers: empty sides', () => {
  assert.deepEqual(D.myers([], ['x'], eq).map(o => o.op), ['ins']);
  assert.deepEqual(D.myers(['x'], [], eq).map(o => o.op), ['del']);
  assert.deepEqual(D.myers([], [], eq), []);
});
test('myers: maxD exceeded returns null', () => {
  assert.equal(D.myers(['a', 'b', 'c'], ['x', 'y', 'z'], eq, 2), null);
});
test('tokenize splits tags, words and whitespace', () => {
  assert.deepEqual(D.tokenize('<b>안녕</b> 세상  a'), ['<b>', '안녕', '</b>', ' ', '세상', '  ', 'a']);
});
test('normText collapses whitespace and nbsp', () => {
  assert.equal(D.normText(' 하나  둘\n셋 '), '하나 둘 셋');
});
test('dice similarity', () => {
  assert.equal(D.dice('a b c', 'a b c'), 1);
  assert.equal(D.dice('a b', 'c d'), 0);
  assert.equal(D.dice('', ''), 1);
  assert.ok(Math.abs(D.dice('a b c d', 'a b x y') - 0.5) < 1e-9);
});
test('wordDiff wraps inserted and deleted words', () => {
  const out = D.wordDiff('하나 둘 셋', '하나 넷 셋');
  assert.ok(out.startsWith('하나 ') && out.endsWith(' 셋'), out);
  assert.ok(out.includes('<del class="doc-ed-del">둘</del>'), out);
  assert.ok(out.includes('<ins class="doc-ed-ins">넷</ins>'), out);
});
test('wordDiff keeps the current tag structure and drops deleted tags', () => {
  assert.equal(D.wordDiff('<b>a</b> b', '<i>a</i> b'), '<i>a</i> b');
});
test('wordDiff keeps deleted images inside del', () => {
  assert.ok(D.wordDiff('x <img src="a.png"> y', 'x y').includes('<del class="doc-ed-del"><img src="a.png">'));
});
test('wordDiff ignores whitespace-only changes', () => {
  assert.equal(D.wordDiff('a b', 'a  b'), 'a  b');
});
test('wordDiff keeps one wrapper across inserted words', () => {
  assert.equal(D.wordDiff('x', 'x a b'), 'x<ins class="doc-ed-ins"> a b</ins>');
});
test('wordDiff returns null when the token diff is too large', () => {
  const a = Array.from({ length: 3000 }, (_, i) => 'a' + i).join(' ');
  const b = Array.from({ length: 3000 }, (_, i) => 'b' + i).join(' ');
  assert.equal(D.wordDiff(a, b), null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/unit/*.test.js`
Expected: 모듈을 찾지 못해 실패 (`Cannot find module '../../assets/doc-diff.js'`).

- [ ] **Step 3: `assets/doc-diff.js` 작성 (순수 함수 부분)**

```js
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
```

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `node --test tests/unit/*.test.js`
Expected: 13 tests pass, 0 fail.

- [ ] **Step 5: 빌드 스크립트에 `doc-diff.js` 연결**

`assets/build-template.py`의 다음 두 줄을

```python
attach_js = (assets / 'doc-attach.js').read_text(encoding='utf-8')
js = attach_js + '\n' + (assets / 'doc-editor.js').read_text(encoding='utf-8')
```

이렇게 바꾼다:

```python
attach_js = (assets / 'doc-attach.js').read_text(encoding='utf-8')
diff_js = (assets / 'doc-diff.js').read_text(encoding='utf-8')
js = attach_js + '\n' + diff_js + '\n' + (assets / 'doc-editor.js').read_text(encoding='utf-8')
```

`scripts/check-release.py`의

```python
    js = ((ROOT / 'assets/doc-attach.js').read_text() + '\n' + (ROOT / 'assets/doc-editor.js').read_text()).strip()
```

를

```python
    js = ((ROOT / 'assets/doc-attach.js').read_text() + '\n' + (ROOT / 'assets/doc-diff.js').read_text()
          + '\n' + (ROOT / 'assets/doc-editor.js').read_text()).strip()
```

로, 그리고

```python
        for filename in ['doc-editor.js', 'doc-attach.js']:
```

를

```python
        for filename in ['doc-editor.js', 'doc-attach.js', 'doc-diff.js']:
```

로 바꾼다.

- [ ] **Step 6: 재빌드와 검사**

Run: `python3 assets/build-template.py && python3 assets/build-template.py --check && node --check assets/doc-diff.js`
Expected: 세 생성물 "생성 완료", `--check`는 모두 "최신 상태". 브라우저에서 `examples/demo.html`을 열면 `window.DocEditorDiff.wordDiff`가 함수여야 한다(Task 2 테스트에서 확인).

- [ ] **Step 7: 커밋**

```bash
git add assets/doc-diff.js tests/unit/diff-core.test.js assets/build-template.py scripts/check-release.py assets/skeleton.html examples/demo.html tools/add-editor.html
git commit -m "비교 엔진 순수 함수(myers·tokenize·wordDiff)와 Node 단위 테스트, 빌드 연결"
```

---

### Task 2: 비교 엔진의 DOM 함수 (`doc-diff.js` 2부) + 브라우저 테스트 골격

**Files:**
- Modify: `assets/doc-diff.js` (`/* ---------- DOM 함수 ---------- */` 자리)
- Create: `tests/review-notes.js`

**Interfaces:**
- Consumes: Task 1의 `myers`, `tokenize`, `dice`, `wordDiff`, `normText`.
- Produces: `DocEditorDiff.units(root)` → 단위 배열 `{type:'block'|'run', tag, nodes, path, start, end, text, nhtml, tsig, sig}`. `DocEditorDiff.compare(baseHtml, curHtml)` → `{bRoot, cRoot, ops, counts:{ins,del,mod,fmt}, exceeded, changes:[]}`; `ops[i]` = `{type:'eq'|'ins'|'del'|'mod'|'fmt', b?, c?, fmt?}`. `DocEditorDiff.render(cmp)` → `cmp.cRoot`를 표식으로 바꾸고 `cmp.changes`(변경 op 배열, 각 op에 `el`)를 채워 반환. `DocEditorDiff.revert(cmp, index, modelRoot)` → `true|false`, `modelRoot`(원본 문자열을 파싱한 div)를 제자리에서 수정.

- [ ] **Step 1: 브라우저 테스트 골격과 비교 엔진 검증 작성**

`tests/review-notes.js` (새 파일. 이후 Task에서 절을 덧붙인다):

```js
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
```

- [ ] **Step 2: 실패 확인**

Run (저장소 루트, 서버 실행 중): `aside repl "$(cat tests/review-notes.js)"`
Expected: `FAIL: diff: compare counts` (`D.compare is not a function`).

- [ ] **Step 3: DOM 함수 구현**

`assets/doc-diff.js`의 `/* ---------- DOM 함수 (Task 2에서 추가) ---------- */` 주석을 아래 코드로 바꾸고, 마지막 줄의 API 객체에 `units`, `compare`, `render`, `revert`를 추가한다.

```js
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
  // cRoot에 표식을 넣는다. 삭제 단위는 다음 C 단위 앞, 없으면 직전에 그린 노드 뒤, 없으면 root 끝에 복제해 넣는다.
  function render(cmp){
    var ops=cmp.ops,changes=[],cursor=null,i,o,el,next,parent,html,delEl,parentTag;
    function nextC(from){for(var k=from+1;k<ops.length;k++)if(ops[k].c)return ops[k].c;return null;}
    for(i=0;i<ops.length;i++){
      o=ops[i];
      if(o.type==='eq'){cursor=lastNode(o.c);continue;}
      if(o.type==='del'){
        next=nextC(i);
        parent=next?firstNode(next).parentNode:(cursor?cursor.parentNode:cmp.cRoot);
        parentTag=parent&&parent.nodeType===1&&parent!==cmp.cRoot?parent.tagName.toLowerCase():'';
        el=cloneDeleted(o.b,parentTag);
        if(next)parent.insertBefore(el,firstNode(next));else if(cursor)cursor.parentNode.insertBefore(el,cursor.nextSibling);else cmp.cRoot.appendChild(el);
      }else if(o.type==='ins'){el=markUnit(o.c,'doc-ed-diff-ins');}
      else if(o.type==='mod'){
        html=wordDiff(innerOf(o.b),innerOf(o.c));
        if(html===null){
          parent=firstNode(o.c).parentNode;
          delEl=cloneDeleted(o.b,parent!==cmp.cRoot?parent.tagName.toLowerCase():'');
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
  // 원본 모델(같은 문자열을 파싱한 div)에 변경 하나를 기준 쪽으로 되돌린다.
  function revert(cmp,index,model){
    var o=cmp.changes[index],r,i,k,ref,clones,at;
    if(!o)return false;
    if(o.type==='ins'){r=unitRange(model,o.c);if(!r)return false;r.nodes.forEach(function(n){r.parent.removeChild(n);});return true;}
    if(o.type==='mod'||o.type==='fmt'){
      r=unitRange(model,o.c);if(!r)return false;clones=cloneNodes(o.b);
      for(i=0;i<clones.length;i++)r.parent.insertBefore(clones[i],r.nodes[0]);
      r.nodes.forEach(function(n){r.parent.removeChild(n);});return true;
    }
    clones=cloneNodes(o.b);at=cmp.ops.indexOf(o);
    for(k=at+1;k<cmp.ops.length;k++)if(cmp.ops[k].c){r=unitRange(model,cmp.ops[k].c);if(!r)return false;for(i=0;i<clones.length;i++)r.parent.insertBefore(clones[i],r.nodes[0]);return true;}
    for(k=at-1;k>=0;k--)if(cmp.ops[k].c){r=unitRange(model,cmp.ops[k].c);if(!r)return false;ref=r.nodes[r.nodes.length-1].nextSibling;for(i=0;i<clones.length;i++)r.parent.insertBefore(clones[i],ref);return true;}
    for(i=0;i<clones.length;i++)model.appendChild(clones[i]);return true;
  }
```

API 줄:

```js
  global.DocEditorDiff={myers:myers,tokenize:tokenize,dice:dice,wordDiff:wordDiff,normText:normText,units:units,compare:compare,render:render,revert:revert};
```

- [ ] **Step 4: 재빌드 후 테스트 통과 확인**

Run: `python3 assets/build-template.py && node --test tests/unit/*.test.js && aside repl "$(cat tests/review-notes.js)"`
Expected: Node 13 pass. Aside 출력 마지막 줄 `{"pass":true,"count":8,...}`.

- [ ] **Step 5: 커밋**

```bash
git add assets/doc-diff.js tests/review-notes.js assets/skeleton.html examples/demo.html tools/add-editor.html
git commit -m "비교 엔진 DOM 함수: 단위 추출·정렬·수정 쌍·렌더·되돌리기와 브라우저 검증"
```

---

### Task 3: 이름·저장 출처·첫 저장 ID·백업 안전장치 (`doc-editor.js`)

**Files:**
- Modify: `assets/doc-editor.js` (상태 변수, `loadHistory`, 자동저장, `pushHistoryIfChanged`, `saveToFile`, `openHistory`, `restoreHistory`, `checkAutosave`, API)
- Modify: `tests/browser-regression.js`, `tests/persistent-save.js` (prompt 대체, ID 정책)
- Modify: `tests/review-notes.js` (B절 추가)

**Interfaces:**
- Produces (엔진 내부, 이후 Task가 사용): `getContentHtml()`(비교 모드면 원본 문자열), `notes` 배열과 `sanitizeNotes(arr)`, `lastBackedUpNotes`, `afterContentReplaced()`(본문 교체 후 훅), `readAuthor()/storeAuthor(v)/currentAuthor()/ensureAuthor()`, 백업 레코드 `{ts, html, notes, title, savedBy, savedAt}`, 히스토리 항목 `{ts, title, html, author}`, body 속성 `data-doc-saved-by`, `data-doc-saved-at`.
- Produces (공개 API): `DocEditor.author(name?)`.

- [ ] **Step 1: 기존 스위트에 prompt 대체 반영 (실패 방지)**

`tests/browser-regression.js`:
- `check('save cancellation preserves history and identity', ...)`의 evaluate 첫 줄에 `window.prompt=()=>'QA';`를 추가한다.
- `check('save then repeat does not duplicate history', ...)`의 evaluate 첫 줄에 `window.prompt=()=>'QA';`를 추가하고, 반환식 끝의 `&& !document.body.dataset.docId`를 `&& !!document.body.dataset.docId`로 바꾼다(첫 저장에서 ID를 만든다).
- `check('save failure download updates baseline once', ...)`에서 `const w=frame.contentWindow, ...` 다음 줄에 `w.prompt=()=>'QA';`를 추가한다.

`tests/persistent-save.js`: `window.showSaveFilePicker=` 대입이 들어 있는 각 `page.evaluate` 콜백의 첫 문장으로 `window.prompt=()=>'QA';`를 추가한다(파일 전체에서 `let calls=0;` 앞).

- [ ] **Step 2: B절 테스트 작성 (실패 확인용)**

`tests/review-notes.js`의 마지막 `console.log(JSON.stringify({pass:true,...}))` 줄 **앞**에 추가:

```js
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
check('provenance: saved-by/at and history author are written', await page.evaluate(()=>{
  const docs=window.__writes.map(h=>new DOMParser().parseFromString(h,'text/html'));
  const b=docs[1].body, hist=JSON.parse(docs[1].getElementById('doc-history').textContent);
  return docs.length===2 && b.dataset.docSavedBy==='검토자' && /^\d{4}-/.test(b.dataset.docSavedAt||'') && hist.length===1 && hist[0].author==='' && !!b.dataset.docId;
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
```

- [ ] **Step 3: 실패 확인**

Run: `aside repl "$(cat tests/review-notes.js)"`
Expected: `FAIL: author: prompt once on first save and remembered`.

- [ ] **Step 4: 엔진 수정**

`assets/doc-editor.js`에서 다음을 순서대로 바꾼다.

(a) 상태 변수. 이 줄

```js
  var lastBackedUpHtml=content.innerHTML;
```

바로 아래에 추가:

```js
  var lastBackedUpNotes='[]';
  var notes=[];                       // 메모 저장소 (Task 4에서 #doc-notes와 연결)
  var comparing=false, pristineHtml=null; // 비교 모드 (Task 6). 비교 중에는 화면 대신 원본 문자열이 진짜 본문이다.
  function getContentHtml(){ return comparing?pristineHtml:content.innerHTML; }
  function sanitizeNotes(arr){ return Array.isArray(arr)?arr.filter(function(v){ return v && typeof v.id==='string' && typeof v.text==='string'; }):[]; }
  function afterContentReplaced(){ }   // 본문을 통째로 바꾼 뒤 호출 (Task 4에서 메모 정합성 갱신을 넣는다)
```

(b) `loadHistory`를 이렇게 교체:

```js
  function loadHistory(){ try{ var h=JSON.parse(histEl.textContent||'[]'); return Array.isArray(h)?h.filter(function(v){return v && typeof v.html==='string' && typeof v.title==='string' && typeof v.ts==='string';}).slice(0,30).map(function(v){return {ts:v.ts,title:v.title,html:v.html,author:typeof v.author==='string'?v.author:''};}):[]; }catch(e){ return []; } }
```

(c) `function $(id){ ... }` 줄 아래에 작성자 블록 추가:

```js
  /* ---------- 작성자 이름 (브라우저별로 기억, 문서에는 넣지 않음) ---------- */
  var AUTHOR_KEY='docedit:author', sessionAuthor=null;
  function readAuthor(){ var v=null; try{ v=localStorage.getItem(AUTHOR_KEY); }catch(e){} if(v===null) v=sessionAuthor; return v; }
  function storeAuthor(v){ sessionAuthor=v; try{ localStorage.setItem(AUTHOR_KEY,v); }catch(e){} var inp=$('doc-notesAuthor'); if(inp && inp.value!==v) inp.value=v; }
  function currentAuthor(){ return readAuthor()||''; }
  // 처음 한 번만 묻는다. 취소·빈 값은 ''로 기억해 다시 묻지 않는다.
  function ensureAuthor(){ var v=readAuthor(); if(v===null){ var r=null; try{ r=window.prompt('이름을 입력하세요. 메모와 저장 기록에 표시됩니다. 비워 두면 이름 없이 남깁니다.',''); }catch(e){} v=(r===null?'':String(r)).trim(); storeAuthor(v); } return v; }
```

(d) `writeBackup`과 `doAutosave`를 교체:

```js
  function writeBackup(){
    try{ var html=getContentHtml(); localStorage.setItem(autosaveKey(), JSON.stringify({ts:new Date().toISOString(),html:html,notes:notes,title:snapshotTitle(html),savedBy:body.dataset.docSavedBy||'',savedAt:body.dataset.docSavedAt||''})); lastBackedUpHtml=html; lastBackedUpNotes=JSON.stringify(notes); return true; }
    catch(e){ toast('브라우저 백업을 저장하지 못했습니다. 파일로 저장해 주세요.'); return false; }
  }
  function doAutosave(){ clearTimeout(autosaveTimer); autosaveTimer=null; if(getContentHtml()!==lastBackedUpHtml || JSON.stringify(notes)!==lastBackedUpNotes) return writeBackup(); return true; }
```

(e) `pushHistoryIfChanged`를 교체(히스토리 항목에 출처를 넣고, 같은 본문이 연달아 쌓이지 않게 한다):

```js
  function pushHistoryIfChanged(){ var cur=getContentHtml(); if(cur!==lastSavedHtml && !(history[0] && history[0].html===lastSavedHtml)){ history.unshift({ts:body.dataset.docSavedAt||new Date().toISOString(), title:snapshotTitle(lastSavedHtml), html:lastSavedHtml, author:body.dataset.docSavedBy||''}); history=history.slice(0,30); } }
```

(f) `suggestName`의 `snapshotTitle(content.innerHTML)`을 `snapshotTitle(getContentHtml())`로 바꾼다.

(g) `saveToFile` 전체를 교체:

```js
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
      var author=ensureAuthor();
      await fileLinkReady;
      var handle=forceNew?null:fileHandle, pickerFailed=false;
      if(window.showSaveFilePicker){
        try{
          if(forceNew || !handle){ handle=await window.showSaveFilePicker({ suggestedName:suggestName(), types:[{description:'HTML 문서', accept:{'text/html':['.html','.htm']}}] }); }
          else { var p=await handle.queryPermission({mode:'readwrite'}); if(p!=='granted' && (await handle.requestPermission({mode:'readwrite'}))!=='granted'){ toast('쓰기 권한이 허용되지 않아 저장하지 않았습니다. 다시 저장하거나 다른 이름으로 저장해 주세요.'); return; } }
        }catch(e){ if(e&&e.name==='AbortError') return; if(handle){ toast('저장 파일의 쓰기 권한을 확인하지 못했습니다. 저장 버튼을 다시 눌러 주세요.'); return; } handle=null; pickerFailed=true; }
      }
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
      // 일반 저장에서 경로 키가 ID 키로 바뀌었으면 새 키 백업에 성공한 뒤 경로 키 백업을 지운다. 다른 이름으로는 원래 경로 백업을 두지 않는다.
      if(writeBackup() && wasPathKeyed && !forceNew){ try{ localStorage.removeItem('docedit:autosave:url:'+location.origin+location.pathname); }catch(e){} }
      var banner=$('doc-restore-banner'); if(banner) banner.classList.remove('show');
      toast(wroteFile?'저장되었습니다 · '+handle.name+(remembered?'':' · 파일 연결을 기억하지 못해 다음에 다시 선택해야 합니다.'):(pickerFailed?'파일 저장 실패. 다운로드를 시작했습니다.':'다운로드를 시작했습니다. 내려받은 파일을 확인해 주세요.'));
    }catch(e){
      rollback();
      toast('저장하지 못했습니다. 다시 시도해 주세요.');
    }finally{ saving=false; }
  }
```

(h) `openHistory`의 카드 생성 줄에서 `'<span>'+fmtTs(h.ts)+'</span>'`을 `'<span>'+escapeHtml(h.author||'이름 없음')+' · '+fmtTs(h.ts)+'</span>'`으로 바꾼다.

(i) `restoreHistory`를 교체:

```js
  function restoreHistory(i){
    var target=history[i].html, cur=getContentHtml();
    if(!(history[0] && history[0].html===cur)){ history.unshift({ts:body.dataset.docSavedAt||new Date().toISOString(), title:'복원 전: '+snapshotTitle(cur), html:cur, author:body.dataset.docSavedBy||''}); history=history.slice(0,30); }
    content.innerHTML=target; savedRange=null; var m=$('doc-history-modal'); if(m) m.classList.remove('open'); afterContentReplaced(); scheduleAutosave();
    toast('해당 버전으로 복원했습니다. 파일에 반영하려면 [저장]을 누르세요.');
  }
```

(j) `checkAutosave`를 교체:

```js
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
```

(k) `toast`에 표시 시간 인수를 추가:

```js
  function toast(t,ms){ var el=document.getElementById('doc-toast'); if(!el) return; el.textContent=t; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(function(){el.classList.remove('show');},ms||2600); }
```

(l) 초기화 블록의 `checkAutosave();` 다음 줄에 열 때 안내를 추가:

```js
  (function(){ var by=body.dataset.docSavedBy||''; if(by && by!==currentAuthor() && history.length) toast(by+'이(가) 저장한 문서입니다. 변경 사항으로 수정된 부분을 볼 수 있습니다.',6000); })();
```

(m) 공개 API 객체에 추가:

```js
    author:function(name){ if(typeof name==='string'){ storeAuthor(name.trim()); } return currentAuthor(); },
```

- [ ] **Step 5: 재빌드 후 테스트**

Run: `python3 assets/build-template.py && node --check assets/doc-editor.js && aside repl "$(cat tests/review-notes.js)" && aside repl "$(cat tests/browser-regression.js)" && aside repl "$(cat tests/persistent-save.js)"`
Expected: review-notes `"pass":true,"count":18`, browser-regression `"pass":true,"count":16`, persistent-save `"pass":true`.

- [ ] **Step 6: 커밋**

```bash
git add assets/doc-editor.js tests/review-notes.js tests/browser-regression.js tests/persistent-save.js assets/skeleton.html examples/demo.html tools/add-editor.html
git commit -m "작성자 이름·저장 출처·첫 저장 ID·백업 출처 확인과 복구 전 히스토리 보존"
```

---

### Task 4: 메모 저장소·앵커·정합성·API (`doc-editor.js`)

**Files:**
- Modify: `assets/doc-editor.js` (저장소 연결, 메모 블록, `afterContentReplaced`, `serialize`, `serializeReadOnly`, API)
- Modify: `examples/demo-src.html`, `assets/skeleton-src.html` (`#doc-notes` 저장소 한 줄)
- Modify: `tests/review-notes.js` (C절 추가)

**Interfaces:**
- Consumes: Task 3의 `notes`, `sanitizeNotes`, `getContentHtml`, `ensureAuthor`, `afterContentReplaced`, `lastBackedUpNotes`.
- Produces (내부): `normText(s)`, `findNote(id)`, `noteMarks(id, root?)`, `unwrapMark(m)`, `unwrapMarks(id, root)`, `wrapRange(range, id)`, `quoteOf(range)`, `targetFrom(range)` → `{range, quote}|null`, `addNote(text, target)` → note|null, `replyNote(id, text)`, `resolveNote(id, on)`, `removeNote(id)`, `openCount()`, `reconcileNotes()`, `noteHasAnchor(id)`, `afterNotesChange()`, `renderNotes()`(이 Task에서는 개수 표시만), `noteTarget` 변수.
- Produces (공개 API): `DocEditor.notes.list()/add(text, {range}|{anchor:true})/reply(id,text)/resolve(id,on)/remove(id)`.
- 본문 앵커: `<mark class="doc-ed-note" data-doc-note="ID">`, 상태 클래스 `doc-ed-note-resolved`, `doc-ed-note-active`.

- [ ] **Step 1: C절 테스트 작성 (실패 확인용)**

`tests/review-notes.js`의 마지막 `console.log(JSON.stringify({pass:true,...}))` 줄 앞에 추가:

```js
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
check('notes: whole-document note has no anchor', await page.evaluate(()=>{ const id=window.DocEditor.notes.add('전체 의견'); const n=window.DocEditor.notes.list().find(x=>x.id===id); return !!n && !n.anchored && n.quote==='' && document.querySelectorAll('mark.doc-ed-note').length===3; }));
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
  return store.length===3 && d.querySelectorAll('#doc-content mark.doc-ed-note').length===3 && !ro.getElementById('doc-notes') && !ro.querySelector('mark.doc-ed-note') && ro.getElementById('doc-content').textContent.includes('첫째 문장입니다. 둘째 문장입니다.') && !ro.body.hasAttribute('data-doc-saved-by');
}));
check('notes: remove unwraps marks and merges text', await page.evaluate(()=>{
  const id=window.DocEditor.notes.list()[0].id, ok=window.DocEditor.notes.remove(id), p1=document.getElementById('qa-p1');
  return ok && document.querySelectorAll('mark[data-doc-note="'+id+'"]').length===0 && window.DocEditor.notes.list().length===2 && p1.childNodes.length===2 && p1.childNodes[0].nodeValue==='첫째 문장입니다. 둘째 ';
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
  return !!a && Array.isArray(a.notes) && a.notes.length===2 && a.notes[0].text==='두 문단에 걸친 메모';
}));
await page.reload(); await stub();
check('notes: recovery restores notes with the body', await page.evaluate(()=>{ const b=document.getElementById('doc-restore-banner'); if(!b.classList.contains('show')) return false; document.getElementById('doc-rb-restore').click(); return window.DocEditor.notes.list().length===2 && document.getElementById('doc-content').textContent.includes('고아 표시'); }));
await page.evaluate(()=>localStorage.removeItem('docedit:autosave:url:'+location.origin+location.pathname));
```

- [ ] **Step 2: 실패 확인**

Run: `aside repl "$(cat tests/review-notes.js)"`
Expected: `FAIL: notes: anchored note wraps the selection ...` (`window.DocEditor.notes` undefined).

- [ ] **Step 3: 저장소 마크업**

`assets/skeleton-src.html`과 `examples/demo-src.html`에서 `<script type="application/json" id="doc-history">[]</script>` 줄 바로 아래에 다음 줄을 추가한다:

```html
<script type="application/json" id="doc-notes">[]</script>
```

- [ ] **Step 4: 엔진 수정**

(a) `if(!histEl){ ... }` 줄 바로 아래에 저장소 연결을 추가:

```js
  var notesEl=document.getElementById('doc-notes');
  if(!notesEl){ notesEl=document.createElement('script'); notesEl.type='application/json'; notesEl.id='doc-notes'; notesEl.textContent='[]'; histEl.parentNode.insertBefore(notesEl,histEl.nextSibling); }
```

(b) Task 3에서 넣은 `var notes=[];` 줄을 `var notes=loadNotes();`로 바꾸고, `sanitizeNotes`와 `afterContentReplaced`를 아래로 교체:

```js
  function sanitizeNotes(arr){
    if(!Array.isArray(arr)) return [];
    return arr.filter(function(v){ return v && typeof v.id==='string' && typeof v.text==='string'; }).map(function(v){
      return {id:v.id, author:typeof v.author==='string'?v.author:'', ts:typeof v.ts==='string'?v.ts:'', text:v.text, quote:typeof v.quote==='string'?v.quote:'', anchored:!!v.anchored, resolved:!!v.resolved,
        replies:Array.isArray(v.replies)?v.replies.filter(function(r){ return r && typeof r.text==='string'; }).map(function(r){ return {author:typeof r.author==='string'?r.author:'', ts:typeof r.ts==='string'?r.ts:'', text:r.text}; }):[]};
    });
  }
  function loadNotes(){ try{ return sanitizeNotes(JSON.parse(notesEl.textContent||'[]')); }catch(e){ return []; } }
  function afterContentReplaced(){ reconcileNotes(); renderNotes(); }
```

(c) `/* ---------- 편집 모드 ---------- */` 블록 바로 앞에 메모 블록을 추가:

```js
  /* ---------- 메모 (저장소 #doc-notes + 본문 mark 앵커) ---------- */
  var noteTarget=null, locateTimer=null;
  function normText(s){ return (s||'').replace(/ /g,' ').replace(/\s+/g,' ').trim(); }
  function findNote(id){ for(var i=0;i<notes.length;i++) if(notes[i].id===id) return notes[i]; return null; }
  function noteMarks(id,root){ return (root||content).querySelectorAll('mark.doc-ed-note[data-doc-note="'+id+'"]'); }
  function unwrapMark(m){ var p=m.parentNode; while(m.firstChild) p.insertBefore(m.firstChild,m); p.removeChild(m); p.normalize(); }
  function unwrapMarks(id,root){ var marks=noteMarks(id,root); for(var i=0;i<marks.length;i++) unwrapMark(marks[i]); }
  // 선택 범위 안의 텍스트 노드를 같은 ID의 mark로 감싼다. 경계 텍스트는 잘라 선택한 부분만 감싼다.
  function wrapRange(range,id){
    var sc=range.startContainer, so=range.startOffset, ec=range.endContainer, eo=range.endOffset, r=document.createRange(), walker, nodes=[], t, i, m, rest;
    if(ec.nodeType===3 && eo<ec.nodeValue.length) ec.splitText(eo);
    if(sc.nodeType===3 && so>0){ rest=sc.splitText(so); if(ec===sc) ec=rest; sc=rest; so=0; }
    if(sc.nodeType===3) r.setStart(sc,0); else r.setStart(sc,so);
    if(ec.nodeType===3) r.setEnd(ec,ec.nodeValue.length); else r.setEnd(ec,eo);
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
    if(comparing){ var model=document.createElement('div'); model.innerHTML=pristineHtml; unwrapMarks(id,model); pristineHtml=model.innerHTML; }
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
  function renderNotes(){ var open=openCount(), count=$('doc-notesCount'), btn=$('doc-notesBtn'); if(count) count.textContent=open?String(open):''; if(btn) btn.title=open?('미해결 메모 '+open+'개'):'메모 보기·남기기'; }
```

(d) `serialize()`에서 첫 줄 `histEl.textContent=escForScript(JSON.stringify(history));` 다음에 `notesEl.textContent=escForScript(JSON.stringify(notes));`를 추가하고, `b.classList.remove('doc-editing','doc-inspector-open');`를 `b.classList.remove('doc-editing','doc-inspector-open','doc-notes-open','doc-changes');`로 바꾼 뒤, `var attach=clone.querySelector('#doc-attachBtn');...` 줄 다음에 추가:

```js
    clone.querySelectorAll('#doc-content .doc-ed-note-active').forEach(function(m){m.classList.remove('doc-ed-note-active');});
    ['#doc-notesList','#doc-changesSummary','#doc-changesBase'].forEach(function(s){var el=clone.querySelector(s); if(el) el.innerHTML='';});
    var nt=clone.querySelector('#doc-notesTarget'); if(nt){ nt.classList.remove('has'); var nq=nt.querySelector('.q'); if(nq) nq.textContent='문서 전체'; var nx=nt.querySelector('#doc-notesTargetClear'); if(nx) nx.hidden=true; }
    var ni=clone.querySelector('#doc-notesInput'); if(ni) ni.textContent='';
    var na=clone.querySelector('#doc-notesAuthor'); if(na) na.removeAttribute('value');
    var nh=clone.querySelector('#doc-notesHint'); if(nh) nh.hidden=true;
    var nbt=clone.querySelector('#doc-notesBtn'); if(nbt) nbt.setAttribute('aria-expanded','false');
    var cbt=clone.querySelector('#doc-changesBtn'); if(cbt) cbt.classList.remove('on');
    var rv=clone.querySelector('#doc-changesRevert'); if(rv) rv.disabled=true;
```

(e) `serializeReadOnly()`에서 제거 셀렉터 배열 `['#doc-controls','#doc-editbar','#doc-inspector','#doc-editflag','#doc-restore-banner', '#doc-history-modal','#doc-toast','#doc-history',...]`에 `'#doc-notes-panel','#doc-changes-bar','#doc-notes'`를 추가하고, `b.removeAttribute('data-doc-id');` 뒤에 `b.removeAttribute('data-doc-saved-by');b.removeAttribute('data-doc-saved-at');`를 추가하고, `var c=clone.querySelector('#doc-content');if(c)c.removeAttribute('contenteditable');` 줄을 아래로 바꾼다:

```js
    var c=clone.querySelector('#doc-content');
    if(c){ c.removeAttribute('contenteditable'); var marks=c.querySelectorAll('mark.doc-ed-note'); for(var k=0;k<marks.length;k++) unwrapMark(marks[k]); }
```

(f) 공개 API 객체에 추가:

```js
    notes:{
      list:function(){ return JSON.parse(JSON.stringify(notes)); },
      add:function(text,opts){ opts=opts||{}; var target=null; if(opts.range) target=targetFrom(opts.range); else if(opts.anchor) target=targetFrom(savedRange); var n=addNote(text,target); return n?n.id:null; },
      reply:replyNote, resolve:resolveNote, remove:removeNote
    },
```

(g) 초기화 블록의 `checkAutosave();` 앞에 `reconcileNotes(); renderNotes();`를 추가한다.

- [ ] **Step 5: 재빌드 후 테스트**

Run: `python3 assets/build-template.py && node --check assets/doc-editor.js && aside repl "$(cat tests/review-notes.js)"`
Expected: `"pass":true,"count":27`.

- [ ] **Step 6: 커밋**

```bash
git add assets/doc-editor.js assets/skeleton-src.html examples/demo-src.html tests/review-notes.js assets/skeleton.html examples/demo.html tools/add-editor.html
git commit -m "메모 저장소·본문 앵커·답글·해결·정합성과 DocEditor.notes API"
```

---

### Task 5: 메모 패널 UI (마크업·CSS·패널 동작)

**Files:**
- Modify: `assets/skeleton-src.html` (컨트롤 메모 버튼, 툴바 메모 버튼, `#doc-notes-panel`)
- Modify: `assets/doc-editor.css` (패널·카드·mark·모바일·인쇄)
- Modify: `assets/doc-editor.js` (패널 블록, `renderNotes` 교체, 이벤트 연결, 초기화)
- Modify: `tests/review-notes.js` (C2절 추가)

**Interfaces:**
- Consumes: Task 4의 `addNote`, `replyNote`, `resolveNote`, `removeNote`, `findNote`, `noteMarks`, `noteHasAnchor`, `targetFrom`, `noteTarget`, `openCount`, `storeAuthor`, `currentAuthor`.
- Produces: `setNotes(on)`, `captureTarget()`, `clearTarget()`, `showTarget()`, `locateNote(id)`, `highlightCard(id)`, `noteCard(note)`, `renderNotes()`(전체 렌더). 마크업 id: `doc-notesBtn`, `doc-notesCount`, `doc-ebNote`, `doc-notes-panel`, `doc-notesClose`, `doc-notesAuthor`, `doc-notesTarget`, `doc-notesTargetClear`, `doc-notesInput`, `doc-notesAdd`, `doc-notesShowResolved`, `doc-notesHint`, `doc-notesList`. body 클래스 `doc-notes-open`.

- [ ] **Step 1: C2절 테스트 작성 (실패 확인용)**

`tests/review-notes.js` 마지막 `console.log(...)` 앞에 추가:

```js
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
check('notes ui: saved html has no open panel state or typed text', await page.evaluate(()=>{ document.getElementById('doc-notesInput').value='임시'; const d=new DOMParser().parseFromString(window.DocEditor.getHTML(),'text/html'); return !d.body.classList.contains('doc-notes-open') && d.getElementById('doc-notesList').innerHTML==='' && d.getElementById('doc-notesInput').textContent==='' && !d.getElementById('doc-notesAuthor').hasAttribute('value') && d.getElementById('doc-notesBtn').getAttribute('aria-expanded')==='false'; }));
await page.evaluate(()=>{ document.getElementById('doc-notesInput').value=''; document.getElementById('doc-notesClose').click(); window.DocEditor.notes.list().forEach(n=>window.DocEditor.notes.remove(n.id)); localStorage.removeItem('docedit:autosave:url:'+location.origin+location.pathname); });
```

- [ ] **Step 2: 실패 확인**

Run: `aside repl "$(cat tests/review-notes.js)"`
Expected: `FAIL: notes ui: button opens the panel ...` (`doc-notesBtn` 없음).

- [ ] **Step 3: 마크업 (`assets/skeleton-src.html`)**

(a) `#doc-controls` 안, `id="doc-saveBtn"` 버튼 줄 바로 아래에:

```html
  <button class="doc-ed-btn" id="doc-notesBtn" aria-expanded="false" aria-controls="doc-notes-panel" title="메모 보기·남기기">메모<span class="doc-ed-count" id="doc-notesCount"></span></button>
```

(b) `#doc-editbar` 안, 표·서식 지우기 그룹(`</div>` 로 끝나는 마지막 `.doc-ed-g`) 바로 뒤에:

```html
  <div class="doc-ed-g">
    <button class="doc-ed-eb" id="doc-ebNote" title="선택한 부분에 메모 남기기">메모</button>
  </div>
```

(c) `</aside>`(`#doc-inspector` 끝) 바로 뒤에:

```html
<aside id="doc-notes-panel" aria-label="메모">
  <div class="doc-ed-insp-card">
    <div class="doc-ed-insp-h"><span class="d"></span>메모<button class="doc-ed-btn" id="doc-notesClose" aria-label="메모 닫기">닫기</button></div>
    <div class="doc-ed-notes-author"><label for="doc-notesAuthor">이름</label><input id="doc-notesAuthor" type="text" placeholder="메모와 저장 기록에 표시" autocomplete="off"></div>
    <div class="doc-ed-notes-compose">
      <div id="doc-notesTarget"><span class="k">대상</span><span class="q">문서 전체</span><button type="button" id="doc-notesTargetClear" title="문서 전체 메모로 바꾸기" hidden>×</button></div>
      <textarea id="doc-notesInput" rows="3" placeholder="본문을 선택한 뒤 여기에 쓰면 그 부분에 붙습니다. 선택이 없으면 문서 전체 메모입니다."></textarea>
      <div class="doc-ed-notes-compose-actions"><label class="doc-ed-notes-filter"><input type="checkbox" id="doc-notesShowResolved"> 해결된 메모 보기</label><button type="button" class="doc-ed-btn primary" id="doc-notesAdd">남기기</button></div>
      <div class="doc-ed-notes-hint" id="doc-notesHint" hidden>비교를 닫고 메모를 남겨 주세요.</div>
    </div>
    <div id="doc-notesList"></div>
  </div>
</aside>
```

- [ ] **Step 4: 스타일 (`assets/doc-editor.css`)**

(a) `/* ---------- 편집 affordance ... */` 블록 바로 앞에 추가:

```css
/* ---------- 메모 패널 (보기·편집 모두 · 우측 플로팅 · 인스펙터와 같은 자리) ---------- */
.doc-ed-count{ display:inline-block; min-width:18px; margin-left:6px; padding:0 5px; border-radius:9px; background:var(--doc-ed-accent,#2563eb); color:#fff; font-size:11px; line-height:18px; text-align:center; }
.doc-ed-count:empty{ display:none; }
.doc-ed-btn.on .doc-ed-count{ background:#fff; color:var(--doc-ed-accent,#2563eb); }
#doc-notes-panel{
  position:fixed; top:calc(var(--doc-ed-tools-bottom,0px) + 8px); right:14px; width:320px; z-index:2147483000;
  max-height:calc(var(--doc-ed-visible-height,100vh) - var(--doc-ed-tools-bottom,0px) - 24px); overflow:auto; display:none;
  font-family:-apple-system,'Pretendard','Segoe UI',system-ui,sans-serif;
}
body:not(.doc-editing) #doc-notes-panel{ top:calc(var(--doc-ed-tools-bottom,0px) + var(--doc-ed-controls-height,44px) + 24px); max-height:calc(var(--doc-ed-visible-height,100vh) - var(--doc-ed-tools-bottom,0px) - var(--doc-ed-controls-height,44px) - 40px); }
body.doc-notes-open #doc-notes-panel{ display:block; }
body.doc-notes-open #doc-inspector{ display:none; }
#doc-notes-panel .doc-ed-insp-h .doc-ed-btn{ margin-left:auto; }
.doc-ed-notes-author{ display:flex; align-items:center; gap:8px; padding:8px 15px; border-bottom:1px solid var(--doc-ed-hair,#eef0f2); font-size:12px; font-weight:600; color:var(--doc-ed-muted,#6b7280); }
.doc-ed-notes-author input{ flex:1; min-width:0; height:30px; border:1px solid var(--doc-ed-line,#e5e7eb); border-radius:7px; padding:0 8px; font:inherit; font-size:13px; color:var(--doc-ed-ink,#1f2937); background:#fff; }
.doc-ed-notes-compose{ padding:10px 15px; border-bottom:1px solid var(--doc-ed-hair,#eef0f2); }
#doc-notesTarget{ display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--doc-ed-muted,#6b7280); margin-bottom:6px; }
#doc-notesTarget .k{ font-weight:700; flex:none; }
#doc-notesTarget .q{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#doc-notesTarget.has .q{ color:var(--doc-ed-accent-deep,#1d4ed8); font-weight:700; }
#doc-notesTargetClear{ flex:none; border:none; background:none; color:var(--doc-ed-muted,#6b7280); cursor:pointer; font-size:15px; line-height:1; padding:2px 5px; }
#doc-notesInput{ display:block; width:100%; min-height:64px; border:1px solid var(--doc-ed-line,#e5e7eb); border-radius:8px; padding:8px; font:inherit; font-size:13px; line-height:1.5; color:var(--doc-ed-ink,#1f2937); background:#fff; resize:vertical; }
#doc-notesInput:disabled{ background:var(--doc-ed-paper-2,#f8fafc); color:var(--doc-ed-muted,#6b7280); }
.doc-ed-notes-compose-actions{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; }
.doc-ed-notes-filter{ font-size:12px; color:var(--doc-ed-muted,#6b7280); display:flex; align-items:center; gap:4px; cursor:pointer; }
.doc-ed-notes-hint{ font-size:12px; color:#b45309; margin-top:6px; }
#doc-notesList{ padding:8px 10px 12px; }
.doc-ed-note-card{ border:1px solid var(--doc-ed-line,#e5e7eb); border-radius:10px; padding:9px 11px; margin-bottom:8px; background:#fff; cursor:pointer; }
.doc-ed-note-card.active{ border-color:var(--doc-ed-accent,#2563eb); box-shadow:0 0 0 2px var(--doc-ed-accent-line,#c7d2fe); }
.doc-ed-note-head{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:11.5px; color:var(--doc-ed-muted,#6b7280); }
.doc-ed-note-head strong{ color:var(--doc-ed-ink,#1f2937); font-size:12.5px; }
.doc-ed-note-badge{ font-size:10.5px; padding:1px 6px; border-radius:6px; background:var(--doc-ed-paper-2,#f8fafc); border:1px solid var(--doc-ed-hair,#eef0f2); color:var(--doc-ed-muted,#6b7280); font-weight:700; }
.doc-ed-note-badge.ok{ background:#ecfdf5; border-color:#a7f3d0; color:#047857; }
.doc-ed-note-where{ font-size:11.5px; color:var(--doc-ed-muted,#6b7280); margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.doc-ed-note-text{ font-size:13px; line-height:1.55; color:var(--doc-ed-ink,#1f2937); margin-top:6px; white-space:pre-wrap; overflow-wrap:anywhere; }
.doc-ed-note-replies{ margin-top:8px; padding-left:10px; border-left:2px solid var(--doc-ed-hair,#eef0f2); }
.doc-ed-note-reply{ font-size:12.5px; margin-top:6px; color:var(--doc-ed-ink,#1f2937); }
.doc-ed-note-reply strong{ font-size:12px; margin-right:6px; }
.doc-ed-note-reply span{ font-size:11px; color:var(--doc-ed-muted,#6b7280); }
.doc-ed-note-reply div{ white-space:pre-wrap; overflow-wrap:anywhere; }
.doc-ed-note-actions{ display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; }
.doc-ed-note-actions .doc-ed-btn{ padding:4px 9px; font-size:11.5px; box-shadow:none; }
.doc-ed-note-replybox{ margin-top:8px; }
.doc-ed-note-replybox textarea{ display:block; width:100%; border:1px solid var(--doc-ed-line,#e5e7eb); border-radius:8px; padding:6px 8px; font:inherit; font-size:12.5px; margin-bottom:6px; background:#fff; color:var(--doc-ed-ink,#1f2937); }
.doc-ed-note-card.resolved{ opacity:.78; }
.doc-ed-note-card.resolved:not(.open) .doc-ed-note-text, .doc-ed-note-card.resolved:not(.open) .doc-ed-note-replies,
.doc-ed-note-card.resolved:not(.open) .doc-ed-note-actions, .doc-ed-note-card.resolved:not(.open) .doc-ed-note-replybox{ display:none; }
/* 본문 하이라이트 (글자색은 문서 것) */
#doc-content mark.doc-ed-note{ background:rgba(250,204,21,.35); color:inherit; border-bottom:2px solid #f59e0b; cursor:pointer; padding:0; }
#doc-content mark.doc-ed-note.doc-ed-note-resolved{ background:none; border-bottom:1px dotted #d97706; }
#doc-content mark.doc-ed-note.doc-ed-note-active{ background:rgba(245,158,11,.55); outline:2px solid #f59e0b; outline-offset:1px; }
```

(b) 접근성 블록의 두 줄을 바꾼다:

```css
#doc-controls *, #doc-editbar *, #doc-inspector *, #doc-notes-panel *, #doc-changes-bar *, #doc-history-modal *{ box-sizing:border-box; }
#doc-controls, #doc-editbar, #doc-inspector, #doc-notes-panel, #doc-changes-bar, #doc-history-modal{ box-sizing:border-box; }
```

그리고 `#doc-inspectorClose:focus-visible{ ... }` 셀렉터 목록에 `#doc-notes-panel :is(button,input,textarea):focus-visible`을 추가한다(쉼표로 이어 붙임).

(c) `@media(max-width:900px){` 블록 안, `#doc-inspector{ left:8px; right:8px; width:auto; }` 줄 다음에 추가:

```css
  #doc-notes-panel{ left:8px; right:8px; width:auto; }
  body:not(.doc-editing) #doc-notes-panel{ top:calc(var(--doc-ed-tools-bottom,60px) + 8px); max-height:calc(var(--doc-ed-visible-height,100dvh) - var(--doc-ed-tools-bottom,60px) - 24px); }
  body.doc-editing #doc-notesBtn{ display:none; }
  #doc-notesClose{ min-height:44px; }
  #doc-notes-panel .doc-ed-insp-h{ padding:6px 12px; }
  .doc-ed-note-actions .doc-ed-btn, #doc-notesAdd{ min-height:44px; }
```

(d) `@media print` 목록에 `#doc-notes-panel, #doc-changes-bar,`를 추가한다.

- [ ] **Step 5: 엔진 (`assets/doc-editor.js`)**

(a) Task 4의 `function renderNotes(){ ... }` 한 줄을 지우고, 메모 블록 끝(`function afterNotesChange...` 다음)에 패널 블록을 추가:

```js
  /* ---------- 메모 패널 ---------- */
  function setNotes(on){
    body.classList.toggle('doc-notes-open',on);
    var t=$('doc-notesBtn'); if(t) t.setAttribute('aria-expanded',String(on));
    if(on){ setInspector(false); setMore(false); captureTarget(); renderNotes(); }
  }
  // 작성 상자에 포커스가 올 때의 본문 선택을 메모 대상으로 잡는다. 선택이 없으면 문서 전체.
  function captureTarget(){ noteTarget=comparing?null:targetFrom(savedRange); showTarget(); }
  function clearTarget(){ noteTarget=null; showTarget(); }
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
    card.innerHTML='<div class="doc-ed-note-head"><strong>'+escapeHtml(n.author||'이름 없음')+'</strong><span>'+fmtTs(n.ts)+'</span>'+(n.resolved?'<span class="doc-ed-note-badge ok">해결됨</span>':'')+'</div>'
      +'<div class="doc-ed-note-where">'+where+(n.quote?'<q>'+escapeHtml(n.quote)+'</q>':'')+'</div>'
      +'<div class="doc-ed-note-text">'+escapeHtml(n.text)+'</div>'
      +(n.replies.length?'<div class="doc-ed-note-replies">'+n.replies.map(function(r){ return '<div class="doc-ed-note-reply"><strong>'+escapeHtml(r.author||'이름 없음')+'</strong><span>'+fmtTs(r.ts)+'</span><div>'+escapeHtml(r.text)+'</div></div>'; }).join('')+'</div>':'')
      +'<div class="doc-ed-note-actions"><button type="button" class="doc-ed-btn" data-act="reply">답글</button><button type="button" class="doc-ed-btn" data-act="resolve">'+(n.resolved?'다시 열기':'해결')+'</button><button type="button" class="doc-ed-btn ghost" data-act="remove">삭제</button></div>'
      +'<div class="doc-ed-note-replybox" hidden><textarea rows="2" placeholder="답글"></textarea><button type="button" class="doc-ed-btn primary" data-act="send">남기기</button></div>';
    return card;
  }
  function renderNotes(){
    var open=openCount(), count=$('doc-notesCount'), btn=$('doc-notesBtn'), list=$('doc-notesList'), chk=$('doc-notesShowResolved'), showResolved=!!(chk&&chk.checked), shown=[], i;
    if(count) count.textContent=open?String(open):''; if(btn) btn.title=open?('미해결 메모 '+open+'개'):'메모 보기·남기기';
    showTarget();
    if(!list) return; list.innerHTML='';
    for(i=0;i<notes.length;i++) if(showResolved||!notes[i].resolved) shown.push(notes[i]);
    if(!shown.length){ list.innerHTML='<p class="doc-ed-muted" style="font-size:13px;margin:6px 4px">'+(notes.length?'해결되지 않은 메모가 없습니다.':'메모가 없습니다. 본문을 선택하고 위에 남겨 보세요.')+'</p>'; return; }
    for(i=0;i<shown.length;i++) list.appendChild(noteCard(shown[i]));
  }
  bind('doc-notesBtn','click',function(){ setNotes(!body.classList.contains('doc-notes-open')); });
  bind('doc-notesClose','click',function(){ setNotes(false); var t=$('doc-notesBtn'); if(t) t.focus(); });
  bind('doc-ebNote','click',function(){ setNotes(true); var input=$('doc-notesInput'); if(input && !input.disabled) input.focus(); });
  bind('doc-notesInput','focus',captureTarget);
  bind('doc-notesTargetClear','click',clearTarget);
  bind('doc-notesAdd','click',function(){ var input=$('doc-notesInput'); if(!input) return; var n=addNote(input.value,noteTarget); if(n){ input.value=''; noteTarget=null; showTarget(); highlightCard(n.id); } });
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
      else if(a==='send'){ ta=card.querySelector('.doc-ed-note-replybox textarea'); if(replyNote(id,ta.value)) highlightCard(id); }
      else if(a==='resolve'){ n=findNote(id); if(n) resolveNote(id,!n.resolved); }
      else if(a==='remove'){ ok=true; try{ ok=window.confirm('이 메모와 답글을 삭제할까요?'); }catch(err){} if(ok) removeNote(id); }
    });
  })();
  content.addEventListener('click',function(e){ var m=e.target.closest?e.target.closest('mark.doc-ed-note'):null; if(m && content.contains(m)){ setNotes(true); highlightCard(m.getAttribute('data-doc-note')); } });
```

(b) `bind('doc-inspectorToggle','click',function(){ setMore(false);setInspector(...); });`에서 `setMore(false);` 뒤에 `setNotes(false);`를 추가한다.

(c) `document.addEventListener('pointerdown', ...)` 핸들러 안 `if(content.contains(e.target))setInspector(false);` 다음에 `if(content.contains(e.target) && window.matchMedia('(max-width:900px)').matches) setNotes(false);`를 추가한다.

(d) `keydown` 핸들러의 `if(e.key==='Escape'){setMore(false);setInspector(false);...}`에 `setNotes(false);`를 추가한다.

(e) 초기화 블록의 `reconcileNotes(); renderNotes();` 앞에 `var authorInput=$('doc-notesAuthor'); if(authorInput) authorInput.value=currentAuthor();`를 추가한다.

- [ ] **Step 6: 재빌드 후 테스트**

Run: `python3 assets/build-template.py && aside repl "$(cat tests/review-notes.js)"`
Expected: `"pass":true,"count":34`.

- [ ] **Step 7: 커밋**

```bash
git add assets/doc-editor.js assets/doc-editor.css assets/skeleton-src.html tests/review-notes.js assets/skeleton.html examples/demo.html tools/add-editor.html
git commit -m "메모 패널 UI: 컨트롤·툴바 버튼, 작성 상자의 선택 대상, 카드·답글·해결·삭제, 본문 하이라이트"
```

---

### Task 6: 비교 모드 엔진 (`doc-editor.js`: 상태·기준·렌더·원본 보호·되돌리기 API)

**Files:**
- Modify: `assets/doc-editor.js` (비교 블록, `setEdit`, `serialize`/`serializeReadOnly`의 원본 교체, `restoreHistory`·복구의 비교 종료, API)
- Modify: `tests/review-notes.js` (D절 추가)

**Interfaces:**
- Consumes: Task 2의 `DocEditorDiff.compare/render/revert`, Task 3의 `getContentHtml`, `lastSavedHtml`, `history`, Task 4의 `reconcileNotes`, `renderNotes`, `showTarget`.
- Produces (내부): `comparing`, `pristineHtml`, `cmp`, `baseline`(`{kind:'session'|'history'|'file', index?, label, html}`), `changeIndex`, `setCompare(on)`, `baselineCandidates()`, `pickDefaultBaseline()`, `renderCompare()`, `selectChange(i, scroll)`, `stepChange(dir)`, `revertChange()`, `withPristine(fn)`, `useBaseline(b)`, `loadBaselineFile(file)`.
- Produces (공개 API): `DocEditor.compare(on)`, `DocEditor.isComparing()`, `DocEditor.compareWith(kind, index)`(`'session'` | `'history', i`), `DocEditor.revertChange(i)`, `DocEditor.changes()` → `{counts, total, index, baseline:label}`.
- 바 마크업(id `doc-changes-bar` 등)은 Task 7에서 추가한다. 이 Task의 코드는 요소가 없어도 동작한다.

- [ ] **Step 1: D절 테스트 작성 (실패 확인용)**

`tests/review-notes.js` 마지막 `console.log(...)` 앞에 추가:

```js
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
    let src=await (await fetch('/assets/skeleton.html')).text();
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
await page.evaluate(()=>{ window.DocEditor.notes.list().forEach(n=>window.DocEditor.notes.remove(n.id)); Object.keys(localStorage).filter(k=>k.startsWith('docedit:autosave:')).forEach(k=>localStorage.removeItem(k)); });
```

- [ ] **Step 2: 실패 확인**

Run: `aside repl "$(cat tests/review-notes.js)"`
Expected: `FAIL: compare: session baseline ...` (`window.DocEditor.compare is not a function`).

- [ ] **Step 3: 엔진 수정**

(a) 메모 패널 블록 뒤(편집 모드 블록 앞)에 비교 블록을 추가:

```js
  /* ---------- 변경 사항 비교 (보기 전용 · 원본은 pristineHtml 문자열) ---------- */
  var cmp=null, baseline=null, changeIndex=-1, fileBaseline=null;
  function withPristine(fn){ if(!comparing) return fn(); var rendered=content.innerHTML; content.innerHTML=pristineHtml; try{ return fn(); } finally{ content.innerHTML=rendered; } }
  function baselineCandidates(){
    var list=[], cur=getContentHtml();
    if(cur!==lastSavedHtml) list.push({kind:'session',label:'마지막 저장 이후 (미저장 수정)',html:lastSavedHtml});
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
  function useBaseline(b){ baseline=b; var sel=$('doc-changesBase'); if(sel&&b) sel.value=baselineValue(b); renderCompare(); }
  function setCompare(on){
    if(on){
      if(comparing) return;
      if(!window.DocEditorDiff){ toast('비교 엔진이 없습니다. 크롬과 엔진을 함께 업데이트하세요.'); return; }
      if(editing) setEdit(false);
      captureBasePadding();
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
    if(typeof i==='number') changeIndex=i;
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
```

(b) `/* ---------- 편집 모드 ---------- */` 블록의 `setEdit`를 아래로 교체하고, 그 위에 여백 도우미를 둔다:

```js
  /* ---------- 편집 모드 ---------- */
  function captureBasePadding(){ if(!editing && !comparing){ originalPaddingTop=body.style.paddingTop; originalPaddingPixels=parseFloat(getComputedStyle(body).paddingTop)||0; } }
  function restoreBasePadding(){ body.style.paddingTop=originalPaddingTop; }
  function setEdit(on){
    if(on && comparing) setCompare(false);
    if(on && !editing) captureBasePadding();
    editing=on;
    content.setAttribute('contenteditable', on?'true':'false');
    body.classList.toggle('doc-editing', on);
    var t=$('doc-editToggle');
    if(t){ t.classList.toggle('on', on); t.textContent=on?'✎ 편집 중':'✎ 편집'; }
    try{ document.execCommand('styleWithCSS',false,true); }catch(e){}
    setMore(false);
    if(on) updateInspector();
    else { setInspector(false); if(!comparing) restoreBasePadding(); doAutosave(); }
    updateEditorLayout();
  }
```

(c) `updateEditorLayout`에서 `var controls=$('doc-controls'), bar=$('doc-editbar');` 를 `var controls=$('doc-controls'), bar=$('doc-editbar'), cbar=$('doc-changes-bar');` 로 바꾸고, `var bottom=...` 줄을 아래로 바꾼다:

```js
    var toolsHeight=editing?(bar?bar.offsetHeight:0):(comparing?(cbar?cbar.offsetHeight:0):0);
    var bottom=(mobile?controlHeight:0)+toolsHeight;
```

그리고 `if(editing) body.style.paddingTop=(originalPaddingPixels+bottom)+'px';`를 `if(editing||comparing) body.style.paddingTop=(originalPaddingPixels+bottom)+'px';`로 바꾼다. ResizeObserver 대상 배열 `['doc-controls','doc-editbar']`에 `'doc-changes-bar'`를 추가한다.

(d) `serialize()`의 `var clone=document.documentElement.cloneNode(true);`를 `var clone=withPristine(function(){ return document.documentElement.cloneNode(true); });`로 바꾼다. `serializeReadOnly()`의 같은 줄도 동일하게 바꾸고, 표 스타일 판정 `if(content.querySelector('.doc-ed-tablewrap,table.doc-ed-table'))`을 `if(/doc-ed-tablewrap|doc-ed-table/.test(getContentHtml()))`로 바꾼다.

(e) `restoreHistory(i)` 첫 줄에 `if(comparing) setCompare(false);`를 추가한다. `checkAutosave` 안 `rb.onclick=function(){` 첫 줄에도 `if(comparing) setCompare(false);`를 추가한다.

(f) 바 이벤트 연결(요소가 없으면 `bind`가 무시한다). 버튼/단축키 블록에 추가:

```js
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
```

`keydown`의 Escape 처리에 `setCompare(false);`를 추가한다. 인쇄 버튼 핸들러 `if(editing) setEdit(false); window.print();`는 그대로 둔다(비교 표시 상태로 인쇄 가능).

(g) 공개 API에 추가:

```js
    compare:function(on){ setCompare(on!==false); },
    isComparing:function(){ return comparing; },
    compareWith:function(kind,index){ if(!comparing) setCompare(true); if(!comparing) return; var c=baselineCandidates(), i; for(i=0;i<c.length;i++){ if(c[i].kind===kind && (kind!=='history'||c[i].index===index)){ useBaseline(c[i]); return; } } },
    revertChange:function(i){ return revertChange(i); },
    changes:function(){ return {counts:cmp?cmp.counts:{ins:0,del:0,mod:0,fmt:0}, total:changeTotal(), index:changeIndex, baseline:baseline?baseline.label:''}; },
```

- [ ] **Step 4: 재빌드 후 테스트**

Run: `python3 assets/build-template.py && node --check assets/doc-editor.js && aside repl "$(cat tests/review-notes.js)"`
Expected: `"pass":true,"count":41`.

- [ ] **Step 5: 커밋**

```bash
git add assets/doc-editor.js tests/review-notes.js assets/skeleton.html examples/demo.html tools/add-editor.html
git commit -m "비교 모드: 기준 선택·렌더·원본 문자열 보호·되돌리기와 DocEditor.compare API"
```

---

### Task 7: 변경 사항 바 UI (마크업·CSS·반응형)

**Files:**
- Modify: `assets/skeleton-src.html` (`#doc-changesBtn`, `#doc-changes-bar`)
- Modify: `assets/doc-editor.css` (바, diff 표식, 모바일)
- Modify: `tests/review-notes.js` (D2·E절 추가)

**Interfaces:**
- Consumes: Task 6의 `setCompare`, `useBaseline`, `stepChange`, `revertChange`, `loadBaselineFile`, `fillBaseOptions`, 바 이벤트 연결(`bind`).
- Produces: 마크업 id `doc-changesBtn`, `doc-changes-bar`, `doc-changesBase`, `doc-changesFile`, `doc-changesSummary`, `doc-changesPrev`, `doc-changesNext`, `doc-changesRevert`, `doc-changesClose`. body 클래스 `doc-changes`. 본문 클래스 `doc-ed-diff-ins/del/mod/fmt/run/del-wrap/active`, `ins.doc-ed-ins`, `del.doc-ed-del`.

- [ ] **Step 1: D2·E절 테스트 작성 (실패 확인용)**

`tests/review-notes.js` 마지막 `console.log(...)` 앞에 추가:

```js
// ---- D2. 비교 바 UI ----
await fresh();
check('compare ui: bar summary, baseline select, navigation, revert, close', await page.evaluate(async()=>{
  let src=await (await fetch('/assets/skeleton.html')).text();
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
  const source=await (await fetch('/examples/demo.html')).text(), out=[];
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
  const source=await (await fetch('/examples/demo.html')).text();
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
```

- [ ] **Step 2: 실패 확인**

Run: `aside repl "$(cat tests/review-notes.js)"`
Expected: `FAIL: compare ui: bar summary ...` (`doc-changesBtn` 없음).

- [ ] **Step 3: 마크업 (`assets/skeleton-src.html`)**

(a) `#doc-more-actions` 첫 줄(`다른 이름으로` 버튼 앞)에:

```html
  <button class="doc-ed-btn ghost" id="doc-changesBtn" title="저장본이나 파일과 비교해 바뀐 부분 표시">변경 사항</button>
```

(b) `#doc-editbar`의 닫는 `</div>` 바로 뒤에:

```html
<div id="doc-changes-bar" role="region" aria-label="변경 사항 비교">
  <span class="doc-ed-cb-label">비교 기준</span>
  <select class="doc-ed-esel" id="doc-changesBase" title="비교 기준"></select>
  <input id="doc-changesFile" type="file" accept=".html,.htm,text/html" hidden>
  <span id="doc-changesSummary" class="doc-ed-cb-summary"></span>
  <div class="doc-ed-g">
    <button class="doc-ed-eb" id="doc-changesPrev" title="이전 변경">◂ 이전</button>
    <button class="doc-ed-eb" id="doc-changesNext" title="다음 변경">다음 ▸</button>
    <button class="doc-ed-eb" id="doc-changesRevert" title="선택한 변경을 기준 버전으로 되돌리기" disabled>원래대로</button>
  </div>
  <button class="doc-ed-eb" id="doc-changesClose" title="비교 닫기">닫기</button>
</div>
```

- [ ] **Step 4: 스타일 (`assets/doc-editor.css`)**

(a) 메모 패널 블록 뒤에 추가:

```css
/* ---------- 변경 사항 바 (비교 모드에서만 · 편집 툴바 자리) ---------- */
#doc-changes-bar{
  position:fixed; top:0; left:0; right:0; z-index:2147483000;
  display:none; align-items:center; gap:8px; flex-wrap:wrap;
  background:var(--doc-ed-ink,#1f2937); color:#fff; padding:7px 14px;
  padding-right:calc(var(--doc-ed-controls-width,380px) + 28px);
  box-shadow:0 4px 14px rgba(16,24,40,.22);
  font-family:-apple-system,'Pretendard','Segoe UI',system-ui,sans-serif;
}
body.doc-changes #doc-changes-bar{ display:flex; }
#doc-changes-bar .doc-ed-g{ display:flex; align-items:center; gap:4px; }
#doc-changes-bar .doc-ed-cb-label{ font-size:11px; font-weight:700; color:#aeb6bf; }
#doc-changes-bar .doc-ed-esel{ max-width:320px; }
#doc-changes-bar .doc-ed-cb-summary{ font-size:12.5px; font-weight:700; }
#doc-changes-bar .doc-ed-eb:disabled{ opacity:.45; cursor:default; }
#doc-changesFile{ display:none!important; }
body.doc-changes #doc-content{ cursor:default; }
body.doc-changes #doc-content [data-doc-change]{ cursor:pointer; }
/* diff 표식: 문서 팔레트와 무관한 고정 시맨틱 색. 글자색은 문서 것 */
#doc-content .doc-ed-diff-ins{ background:rgba(34,197,94,.12); box-shadow:-4px 0 0 #22c55e; }
#doc-content .doc-ed-diff-del{ background:rgba(239,68,68,.10); box-shadow:-4px 0 0 #ef4444; text-decoration:line-through; text-decoration-color:rgba(239,68,68,.7); }
#doc-content .doc-ed-diff-mod{ box-shadow:-4px 0 0 #3b82f6; }
#doc-content .doc-ed-diff-fmt{ outline:1px dashed #8b5cf6; outline-offset:2px; }
#doc-content .doc-ed-diff-fmt::before{ content:'서식 변경'; display:inline-block; font-size:10px; line-height:1.4; font-weight:700; padding:0 5px; margin-right:6px; border-radius:4px; background:#ede9fe; color:#5b21b6; vertical-align:middle; letter-spacing:0; text-decoration:none; }
#doc-content ins.doc-ed-ins{ background:rgba(34,197,94,.25); text-decoration:underline; text-decoration-color:#16a34a; color:inherit; }
#doc-content del.doc-ed-del{ background:rgba(239,68,68,.18); text-decoration:line-through; color:inherit; }
#doc-content .doc-ed-diff-run{ display:inline; }
#doc-content .doc-ed-diff-del-wrap{ padding:4px 8px; }
#doc-content .doc-ed-diff-active{ outline:2px solid #2563eb; outline-offset:3px; }
```

(b) `@media(max-width:900px)` 블록 안, `#doc-editbar .doc-ed-ecol .mini{ ... }` 줄 다음에 추가:

```css
  #doc-changes-bar{ top:var(--doc-ed-controls-height,60px); padding:6px 8px; flex-wrap:nowrap; overflow-x:auto; overflow-y:hidden; gap:6px; overscroll-behavior-x:contain; -webkit-overflow-scrolling:touch; scrollbar-width:thin; }
  #doc-changes-bar > *{ flex:0 0 auto; }
  #doc-changes-bar .doc-ed-esel{ height:44px; font-size:16px; max-width:200px; }
  #doc-changes-bar .doc-ed-eb{ height:44px; min-width:44px; }
  #doc-changes-bar .doc-ed-cb-summary{ white-space:nowrap; }
```

- [ ] **Step 5: 재빌드 후 테스트**

Run: `python3 assets/build-template.py && aside repl "$(cat tests/review-notes.js)"`
Expected: `"pass":true,"count":46`.

- [ ] **Step 6: 커밋**

```bash
git add assets/skeleton-src.html assets/doc-editor.css tests/review-notes.js assets/skeleton.html examples/demo.html tools/add-editor.html
git commit -m "변경 사항 바 UI: 기준 선택·요약·이전/다음·원래대로·닫기, diff 표식 스타일, 반응형"
```

---

### Task 8: 변환기·패키지 검사·기존 스위트 반영

**Files:**
- Modify: `assets/doc-attach.js` (`chromeIds`, `bundleFrom` 정리, `convert`)
- Modify: `scripts/check-release.py` (필수 id, 저장소 검사)
- Modify: `tests/export-readonly.js`, `tests/attach-editor.js`, `tests/mobile-layout.js`

**Interfaces:**
- Consumes: Task 5·7의 크롬 id, Task 3의 출처 속성, Task 4의 `#doc-notes`.
- Produces: `DocEditorAttach.convert()` 결과에 크롬 9블록·`#doc-notes`가 들어가고 출처 속성이 없다. `check-release.py`가 새 계약을 검사한다.

- [ ] **Step 1: 기존 스위트에 새 계약 검증 추가 (실패 확인용)**

`tests/attach-editor.js`의 `check('one editor and empty history', ...)` 줄을 아래로 교체하고 그 다음 줄에 두 검증을 추가:

```js
  check('one editor, empty history and empty notes store',after.querySelectorAll('#doc-content').length===1 && after.querySelectorAll('#doc-editor-script').length===1 && after.getElementById('doc-history').textContent==='[]' && after.getElementById('doc-notes').textContent==='[]');
  check('all nine UI blocks are attached',['doc-controls','doc-editbar','doc-inspector','doc-notes-panel','doc-changes-bar','doc-editflag','doc-restore-banner','doc-history-modal','doc-toast'].every(id=>after.getElementById(id)));
  check('provenance attributes are not inherited',!parse(api.convert('<body data-doc-saved-by="누군가" data-doc-saved-at="2026-01-01"><p>본문</p></body>',bundle)).body.hasAttribute('data-doc-saved-by'));
```

같은 파일의 `fails('duplicate editor refused',output);` 다음 줄에:

```js
  fails('conflicting notes store refused','<script type="application/json" id="doc-notes">[]</script><p>본문</p>');
```

`tests/export-readonly.js`의 `check(name+': editor UI/code/history stripped', ...)` 셀렉터 문자열에 `,#doc-notes-panel,#doc-changes-bar,#doc-notes`를 덧붙인다. `check(name+': regular save still includes editor', ...)` 줄 다음에 추가:

```js
  w.prompt=()=>'QA';
  const noteHost=[...c.querySelectorAll('p')].find(p=>p.firstChild&&p.firstChild.nodeType===3), noteRange=d.createRange(); noteRange.setStart(noteHost.firstChild,0); noteRange.setEnd(noteHost.firstChild,1);
  const noteId=w.DocEditor.notes.add('내보내기 검증 메모',{range:noteRange});
  const roNotes=new DOMParser().parseFromString(w.DocEditor.getReadOnlyHTML(),'text/html');
  check(name+': export drops notes, marks, review UI and provenance',!!noteId && !roNotes.querySelector('#doc-notes,#doc-notes-panel,#doc-changes-bar,mark.doc-ed-note') && !roNotes.body.hasAttribute('data-doc-saved-by') && roNotes.getElementById('doc-content').textContent===c.textContent && !!c.querySelector('mark.doc-ed-note'));
  w.DocEditor.notes.remove(noteId);
```

`tests/mobile-layout.js`의 `check(`${width}x${height}: serialized UI closes`, ...)` 조건에 `&& !clean.body.classList.contains('doc-notes-open') && !clean.body.classList.contains('doc-changes')`를 덧붙인다.

- [ ] **Step 2: 실패 확인**

Run: `aside repl "$(cat tests/attach-editor.js)"`
Expected: `all nine UI blocks are attached` 실패(변환기가 두 블록을 모른다).

- [ ] **Step 3: `assets/doc-attach.js` 수정**

(a) `var chromeIds=[...]`를:

```js
  var chromeIds=['doc-controls','doc-editbar','doc-changes-bar','doc-inspector','doc-notes-panel','doc-editflag','doc-restore-banner','doc-history-modal','doc-toast'];
```

(b) `bundleFrom` 안 `if(id==='doc-toast')el.textContent='';` 줄 다음에 추가:

```js
      el.querySelectorAll('#doc-notesList,#doc-changesBase,#doc-changesSummary').forEach(function(b){b.innerHTML='';});
      var notesInput=el.querySelector('#doc-notesInput');if(notesInput)notesInput.textContent='';
      var notesAuthor=el.querySelector('#doc-notesAuthor');if(notesAuthor)notesAuthor.removeAttribute('value');
      var notesTarget=el.querySelector('#doc-notesTarget');if(notesTarget){notesTarget.classList.remove('has');var q=notesTarget.querySelector('.q');if(q)q.textContent='문서 전체';var x=notesTarget.querySelector('#doc-notesTargetClear');if(x)x.hidden=true;}
      var notesHint=el.querySelector('#doc-notesHint');if(notesHint)notesHint.hidden=true;
      var revert=el.querySelector('#doc-changesRevert');if(revert)revert.disabled=true;
```

(c) `convert` 안 설치 검사 `doc.querySelector('#doc-editor-script,#doc-editor-style,#doc-history,#doc-controls')`를 `doc.querySelector('#doc-editor-script,#doc-editor-style,#doc-history,#doc-notes,#doc-controls,#doc-notes-panel,#doc-changes-bar')`로 바꾼다. `doc.body.removeAttribute('data-doc-id');` 다음에 `doc.body.removeAttribute('data-doc-saved-by');doc.body.removeAttribute('data-doc-saved-at');`를 추가한다. 히스토리 저장소를 만드는 줄 다음에:

```js
    var notesStore=doc.createElement('script');notesStore.type='application/json';notesStore.id='doc-notes';notesStore.textContent='[]';doc.body.appendChild(notesStore);
```

- [ ] **Step 4: `scripts/check-release.py` 수정**

`expected = [...]` 목록을:

```python
    expected = ['doc-content', 'doc-controls', 'doc-editbar', 'doc-inspector', 'doc-notes-panel', 'doc-changes-bar', 'doc-editflag',
                'doc-restore-banner', 'doc-history-modal', 'doc-toast', 'doc-history', 'doc-notes', 'doc-attachBtn', 'doc-exportBtn',
                'doc-notesBtn', 'doc-changesBtn', 'doc-ebNote']
```

`assert doc.blocks['doc-history'].strip() == '[]', ...` 다음 줄에:

```python
        assert doc.blocks['doc-notes'].strip() == '[]', f'Example contains notes: {name}'
```

- [ ] **Step 5: 전체 검증**

Run:
```
python3 assets/build-template.py && python3 assets/build-template.py --check && python3 scripts/check-release.py && node --test tests/unit/*.test.js
```
Expected: 모두 통과, `Package validation passed.`

Run (서버 실행 중, 순서대로): `for t in review-notes browser-regression persistent-save mobile-layout export-readonly attach-editor; do aside repl "$(cat tests/$t.js)" | tail -1; done`
Expected: 여섯 줄 모두 `"pass":true`. 실패하면 해당 Task의 코드로 돌아가 고친다. 특히 `mobile-layout`의 `view page fits`(메모 버튼이 320px 한 줄에 들어가는지)와 `attach-editor`의 `body grid layout preserved`를 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add assets/doc-attach.js scripts/check-release.py tests/export-readonly.js tests/attach-editor.js tests/mobile-layout.js assets/skeleton.html examples/demo.html tools/add-editor.html
git commit -m "변환기·패키지 검사에 메모·변경 사항 크롬 반영, 기존 회귀 스위트 갱신"
```

---

### Task 9: 문서·버전 (1.6.0)

**Files:**
- Modify: `SKILL.md`, `references/guide.ko.md`, `README.ko.md`, `README.en.md`, `CHANGELOG.md`, `tests/README.md`

**Interfaces:**
- Consumes: 모든 이전 Task의 id·동작.
- Produces: 버전 문자열 `1.6.0`, 계약 문구 "9 UI blocks / 크롬 9블록", 저장소 2개, 스크립트 순서 `doc-attach.js + doc-diff.js + doc-editor.js`.

- [ ] **Step 1: `SKILL.md`(영문) 갱신**

- frontmatter `version: "1.5.0"` → `"1.6.0"`. description 끝에 ` Includes review tools: change comparison against saved versions and anchored notes with replies.`를 붙인다.
- "Editor integration contract" 절의 세 항목을 바꾼다:
  - `Keep all seven UI blocks: ...` → `Keep all nine UI blocks: \`doc-controls\`, \`doc-editbar\`, \`doc-changes-bar\`, \`doc-inspector\`, \`doc-notes-panel\`, \`doc-editflag\`, \`doc-restore-banner\`, \`doc-history-modal\`, and \`doc-toast\`.`
  - 히스토리 항목 뒤에 `- Keep \`<script type="application/json" id="doc-notes">[]</script>\` next to the history store. Preserve existing notes when updating an existing editor. The engine creates an empty store if it is missing.`
  - `\`#doc-editor-script\` contains \`assets/doc-attach.js\` followed by \`assets/doc-editor.js\`` → `\`#doc-editor-script\` contains \`assets/doc-attach.js\`, \`assets/doc-diff.js\`, then \`assets/doc-editor.js\`, in that order, within one script element.`
- "Saving, backup, and export" 절 끝에 새 절을 추가:

```markdown
## Review tools (1.6.0)

- **Notes:** **메모** opens a side panel. Select body text and write in the box to attach a note to that text (`<mark class="doc-ed-note" data-doc-note="ID">`); without a selection the note applies to the whole document. Notes, replies, and resolved state live in `#doc-notes` inside the file. Anyone with the file can reply, resolve, or delete. Read-only export unwraps marks and drops the store.
- **Change comparison:** **변경 사항** compares the current body with a baseline and overlays additions (green), deletions (red strikethrough), modified paragraphs (word-level marks), and format-only changes. Baselines: the state at the last save (when unsaved edits exist), any saved version in the history (labelled by author and time), or an HTML file. The default baseline is the most recent version saved by someone other than the current saver. **원래대로** reverts the selected change; the result still needs a regular save. Comparison is view-only; saving or exporting while comparing writes the clean body.
- **Author name:** the editor asks for a name once per browser (first note or first save) and stores it in `localStorage` as `docedit:author`. It can be changed in the notes panel. The name is not stored in the document except as the provenance of a saved version (`data-doc-saved-by`, `data-doc-saved-at` on `body`) and in history entries (`author`).
- **Backup safety:** the first regular save assigns `data-doc-id` so browser backups are keyed per document instead of per path. Backups record the provenance of the body they were made from; when a backup does not match the opened file, the restore banner says so, and restoring keeps the current body in the history first.
- On screens up to 900px the **메모** control hides while editing (use the toolbar **메모** button) and **변경 사항** is in **더보기**.
```

- "Verification" 절에 두 항목 추가: `- Parse \`DocEditor.getHTML()\` while a comparison is open: no \`data-doc-change\`, \`ins.doc-ed-ins\`, or \`del.doc-ed-del\` may appear in the body.` 와 `- Add a note, reload, and confirm the note and its mark survive in the saved file; export and confirm both are gone.`
- "Maintenance" 절의 `replace the engine CSS/script and seven UI blocks together` → `replace the engine CSS/script and nine UI blocks together, and add the empty \`#doc-notes\` store`.

- [ ] **Step 2: `references/guide.ko.md` 갱신**

- 첫 문단의 기능 나열 끝에 `, 메모(선택 영역·답글·해결), 변경 사항 비교(저장본·파일 기준, 되돌리기)`를 추가한다.
- "편집 계약" 2항을 `#doc-controls·#doc-editbar·#doc-changes-bar·#doc-inspector·#doc-notes-panel·#doc-editflag·#doc-restore-banner·#doc-history-modal·#doc-toast` 9블록으로, 3항을 `#doc-history`와 `#doc-notes` 두 저장소로, 4항의 인라인 순서를 `doc-attach.js + doc-diff.js + doc-editor.js`로 바꾼다. "수동 통합 시 ... 크롬 7블록"도 9블록으로 바꾼다.
- "스킬 자체를 유지보수한다면" 문단에 `비교 엔진은 assets/doc-diff.js에서 수정한다. 순수 함수는 node --test tests/unit/*.test.js 로 검사한다.`를 추가한다.
- "배포용 HTML 저장" 절에 `- 메모 저장소·본문 mark·메모 패널·변경 사항 바·저장 출처 속성(data-doc-saved-by/at)을 제거한다.`를 추가한다.
- "모바일 편집 UI" 절에 `- 메모 버튼은 컨트롤 첫 줄에 있고 편집 중에는 숨긴다(툴바의 메모 버튼 사용). 변경 사항은 더보기 안에 있다. 메모 패널은 현재 서식 패널과 같은 자리를 쓰며 둘 중 하나만 열린다.`를 추가한다.
- "디자인 중립 / 테마" 절 끝에 `- 메모 하이라이트와 비교 표식은 문서 팔레트와 무관한 고정 색(노랑·초록·빨강·파랑·보라)을 쓰고 글자색은 문서 것을 따른다.`를 추가한다.
- "검증" 절 앞에 세 절을 추가(스펙 5·6·7·8절을 사용자 관점으로 요약):

```markdown
## 메모

- 컨트롤의 **메모**(미해결 개수 표시) 또는 편집 툴바의 **메모**로 패널을 연다. 본문을 선택한 뒤 작성 상자에 쓰면 그 부분에 붙고, 선택이 없으면 문서 전체 메모다. 대상 표시의 ×로 문서 전체 메모로 바꿀 수 있다.
- 메모 내용·답글·해결 상태는 파일 안 `#doc-notes`에, 위치는 본문의 `<mark class="doc-ed-note" data-doc-note="ID">`에 저장된다. 여러 문단 선택은 문단마다 같은 ID의 mark를 쓴다.
- 카드를 누르면 본문 위치로 이동하고, 본문의 하이라이트를 누르면 카드가 열린다. 답글·해결·다시 열기·삭제는 보기 모드에서도 된다. 삭제는 mark도 함께 푼다.
- 히스토리 복원이나 서식 지우기로 mark가 사라진 메모는 "위치 없음"으로 인용문과 함께 남는다. 저장소에 없는 mark는 열 때 풀린다.
- 자동저장 백업에는 메모도 함께 들어가고 복구 시 같이 돌아온다. 배포용 HTML에는 메모·mark·패널이 없다.

## 변경 사항 보기

- 더보기(데스크톱은 컨트롤 인라인)의 **변경 사항**을 누르면 보기 전용 비교 모드가 된다. 상단 바에서 기준을 고른다: 마지막 저장 이후(미저장 수정이 있을 때), 히스토리 저장본(이름 · 시각 · 제목), 파일 선택.
- 기본 기준: 미저장 수정이 있으면 마지막 저장, 아니면 현재 문서를 저장한 사람과 다른 사람이 저장한 가장 최근 저장본, 없으면 가장 최근 저장본. 상대가 여러 번 저장했어도 "내가 보낸 버전"이 잡힌다.
- 문단 단위로 정렬해 추가는 초록, 삭제는 빨강 취소선, 텍스트가 절반 이상 비슷한 수정은 단어 단위 표시, 글자는 같고 서식·태그만 바뀐 문단은 "서식 변경"으로 표시한다. 메모 하이라이트는 차이로 잡지 않는다.
- 이전/다음으로 변경을 오가고(변경 클릭도 선택) **원래대로**로 선택한 변경을 기준 버전으로 되돌린다. 되돌린 결과는 저장해야 파일에 반영된다.
- 비교 중 저장·배포용 저장·인쇄는 가능하며 저장본에는 비교 표식이 남지 않는다. 편집 진입·히스토리 복원·자동저장 복구는 비교를 먼저 닫는다. Escape로도 닫는다.
- 한계: 표 열 추가 같은 구조 변경은 칸 단위로만 보이고, 이미지·SVG는 통째 교체로 보인다. 변경이 아주 많으면 전체 교체로 표시한다.

## 이름·저장 출처·브라우저 기록 안전장치

- 첫 메모 또는 첫 저장 때 이름을 한 번 묻고 브라우저(`docedit:author`)에 기억한다. 비우면 익명으로 기억해 다시 묻지 않는다. 메모 패널의 이름 칸에서 바꾼다. 문서에는 이름 목록을 넣지 않는다.
- 저장하면 body에 `data-doc-saved-by`·`data-doc-saved-at`(현재 본문의 출처)를 기록하고, 다음 저장에서 이전 본문이 히스토리에 들어갈 때 그 출처가 항목의 `author`·`ts`가 된다. 히스토리 모달과 비교 기준 목록에 이름이 표시된다. 다른 사람이 저장한 문서를 열면 토스트로 알려 준다.
- 첫 저장에서 `data-doc-id`를 만들어 자동저장 백업을 경로가 아닌 문서별로 구분한다(경로 키 백업은 새 키 백업 성공 후 정리). 백업에는 만들 당시의 출처를 기록하고, 지금 연 파일과 출처가 다르면 배너에 "다른 저장본에서 만든 백업"이라고 알린다. 복구 전에는 현재 본문을 "복구 전:" 항목으로 히스토리에 남긴다.
- 메모·비교 데이터는 브라우저가 아니라 파일 안에 있다. 브라우저에 새로 남는 것은 이름뿐이다.
```

- 검증 스니펫 아래 "추가 육안 확인"에 `메모 남기기·답글·해결, 변경 사항에서 기준 선택·원래대로·닫기 후 본문 원상 복구`를 덧붙인다. 체크리스트의 "크롬 마크업 7블록 + `#doc-history`"를 "크롬 마크업 9블록 + `#doc-history` + `#doc-notes`"로 바꾼다.

- [ ] **Step 3: README·CHANGELOG·tests/README**

`README.ko.md`: "현재 버전은 **1.5.0**" → **1.6.0**. "주요 기능과 저장 방식" 목록에 추가:

```markdown
- **메모:** 본문을 선택해 메모를 남기고 답글·해결로 주고받습니다. 메모는 파일 안에 저장되며 배포용 HTML에는 들어가지 않습니다.
- **변경 사항:** 돌아온 문서에서 저장본이나 다른 파일과 비교해 추가·삭제·수정·서식 변경을 본문 위에 표시하고, 마음에 안 드는 변경은 원래대로 되돌립니다.
- **이름과 저장 기록:** 첫 메모나 첫 저장 때 이름을 한 번 물어 브라우저에 기억하고, 저장본마다 누가 언제 저장했는지 남깁니다.
```

그리고 "일반 저장 HTML에는 이전 본문이 히스토리로 남을 수 있습니다." 문장 뒤에 `첫 저장에서 문서 ID를 부여해 브라우저 백업을 문서별로 구분하고, 다른 저장본에서 만든 백업은 복구 전에 알려 줍니다.`를 추가한다.

`README.en.md`: 버전 문구를 1.6.0으로 바꾸고 기능 목록에 같은 세 항목의 영문을 추가:

```markdown
- **Notes:** select text and leave a note; others reply or resolve it. Notes live inside the file and are dropped from the read-only export.
- **Changes:** compare a returned document with a saved version or another file, see additions, deletions, edits, and format changes over the body, and revert any change.
- **Author and provenance:** the editor asks for your name once per browser and records who saved each version.
```

`CHANGELOG.md` 맨 위에:

```markdown
## 1.6.0

- Add anchored notes with replies and resolution, stored in the file (`#doc-notes`) and shown in a side panel.
- Add change comparison against saved versions, the last save, or an HTML file, with per-change revert.
- Ask for an author name once per browser; record save provenance and history authors.
- Assign a document ID on the first save, record backup provenance, warn on mismatched backups, and keep the current body in history before restoring.
- Add `assets/doc-diff.js` (engine order: attach, diff, editor) and two UI blocks (`doc-notes-panel`, `doc-changes-bar`).
```

`tests/README.md`: "Coverage:" 줄 뒤에 `review-notes` 스위트 설명과 Node 단위 테스트 실행법을 추가:

```markdown
`review-notes.js` covers the diff engine, author prompt, provenance, backup safety, notes (API and panel), comparison mode (API and bar), and narrow layouts. Stub `window.prompt` in any new browser test that saves or adds notes. Pure diff functions also have Node tests:

```sh
node --test tests/unit/*.test.js
```
```

`for name in [...]` 목록에 `'review-notes'`를 추가한다.

- [ ] **Step 4: 검사와 커밋**

Run: `python3 scripts/check-release.py && grep -rnE "—|–" SKILL.md README.ko.md README.en.md CHANGELOG.md references/guide.ko.md tests/README.md || echo "no dashes"`
Expected: `Package validation passed.` 그리고 `no dashes`.

```bash
git add SKILL.md references/guide.ko.md README.ko.md README.en.md CHANGELOG.md tests/README.md
git commit -m "문서: 1.6.0 메모·변경 사항·이름·백업 안전장치 안내, 계약 9블록"
```

---

### Task 10: 로컬 스킬 복사본 동기화 (`~/.claude/skills/html-doc`, `~/.agents/skills/html-doc`)

**Files:**
- Modify (저장소 밖): `~/.claude/skills/html-doc/{assets,examples,tools,tests}/`, `~/.claude/skills/html-doc/SKILL.md`, `~/.claude/skills/html-doc/REVIEW.md`, `~/.agents/skills/html-doc/` 전체

**Interfaces:**
- Consumes: Task 1~9의 결과물.
- Produces: 두 로컬 복사본이 저장소와 같은 엔진·예시·도구·테스트를 갖는다. 로컬 SKILL.md는 저장소 `references/guide.ko.md` 본문에 한국어 frontmatter(version 1.6.0)와 줄표 금지 규칙·체크리스트 항목을 더한 형태다.

- [ ] **Step 1: 동기화 전 상태 확인**

Run: `diff -rq --exclude=.DS_Store ~/html-doc-release/html-doc/assets ~/.claude/skills/html-doc/assets | head`
Expected: `doc-diff.js`가 로컬에 없고 나머지 파일이 다르다고 나온다(동기화 필요).

- [ ] **Step 2: 엔진·예시·도구·테스트 복사**

```bash
for dest in ~/.claude/skills/html-doc ~/.agents/skills/html-doc; do
  rsync -a --delete --exclude .DS_Store ~/html-doc-release/html-doc/assets/ "$dest/assets/"
  rsync -a --delete --exclude .DS_Store ~/html-doc-release/html-doc/examples/ "$dest/examples/"
  rsync -a --delete --exclude .DS_Store ~/html-doc-release/html-doc/tools/ "$dest/tools/"
  rsync -a --delete --exclude .DS_Store ~/html-doc-release/html-doc/tests/ "$dest/tests/"
done
```

로컬 `tests/`의 이전 변형(8772·18764 포트, doc1~doc3 별칭 버전)은 저장소의 이식 가능한 버전으로 대체한다.

- [ ] **Step 3: 로컬 SKILL.md 재구성**

```bash
python3 - <<'PY'
from pathlib import Path
guide = Path.home()/'html-doc-release/html-doc/references/guide.ko.md'
body = guide.read_text(encoding='utf-8').split('\n', 2)[2]   # 첫 줄(인용 안내)과 빈 줄 제거
front = '''---
name: html-doc
version: 1.6.0
description: Use when 편집 가능한 HTML 문서를 만들 때. 보고서·안내문·공지·레터·설명서 등 어떤 HTML이든 배포 후 사용자가 글자·서식을 직접 고치고 같은 파일에 저장하게 하고 싶을 때, 이미 만든 정적 HTML에 편집·저장 기능을 얹고 싶을 때, 문서 디자인은 자유롭게 두고 수정 기능만 넣고 싶을 때, 주고받은 문서의 변경 부분 표시와 메모(답글·해결)가 필요할 때. (도식은 html-diagram, 발표자료는 html-deck)
---

'''
punct = '''## 문장 부호

- **줄표(`—`) 금지.** 문서 어디에도 em dash(`—`)·en dash(`–`)를 쓰지 않는다. 쉼표·콜론·괄호로 바꾸거나 문장을 나눈다.
  예: `A — B` → `A: B` / `A(B)` / `A. B`

'''
marker = '## 체크리스트 (산출 전)\n\n'
assert body.count(marker) == 1
body = body.replace(marker, punct + marker + '- [ ] 본문에 줄표(`—`, `–`) 0개\n')
for dest in ['.claude/skills/html-doc', '.agents/skills/html-doc']:
    (Path.home()/dest/'SKILL.md').write_text(front + body, encoding='utf-8')
print('SKILL.md synced')
PY
```

- [ ] **Step 4: 로컬 REVIEW.md에 1.6.0 항목 추가**

`~/.claude/skills/html-doc/REVIEW.md` 끝에:

```markdown

## 1.6.0: 변경 사항 비교·메모·이름·백업 안전장치 (2026-09-14)

- 메모: 선택 영역 mark 앵커 + `#doc-notes` 저장소, 답글·해결·삭제, 패널·카드·하이라이트, 위치 없음 처리, 백업 포함, 배포본 제거.
- 변경 사항: `assets/doc-diff.js`(단위 정렬 Myers, 수정 쌍 Dice 0.5, 단어 diff, 서식 감지, 렌더·되돌리기). 기준은 마지막 저장·히스토리·파일. 비교 중 저장·내보내기는 원본 문자열 사용.
- 이름·출처: `docedit:author` 1회 prompt, `data-doc-saved-by/at`, 히스토리 `author`. 다른 사람이 저장한 문서 열면 토스트.
- 안전장치: 첫 저장에서 `data-doc-id` 부여(경로 키 백업 정리), 백업 출처 기록·불일치 배너, 복구 전 히스토리 보존, 히스토리 중복 방지.
- 계약: 크롬 9블록(`#doc-notes-panel`, `#doc-changes-bar`), 저장소 2개, 스크립트 순서 attach + diff + editor. 변환기·check-release 반영.
- 검증: Node 단위 13개, Aside `review-notes.js` 46개, 기존 5개 스위트 재통과. 검증 결과의 실제 개수는 실행 로그를 따른다.
```

- [ ] **Step 5: 확인**

Run: `cd ~/.claude/skills/html-doc && python3 assets/build-template.py --check && diff -rq --exclude=.DS_Store --exclude=SKILL.md --exclude=REVIEW.md --exclude=.git --exclude=docs --exclude=scripts --exclude=references --exclude=README.md --exclude=README.ko.md --exclude=README.en.md --exclude=CHANGELOG.md --exclude=LICENSE --exclude=.gitignore . ~/html-doc-release/html-doc && diff -rq --exclude=.DS_Store ~/.claude/skills/html-doc ~/.agents/skills/html-doc`
Expected: `--check` 세 파일 "최신 상태", 두 diff 모두 출력 없음(REVIEW.md는 .agents 쪽에도 복사되어 있으므로 마지막 diff에서 다르면 `cp`로 맞춘다).

- [ ] **Step 6: 마무리 보고**

저장소에는 커밋하지 않는 단계다. 사용자에게 브랜치 `feature/review-notes`의 커밋 목록과 검증 결과(스위트별 개수), 남은 결정(main 병합·push·GitHub 릴리스 ZIP 생성 `python3 scripts/package-release.py`)을 보고한다.
