#!/usr/bin/env python3
"""Build a reproducible local ZIP; never upload or contact a remote service."""
from pathlib import Path
import hashlib
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
subprocess.run([sys.executable, str(ROOT / 'scripts/check-release.py')], check=True)
version = re.search(r'^  version: "([0-9]+\.[0-9]+\.[0-9]+)"$', (ROOT / 'SKILL.md').read_text(), re.M).group(1)
output = ROOT.parent / f'html-doc-v{version}.zip'
root_files = {'SKILL.md', 'README.md', 'README.ko.md', 'README.en.md', 'LICENSE', 'CHANGELOG.md', '.gitignore'}
folders = {'assets', 'examples', 'tools', 'tests', 'references', 'scripts'}
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(ROOT.rglob('*')):
        rel = path.relative_to(ROOT)
        if not path.is_file() or path.is_symlink():
            continue
        if any(part.startswith('.') or part == '__pycache__' for part in rel.parts) and str(rel) != '.gitignore':
            continue
        if path.suffix in {'.pyc', '.zip', '.sha256'}:
            continue
        if str(rel) not in root_files and rel.parts[0] not in folders:
            continue
        info = zipfile.ZipInfo('html-doc/' + rel.as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
checksum = output.with_suffix('.zip.sha256')
checksum.write_text(hashlib.sha256(output.read_bytes()).hexdigest() + '  ' + output.name + '\n')
print(f'Created {output.name} ({output.stat().st_size:,} bytes) and {checksum.name}')
