import type { Nodes, PhrasingContent, RootContent } from 'mdast'
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { frontmatter } from 'micromark-extension-frontmatter'
import type { Block } from './script'

const CALLOUT = /^\[![^\]]+\]/

function isCallout(node: Nodes): boolean {
  if (node.type !== 'blockquote') return false
  const paragraph = node.children[0]
  const first = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined
  return first?.type === 'text' && CALLOUT.test(first.value)
}

function inlineText(nodes: readonly PhrasingContent[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.value
        case 'break':
          return '\n'
        case 'strong':
        case 'delete':
        case 'link':
        case 'linkReference':
          return inlineText(node.children)
        default:
          // Emphasis, inline code, raw HTML, images and footnote references are not spoken.
          return ''
      }
    })
    .join('')
}

/** The spoken lines of a node. Each paragraph contributes its lines and each list item its own. */
function lines(node: RootContent): string[] {
  switch (node.type) {
    case 'paragraph':
      return inlineText(node.children).split('\n')
    case 'list':
    case 'listItem':
      return node.children.flatMap(lines)
    case 'blockquote':
      return isCallout(node) ? [] : node.children.flatMap(lines)
    default:
      return []
  }
}

function collect(nodes: readonly RootContent[], blocks: Block[]) {
  for (const node of nodes) {
    if (node.type === 'heading') {
      if (blocks.at(-1)?.kind !== 'section') blocks.push({ kind: 'section' })
    } else if (node.type === 'blockquote' && !isCallout(node)) {
      collect(node.children, blocks)
    } else {
      const spoken = lines(node)
      if (spoken.length > 0) blocks.push({ kind: 'paragraph', lines: spoken })
    }
  }
}

/**
 * Markdown reduced to what is meant to be spoken. GFM is left out on purpose: tables and
 * strikethrough are rare in scripts and the extension would add bundle weight for them.
 */
export function spokenBlocks(markdown: string): Block[] {
  const tree = fromMarkdown(markdown, {
    extensions: [frontmatter(['yaml', 'toml'])],
    mdastExtensions: [frontmatterFromMarkdown(['yaml', 'toml'])],
  })
  const blocks: Block[] = []
  collect(tree.children, blocks)
  return blocks
}
