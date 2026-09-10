# HTML Doc

An Agent Skills package for making editable, standalone HTML documents.

[한국어](README.md) · [Skill instructions](SKILL.md) · [Demo](examples/demo.html) · [Add an editor](tools/add-editor.html)

Create a report, guide, or letter with an inline editor. Open the resulting HTML in a browser to edit text and formatting, save changes, recover a local backup, or download a clean read-only copy. No server, browser extension, or AI account is needed to use a generated document.

**Current release: 1.5.0.** Agent instructions are in English, with a Korean reference. The editor and conversion-tool UI are currently **Korean**; document content can be in any language. This package does not yet provide an English UI toggle.

## Downloads

[Latest release](https://github.com/tonywjs/html-doc/releases/latest) · [Editable demo](https://github.com/tonywjs/html-doc/releases/latest/download/demo.html) · [Standalone conversion tool](https://github.com/tonywjs/html-doc/releases/latest/download/add-editor.html)

Download an HTML file and open it in your browser.

## Try it without installing a skill

Download and extract the repository or release ZIP, then open:

- `examples/demo.html`: magazine-style example with the complete editor.
- `assets/skeleton.html`: starter document to copy and customize.
- `tools/add-editor.html`: choose an existing `.html`/`.htm` file and download an editable copy.

Open the built `.html` files, not `*-src.html`. Source files contain build placeholders. A GitHub source-file page displays code; download the file to run it locally.

## Install for an AI agent

Install the **whole folder**, including assets. `SKILL.md` alone is not sufficient. Use one installation per agent to avoid duplicate entries.

| Environment | Personal installation folder | Example request |
|---|---|---|
| Claude Code | `~/.claude/skills/html-doc/` | `/html-doc Create an editable project update.` |
| Codex local | `~/.agents/skills/html-doc/` | `$html-doc Create an editable project update.` |
| Other Agent Skills clients | Use that client's documented skill location | Ask it to use the `html-doc` skill |

For a project-scoped install, place the folder under `.claude/skills/` or `.agents/skills/` within the project instead. The final path must end in `html-doc/SKILL.md`. GitHub ZIP downloads may add an outer folder; rename or copy its contents accordingly.

Alternatively, clone this repository directly into an unused destination. Use this public repository URL:

```sh
# Claude Code
mkdir -p ~/.claude/skills
git clone https://github.com/tonywjs/html-doc.git ~/.claude/skills/html-doc

# Codex
mkdir -p ~/.agents/skills
git clone https://github.com/tonywjs/html-doc.git ~/.agents/skills/html-doc
```

If an installation already exists, inspect it before replacing or updating it. Codex's skill installer can also accept a repository URL. Skill loading and file/browser permissions depend on the client. This is a portable skill folder, not a registered Claude or OpenAI plugin. ChatGPT web/mobile distribution may require product-specific plugin packaging; uploading this repository does not register a plugin.

Official references: [Agent Skills](https://agentskills.io/home), [Claude Code](https://code.claude.com/docs/en/skills), [OpenAI](https://learn.chatgpt.com/docs/build-skills).

## What the buttons do

| Label | Action |
|---|---|
| 편집 | Toggle editing |
| 저장 | Save; first connection requires choosing a destination |
| 다른 이름으로 | Save as another file |
| 배포용 HTML 저장 | Download a read-only copy without editor/history |
| HTML에 편집기 추가 | Add this editor to another HTML file |
| 히스토리 | View and restore previous saved versions |
| 현재 서식 | Show the current formatting inspector |
| 더보기 | Extra actions on mobile |
| 인쇄 | Print the document |

`Cmd/Ctrl+E` toggles editing. `Cmd/Ctrl+S` saves. Formatting includes headings, fonts, sizes, colors, alignment, lists, and tables.

## Saving and compatibility

The first save cannot silently overwrite an arbitrary local file. In browsers supporting the required file APIs, choose a destination once; the editor can remember its handle for the same origin/path and profile. Permission renewal, browser storage deletion, moving the file, or a different browser can require reconnecting. Other browsers use downloads, whose dialogs follow browser settings.

Autosave is a local browser backup, not a disk save. Ignore dismisses a restore prompt temporarily; **무시하고 현재 버전으로 백업 확정** replaces the old backup with the current body. Normal editable saves may retain previous content in embedded history. Use read-only export when you want to remove editor history.

Read-only export preserves document scripts and external-resource references. It does not sanitize scripts, inline every asset, or publish anything. Keep converted files beside their original relative resources. Automatic editor attachment may need adjustment for `body > ...` selectors, parent-sensitive scripts, or complex web applications.

The UI supports narrow viewports; native file APIs and contenteditable behavior vary by browser. The included regression harness was exercised with Chromium, simulated mobile viewports, and partly mocked file APIs. It is not a claim that every AI client, native mobile keyboard, or browser has been tested.

## Development

Python 3.9+ is needed only for rebuilding/validation. Node.js is used for optional syntax checks. No npm dependencies are needed to run a generated document.

```sh
python3 assets/build-template.py
python3 scripts/check-release.py
```

Canonical CSS/JS are in `assets/`. Shared editor markup is in `assets/skeleton-src.html`; the build also produces the demo and attachment tool. [Testing instructions](tests/README.md) include optional Aside-based browser regressions. Aside is not needed by end users or other AI agents.

To build a reproducible ZIP locally:

```sh
python3 scripts/package-release.py
```

The archive and its SHA-256 checksum are written beside the repository. This command does not contact GitHub or publish files.

## License

See [LICENSE](LICENSE). Examples and templates are bundled with this package; resources you add to your own documents remain subject to their own terms.
