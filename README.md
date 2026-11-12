# Teleprompter

A local teleprompter that runs in your browser. Paste a Script and the Prompter scrolls it at a steady pace. The lines you are reading stay bright inside the Reading window, and the text above and below it is dimmed.

A local server holds the Script, so other tools can send text to the Prompter. The `tp` command and a Claude Code plugin do that today. Voice-driven scrolling is next (see [Roadmap](#roadmap)).

## Run it

You need Node 22.18 or later and pnpm.

```bash
pnpm install
pnpm build
pnpm start
```

Open http://localhost:4747, then press `p` to paste a Script. One process serves the app and the API on port 4747.

Set `PORT` or `HOST` to change where it listens. It binds `127.0.0.1` by default, so only your machine can reach it. The server stores the Script in `$TELEPROMPTER_DATA_DIR/script.json`, which defaults to `${XDG_DATA_HOME:-~/.local/share}/teleprompter/`.

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

`tp send` takes `--replace` or `--append`, and optionally `--markdown` for markdown text and `--source <label>` to say where the text came from, such as a note title. It reads stdin when you give no text. A Replace returns every open Prompter to the top, paused. An Append keeps the reader's place.

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
| `GET /api/events` | A server-sent event stream. It sends the current Script as a `script` event, then one `change` event per change: `{ kind, script }`. |

`kind` is `replace`, `append` or `apply`. Replace and Append are Pushes. Apply is the Script dialog's edit, and each Prompter keeps its place if the words it has read are unchanged. `format` is `markdown` or `text`, and is detected when omitted. `revision` goes up by one on every change.

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
| `p` | Open the Script dialog. |
| `,` | Open the display settings. |

Scroll the mouse wheel or drag the text to move through the Script by hand. Either one pauses playback.

Speed is measured in words, not pixels. Changing the text size or line spacing changes how far the text moves, not how fast you read.

### Edit the Script

The Script dialog (`p`) opens with your current text selected. Paste over it, or edit it, then press **Apply** or `Ctrl+Enter`. If nothing before your reading position changed, you keep your place. Otherwise the Prompter goes back to the top.

The dialog keeps your edits when you close it. An amber dot on the toolbar shows that you have edits you have not applied. **Discard** throws them away. **Append clipboard** adds your clipboard text to the end of the Script without moving your place.

### Display settings

Open the settings panel (`,`) to change:

- the font, text size, line spacing, and colors
- how dark the dimming is
- the Reading window's size and position
- column width, or full width with minimum side margins
- the top and bottom margins, which stay blank
- mirroring, for use behind beam-splitter glass
- the countdown, and whether it runs only at the start

Settings and any unapplied edits are saved in your browser. The Script is saved by the server, so every open Prompter shows the same one.

## Project layout

- `apps/web` holds the Prompter: Vite, React, TanStack Router, and shadcn/ui on Base UI.
- `apps/server` is the Hono server that owns the Script.
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
3. Editor window with undo, Script history, and live sync to the Prompter.
4. Spoken-only mode for markdown, which hides headings, italics, and code.
5. Obsidian plugin to send selected text to the Prompter.
6. Follow mode: scrolls as you speak, using a local Whisper server.
7. Azure Speech as an optional speech-to-text service.
8. Docker image.

## License

[MIT](./LICENSE)
