# html-doc 1.6.0 설계: 변경 사항 비교와 메모

작성일: 2026-09-14. 대상 저장소: tonywjs/html-doc. 브랜치: feature/review-notes.

## 1. 배경과 목표

문서를 다른 사람에게 보내면 그 사람이 편집기로 고쳐서 돌려준다. 돌아온 문서에서 **어디가 바뀌었는지** 한눈에 보이고, 고친 사람이 **왜 고쳤는지 메모**를 남길 수 있어야 한다. 두 기능 모두 HTML 파일 하나에 담겨 서버·확장 프로그램 없이 동작해야 한다.

목표:

1. 변경 사항 보기: 기준 버전과 현재 본문을 비교해 추가·삭제·수정·서식 변경을 본문 위에 겹쳐 표시하고, 변경 단위로 되돌릴 수 있다.
2. 메모: 본문 일부(또는 문서 전체)에 메모를 남기고 답글·해결·삭제할 수 있다.
3. 이름: 메모와 저장 기록에 누가 남겼는지 표시한다. 이름은 브라우저에 한 번 기억한다.
4. 안전장치: 브라우저에 남는 기록이 다른 문서의 기록을 덮어쓰거나 잘못 복구되지 않게 한다.

## 2. 범위 밖

- Word 방식의 실시간 변경 추적(타이핑 즉시 기록, 삭제 글자 잔존)은 하지 않는다.
- 서버 동기화, 실시간 협업, 사용자 인증은 없다. 이름은 자기 신고이며 검증하지 않는다.
- 배포용 HTML에는 메모·비교 표시가 남지 않는다. 검토용 문서와 배포본은 구분한다.
- 편집기 UI 언어는 한국어를 유지한다.

## 3. 용어

- 본문: `#doc-content`의 innerHTML.
- 원본 문자열(pristine): 비교 모드 중 화면에는 표시가 겹쳐 있지만 저장·자동저장·내보내기에 쓰는 진짜 본문 HTML 문자열.
- 저장본: 파일 안 `#doc-history` 항목. 저장할 때 직전 본문이 들어간다.
- 출처(provenance): 현재 본문을 마지막으로 저장한 사람과 시각. `body[data-doc-saved-by]`, `body[data-doc-saved-at]`.
- 단위(unit): 비교의 최소 블록. 5.3 참고.

## 4. 사용 흐름

1. A가 문서를 작성하고 저장한다. 첫 저장에서 이름을 한 번 묻고(prompt), 문서에는 `data-doc-id`와 출처(A, 시각)가 기록된다.
2. A가 파일을 R에게 보낸다. R이 열어 편집하고 메모를 남기고 저장한다. 저장하면 A의 버전이 히스토리에 author=A로 들어가고 출처는 R로 바뀐다.
3. A가 돌아온 파일을 연다. 출처가 자신과 다르고 히스토리가 있으므로 토스트가 "R이(가) 저장한 문서입니다. 변경 사항으로 수정된 부분을 볼 수 있습니다"라고 안내한다. 메모 버튼에는 미해결 개수가 보인다.
4. A가 변경 사항을 연다. 기본 기준은 "A가 저장한 가장 최근 저장본"이라 R의 수정만 보인다. 마음에 안 드는 문단은 원래대로 되돌린다.
5. A가 메모에 답글을 달거나 해결로 표시하고 저장한다. 다시 R에게 보낼 수 있다.

## 5. 변경 사항 보기

### 5.1 진입·종료와 상태 규칙

- 진입: `#doc-changesBtn`(더보기 영역 첫 버튼, 데스크톱에서는 컨트롤에 인라인 표시). 편집 중이면 `setEdit(false)` 후 진입.
- 상태: `body.doc-changes`. 본문은 `contenteditable=false`. 상단에 `#doc-changes-bar` 표시. 메모 패널·히스토리·저장 버튼은 그대로 쓸 수 있다.
- 원본 문자열은 진입 시 `pristineHtml`로 보관한다. 화면의 `#doc-content`에는 비교 렌더 결과를 넣는다.
- 본문을 읽는 모든 경로는 `getContentHtml()`을 쓴다. 비교 모드면 `pristineHtml`, 아니면 `content.innerHTML`. 자동저장(`writeBackup`, `doAutosave`), 저장(`pushHistoryIfChanged`, `saveToFile`), 제목 추출, 자동저장 비교가 여기에 해당한다.
- `serialize()`와 `serializeReadOnly()`는 문서 전체를 복제하므로, 비교 모드면 복제 직전에 `content.innerHTML`을 원본으로 잠시 되돌렸다가 복제 후 렌더 결과로 복구한다. 저장본·배포본에 비교 표시는 절대 남지 않는다.
- 다음 동작은 시작할 때 비교 모드를 먼저 닫는다: 편집 모드 진입, 히스토리 복원, 자동저장 복구. 저장·배포용 저장·HTML에 편집기 추가·인쇄는 비교 모드를 유지한다.
- 종료: 바의 닫기, Escape, 위 동작들. 종료 시 `content.innerHTML = pristineHtml`, 메모 정합성 갱신(6.5), 레이아웃 갱신.

