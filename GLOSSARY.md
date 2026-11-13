# Teleprompter

A local teleprompter that displays a Script in a scrolling view, paced by a fixed speed or by following the reader's voice. Text arrives from editors (Obsidian, Claude Code) or is pasted in directly.

## Content

**Script**:
The single current body of text being prompted. Replaced or appended to as a whole; recent prior versions are kept as Script history.
_Avoid_: Document, text, note, prompt

**Script history**:
The last 20 prior versions of the Script, kept so a Replace or an Edit can be undone. A version is saved before every Push and before an Edit that follows 30 seconds of quiet.

**Version**:
One saved copy of the Script in Script history.
_Avoid_: Library, saved scripts

**Source**:
Where the Script's text came from (an Obsidian note title, Claude Code, or a paste) and whether it is markdown.

**Push**:
Text sent into the teleprompter from outside it, as either a Replace or an Append.
_Avoid_: Send, import, upload

**Replace**:
A Push that swaps out the whole Script and returns to the top, paused.

**Append**:
A Push that adds text to the end of the Script without moving the Current line.

**Edit**:
A change to the Script made by hand in the Editor. Every Prompter keeps its Current line on the same words through an Edit.
_Avoid_: Apply, save, commit

**Spoken-only**:
A display filter for markdown Scripts that hides everything not meant to be read aloud (headings, italics, code, frontmatter, comments, callouts). The stored Script is unchanged.
_Avoid_: Clean mode, strip markdown

**Section marker**:
A thin dimmed divider shown in place of a heading while Spoken-only is on.
_Avoid_: Header line

## Surfaces

**Prompter**:
The window that displays the Script for reading.
_Avoid_: Viewer, player, display

**Editor**:
A separate window for viewing and changing the Script by hand; its changes reach every open Prompter.
_Avoid_: Edit view, admin

## Display

**Reading window**:
The horizontal band of the display where text is shown at full brightness; everything outside it sits under a dimming overlay. Its height and vertical position are adjustable.
_Avoid_: Focus area, highlight, viewport

**Current line**:
The line being read: the reader's position in the Script. It enters the Reading window below the top edge and rises to the top edge as it is read, so it is never dimmed.
_Avoid_: Cursor, playhead

**Dimming overlay**:
The dark translucent layer over all text outside the Reading window.
_Avoid_: Mask, shade

## Pacing

**Scroll mode**:
How the Current line advances: either Auto or Follow.

**Auto**:
Scroll mode that advances at a constant Speed.
_Avoid_: Timed, manual

**Follow**:
Scroll mode that advances by matching the reader's spoken words against the Script.
_Avoid_: Voice mode, listen mode, karaoke

**Transcriber**:
The speech-to-text service Follow listens through: local Whisper or Azure Speech.
_Avoid_: STT, recognizer, voice engine

**Lookahead window**:
The span of upcoming words after the Current line that Follow searches for a match.

**Read words**:
The words before the reader's position, optionally shown in a distinct color (karaoke style). In Follow they are the words actually spoken; in Auto, the words the pace has passed.
_Avoid_: Spoken highlight, progress fill

**Speed**:
The Auto pace, in words per minute. Independent of text size.
_Avoid_: Scroll rate, px/s
