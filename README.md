# Teleprompter

A local teleprompter that runs in your browser. Write or paste a Script in the Editor and the Prompter scrolls it at a steady pace. The lines you are reading stay bright inside the Reading window, and the text above and below it is dimmed.

A local server holds the Script and its recent history, so other tools can send text to the Prompter. The `tp` command and a Claude Code plugin do that today. Voice-driven scrolling is next (see [Roadmap](#roadmap)).

## Run it

You need Node 22.18 or later and pnpm.

```bash
pnpm install
pnpm build
pnpm start
```

Open http://localhost:4747, then press `p` to open the Editor and write or paste a Script. One process serves the app and the API on port 4747.

Set `PORT` or `HOST` to change where it listens. It binds `127.0.0.1` by default, so only your machine can reach it. The server stores the Script in `script.json` and the Script history in `history.json`. Both are in `$TELEPROMPTER_DATA_DIR`, which defaults to `${XDG_DATA_HOME:-~/.local/share}/teleprompter/`.

### Develop

```bash
pnpm dev
```

This runs the server in watch mode on port 4747 and Vite on port 4748. Open http://localhost:4748. Vite forwards `/api` to the server.

If you used an earlier version, the Script saved in your browser moves to the server the first time you open the app against an empty server.

## Send text from other tools

### Put `tp` on your PATH

```bash
pnpm link:tp
```

This installs the `tp` command globally from this checkout. If pnpm says its global bin directory is not on your PATH, run `pnpm setup` and open a new shell.

### Send text

```bash
tp serve                                  # start the server
tp send --replace "Welcome to the show."  # replace the Script
echo "More text." | tp send --append      # add to the end, from stdin
```

`tp send` takes `--replace` or `--append`, and optionally `--markdown` to mark the text as markdown and `--source <label>` to say where the text came from, such as a note title. Without `--markdown`, the server detects the format, and an Append never turns a markdown Script into text. It reads stdin when you give no text. A Replace returns every open Prompter to the top, paused, and the Prompter offers to undo it. An Append keeps the reader's place.

If the server is not running, `tp send` exits with an error and tells you to run `tp serve`. Set `TELEPROMPTER_URL` to send to a server other than http://127.0.0.1:4747.

### Use it from Claude Code

This repository is a Claude Code plugin marketplace. Add it and install the plugin:

```
/plugin marketplace add /path/to/teleprompter
/plugin install teleprompter@teleprompter
```

For a published copy, use `/plugin marketplace add <owner>/<repo>` instead. The plugin needs `tp` on your PATH and the server running.

- `/teleprompter replace [text]` and `/teleprompter append [text]` send the text. With no text, Claude sends its previous reply.
- Ask Claude to "put that in the prompter" and it sends the script it just wrote.

### API

The server has no login. It rejects requests whose `Host` is not `localhost` or `127.0.0.1`, and writes from a browser page on another origin. Requests with no `Origin` header, such as from `tp` or Obsidian, are allowed. Bodies over 2 MB are refused.

| Request | Result |
|---|---|
| `GET /api/script` | The current Script: `{ text, format, source, revision }`. |
| `POST /api/script` | Changes the Script and returns it. The body is `{ kind, text, format?, source? }`. |
| `GET /api/events` | A server-sent event stream. It sends the current Script as a `script` event, then one `change` event per change: `{ kind, script, previousVersionId }`. |
| `GET /api/history` | The Script history, newest first. Each entry is `{ id, revision, savedAt, reason, source, wordCount, preview }`. |
| `GET /api/history/:id` | One Version with its full `text` and `format`. |
| `POST /api/history/:id/restore` | Makes that Version the Script again, as a Replace, and returns the Script. |

`kind` is `replace`, `append` or `edit`. Replace and Append are Pushes, and their `text` must not be empty. Edit is a change made in the Editor: it carries the whole text, may be empty, and each Prompter keeps its place on the same words. `format` is `markdown` or `text`. When you omit it, a Push detects it and an Edit keeps the Script's format. `revision` goes up by one on every change.

The server saves a Version of the Script before every Push, and before an Edit that follows 30 seconds with no Edit. It keeps the newest 20 and never saves an empty Script. A Version's `reason` is the kind of change it was saved before. In a `change` event, `previousVersionId` is the Version saved before that change, or `null` if none was saved. Restore that Version to undo the change.

## Use the Prompter

Press `?` to see every keyboard shortcut. Hover a toolbar button to see what it does and its shortcut. The common ones:

| Key | Action |
|---|---|
| `Space` | Play or pause. The first play counts down from 3. |
| `↑` `↓` | Change the speed, in words per minute. |
| `+` `-` | Change the text size. |
| `←` `→` | Move back or forward one line. Hold `Shift` to move one paragraph. |
| `[` `]` | Change how many lines the Reading window highlights. |
| `Home` | Go back to the top. |
| `p` | Open the Editor. |
| `,` | Open the display settings. |

Scroll the mouse wheel or drag the text to move through the Script by hand. Either one pauses playback.

Speed is measured in words, not pixels. Changing the text size or line spacing changes how far the text moves, not how fast you read.

### Undo a Replace

When a Replace arrives, the Prompter shows **Undo** at the top of the window for 10 seconds. Undo brings back the Script as it was before the Replace. You can also restore any earlier Version from the Editor's **History** menu.

### Display settings

Open the settings panel (`,`) to change:

- the font, text size, line spacing, and colors
- how dark the dimming is
- the Reading window's size and position
- column width, or full width with minimum side margins
- the top and bottom margins, which stay blank
- mirroring, for use behind beam-splitter glass
- the countdown, and whether it runs only at the start

Settings are saved in your browser. The Script is saved by the server, so every open Prompter and Editor shows the same one.

## Use the Editor

Press `p` in the Prompter, or open http://localhost:4747/editor, to edit the Script in its own window. Put it on a second screen and edit while the Prompter runs.

- There is no save button. The Editor sends your text to the server when you stop typing for a moment, and every open Prompter updates.
- The Prompter keeps your place through an edit. It stays on the word you were reading, even when you add or delete text before it. If you delete that word, it moves to the next word that is still there.
- A Push from `tp` or Claude Code appears in the Editor as it arrives, without losing what you are typing. `Ctrl+Z` undoes it like any other change.
- **Markdown** and **Text** set the Script's format. Markdown turns on syntax highlighting.
- **Preview** shows the rendered markdown beside the text.
- **History** lists the last 20 Versions of the Script, with when and why each was saved. **Restore** makes one the Script again. The Script it replaces is saved first, so you can go back.
- **Open Prompter** goes to the Prompter window.

If two Editor windows are typing at the same moment, the last one to send wins. See [ADR 0002](./docs/adr/0002-editor-syncs-full-text.md).

## Project layout

- `apps/web` holds the Prompter and the Editor: Vite, React, TanStack Router, shadcn/ui on Base UI, and CodeMirror 6.
- `apps/server` is the Hono server that owns the Script and the Script history.
- `packages/protocol` holds the types and request schema shared by the web app, server, and CLI.
- `packages/cli` is the `tp` command.
- `plugins/teleprompter` is the Claude Code plugin.
- `apps/e2e` holds the Playwright smoke test.
- [GLOSSARY.md](./GLOSSARY.md) defines the project's terms, such as Script, Reading window, and Push.
- [docs/adr](./docs/adr) records design decisions.

Run the checks from the repository root:

```bash
pnpm -r typecheck
pnpm -r test
pnpm test:e2e
```

`pnpm test:e2e` builds the app and drives it in Chromium. Install the browser once with `pnpm --filter @teleprompter/e2e exec playwright install chromium`. The test starts its own server on a free port with a temporary data directory.

## Roadmap

1. Prompter: done.
2. Local server, Push API, the `tp` command, and a Claude Code plugin: done.
3. Editor window with undo, Script history, and live sync to the Prompter: done.
4. Spoken-only mode for markdown, which hides headings, italics, and code.
5. Obsidian plugin to send selected text to the Prompter.
6. Follow mode: scrolls as you speak, using a local Whisper server.
7. Azure Speech as an optional speech-to-text service.
8. Docker image.

## License

[MIT](./LICENSE)