### 5.2 비교 기준

바의 `#doc-changesBase` 드롭다운에 다음 순서로 나열한다.

1. `session`: "마지막 저장 이후 (미저장 수정)". 진입 시점에 `getContentHtml() !== lastSavedHtml`일 때만 표시. 기준 HTML은 진입 시점의 `lastSavedHtml`을 복사한 문자열이며, 비교 중 저장해도 바뀌지 않는다.
2. `history:i`: 히스토리 항목. 표시는 `이름 · 시각 · 제목`. 이름이 없으면 `이름 없음`.
3. `file`: "파일 선택…". 선택하면 `DocEditorAttach.readFile`로 읽어 DOMParser로 파싱하고 `#doc-content`(없으면 body)의 innerHTML을 기준으로 쓴다. 표시는 `파일: 이름`. 파일을 다시 고르려면 항목을 다시 선택한다.

기본값(진입 시 한 번만 계산, 이후 되돌리기로 재렌더해도 유지):

1. 미저장 수정이 있으면 `session`.
2. 아니면 `me = body.dataset.docSavedBy || ''`로 두고, 히스토리에서 `author !== me`인 가장 최근 항목.
3. 없으면 히스토리 첫 항목.
4. 히스토리가 비어 있으면 기준 없음. 요약에 "비교할 저장본이 없습니다. 파일을 선택해 비교할 수 있습니다"를 표시하고 본문은 원본 그대로 둔다.

### 5.3 비교 알고리즘

입력: 기준 HTML `B`, 현재 HTML `C`(원본 문자열). 둘 다 분리된 `div`에 파싱한다.

**정규화**: 비교용 복제본에서 `mark.doc-ed-note`를 풀고(자식만 남김), 공백을 한 칸으로 접고, nbsp를 공백으로 바꾼다. 화면 렌더에는 정규화하지 않은 C 트리를 쓴다.

**단위 추출** `units(root)`:

- BLOCK 태그 집합: address, article, aside, blockquote, caption, dd, details, div, dl, dt, fieldset, figcaption, figure, footer, form, h1~h6, header, hr, li, main, nav, ol, p, pre, section, summary, table, tbody, td, tfoot, th, thead, tr, ul.
- 컨테이너의 자식을 순서대로 본다. BLOCK 요소를 만나면 그 안에 BLOCK 자손이 있으면 재귀(컨테이너), 없으면 **블록 단위**. BLOCK이 아닌 노드(텍스트·인라인 요소)는 연속 구간을 모아 **인라인 조각 단위**(run)로 만든다. 공백만 있고 요소가 없는 조각은 버린다. 주석 노드는 무시한다.
- 단위 속성: `type`(block|run), `tag`(블록 태그 또는 `run`), `nodes`(블록은 요소 1개, 조각은 노드 배열), `path`(root에서 childNodes 인덱스 경로. 조각은 부모 경로 + 시작·끝 인덱스), `text`(정규화 텍스트), `nhtml`(정규화 HTML), `sig`(정렬 키).
- `sig` = `tag + '|' + text`. text가 비어 있으면(hr, svg만 있는 figure 등) `tag + '||' + nhtml`.

**정렬**: 두 `sig` 배열에 Myers O(ND) diff를 적용해 eq/del/ins 열을 얻는다. D가 3000을 넘으면 중단하고 전체를 del+ins로 취급한다(문서 전체 교체로 표시).

**수정 쌍 묶기**: 연속된 del 묶음과 ins 묶음(replace 영역)에서 del을 순서대로 보며, 아직 짝이 없는 ins 중 현재 포인터 이후에서 처음으로 유사도 0.5 이상인 것과 짝짓는다(단조 증가). 유사도는 `text`를 공백으로 나눈 단어 집합의 Dice 계수. 둘 다 text가 비어 있으면 `tag`가 같을 때 1, 아니면 0. 짝지은 결과는 C 순서를 지키며 출력한다: 짝 앞에 남은 ins는 ins로, 짝은 mod, 짝 없는 del은 del로, 남은 ins는 ins로.

