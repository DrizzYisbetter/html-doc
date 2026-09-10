# Validation

From the repository root, run the portable package checks:

```sh
python3 scripts/check-release.py
```

They check the generated artifacts, required inline engine and UI, unique IDs, local documentation links, and personal absolute paths. If Node.js is available, they also syntax-check the JavaScript. These checks do not replace browser tests or constitute an exhaustive credential scan.

## Browser checks without a specific automation tool

Open `examples/demo.html` in your browser. Use a test copy when changing content.

1. Toggle editing, change a paragraph, and apply formatting.
2. Save or download and reopen the output; check the current text and inactive edit state.
3. Make an unsaved change and reload. Test restore, temporary ignore, and replacing the backup with current content. Reload again after confirming the backup.
4. Export read-only HTML. Reopen it and confirm the editor and history are gone while content and design remain.
5. In `tools/add-editor.html`, attach the editor to the exported file. Check editing and export again. Selecting an already-editable file should report an error.
6. Check narrow viewports, toolbar scrolling, the more menu, and inspector. Native mobile keyboard and OS file-picker testing must be performed separately.

Never run destructive backup fixtures on a document you use for real work.

## Optional Aside regression harness

The `.js` files in this directory use the Aside REPL adapter. They are developer tests, not runtime dependencies. Other clients can port their browser assertions to an available harness.

Read your installed Aside skill/CLI guide before using that adapter. Serve this repository on a dedicated local origin:

```sh
python3 -m http.server 8769 --bind 127.0.0.1
```

In another terminal at the repository root, with Aside already installed:

```python
from pathlib import Path
import subprocess

for name in ['browser-regression', 'persistent-save', 'mobile-layout',
             'export-readonly', 'attach-editor']:
    result = subprocess.run(
        ['aside', 'repl', Path('tests', name + '.js').read_text()],
        capture_output=True, text=True,
    )
    print(result.stdout, result.stderr)
    assert '"pass":true' in result.stdout, name
```

Run them sequentially: the tests change test-origin backups and IndexedDB. If the port is occupied, select another dedicated port and update all test URLs. No private reports or external QA aliases are required.

Coverage: restoration and history (16 checks), file-handle persistence (5), responsive layout and formatting (94), read-only export on the bundled skeleton/demo (16), attachment and encoding (34).

The file tests use OPFS/IndexedDB and partly mocked file handles or input events. They do not prove native OS picker behavior or real local-file overwrite permissions. Viewport simulations do not prove iOS/Android keyboard behavior. Prior full reports are not bundled; rerun tests in your target environment before claiming that environment is supported.
