# Changelog

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
