# Teleprompter

A local teleprompter that runs in your browser. Paste a Script and the Prompter scrolls it at a steady pace. The lines you are reading stay bright inside the Reading window, and the text above and below it is dimmed.

The project is in progress. The Prompter works today. A local server, editor plugins, and voice-driven scrolling are next (see [Roadmap](#roadmap)).

## Run it

You need Node 22 or later and pnpm.

```bash
pnpm install
pnpm dev
```

Open http://localhost:4748, then press `p` to paste a Script.

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

Settings, the Script, and any unapplied edits are saved in your browser.

## Project layout

- `apps/web` holds the Prompter: Vite, React, TanStack Router, and shadcn/ui on Base UI.
- [GLOSSARY.md](./GLOSSARY.md) defines the project's terms, such as Script, Reading window, and Push.
- [docs/adr](./docs/adr) records design decisions.

Run the checks from the repository root:

```bash
pnpm -r typecheck
pnpm -r test
```

## Roadmap

1. Prompter: done.
2. Local server, Push API, the `tp` command, and a Claude Code plugin: in progress.
3. Editor window with undo, Script history, and live sync to the Prompter.
4. Spoken-only mode for markdown, which hides headings, italics, and code.
5. Obsidian plugin to send selected text to the Prompter.
6. Follow mode: scrolls as you speak, using a local Whisper server.
7. Azure Speech as an optional speech-to-text service.
8. Docker image.

## License

[MIT](./LICENSE)
