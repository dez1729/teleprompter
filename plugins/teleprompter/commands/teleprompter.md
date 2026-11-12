---
description: Push text to the Teleprompter (replace or append)
argument-hint: replace|append [text]
allowed-tools: Bash(tp send:*)
---

Push text to the local Teleprompter with the `tp` command. Arguments: `$ARGUMENTS`

The first word is the mode, `replace` or `append`. If it is missing or is anything else, ask which one the user wants and stop.

- `replace` swaps out the whole Script and returns every Prompter to the top.
- `append` adds to the end and keeps the reader's place.

The rest of the arguments is the text to send. If there is none, send your own previous reply in this conversation, exactly as written.

Send the text on stdin through a quoted heredoc, so quotes, `$` and backticks in it are not interpreted:

```bash
tp send --replace --source "Claude Code" <<'TELEPROMPTER_EOF'
<the text, unchanged>
TELEPROMPTER_EOF
```

Use `--append` for append. Add `--markdown` when the text is markdown. If the text itself contains the line `TELEPROMPTER_EOF`, use a different delimiter.

If `tp send` says it cannot reach the server, tell the user to run `tp serve` in the repository and try again. If the command is not found, tell them to put `tp` on their PATH as the project README describes. Otherwise report the result in one sentence.