**분류**: 짝의 `text`가 같으면 `fmt`(서식·태그 변경), 다르면 `mod`. `mod`이면서 태그 토큰도 다르면 `fmt` 표식을 함께 붙인다.

**단어 diff**(mod 단위): C의 실제 innerHTML(mark 포함)과 B의 innerHTML을 토큰으로 나눈다. 토큰은 `tag`(`<…>`), `ws`(공백 연속), `word`(공백과 `<`를 제외한 연속 문자). 비교 시 ws는 모두 같다고 보고 tag·word는 문자열 그대로 비교한다. Myers diff 후 렌더:

- eq: C 토큰 그대로.
- ins: tag면 열려 있는 ins/del 래퍼를 닫고 그대로 출력(메모 mark도 여기에 해당해 화면에 남는다). word/ws면 `<ins class="doc-ed-ins">`를 열어 출력.
- del: tag면 건너뛴다(img 등 void 시각 요소는 `<del>` 안에 출력, br은 건너뜀). word/ws면 `<del class="doc-ed-del">`을 열어 출력.
- eq·ins tag 토큰을 만나면 먼저 열린 래퍼를 닫는다. 래퍼는 텍스트와 void 요소만 감싸므로 중첩이 깨지지 않는다.
- 공백만으로 이루어진 ins/del 연속은 래퍼 없이 출력한다.

### 5.4 렌더링

C를 새로 파싱한 트리에 표식을 넣고 `content.innerHTML`로 교체한다. 각 변경 단위 요소(또는 래퍼)에 `data-doc-change="i"`를 붙인다.

- ins 블록: 요소에 `doc-ed-diff-ins`. ins 조각: 노드들을 `<span class="doc-ed-diff-run doc-ed-diff-ins">`로 감싼다.
- del 블록: B 요소를 깊은 복제해 `doc-ed-diff-del`을 붙이고 내부 `id` 속성을 제거해 삽입한다. del 조각: `<span class="doc-ed-diff-run doc-ed-diff-del">`에 B 노드 복제.
- mod: C 요소의 innerHTML을 단어 diff 결과로 바꾸고 `doc-ed-diff-mod`. 조각은 `doc-ed-diff-run doc-ed-diff-mod` 래퍼.
- fmt: `doc-ed-diff-fmt`. 조각은 래퍼.
- del 삽입 위치: 삭제 단위가 B 트리에서 어느 컨테이너에 있었는지를 부모 경로(`path`)로 판단한다. 다음 정렬 단위(eq/mod/fmt)의 B 쪽 부모가 같으면 그 C 요소 앞에, 아니면 직전 정렬 단위의 B 쪽 부모가 같으면 그 C 요소 뒤(그 사이에 같은 부모로 그린 노드가 있으면 그 뒤)에 둔다. 둘 다 아니면(컨테이너 자체가 사라진 경우) 다음 C 단위의 첫 노드 앞, 없으면 마지막으로 그린 노드 뒤, 그것도 없으면 root 끝. 목록의 마지막 항목, 표의 한 칸, 섹션 끝 문단이 삭제되어도 원래 컨테이너 안에 표시된다.
- 부모 호환: 삽입 부모가 B 태그를 담을 수 없으면(td/th는 tr, li는 ul/ol/menu, dt/dd는 dl, tr은 tbody/thead/tfoot/table, caption은 table 안이어야 함) `<div class="doc-ed-diff-del doc-ed-diff-del-wrap" data-doc-tag="li">`로 감싸 B innerHTML만 넣는다.
- 스타일: ins 초록 배경·밑줄, del 빨강 배경·취소선, 블록 ins/del은 왼쪽 두꺼운 테두리와 옅은 배경, mod는 왼쪽 파란 테두리, fmt는 점선 테두리와 작은 "서식" 표식(`::before`). 선택된 변경(`doc-ed-diff-active`)은 진한 외곽선. 색은 `--doc-ed-*` 변수를 쓰지 않고 고정 시맨틱 색(초록·빨강·파랑)을 쓴다. 글자색은 상속.

### 5.5 상단 바와 탐색

`#doc-changes-bar`: 기준 드롭다운 `#doc-changesBase`, 숨은 파일 입력 `#doc-changesFile`, 요약 `#doc-changesSummary`(`추가 N · 삭제 N · 수정 N · 서식 N`, 없으면 `차이 없음`), 이전 `#doc-changesPrev`, 다음 `#doc-changesNext`, 원래대로 `#doc-changesRevert`, 닫기 `#doc-changesClose`.

