import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, Transaction, type ChangeSet } from '@codemirror/state'
import { drawSelection, EditorView, keymap, placeholder } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import type { ScriptFormat } from '@teleprompter/protocol'

/** Colors come from the app's CSS variables, so the Editor follows the app's theme. */
const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'var(--background)', color: 'var(--foreground)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: '15px',
      lineHeight: '1.7',
    },
    '.cm-content': { padding: '24px 0', caretColor: 'var(--foreground)' },
    '.cm-line': { padding: '0 28px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'color-mix(in oklch, var(--foreground) 22%, transparent)',
    },
    '.cm-placeholder': { color: 'var(--muted-foreground)' },
  },
  { dark: true },
)

const markdownColors = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700', color: 'oklch(0.85 0.1 85)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'oklch(0.78 0.1 235)' },
  { tag: tags.monospace, color: 'oklch(0.8 0.09 160)' },
  { tag: tags.quote, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.meta, tags.comment, tags.contentSeparator], color: 'var(--muted-foreground)' },
])

const languageFor = (format: ScriptFormat) => (format === 'markdown' ? markdown() : [])

export interface ScriptEditor {
  text: () => string
  /** Applies a change from the server as its own undo step, so Ctrl+Z takes back exactly that change. */
  applyRemote: (changes: ChangeSet) => void
  setFormat: (format: ScriptFormat) => void
  focus: () => void
  destroy: () => void
}

export function createScriptEditor(options: {
  parent: HTMLElement
  text: string
  format: ScriptFormat
  onChange: (text: string) => void
}): ScriptEditor {
  const language = new Compartment()
  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        placeholder('Type or paste your Script'),
        language.of(languageFor(options.format)),
        syntaxHighlighting(markdownColors),
        theme,
        EditorView.contentAttributes.of({ 'aria-label': 'Script' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange(update.state.doc.toString())
        }),
      ],
    }),
  })
  return {
    text: () => view.state.doc.toString(),
    applyRemote: (changes) =>
      view.dispatch({ changes, annotations: [isolateHistory.of('full'), Transaction.remote.of(true)] }),
    setFormat: (format) => view.dispatch({ effects: language.reconfigure(languageFor(format)) }),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  }
}
