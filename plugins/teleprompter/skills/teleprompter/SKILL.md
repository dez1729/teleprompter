---
name: teleprompter
description: Put text in the user's local Teleprompter. Use when the user asks to send, put, push or add a script or other text to the prompter or teleprompter, such as "put that in the prompter" or "add this to the teleprompter".
---

# Teleprompter

The user runs a local Teleprompter. `tp send` pushes text into it. The server must be running (`tp serve`).

## Choose the mode

- **Replace** (`--replace`) when the text is a new script. The Prompter returns to the top, paused. This is the default for "put that in the prompter".
- **Append** (`--append`) when the user says add, append or continue. The text goes after the current Script and the reader keeps their place.

## What to send

Send the script text the user asked for, such as a script you just wrote. Send only the words to be read aloud, without a preamble like "Here is your script" and without commentary. Do not change the wording unless the user asked.

## How to send

Pipe the text on stdin through a quoted heredoc so quoting is safe:

```bash
tp send --replace --source "Claude Code" <<'TELEPROMPTER_EOF'
<the script text>
TELEPROMPTER_EOF
```

Add `--markdown` only when the text is markdown the user wants kept as markdown. If the text contains the line `TELEPROMPTER_EOF`, use another delimiter.

## When it fails

`tp send` exits non-zero and prints why. If it cannot reach the server, tell the user to run `tp serve`. If `tp` is not found, tell them to put it on their PATH (the project README explains how). Do not retry in a loop and do not start the server yourself.