- 데스크톱: 편집 툴바처럼 상단 고정 어두운 띠, 오른쪽에 컨트롤 폭만큼 여백. 모바일: 컨트롤 아래 한 줄, 가로 스크롤.
- `updateEditorLayout()`은 `body.doc-changes`일 때 바 높이를 `--doc-ed-tools-bottom`과 body 상단 여백에 더한다. ResizeObserver 대상에 바를 추가한다.
- 변경 선택: 이전/다음은 `data-doc-change` 순서로 순환하며 `scrollIntoView({block:'center'})`와 `doc-ed-diff-active`를 적용한다. 변경 요소 클릭도 선택한다. 선택이 없으면 원래대로 버튼은 비활성.
- 인쇄 시 바는 숨기고 본문 표식은 그대로 인쇄된다.

### 5.6 원래대로

선택된 변경 `i`의 연산을 원본 모델에 적용한다. 모델은 `pristineHtml`을 새로 파싱한 트리이며, 렌더 트리와 같은 문자열에서 파싱했으므로 `path`가 일치한다.

- ins: path의 노드(들)를 제거.
- del: 5.4의 삽입 위치 규칙(B 트리 부모 경로 기준)을 모델에 적용해 B 복제(블록은 원래 요소, 조각은 노드들)를 삽입. 직전 정렬 단위 뒤에 둘 때 그 사이의 C 단위가 같은 부모면 그 뒤에 둔다. 부모 호환 래핑은 하지 않는다(원래 요소 그대로).
- mod/fmt: path의 노드(들)를 B 복제로 교체.

적용 후 `pristineHtml = model.innerHTML`, 같은 기준으로 다시 비교·렌더, 요약 갱신, 같은 인덱스(범위를 넘으면 마지막)를 선택, `scheduleAutosave()`. 토스트: "원래대로 되돌렸습니다. 파일에 반영하려면 저장을 누르세요". 히스토리에는 넣지 않는다(일반 편집과 동일). 되돌린 문단 안의 메모 mark는 사라질 수 있으며 6.5의 위치 없음 처리로 남는다.

### 5.7 부가와 한계

- 열 때 안내: 초기화에서 `me = localStorage 이름`, `by = data-doc-saved-by`. `by`가 비어 있지 않고 `by !== me`이고 히스토리가 1개 이상이면 토스트 "OOO이(가) 저장한 문서입니다. 변경 사항으로 수정된 부분을 볼 수 있습니다". 이름이 아직 없어도(빈 문자열) 표시한다.
- 한계: 표 열 추가 같은 구조 변경은 칸 단위로만 보인다. 이미지·SVG는 통째 교체로 보인다. 아주 큰 문서에서 D 상한을 넘으면 전체 교체로 표시한다. 문서 자체 스크립트가 본문 요소를 참조하고 있으면 비교 모드에서 innerHTML 교체로 참조가 끊길 수 있다(히스토리 복원과 같은 조건).

## 6. 메모

### 6.1 데이터 모델

저장소: `<script type="application/json" id="doc-notes">[]</script>`. `#doc-history` 옆에 둔다. 없으면 엔진이 만든다. 잘못된 JSON이나 배열이 아니면 빈 배열로 읽는다. 항목 검증: `id`(문자열), `text`(문자열) 필수, 나머지는 기본값으로 보정.

```json
{"id":"n-m1x2y3-ab12","author":"김OO","ts":"2026-09-12T05:03:00.000Z",
 "text":"근거: 2024 통계 인용","quote":"선택한 텍스트 앞 80자…","anchored":true,
 "resolved":false,"replies":[{"author":"A","ts":"…","text":"반영했습니다"}]}
```

본문 앵커: `<mark class="doc-ed-note" data-doc-note="ID">`. 여러 문단에 걸치면 문단마다 같은 ID의 mark. 겹치는 메모는 mark 중첩을 허용한다. 문서 전체 메모는 `anchored:false`이고 mark가 없다. 런타임 상태 클래스 `doc-ed-note-resolved`(정합성 갱신 때 저장소 기준으로 다시 계산)와 `doc-ed-note-active`(선택 표시, 직렬화 때 제거).

### 6.2 패널 `#doc-notes-panel`

