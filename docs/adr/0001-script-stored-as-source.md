# Script is stored as source; Spoken-only is a display-time projection

Scripts often arrive as markdown with headings, italic stage directions and other text not meant to be read aloud. We store the Script exactly as pushed (source markdown) and apply Spoken-only as a filter at display time, rather than stripping at ingest. Follow matches against the same filtered projection the Prompter shows, so the filter and the aligner can never disagree about which words exist.

## Considered Options

- **Strip at ingest**: simpler storage, but lossy: the filter could not be toggled off, the Editor would show mangled text, and Script history would hold filtered copies.
- **Store both source and filtered text**: two copies that can drift whenever the filter rules change.

## Consequences

- Positions (Current line, Follow matches, edit anchoring) live in the projected text and must be mapped back to source offsets when the Editor changes the Script.
- Changing the filter rules changes what every existing Script displays; this is intended.
