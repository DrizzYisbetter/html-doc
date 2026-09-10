---
name: html-doc
description: Create editable, standalone HTML documents, add an inline editor to existing HTML, and export clean read-only HTML. Use for reports, guides, letters, and other documents that users want to edit in a browser and save as HTML.
metadata:
  version: "1.5.0"
---

# HTML Doc

**Environment:** Requires file access to copy bundled assets. A browser is needed for interactive verification. Python 3.9+ is needed only to rebuild or validate the package. The editor UI is currently Korean.

Create a document whose editor travels with the HTML file. Preserve the user's content, visual design, and chosen language. Do not replace an existing document's design with the example design unless requested. See [the Korean reference](references/guide.ko.md) for detailed behavior and API notes.

## New documents

1. Copy `assets/skeleton.html` to the requested output location.
2. Write the document design in the first `<style>` and the body inside `#doc-content`.
3. Keep the editor CSS, script, history store, and UI blocks intact. Do not summarize or rewrite the bundled engine when generating a document.
4. Open the result using a browser tool available in the current environment. Verify view mode, editing, serialization, and the document's layout. If browser tools are unavailable, state which interactive checks were not performed.

Read the template before replacing sections. It contains a document stylesheet and a separate editor stylesheet. The demo is an optional visual example, not a mandatory layout.

## Editor integration contract

- Exactly one body container has `id="doc-content"` and starts with `contenteditable="false"`.
- Keep all seven UI blocks: `doc-controls`, `doc-editbar`, `doc-inspector`, `doc-editflag`, `doc-restore-banner`, `doc-history-modal`, and `doc-toast`.
- Keep `<script type="application/json" id="doc-history">[]</script>` for a new document. Preserve existing history when updating an existing editor.
- `#doc-editor-style` contains `assets/doc-editor.css`.
- `#doc-editor-script` contains `assets/doc-attach.js` followed by `assets/doc-editor.js`, in that order, within one script element. Both are already inlined in built templates.
- The UI uses `doc-*` IDs/classes and `--doc-ed-*` variables. It is not isolated with Shadow DOM, so inspect interference from document-wide CSS.

## Existing HTML

For an interactive conversion, open `tools/add-editor.html`, choose the HTML file, and download the editable copy. The editor's **HTML에 편집기 추가** button does the same from an existing editable document. Both retain the original file.

For an agent-driven integration, preserve the input and add only the integration contract above. Reuse an existing `#doc-content`; otherwise choose a root suited to the original layout. The automatic converter wraps the body in a `display:contents` container when needed. This can affect `body > ...` CSS and parent-sensitive scripts. Inspect those cases rather than claiming universal structural compatibility.

The converter retains document scripts without executing them during conversion. They execute when the user opens the output. It rejects conflicting editor IDs, duplicate roots, existing editors, framesets, and CSP meta policies requiring separate review. It is not an HTML sanitizer. Relative resources still require the original folder layout.

## Saving, backup, and export

Explain these distinctions accurately:

- **Save:** first use requires choosing a destination in supported browsers. A successful file handle can be remembered in IndexedDB for the same origin/path and browser profile. Permission may need renewal. Never promise silent first-time overwriting.
- **Save as:** chooses another destination; unsupported file APIs fall back to a download. Download dialogs depend on browser settings.
- **Autosave:** stores a local browser backup, separately from the HTML file. Ignore only dismisses the current prompt. **무시하고 현재 버전으로 백업 확정** replaces the old backup with the current body; the banner closes only after success.
- **Read-only export:** **배포용 HTML 저장** downloads a separate copy without editor UI, engine, history, backup identity, or temporary editing layout. The current unsaved body, original document styling/scripts, and inserted table presentation remain. External resources are not embedded automatically. This does not publish a website.
- **Attach editor:** downloads an editable copy with empty history and no inherited backup ID or file connection.

On screens up to 900px, extra actions are in **더보기**. The formatting toolbar scrolls horizontally, and **현재 서식** opens a collapsible inspector. Preserve the document's own responsive design.

## Maintenance and existing-document upgrades

Edit canonical files under `assets/`; edit UI markup in `assets/skeleton-src.html`. Then run:

```sh
python3 assets/build-template.py
python3 assets/build-template.py --check
```

This rebuilds the skeleton, demo, and standalone attachment tool. Do not update generated copies alone. Existing user documents do not update automatically: preserve their body, design, history, and `data-doc-id`, and replace the engine CSS/script and seven UI blocks together.

For an old document without an ID, recover needed backups with its previous engine and save first. Do not automatically adopt or delete the legacy global `__unsaved__` backup.

## Verification

For each generated or upgraded document:

- Check the DOM for one editable root and all editor blocks. Searching HTML text for IDs is insufficient because engine strings also contain them.
- Toggle edit mode, modify a test copy, and verify formatting and the saved body.
- Parse `DocEditor.getHTML()`: editor remains, root is not actively editable, and transient menus/panels are closed.
- Parse `DocEditor.getReadOnlyHTML()`: editor and history are absent, current content/design remain, and source editing state is unchanged.
- At a narrow viewport, verify toolbar access, more-menu actions, inspector, and horizontal overflow.
- For editor maintenance, follow [tests/README.md](tests/README.md) for recovery and persistence regressions. Aside is an optional developer test harness, not a runtime or skill requirement.

Do not claim real mobile keyboard, native file picker, or cross-browser verification based only on simulated viewports or mocked file handles.
