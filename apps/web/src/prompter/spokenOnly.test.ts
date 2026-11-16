import { describe, expect, it } from 'vitest'
import { project } from './script'

const spoken = (text: string) => project({ text, format: 'markdown' }, { spokenOnly: true })
const lines = (text: string) => {
  const { words } = spoken(text)
  return words.reduce<string[]>((out, word) => {
    if (out.length === 0 || word.lineBreakBefore || word.paragraphIndex !== words[words.indexOf(word) - 1]?.paragraphIndex) {
      out.push(word.text)
    } else out[out.length - 1] += ` ${word.text}`
    return out
  }, [])
}
const texts = (text: string) => spoken(text).words.map((w) => w.text)

describe('Spoken-only', () => {
  it('hides ATX and setext headings', () => {
    expect(texts('# Title\n\nHello there\n\nSub\n---\n\nMore words')).toEqual(['Hello', 'there', 'More', 'words'])
  })

  it('hides italics, including bold-italic, but keeps bold words', () => {
    expect(texts('Say *quietly* then **loudly** and ***both*** now _soft_')).toEqual(['Say', 'then', 'loudly', 'and', 'now'])
  })

  it('hides inline code, fenced code and indented code', () => {
    expect(texts('Run `npm test` now\n\n```js\nconst a = 1\n```\n\nafter\n\n    indented()\n\nend')).toEqual([
      'Run', 'now', 'after', 'end',
    ])
  })

  it('hides frontmatter, HTML comments and raw HTML', () => {
    expect(texts('---\ntitle: x\n---\n\nHello <!-- note --> world\n\n<!-- block -->\n\n<div>raw</div>\n\nbye')).toEqual([
      'Hello', 'world', 'bye',
    ])
  })

  it('hides Obsidian callouts but keeps ordinary quotes without the marker', () => {
    expect(texts('> [!note] Title\n> hidden body\n\nkept\n\n> quoted words')).toEqual(['kept', 'quoted', 'words'])
  })

  it('strips link, list, image and rule syntax', () => {
    expect(texts('See [the docs](http://x.y) ![alt](img.png) ok\n\n***\n\n- one\n- two\n\n1. three\n2. four')).toEqual([
      'See', 'the', 'docs', 'ok', 'one', 'two', 'three', 'four',
    ])
  })

  it('puts each list item and each source line break on its own line', () => {
    expect(lines('- one a\n- two b\n\nfirst\nsecond')).toEqual(['one a', 'two b', 'first', 'second'])
  })

  it('leaves snake_case words and asterisks in code alone', () => {
    expect(texts('Use snake_case_name and `a * b * c` here')).toEqual(['Use', 'snake_case_name', 'and', 'here'])
  })

  it('shows a Section marker before the next paragraph, once for consecutive headings', () => {
    const { words } = spoken('# One\n## Two\n\nalpha\n\nbeta\n\n# Three\n\ngamma')
    expect(words.map((w) => [w.text, w.sectionBefore])).toEqual([
      ['alpha', true],
      ['beta', false],
      ['gamma', true],
    ])
  })

  it('makes no Section marker for a trailing heading or when nothing is spoken after it', () => {
    const { words } = spoken('alpha\n\n# Last\n\n```\ncode\n```')
    expect(words.map((w) => w.sectionBefore)).toEqual([false])
  })

  it('leaves text-format Scripts and the off setting as raw text', () => {
    const raw = '# Title\n\n*italic* `code`'
    const asText = project({ text: raw, format: 'text' }, { spokenOnly: true })
    const off = project({ text: raw, format: 'markdown' }, { spokenOnly: false })
    expect(asText.words.map((w) => w.text)).toEqual(['#', 'Title', '*italic*', '`code`'])
    expect(off).toEqual(asText)
    expect(asText.words.every((w) => !w.sectionBefore)).toBe(true)
  })
})