- 열기: 컨트롤의 `#doc-notesBtn`(텍스트 `메모`, 미해결 개수 `#doc-notesCount`), 편집 툴바의 `#doc-ebNote`, 본문 mark 클릭. 상태 `body.doc-notes-open`. 열리면 `doc-inspector-open`은 끄고 데스크톱에서도 `#doc-inspector`를 숨긴다. 닫으면 데스크톱 인스펙터는 다시 보인다. 인스펙터 토글을 누르면 메모 패널을 닫는다.
- 위치: 인스펙터와 같은 고정 오른쪽 패널(폭 320px). 모바일은 인스펙터처럼 좌우 8px 전체 폭, 컨트롤·툴바 아래.
- 구성: 헤더(제목, 개수, 닫기 `#doc-notesClose`), 이름 행(`#doc-notesAuthor` 입력, 변경 시 localStorage 저장), 작성 상자(대상 표시 `#doc-notesTarget` + 해제 `#doc-notesTargetClear`, `#doc-notesInput` textarea, `#doc-notesAdd` 버튼), `#doc-notesShowResolved` 체크박스("해결된 메모 보기"), 목록 `#doc-notesList`.
- 카드: 작성자·시각, 인용문(없으면 "문서 전체", mark를 못 찾으면 "위치 없음" 배지와 인용문), 내용, 답글 목록(들여쓰기), 버튼 답글/해결(또는 다시 열기)/삭제. 답글 버튼은 카드 안에 textarea와 남기기 버튼을 편다. 해결된 카드는 한 줄로 접히고 체크박스가 켜졌을 때만 보인다.
- 카드 클릭: 첫 mark로 `scrollIntoView({block:'center'})`, 모든 같은 ID mark에 `doc-ed-note-active`를 1.5초 유지. 위치 없음이면 토스트.
- mark 클릭(보기·편집 모드 모두, 기본 동작 유지): 패널을 열고 해당 카드를 스크롤·강조.
- 패널 안 버튼은 `mousedown`에서 `preventDefault`해 본문 선택을 유지한다(툴바와 동일). textarea·input은 예외.
- 비교 모드에서는 작성 상자를 비활성화하고 "비교를 닫고 메모를 남겨 주세요"를 표시한다. 답글·해결·삭제는 가능하다(저장소만 바꿈. 삭제 시 mark 제거는 원본 모델에도 적용한다).

### 6.3 작성 흐름

- 대상 캡처: `#doc-notesInput`가 포커스를 받을 때, 그리고 `#doc-ebNote`/`#doc-notesBtn`을 눌렀을 때, `savedRange`가 비어 있지 않고 본문 안이면 `{range: clone, quote}`를 대상으로 잡고 대상 표시에 인용문을 보여 준다. 해제(×)를 누르면 문서 전체 메모로 바뀐다. 포커스를 다시 받을 때마다 갱신한다.
- 남기기: 내용이 비어 있으면 무시. `ensureAuthor()`로 이름 확보. 대상이 있으면 `wrapRange(range, id)`로 mark를 씌운다. 감쌀 텍스트 노드가 없으면(이미지만 선택 등) 문서 전체 메모로 저장하고 토스트 "선택한 부분을 표시할 수 없어 문서 전체 메모로 남겼습니다". 저장소에 추가, 패널 갱신, 작성 상자 비우기, `scheduleAutosave()`, 개수 갱신.
- `wrapRange(range, id)`: (1) 끝 컨테이너가 텍스트 노드이고 끝 오프셋이 길이보다 작으면 `splitText(endOffset)`. (2) 시작 컨테이너가 텍스트 노드이고 시작 오프셋이 0보다 크면 `splitText(startOffset)`의 결과를 시작 노드로 쓴다. (3) `commonAncestorContainer`에서 TreeWalker(SHOW_TEXT)로 `range.intersectsNode`인 텍스트 노드를 모으되 `#doc-content` 밖은 제외한다. (4) 앞뒤의 공백만 있는 노드는 버린다. (5) 각 텍스트 노드를 새 mark로 감싼다. (6) 감싼 노드가 하나라도 있으면 true.
- 보기 모드에서도 작성·답글·해결·삭제가 된다. 편집 모드 진입 없이 메모만 남기고 저장할 수 있다. 모든 변경은 `scheduleAutosave()`를 호출하며 저장 대상이다.

### 6.4 답글·해결·삭제

- 답글: `ensureAuthor()` 후 `replies`에 추가.
- 해결/다시 열기: `resolved` 토글. mark 클래스 갱신. 개수 갱신.
- 삭제: `confirm('이 메모와 답글을 삭제할까요?')` 후 항목 제거, 같은 ID의 mark를 모두 풀고(`replaceWith(...childNodes)` 후 부모 `normalize()`) 갱신.

### 6.5 정합성 `reconcileNotes()`

호출 시점: 초기화, 히스토리 복원, 자동저장 복구, 되돌리기, 비교 모드 진입·종료, 패널 갱신 전.

