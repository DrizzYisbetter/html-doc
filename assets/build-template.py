#!/usr/bin/env python3
"""편집 엔진과 공통 크롬을 인라인한다. --check는 산출물 갱신 누락을 검사한다."""
import argparse
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
assets = root / 'assets'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='파일을 쓰지 않고 최신 빌드와 비교')
args = parser.parse_args()
css = (assets / 'doc-editor.css').read_text(encoding='utf-8')
attach_js = (assets / 'doc-attach.js').read_text(encoding='utf-8')
diff_js = (assets / 'doc-diff.js').read_text(encoding='utf-8')
js = attach_js + '\n' + diff_js + '\n' + (assets / 'doc-editor.js').read_text(encoding='utf-8')
skeleton = (assets / 'skeleton-src.html').read_text(encoding='utf-8')
start = skeleton.index('<div id="doc-controls">')
end = skeleton.index('</div>', skeleton.index('<div id="doc-toast"')) + len('</div>')
chrome = skeleton[start:end]

for source, output in [('assets/skeleton-src.html', 'assets/skeleton.html'),
                       ('examples/demo-src.html', 'examples/demo.html'),
                       ('tools/add-editor-src.html', 'tools/add-editor.html')]:
    html = (root / source).read_text(encoding='utf-8')
    replacements = [('/*__DOC_EDITOR_CSS__*/', css), ('/*__DOC_EDITOR_JS__*/', js)]
    if source.startswith('tools/'):
        bundle = json.dumps({'css': css, 'js': js, 'chrome': chrome}, ensure_ascii=False).replace('<', '\\u003c')
        replacements = [('/*__DOC_EDITOR_BUNDLE__*/', bundle), ('/*__DOC_ATTACH_JS__*/', attach_js)]
    for marker, replacement in replacements:
        if html.count(marker) != 1:
            raise SystemExit(f'{source}: {marker} 마커가 정확히 1개 필요합니다')
        html = html.replace(marker, replacement)
    if source.startswith('examples/'):
        marker = '<!--__DOC_EDITOR_CHROME__-->'
        if html.count(marker) != 1:
            raise SystemExit(f'{source}: 공통 크롬 마커가 정확히 1개 필요합니다')
        html = html.replace(marker, chrome)
    target = root / output
    if args.check:
        if not target.exists() or target.read_text(encoding='utf-8') != html:
            raise SystemExit(f'{output}: 재빌드가 필요합니다')
        print(f'{output}: 최신 상태')
    else:
        target.write_text(html, encoding='utf-8')
        print(f'{output} 생성 완료 ({len(html.encode("utf-8")):,} bytes)')
