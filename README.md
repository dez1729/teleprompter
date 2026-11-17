# Teleprompter

A local teleprompter that runs in your browser. Write or paste a Script in the Editor and the Prompter scrolls it at a steady pace. The lines you are reading stay bright inside the Reading window, and the text above and below it is dimmed.

A local server holds the Script and its recent history, so other tools can send text to the Prompter. The `tp` command, a Claude Code plugin, and an Obsidian plugin do that today. Follow scrolls the Prompter as you read aloud, using a Whisper server on your machine. Read aloud has the computer speak the Script, using a Kokoro server on your machine, so you can test the pacing.

## Features

### The Prompter

- A Reading window that keeps the lines you are reading bright and dims the rest. Its size, position, and how dark the dimming is are all adjustable.
- Auto scrolling at a Speed in words per minute, so changing the text size or line spacing does not change how fast you read.
- Pacing that keeps short lines up for a minimum time and moves quickly through the space between paragraphs.
- Read words, which colors the words you have already read, karaoke style.
- Move by hand with the arrow keys, the mouse wheel, or by dragging the text, and keep playing from there.
- A countdown before you start, mirroring for beam-splitter glass, and settings for the font, colors, margins, and column width. See [Display settings](#display-settings).
- Keyboard shortcuts for everything, a `?` overlay that lists them, and a short on-screen readout when a key changes a setting. See [Use the Prompter](#use-the-prompter).
- A [Timer](#timer) that counts your reading time, with an optional target length and an estimate of the time left.

### Follow and Read aloud

- [Follow](#follow-your-voice) scrolls as you read aloud, using a Whisper server on your machine. It keeps up with your pace, waits when you pause, and finds you again when you skip ahead or go back.
- [Speaking rate](#speaking-rate) shows how fast you are speaking, in words per minute, while Follow listens.
- [Read aloud](#read-aloud) has the computer speak the Script through a Kokoro server on your machine, with its own Voice speed and a choice of Voice. In Follow, the Prompter follows that voice, so you can see how Follow keeps up.
- Nothing leaves your machine. The audio and the text go only to servers you run.

### Markdown

- [Spoken-only](#spoken-only) hides what you do not read aloud from a markdown Script: headings become Section markers, and italics, code, tables, comments, frontmatter, and callouts are hidden.
- Obsidian syntax is understood: wikilinks show their alias, and `%%` comments, embeds, and callouts are hidden.

### The Editor

- An [Editor](#use-the-editor) window with markdown highlighting and a preview. It saves as you type, and every open Prompter updates.
- Every Prompter stays on the word you were reading through an Edit.
- [Script history](#use-the-editor) keeps the last 20 Versions, and any of them can be restored.
- [Undo a Replace](#undo-a-replace) from the Prompter for 10 seconds after it arrives.

### Push text from other tools

- A local server holds the Script, so every Prompter and Editor shows the same one.
- The [`tp` command](#send-text) Pushes text as a Replace or an Append, from an argument or stdin.
- A [Claude Code plugin](#use-it-from-claude-code): `/teleprompter replace` and `/teleprompter append`, or ask Claude to "put that in the prompter".
- An [Obsidian plugin](#use-it-from-obsidian) that Pushes the selection or the whole note, from the command palette or the right-click menu.
- An [HTTP API](#api) with a live event stream, for anything else.
- Runs on your machine only, with `pnpm start` or [in Docker](#run-it-in-docker).

## Run it

You need Node 22.18 or later and pnpm.

```bash
pnpm install
pnpm build
pnpm start
```

Open http://localhost:4747, then press `p` to open the Editor and write or paste a Script. One process serves the app and the API on port 4747.

Follow needs a Whisper server as well. See [Follow your voice](#follow-your-voice). Read aloud needs a Kokoro server. See [Read aloud](#read-aloud).

Set `PORT` or `HOST` to change where it listens. It binds `127.0.0.1` by default, so only your machine can reach it. The server stores the Script in `script.json` and the Script history in `history.json`. Both are in `$TELEPROMPTER_DATA_DIR`, which defaults to `${XDG_DATA_HOME:-~/.local/share}/teleprompter/`.

### Run it in Docker

You need Docker with Compose. From this checkout:

```bash
docker compose up -d --build
```

Open http://localhost:4747. The container restarts with Docker, and `docker compose down` stops it. The Script and the Script history are kept in the `teleprompter-data` volume, so they survive a rebuild.

The port is published on `127.0.0.1` only. The server answers only requests addressed to its own port, so the host port must be the same as `PORT`. To use another port, such as 8080, set `PORT: 8080` under `environment` and publish `127.0.0.1:8080:8080`.

`tp` and the plugins on your machine reach the container at http://127.0.0.1:4747, as they would reach `tp serve`.

Follow reaches a Whisper server on your machine at http://host.docker.internal:2022, and Read aloud a Kokoro server at http://host.docker.internal:8880. To use others, set `TELEPROMPTER_WHISPER_URL` or `TELEPROMPTER_KOKORO_URL` under `environment`. A server that listens on `127.0.0.1` only cannot be reached from the container on Linux. Make it listen on the Docker bridge address as well, `172.17.0.1` by default (`ip -4 addr show docker0` shows it). Avoid `0.0.0.0`: it opens the server, which has no login, to your whole network.

Without Compose:

```bash
docker build -t teleprompter .
docker run -d --name teleprompter -p 127.0.0.1:4747:4747 -v teleprompter-data:/data --add-host host.docker.internal:host-gateway teleprompter
```

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

### Use it from Obsidian

The Obsidian plugin sends the selection, or the whole note when nothing is selected, to the Prompter. It works in Obsidian on the desktop, on the same computer as the server.

```bash
pnpm install:obsidian /path/to/your/vault
```

This builds the plugin and copies it into the vault's `.obsidian/plugins/teleprompter` folder. Run it again after you update this checkout. Then, in Obsidian, open **Settings → Community plugins** and turn on **Teleprompter**.

- **Teleprompter: Replace the Script with the selection or note** and **Teleprompter: Add the selection or note to the Script** are in the command palette. Assign them hotkeys under **Settings → Hotkeys**.
- The same two actions are in the editor's right-click menu.
- The note's title becomes the Script's source, and the text is sent as markdown, so Spoken-only hides frontmatter, comments, and callouts.
- If the server is not running, a notice tells you to run `tp serve`. To use another address, change **Server address** in the plugin's settings.

If your vault is on Windows and the server runs in WSL, give the Windows path in WSL form, such as `/mnt/c/Users/you/Notes`. WSL forwards http://127.0.0.1:4747 to the server by default. If Obsidian cannot reach it, check that `localhostForwarding` is not turned off in `.wslconfig`.

### API

The server has no login. It rejects requests whose `Host` is not `localhost`, `127.0.0.1` or `[::1]`, and writes from a browser page on another origin. Requests with no `Origin` header, such as from `tp`, are allowed, and so are requests from Obsidian (`app://obsidian.md`). Bodies over 2 MB are refused.

| Request                         | Result                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/script`               | The current Script: `{ text, format, source, revision }`.                                                                                                                 |
| `POST /api/script`              | Changes the Script and returns it. The body is `{ kind, text, format?, source? }`.                                                                                        |
| `GET /api/events`               | A server-sent event stream. It sends the current Script as a `script` event, then one `change` event per change: `{ kind, script, previousVersionId }`.                   |
| `POST /api/transcribe`          | Sends a WAV clip to the Whisper server and returns `{ text }`. Follow uses it. It answers 502 with `{ error }` when the Whisper server cannot be reached or fails.        |
| `POST /api/speak`               | Sends `{ text, speed, voice? }` to the Kokoro server and returns the speech as WAV. Read aloud uses it. `speed` is from 0.25 to 4. It answers 502 like `/api/transcribe`. |
| `GET /api/voices`               | The Kokoro server's voices and the default one: `{ voices, default }`. It answers 502 like `/api/transcribe`.                                                             |
| `GET /api/history`              | The Script history, newest first. Each entry is `{ id, revision, savedAt, reason, source, wordCount, preview }`.                                                          |
| `GET /api/history/:id`          | One Version with its full `text` and `format`.                                                                                                                            |
| `POST /api/history/:id/restore` | Makes that Version the Script again, as a Replace, and returns the Script.                                                                                                |

`kind` is `replace`, `append` or `edit`. Replace and Append are Pushes, and their `text` must not be empty. Edit is a change made in the Editor: it carries the whole text, may be empty, and each Prompter keeps its place on the same words. `format` is `markdown` or `text`. When you omit it, a Push detects it and an Edit keeps the Script's format. `revision` goes up by one on every change.

The server saves a Version of the Script before every Push, and before an Edit that follows 30 seconds with no Edit. It keeps the newest 20 and never saves an empty Script. A Version's `reason` is the kind of change it was saved before. In a `change` event, `previousVersionId` is the Version saved before that change, or `null` if none was saved. Restore that Version to undo the change.

## Use the Prompter

Press `?` to see every keyboard shortcut. Hover a toolbar button to see what it does and its shortcut. The common ones:

| Key     | Action                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Space` | Play or pause, in Auto or Follow. In Auto, the first play counts down from 3, unless the Countdown setting says otherwise. |
| `↑` `↓` | Change the speed, in words per minute.                                                                                     |
| `+` `-` | Change the text size.                                                                                                      |
| `←` `→` | Move back or forward one line. Hold `Shift` to move one paragraph.                                                         |
| `[` `]` | Change how many lines the Reading window highlights.                                                                       |
| `Home`  | Go back to the top.                                                                                                        |
| `f`     | Switch between Auto and Follow.                                                                                            |
| `r`     | Turn Read aloud on or off.                                                                                                 |
| `p`     | Open the Editor.                                                                                                           |
| `s`     | Turn Spoken-only on or off.                                                                                                |
| `t`     | Open the Timer.                                                                                                            |
| `,`     | Open the display settings.                                                                                                 |

Scroll the mouse wheel or drag the text to move through the Script by hand. Scrolling, dragging, and the arrow keys keep playing from where you move to, in Auto or Follow. To have them pause instead, turn off **Keep playing when you move** in Advanced settings.

Speed is measured in words, not pixels. Changing the text size or line spacing changes how far the text moves, not how fast you read.

Each line stays up for at least the minimum time per line. Then the space below it, between paragraphs or at a Section marker, scrolls by faster, so a new paragraph comes up quickly without rushing the line before it. The paragraph pause setting sets how much faster.

### Follow your voice

The Prompter has two Scroll modes, chosen with **Auto | Follow** next to the play button, or with `f`. Auto scrolls at the set Speed. Follow listens to you read aloud and keeps the words you are saying on the Current line. It moves at your pace, slows to a stop when you pause, and catches up when you skip a few words or go back to reread a line.

Choose Follow, then press `Space` or the play button and start reading. Press `Space` again to stop. Speed does not apply in Follow, so it is greyed out. Pressing `f` while scrolling switches to the other mode from the same place.

Follow sends what the microphone hears to a Whisper server on your computer, through the Teleprompter server. Nothing leaves your machine. The browser asks for the microphone the first time.

Any Whisper server with the OpenAI transcription API works. [Speaches](https://speaches.ai) is the default, at http://127.0.0.1:2022, which is also where VoiceMode runs it. To use another server or model, set these before you start the Teleprompter server:

- `TELEPROMPTER_WHISPER_URL`, such as `http://127.0.0.1:8080` for whisper.cpp's server.
- `TELEPROMPTER_WHISPER_MODEL`. The default is `Systran/faster-whisper-small`. A larger model, such as `deepdml/faster-whisper-large-v3-turbo-ct2`, hears better but answers more slowly.

If the Whisper server cannot be reached, Follow stops and the top right corner says why.

Follow aims about a word behind your voice, so it does not get ahead of you. In testing with a recorded voice, it stayed within about one to two words behind it during steady reading, never ran past the end of a sentence the voice had not finished, and stopped about three words past it at a pause in the middle of a sentence. It picked the voice up about two seconds after it started again, or after it started 30 words further on. If you start reading somewhere else, Follow jumps there. Within about 60 words of where you are, it needs two or three words to find you. Further away, it needs about five words in a row. It waits at the end of each sentence until it hears you start the next one, so it does not run on into a sentence you have not started. If it runs ahead of you, it waits rather than moving back. It moves back only when you go back to reread. Until it has heard enough to measure your pace, it assumes the Speed setting. You can also move there yourself with the arrow keys, the mouse wheel, or by dragging the text, and Follow carries on from there, unless you turned off **Keep playing when you move**. If your voice is clearly somewhere else, Follow goes back to it.

#### Speaking rate

While Follow listens, the top right corner shows how fast the voice it hears is going, in words per minute. The control bar shows the same number next to the speaker button. Both show `-- wpm` while nothing is heard: in Auto, before Follow has heard about two seconds of speech, and after about two seconds of quiet. A longer pause starts the count again, so it is the rate of your current stretch of speech, pauses within it included.

The number comes from where in the Script Follow matched your voice over the last ten seconds, fitted as a straight line so that no one match decides it. Going back to reread, or skipping ahead, starts the count again. Words you say that are not in the Script do not count.

This is an experiment. In three runs with recorded voices at about 145, 185 and 225 wpm, the number was within about 5 to 10 wpm of the voice's true rate over the same ten seconds half the time, and read about 2 to 3 wpm low on average. It was never more than about 30 wpm off. To try it yourself, turn on Read aloud in Follow. Follow then hears the voice, which reads at about the Voice speed.

### Read aloud

Read aloud has the computer speak the Script while the Prompter scrolls, so you can hear how it sounds at a pace before you read it yourself. Turn it on with `r` or the speaker button next to **Auto | Follow**, then press `Space` or the play button.

The voice starts from the Current line each time you press play, and stops when you pause. It speaks what the Prompter shows, so Spoken-only applies. It has its own pace, **Voice speed** in the display settings, in words per minute. 150 is the default. **Voice** in the display settings chooses who reads, from the voices your Kokoro server has, grouped by language.

- In Auto, the Prompter scrolls at Speed and the voice reads at Voice speed, so you can hear and see whether the two agree.
- In Follow, the Prompter follows the voice instead of your microphone, as it would follow you. This shows how Follow keeps up with a reader at a known pace.

When you move by hand while it plays, with the arrow keys, the mouse wheel, or by dragging the text, the voice stops and starts again from the beginning of the new Current line once you stop moving.

Read aloud sends the text to a Kokoro text-to-speech server on your computer, through the Teleprompter server. Nothing leaves your machine. [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) is the default, at http://127.0.0.1:8880, which is also where VoiceMode runs it. To use another server or voice, set these before you start the Teleprompter server:

- `TELEPROMPTER_KOKORO_URL`, the server's address.
- `TELEPROMPTER_KOKORO_VOICE`, the voice used when **Voice** is left on **Server default**. The default is `af_heart`.
- `TELEPROMPTER_KOKORO_TIMEOUT_MS`, how long to wait for Kokoro, as a whole number of milliseconds. By default it waits 20000 for a passage and 5000 for the list of voices. Set it higher if Kokoro runs on a CPU and Read aloud stops with "did not answer within 20 s".

The voice measures its own pace as it reads and corrects it. In testing at 150, a 57-word Script came out at 152 words per minute overall, though single sentences ranged from about 125 to 190. If the Kokoro server cannot be reached, the Prompter pauses and the top right corner says why.

### Spoken-only

A markdown Script often holds text you do not read aloud. Spoken-only, which is on by default, hides it:

- Headings and horizontal rules become a short dimmed line, the Section marker.
- Italics, strikethrough, inline code, code blocks, tables, images, and HTML are hidden. Use italics for stage directions.
- Obsidian frontmatter, `%%` comments, footnotes, embeds, and callouts are hidden. A wikilink shows its alias, or the note name.
- Bold text and link text stay. List markers and `>` quote marks are hidden, and a list reads as one paragraph with a line per item.

Press `s` to see the whole Script. The Prompter stays on the word you were reading. Spoken-only changes only what the Prompter shows: the Editor and the stored Script keep every character. A text Script is never filtered.

### Timer

The Timer shows how long you have been reading. The top right corner of the Prompter shows the time, such as `2:14`, or `2:14 / 5:00` when you set a target length. It turns red once you pass the target.

Press `t`, or the clock button in the control bar, to open the Timer. Clicking the Script closes it. Click the pin in its corner to keep it open while you read; then only `t`, Esc, or the clock button close it. The pin is saved in your browser. It has Start or Pause and Reset buttons and an estimate of the time left, worked out from the words still to read and the Speed. In Follow it shows no estimate, since Follow goes at your pace, not the Speed. Its settings are folded under **Settings**. Open it to change them:

- **Run with playback**, on by default. The Timer starts when the Prompter starts scrolling, in Auto or Follow, and pauses when it stops. The countdown is not counted. Restart and a Replace set it back to zero. Turn it off to start, pause, and reset the Timer yourself.
- **Target length**, from 0 to 120 minutes. 0 means no target.
- **Show timer**. Turn it off to hide the time in the corner. The Timer keeps running.

### Undo a Replace

When a Replace arrives, the Prompter shows **Undo** at the top of the window for 10 seconds. Undo brings back the Script as it was before the Replace. You can also restore any earlier Version from the Editor's **History** menu.

### Display settings

Open the settings panel (`,`) to change:

- Spoken-only
- the font, text size, line spacing, and colors
- Read words, which colors the words you have already read, karaoke style, and their color
- the Reading window's size and position
- column or full width
- mirroring, for use behind beam-splitter glass
- the speed
- Read aloud, the Voice speed, and the Voice
- the countdown: At start, before the first play and after you go back to the top; Every play; or Off

**Advanced settings**, at the bottom of the panel, opens the rest in its place. **Back** returns.

- how dark the dimming is
- column width and the side margins
- the top and bottom margins, which stay blank
- the minimum time each line stays up, so a line of one or two words does not pass before you can read it
- the paragraph pause: how quickly the space between paragraphs scrolls by, Short, Normal, or Long
- how long the countdown is
- whether scrolling, dragging, and the arrow keys keep playing or pause

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
- `apps/server` is the Hono server that owns the Script and the Script history, forwards Follow's audio to Whisper, and asks Kokoro to speak for Read aloud.
- `packages/protocol` holds the types and request schema shared by the web app, server, and CLI.
- `packages/cli` is the `tp` command.
- `plugins/teleprompter` is the Claude Code plugin.
- `apps/obsidian` is the Obsidian plugin.
- `apps/e2e` holds the Playwright smoke test and the Follow benchmark.
- `Dockerfile` and `compose.yaml` build and run the server, with the built web app, in a container.
- [GLOSSARY.md](./GLOSSARY.md) defines the project's terms, such as Script, Reading window, and Push.
- [docs/adr](./docs/adr) records design decisions.

Run the checks from the repository root:

```bash
pnpm -r typecheck
pnpm -r test
pnpm test:e2e
```

`pnpm test:e2e` builds the app and drives it in Chromium. Install the browser once with `pnpm --filter @teleprompter/e2e exec playwright install chromium`. The test starts its own server on a free port with a temporary data directory.

`pnpm bench:follow` measures how closely Follow keeps up with a voice. It needs a Whisper server and a Kokoro text-to-speech server running locally, at `http://127.0.0.1:2022` and `http://127.0.0.1:8880` unless `TELEPROMPTER_WHISPER_URL` or `KOKORO_URL` say otherwise. Kokoro speaks a 77-word paragraph, and the recording plays as Chromium's microphone, starting at word 62, 30 and 0 by default. For each run it prints how many seconds Follow takes to come within three words of the voice, how far it trails the voice while reading, and how far it ever gets ahead of the voice or past a sentence end. Choose the starting words and the number of runs with `pnpm bench:follow --from 62 --runs 3`, and add `--trace` to print every cursor sample.

`pnpm bench:rate` checks the Speaking rate the same way. Kokoro speaks a 112-word passage at speeds 0.8, 1 and 1.3, and each second the bench prints the rate the Prompter shows beside the voice's true rate, fitted the same way through where each word started over the last ten seconds, then the mean and median error. Choose the speeds with `pnpm bench:rate --speed 1 --speed 1.5`.

## License

[MIT](./LICENSE)