- 본문의 `mark.doc-ed-note` 중 저장소에 없는 ID는 푼다. 내용이 빈 mark는 제거한다.
- 저장소 항목 중 `anchored`인데 mark가 없으면 런타임에서 "위치 없음"으로 표시한다(저장소 값은 바꾸지 않는다. 히스토리 복원으로 돌아올 수 있다).
- `resolved`에 따라 mark 클래스를 맞춘다.
- `서식 지우기`(removeFormat)가 mark를 벗기면 그 메모는 위치 없음으로 남는다. 내용은 지워지지 않는다. Chrome에서 실제 동작을 확인해 문서에 적는다.

### 6.6 표시

- `#doc-content mark.doc-ed-note`: 배경 `rgba(250,204,21,.35)`, 아래 2px 주황 밑줄, `color:inherit`, `cursor:pointer`. 해결: 배경 없이 점선 밑줄. 선택: 배경 진하게 + 외곽선.
- 인쇄: mark 표시 유지(검토용 인쇄). 패널·바는 숨김.

## 7. 이름과 저장 기록

### 7.1 이름

- 키: `localStorage['docedit:author']`. 값은 문자열, 빈 문자열은 "익명으로 결정함".
- `ensureAuthor()`: 키가 없으면(null) `window.prompt('이름을 입력하세요. 메모와 저장 기록에 표시됩니다. 비워 두면 이름 없이 남깁니다.')`. 취소·빈 값은 ''로 저장해 다시 묻지 않는다. localStorage 실패는 무시하고 이번 값만 쓴다. 호출: 메모 남기기, 답글, 저장(파일 선택기 전).
- 패널 이름 입력은 현재 값을 보여 주고 `change`에서 저장한다. `DocEditor.author(name?)` API로 읽고 쓸 수 있다.
- 문서에는 이름 목록을 심지 않는다. 출처 속성에만 저장자 이름이 들어간다.

### 7.2 저장 기록

- 저장 성공 시(파일 쓰기 또는 다운로드 시작) `body.dataset.docSavedBy = 이름`, `docSavedAt = ISO 시각`. 직렬화 전에 설정해 파일에 포함한다. 저장 실패 시 이전 값으로 되돌린다(`data-doc-id` 롤백과 같은 방식).
- `pushHistoryIfChanged()`: 항목에 `author = 이전 docSavedBy || ''`, `ts = 이전 docSavedAt || now`. 즉 항목은 "그 본문을 저장한 사람과 시각"이다. 기존 항목(`author` 없음)은 그대로 읽는다. `loadHistory` 검증은 `author`를 선택 문자열로 허용한다.
- 히스토리 복원의 "복원 전:" 항목과 자동저장 복구의 "복구 전:" 항목(8.4)은 `author = 현재 docSavedBy`, `ts = 현재 docSavedAt || now`.
- 히스토리 모달 카드와 비교 기준 드롭다운에 `이름 · 시각 · 제목`을 표시한다.

## 8. 브라우저 기록 안전장치

사용자 우려: 같은 파일명이지만 내용이 다른 문서를 열면 브라우저 기록이 덮어써질 수 있다.

### 8.1 새 기능이 브라우저에 남기는 것

메모·답글·해결 상태·비교 기준·되돌리기 결과는 모두 **파일 안**(`#doc-notes`, 본문 mark, 히스토리)에 있다. 브라우저에는 이름(`docedit:author`)만 새로 남고, 이는 문서가 아니라 사람에 속한다. 기존 기록은 자동저장 백업(localStorage)과 파일 연결(IndexedDB)이며 아래 조치를 더한다.

### 8.2 문서 ID를 첫 저장에서 부여

- 현재는 "다른 이름으로"에서만 ID를 만들어, 대부분의 문서가 경로 키(`url:origin+path`)로 백업된다. 같은 경로에 다른 문서가 오면 백업이 뒤섞인다.
- 변경: 저장할 때 `data-doc-id`가 없으면 새로 만든다(실패 시 롤백은 기존 로직). 이후 백업은 ID 키를 쓴다. 일반 저장(다른 이름으로가 아닌 저장)에서 경로 키에서 ID 키로 바뀌고 새 키 백업 쓰기까지 성공한 경우에 한해 경로 키 백업을 지운다(내용은 파일과 새 백업에 있으므로 안전). 다른 이름으로 저장은 원래 경로 문서의 백업을 건드리지 않는다(기존 정책 유지).
- 파일 연결(IndexedDB)은 경로 키를 유지한다. 같은 경로의 파일에 저장하는 것이 의도된 동작이기 때문이다.
- 한 번도 저장하지 않은 문서는 계속 경로 키를 쓴다. OS에서 복사한 사본은 ID를 공유하며, 8.3의 출처 비교로 구분한다.

