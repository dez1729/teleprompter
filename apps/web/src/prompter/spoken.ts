import { GFM, parser } from "@lezer/markdown";
import type { Block } from "./script";

const markdown = parser.configure(GFM);
type Node = ReturnType<typeof markdown.parse>["topNode"];

/** Inline nodes whose text is not read aloud. Emphasis is italics: stage directions and asides. */
const HIDDEN_INLINE = new Set([
  "Emphasis",
  "Strikethrough",
  "InlineCode",
  "Image",
  "Autolink",
  "Comment",
  "HTMLTag",
  "ProcessingInstruction",
  "URL",
  "LinkTitle",
  "LinkLabel",
  "TaskMarker",
  "EmphasisMark",
  "LinkMark",
  "QuoteMark",
  "ListMark",
]);
const SECTION_BREAK = /^(ATXHeading|SetextHeading)|^HorizontalRule$/;
const LIST = /^(BulletList|OrderedList|ListItem)$/;
const CALLOUT = /^\s*>\s*\[!/;

const keepLineBreaks = (match: string) => match.replace(/[^\n]/g, "");

/** Obsidian syntax that CommonMark does not know: frontmatter, %% comments, footnotes, embeds and wikilinks. */
const rewriteObsidian = (source: string): string => {
  return source
    .replace(/^---\n[\s\S]*?\n---[ \t]*(?=\n|$)/, keepLineBreaks)
    .replace(/%%[\s\S]*?%%/g, keepLineBreaks)
    .replace(/^\[\^[^\]\n]+\]:.*$/gm, "")
    .replace(/\[\^[^\]\s]+\]/g, "")
    .replace(/!\[\[[^\]\n]*\]\]/g, "")
    .replace(/\[\[([^\]|\n]*)\|([^\]\n]*)\]\]/g, "$2")
    .replace(/\[\[([^\]#\n]*)[^\]\n]*\]\]/g, "$1");
};

const inlineText = (text: string, node: Node): string => {
  let out = "";
  let pos = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    out += text.slice(pos, child.from);
    if (child.name === "Escape") out += text.slice(child.from + 1, child.to);
    else if (child.name === "HardBreak") out += "\n";
    else if (!HIDDEN_INLINE.has(child.name)) out += inlineText(text, child);
    pos = child.to;
  }

  return out + text.slice(pos, node.to);
};

const linesOf = (text: string, paragraph: Node) => inlineText(text, paragraph).split("\n");

const listLines = (text: string, list: Node, lines: string[]): string[] => {
  for (let child = list.firstChild; child; child = child.nextSibling) {
    if (child.name === "Paragraph" || child.name === "Task") lines.push(...linesOf(text, child));
    else if (LIST.test(child.name)) listLines(text, child, lines);
  }

  return lines;
};

/**
 * The Spoken-only projection of a markdown Script: only the words meant to be read aloud.
 * Headings and horizontal rules become section starts. Code, tables, HTML, comments, callouts
 * and italics are left out. A list reads as one paragraph, one line per item.
 */
export const spokenBlocks = (source: string): Block[] => {
  const text = rewriteObsidian(source);
  const blocks: Block[] = [];
  let sectionStart = false;
  const add = (lines: string[]) => {
    blocks.push({ lines, sectionStart });
    sectionStart = false;
  };

  const visit = (container: Node) => {
    for (let child = container.firstChild; child; child = child.nextSibling) {
      if (SECTION_BREAK.test(child.name)) sectionStart = true;
      else if (child.name === "Paragraph") add(linesOf(text, child));
      else if (child.name === "BulletList" || child.name === "OrderedList") add(listLines(text, child, []));
      else if (child.name === "Blockquote" && !CALLOUT.test(text.slice(child.from, child.to))) visit(child);
    }
  };

  visit(markdown.parse(text).topNode);
  return blocks;
};
