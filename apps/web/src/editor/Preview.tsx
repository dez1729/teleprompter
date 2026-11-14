import { useDeferredValue } from 'react'
import Markdown from 'react-markdown'
import type { ScriptFormat } from '@teleprompter/protocol'

export function Preview({ text, format }: { text: string; format: ScriptFormat }) {
  const shown = useDeferredValue(text)
  return (
    <div aria-label="Preview" className="script-preview h-full overflow-y-auto px-7 py-6">
      {format === 'markdown' ? <Markdown>{shown}</Markdown> : <div className="whitespace-pre-wrap">{shown}</div>}
    </div>
  )
}
