#!/usr/bin/env python3
"""Validate an unpacked release without third-party Python packages."""
from pathlib import Path
from html.parser import HTMLParser
from collections import Counter
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent

class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=False)
        self.ids = []
        self.blocks = {}
        self.active = None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if tag in ('script', 'style'):
            self.active = (tag, attrs.get('id'))
            if self.active[1]:
                self.blocks[self.active[1]] = ''

    def handle_data(self, data):
        if self.active and self.active[1]:
            self.blocks[self.active[1]] += data

    def handle_endtag(self, tag):
        if self.active and tag == self.active[0]:
            self.active = None

def main():
    for name in ['SKILL.md', 'README.md', 'README.ko.md', 'LICENSE', 'CHANGELOG.md']:
        assert (ROOT / name).is_file(), f'Missing {name}'
    skill = (ROOT / 'SKILL.md').read_text()
    front = skill.split('---', 2)[1]
    assert re.search(r'^name: html-doc$', front, re.M), 'Skill name must match folder name'
    assert re.search(r'^description: .+', front, re.M), 'Missing description'
    assert re.search(r'^metadata:\n  version: "[0-9]+\.[0-9]+\.[0-9]+"', front, re.M), 'Missing version metadata'
    assert not re.search(r'^version:', front, re.M), 'Use metadata.version'
    subprocess.run([sys.executable, str(ROOT / 'assets/build-template.py'), '--check'], check=True)
    css = (ROOT / 'assets/doc-editor.css').read_text().strip()
    js = ((ROOT / 'assets/doc-attach.js').read_text() + '\n' + (ROOT / 'assets/doc-diff.js').read_text()
          + '\n' + (ROOT / 'assets/doc-editor.js').read_text()).strip()
    expected = ['doc-content', 'doc-controls', 'doc-editbar', 'doc-inspector', 'doc-editflag',
                'doc-restore-banner', 'doc-history-modal', 'doc-toast', 'doc-history', 'doc-attachBtn', 'doc-exportBtn']
    for name in ['assets/skeleton.html', 'examples/demo.html']:
        doc = Document((ROOT / name).read_text())
        counts = Counter(doc.ids)
        assert all(count == 1 for count in counts.values()), f'Duplicate IDs in {name}'
        assert all(counts[x] == 1 for x in expected), f'Missing UI in {name}'
        assert doc.blocks['doc-editor-style'].strip() == css, f'Style mismatch: {name}'
        assert doc.blocks['doc-editor-script'].strip() == js, f'Engine mismatch: {name}'
        assert doc.blocks['doc-history'].strip() == '[]', f'Example contains history: {name}'
    tool = Document((ROOT / 'tools/add-editor.html').read_text())
    import json
    bundle = json.loads(tool.blocks['editor-bundle'])
    assert bundle['js'].strip() == js and bundle['css'].strip() == css, 'Tool bundle mismatch'
    for path in ROOT.rglob('*'):
        if not path.is_file() or '.git' in path.parts:
            continue
        assert not path.is_symlink(), f'Unexpected symlink: {path.relative_to(ROOT)}'
        if path.suffix in ('.md', '.py', '.js', '.css', '.html'):
            text = path.read_text()
            assert not re.search(r'/(?:Users|home)/[A-Za-z0-9_-]+/', text), f'Personal path: {path.relative_to(ROOT)}'
        if path.suffix == '.md':
            for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', path.read_text()):
                if re.match(r'^(?:https?://|#)', target):
                    continue
                resolved = (path.parent / target.split('#', 1)[0]).resolve()
                assert resolved.is_relative_to(ROOT) and resolved.exists(), f'Broken local link in {path.name}: {target}'
    node = shutil.which('node')
    if node:
        for filename in ['doc-editor.js', 'doc-attach.js', 'doc-diff.js']:
            subprocess.run([node, '--check', str(ROOT / 'assets' / filename)], check=True)
    else:
        print('Node.js absent: JavaScript syntax checks skipped.')
    print('Package validation passed.')

if __name__ == '__main__':
    main()