### 8.3 백업에 출처를 기록하고 불일치를 알린다

- 백업 레코드: `{ts, html, title, savedBy, savedAt}`. `savedBy/At`는 백업 시점의 문서 출처.
- `checkAutosave()`: 백업의 `savedBy/At`(없으면 '')와 지금 연 파일의 출처(없으면 '')를 비교한다. 다르면 배너 문구를 바꾼다: "이 위치의 자동저장본(제목 · 시각)은 지금 연 파일과 다른 저장본에서 만든 것입니다. 파일: OOO · 시각 저장. 복구하면 현재 본문은 히스토리에 남습니다." 같으면 기존 문구에 제목·시각을 덧붙인다.
- 버튼 구성(복구 / 무시 / 무시하고 현재 버전으로 백업 확정)과 동작은 유지한다.

### 8.4 복구 전 현재 본문을 히스토리에 남긴다

자동저장 복구(`#doc-rb-restore`)는 본문을 바꾸기 전에 현재 본문을 `복구 전: 제목` 항목으로 히스토리에 넣는다(히스토리 복원과 동일한 보호). 잘못된 복구도 히스토리에서 되돌릴 수 있다.

## 9. 크롬 계약과 마크업

- UI 블록 9개: 기존 7개 + `#doc-notes-panel` + `#doc-changes-bar`. 저장소 2개: `#doc-history`, `#doc-notes`.
- 컨트롤 순서: `편집` · `저장` · `메모` (`#doc-notesBtn`) · `현재 서식` · `더보기 ▾` · 더보기 영역(`변경 사항` `#doc-changesBtn` · 다른 이름으로 · 배포용 HTML 저장 · HTML에 편집기 추가 · 히스토리 · 인쇄).
- 편집 툴바: 표 그룹 뒤에 `메모` 그룹(`#doc-ebNote`) 추가.
- 모바일(900px 이하): 편집 중에는 `#doc-notesBtn`을 숨긴다(툴바의 메모 버튼 사용). 320px 보기 모드 한 줄: 편집 · 저장 · 메모 · 더보기.
- 없는 블록 허용: `bind()`는 요소가 없으면 무시하므로, 엔진만 교체한 구문서는 새 버튼·패널 없이 기존 기능만 동작한다. `#doc-notes` 저장소는 없으면 엔진이 만든다.
- `skeleton-src.html`에 마크업 추가. `build-template.py`는 크롬 범위를 `#doc-controls`부터 `#doc-toast`까지 자르므로 새 블록은 그 사이에 둔다.
- `doc-attach.js`: `chromeIds`에 두 블록 추가. `bundleFrom`은 패널 목록·textarea·이름 입력의 value 속성·바의 옵션·요약을 비운다. `convert`는 `data-doc-saved-by/at`를 제거하고 `#doc-notes`가 없으면 `[]`로 만든다. 설치 검사 셀렉터에 `#doc-notes`, `#doc-notes-panel`을 추가한다.
- `scripts/check-release.py` 필수 id: `doc-notes-panel`, `doc-changes-bar`, `doc-notes`, `doc-notesBtn`, `doc-changesBtn`. 예시의 `#doc-notes`는 `[]`.

## 10. 직렬화·내보내기 규칙 총정리

`serialize()` 추가 정리: body에서 `doc-notes-open`, `doc-changes` 제거. `#doc-notesList`·`#doc-notesTarget`·`#doc-changesSummary` 비우기, `#doc-notesInput` 텍스트 비우기, `#doc-changesBase` 옵션 제거, `#doc-notesAuthor`의 `value` 속성 제거, 본문의 `doc-ed-note-active` 제거. 비교 모드면 5.1의 임시 교체. `#doc-notes` 텍스트를 `escForScript(JSON.stringify(notes))`로 갱신.

`serializeReadOnly()` 추가: `#doc-notes-panel`, `#doc-changes-bar`, `#doc-notes` 제거. `data-doc-saved-by/at` 제거. 본문 `mark.doc-ed-note` 풀기(부모 normalize). 비교 모드면 임시 교체. 표 스타일 보존 규칙은 그대로.

## 11. 공개 API 추가

