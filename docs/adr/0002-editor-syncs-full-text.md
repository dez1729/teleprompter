# The Editor syncs full text; the server is last-write-wins

The Editor sends the whole Script text to the server after each pause in typing, and the server keeps whichever write arrives last. Changes that arrive while the reader is typing (a Push, another window) are applied to the Editor as a CodeMirror change set rebased over the unsent local edits, so typing is never lost and a Push lands in the undo history.

There is one user, one machine, and rarely two writers at once, so a CRDT or operational-transform server would cost far more than the conflicts it prevents.

## Considered Options

- **CRDT (Yjs) shared document**: correct merging for any number of writers, but adds a sync protocol, a binary document format beside the Script file, and a dependency on every client including the CLI.
- **Lock the Editor while a Push arrives**: simple, but loses or blocks typing.

## Consequences

- Two Editor windows typing at the same moment can overwrite each other's latest few seconds. Accepted.
- Prompters receive full text and map their position through a word-level diff, so the anchoring logic lives in the Prompter, not the server.
