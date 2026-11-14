import { describe, expect, it } from 'vitest'
import { placementFor } from './anchor'
import { tokenize } from './script'

/** What the Prompter shows: one string per paragraph, lines joined by " / ", "——" for a Section marker. */
function shown(text: string, { format = 'markdown', spokenOnly = true }: { format?: 'markdown' | 'text'; spokenOnly?: boolean } = {}) {
  const tokens = tokenize({ text, format }, spokenOnly)
  const out: string[] = []
  tokens.paragraphStarts.forEach((start, paragraph) => {
    if (tokens.sectionStarts.includes(paragraph)) out.push('——')
    const end = tokens.paragraphStarts[paragraph + 1] ?? tokens.words.length
    out.push(
      tokens.words
        .slice(start, end)
        .map((word) => (word.lineBreakBefore ? `/ ${word.text}` : word.text))
        .join(' '),
    )
  })
  return out
}

describe('tokenize', () => {
  it('splits text into paragraphs and keeps line breaks', () => {
    expect(shown('One two\nthree\n\n\nFour', { format: 'text' })).toEqual(['One two / three', 'Four'])
  })

  it('shows a markdown Script as written when Spoken-only is off', () => {
    expect(shown('# Title\n\n*aside* **bold**', { spokenOnly: false })).toEqual(['# Title', '*aside* **bold**'])
  })

  it('leaves a text Script alone when Spoken-only is on', () => {
    expect(shown('# not a heading\n\n*kept*', { format: 'text' })).toEqual(['# not a heading', '*kept*'])
  })
})

describe('Spoken-only', () => {
  it('replaces headings and rules with Section markers, never before the first paragraph', () => {
    expect(shown('# Intro\n\nHello.\n\n## Part two\n\nMore.\n\n---\n\nEnd.\n\nSetext\n======\n\nLast.')).toEqual([
      'Hello.',
      '——',
      'More.',
      '——',
      'End.',
      '——',
      'Last.',
    ])
  })

  it('shows one marker for headings in a row and none for a trailing heading', () => {
    expect(shown('Hello.\n\n# A\n\n## B\n\nMore.\n\n# Notes')).toEqual(['Hello.', '——', 'More.'])
  })

  it('drops italics, code, strikethrough, images and HTML, and keeps bold and link text', () => {
    expect(
      shown('Say **this** *(pause)* and `code` ~~not~~ ![alt](x.png) [the site](http://x "t") <b>loud</b> <!-- note -->.'),
    ).toEqual(['Say this and the site loud .'])
  })

  it('hides italics nested in bold and bold nested in italics', () => {
    expect(shown('A **bold _aside_** B *italic **bold*** C ***both*** D')).toEqual(['A bold B C D'])
  })

  it('keeps words that only look like markdown', () => {
    expect(shown('2 * 3 * 4 snake_case_name \\*star\\*')).toEqual(['2 * 3 * 4 snake_case_name *star*'])
  })

  it('drops code blocks, tables, HTML blocks and link definitions', () => {
    const text = 'Before.\n\n```\nconst x = 1\n```\n\n    indented code\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<div>\nhtml\n</div>\n\n[ref]: http://x\n\nAfter.'
    expect(shown(text)).toEqual(['Before.', 'After.'])
  })

  it('reads a list as one paragraph with a line per item', () => {
    expect(shown('- one\n- two *aside*\n  1. nested\n- [ ] task\n\nNext.')).toEqual(['one / two / nested / task', 'Next.'])
  })

  it('keeps a quote and drops a callout', () => {
    expect(shown('> quoted\n> text\n\n> [!note] Reminder\n> body\n\nEnd.')).toEqual(['quoted / text', 'End.'])
  })

  it('drops frontmatter, %% comments and footnotes, and reads wikilinks by their shown text', () => {
    const text = '---\ntitle: Show\ntags: [a]\n---\nHello %%secret%% [[Page]] [[Page|alias]] [[Page#Part]] ![[pic.png]] note[^1].\n\n%%\nhidden\n%%\n\n[^1]: The footnote.'
    expect(shown(text)).toEqual(['Hello Page alias Page note.'])
  })

  it('keeps soft and hard line breaks', () => {
    expect(shown('one\ntwo  \nthree\\\nfour')).toEqual(['one / two / three / four'])
  })

  it('shows nothing when nothing is read aloud', () => {
    expect(shown('# Only a heading\n\n*only an aside*')).toEqual([])
  })
})

describe('turning Spoken-only on or off', () => {
  const text = '# Scene one\n\nWelcome *(smile)* to the show.\n\nToday we talk about `code`.'
  const on = tokenize({ text, format: 'markdown' }, true)
  const off = tokenize({ text, format: 'markdown' }, false)
  const wordAt = (tokens: typeof on, cursor: number) => tokens.words[Math.floor(cursor)]!.text

  it('keeps the reader on the same word', () => {
    const toOn = placementFor('edit', off, on)
    const toOff = placementFor('edit', on, off)
    if (toOn === 'reset' || toOff === 'reset') throw new Error('expected the place to be kept')
    expect(wordAt(on, toOn(off.words.findIndex((w) => w.text === 'Today')))).toBe('Today')
    expect(wordAt(off, toOff(on.words.findIndex((w) => w.text === 'show.')))).toBe('show.')
  })

  it('moves a reader on a hidden word to the next word read aloud', () => {
    const toOn = placementFor('edit', off, on)
    if (toOn === 'reset') throw new Error('expected the place to be kept')
    expect(wordAt(on, toOn(off.words.findIndex((w) => w.text === '*(smile)*')))).toBe('to')
  })
})