- `DocEditor.compare(on)`: 비교 모드 켜기/끄기(켤 때 기본 기준). `DocEditor.isComparing()`.
- `DocEditor.notes`: `list()`(복사본), `add(text, {anchor:true|false})`(anchor true면 현재 `savedRange` 사용), `reply(id, text)`, `resolve(id, on)`, `remove(id)`.
- `DocEditor.author(name?)`: 이름 읽기/쓰기.
- 기존 API 유지.

## 12. 검증

새 스위트 `tests/review-notes.js`(Aside, 8769 서버, 데모 문서). `window.prompt`·`confirm`은 테스트에서 대체한다.

1. 이름: prompt 대체 후 첫 메모에서 한 번만 호출, 두 번째부터 호출 없음. 빈 값 취소 시 '' 저장. 패널 입력 변경이 저장됨.
2. 메모: 선택 영역 메모 생성 시 mark와 저장소 항목, 인용문. 여러 문단 선택 시 mark 여러 개·같은 ID. 문서 전체 메모. 답글·해결·다시 열기·삭제(mark 제거). 해결 필터. 카드 클릭 시 스크롤·강조. mark 클릭 시 패널 열림. 미해결 개수 표시.
3. 정합성: 저장소에 없는 mark가 풀림. mark 없는 anchored 메모가 위치 없음 표시. 빈 mark 제거.
4. 직렬화: `getHTML()`에 `#doc-notes` JSON과 mark 포함, 패널 상태 없음. `getReadOnlyHTML()`에 mark·저장소·패널·바·출처 속성 없음.
5. 저장 기록: 모의 저장 두 번 후 히스토리 항목 `author`, 출처 속성 갱신, 첫 저장에서 `data-doc-id` 부여와 경로 키 백업 삭제.
6. 백업 안전장치: 출처가 다른 백업이면 불일치 문구. 복구 시 히스토리에 "복구 전:" 항목.
7. 비교: 데모 본문을 변형한 뒤(문단 추가·삭제·단어 수정·굵게) `compare(true)`에서 요약 개수와 클래스, 단어 ins/del, 메모 mark 유지. 기본 기준 선택(미저장 → session, 저장 후 다른 저장자 항목). 파일 기준 선택. 이전/다음 선택과 active 클래스. 각 유형 원래대로 후 원본 문자열과 개수 변화. 비교 중 `getHTML()`/`getReadOnlyHTML()`에 diff 클래스 없음. 닫기 후 본문 원본 복구. 편집 진입 시 비교 종료.
8. 열 때 안내 토스트: 출처가 다른 문서를 열면 표시.
9. 반응형: 320·390·768px에서 메모 패널과 바가 화면 폭 안에 있고 컨트롤 한 줄 유지, 편집 중 메모 버튼 숨김.

기존 스위트 갱신: `browser-regression.js`(prompt 대체, 첫 저장 후 ID 존재로 단언 변경), `export-readonly.js`(새 크롬·저장소·mark 제거 확인), `attach-editor.js`(크롬 9블록, 출처 속성 제거, `#doc-notes` 생성), `mobile-layout.js`(새 버튼 포함 한 줄 검사), `persistent-save.js`(변경 없음 확인). 모두 `pass:true`.

패키지 검사: `python3 assets/build-template.py --check`, `python3 scripts/check-release.py`, `node --check`.

## 13. 문서·버전·동기화

- 버전 1.6.0: 저장소 `SKILL.md`(metadata.version), 로컬 한국어 SKILL.md(version), README 한/영의 현재 버전 문구.
- 갱신: 저장소 `SKILL.md`(계약 9블록·저장소 2개·메모·변경 사항·이름·출처·ID 부여·백업 불일치 안내), `references/guide.ko.md`(상세), README 한/영 기능 목록, `CHANGELOG.md` 1.6.0, 로컬 `REVIEW.md` 1.6.0 항목, `tests/README.md`.
- 동기화: 저장소에서 구현·검증 후 `assets/`, `examples/`, `tools/`, `tests/`를 `~/.claude/skills/html-doc`와 `~/.agents/skills/html-doc`에 복사한다. 로컬 SKILL.md는 `guide.ko.md` 본문에 frontmatter와 줄표 금지 규칙·체크리스트 항목을 더한 형태를 유지한다.
- 커밋·push는 검증 완료 후 사용자 확인을 받아 진행한다.

## 14. 구현 순서

1. 이름·출처·ID 부여·백업 안전장치(7, 8) + 기존 테스트 갱신.
2. 메모 저장소·패널·앵커·정합성(6) + 테스트.
3. 비교 엔진·바·되돌리기(5) + 테스트.
4. 직렬화·내보내기·변환·check-release·빌드(9, 10), 문서(13), 동기화.
