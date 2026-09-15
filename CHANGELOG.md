# Changelog

## 1.7.0

- Add block deletion. **블록 선택** outlines the block at the caret and widens to the parent on a second press; **블록 삭제** removes it, with 되돌리기 in a toast and Ctrl/Cmd+Z right after the deletion.
- Deleting from a table cell removes the row, since dropping a single cell breaks the column alignment.
- The engine detaches the node instead of using the browser's delete, which merges blocks and strips the surviving block's class, and cannot remove a table row.

## 1.6.1

- Fix: documents converted by `tools/add-editor.html` from HTML without an existing `#doc-content` dropped every key press. The `display:contents` wrapper generates no box, so the editing root could not take focus (issue #1).
- The engine now gives the editing root a box only while editing, and restores `display:contents` for view mode, saved files, and read-only exports. Roots that are intentionally `flex` or `grid` are left untouched.
- Add real key input regression checks to `tests/attach-editor.js`. Assigning `textContent` cannot catch this class of bug.

## 1.6.0

- Add anchored notes with replies and resolution, stored in the file (`#doc-notes`) and shown in a side panel.
- Add change comparison against saved versions, the last save, or an HTML file, with per-change revert.
- Ask for an author name once per browser; record save provenance and history authors.
- Assign a document ID on the first save, record backup provenance, warn on mismatched backups, and keep the current body in history before restoring.
- Add `assets/doc-diff.js` (engine order: attach, diff, editor) and two UI blocks (`doc-notes-panel`, `doc-changes-bar`).

## 1.5.0

- Attach the editor to existing HTML and download an editable copy.
- Include a standalone attachment tool, duplicate-ID checks, and charset decoding.
- Provide a portable Agent Skills entrypoint and English/Korean documentation.

## 1.4.0

- Export read-only HTML without editor UI, history, or backup identity.
- Retain document content, styles, scripts, and inserted table presentation.

## 1.3.0

- Add a responsive toolbar, mobile more menu, and collapsible inspector.

## 1.2.0

- Remember supported file handles by document origin/path using IndexedDB.

## 1.1.0

- Add the option to dismiss a restore prompt and replace the backup with the current body.
- Improve autosave, history, and shared template generation.
