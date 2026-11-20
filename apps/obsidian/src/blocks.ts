import { isNil } from "es-toolkit";

export type BlockKind = "marked" | "default" | "section";

/** A range of a note that has its own Push button. Line numbers are 0-based; `end` is exclusive. */
export interface Block {
  kind: BlockKind;
  /** The line the button sits on: the opening marker, or the heading. */
  buttonLine: number;
  /** The first line of the text the button Pushes. */
  start: number;
  end: number;
}

const OPEN = /^%%\s*tp(-default)?\s*%%$/;
const CLOSE = /^%%\s*\/tp\s*%%$/;
const HEADING = /^(#{1,6})\s/;
const FENCE = /^\s*(`{3,}|~{3,})/;

const frontmatterEnd = (lines: string[]): number => {
  if (lines.at(0)?.trim() !== "---") return 0;
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return close === -1 ? 0 : close + 1;
};

/** The marked ranges and heading sections of a note, in the order they start. */
export const findBlocks = (text: string): Block[] => {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  const sections: { level: number; block: Block }[] = [];
  let open: Block | null = null;
  let fence: string | null = null;

  for (let index = frontmatterEnd(lines); index < lines.length; index++) {
    const line = lines.at(index)!;
    const trimmed = line.trim();
    const fenceMark = FENCE.exec(line)?.at(1);

    if (!isNil(fence)) {
      if (fenceMark?.startsWith(fence)) fence = null;
      continue;
    }

    if (!isNil(fenceMark)) {
      fence = fenceMark;
      continue;
    }

    const opener = OPEN.exec(trimmed);

    if (!isNil(opener) && isNil(open)) {
      open = { kind: isNil(opener.at(1)) ? "marked" : "default", buttonLine: index, start: index + 1, end: lines.length };
      blocks.push(open);
      continue;
    }

    if (CLOSE.test(trimmed) && !isNil(open)) {
      open.end = index;
      open = null;
      continue;
    }

    const level = HEADING.exec(line)?.at(1)?.length;
    if (isNil(level)) continue;

    while ((sections.at(-1)?.level ?? 0) >= level) sections.pop()!.block.end = index;
    const section: Block = { kind: "section", buttonLine: index, start: index, end: lines.length };
    sections.push({ level, block: section });
    blocks.push(section);
  }

  return blocks;
};

/** The text a block Pushes, without trailing blank lines. */
export const blockText = (text: string, block: Block): string => text.split("\n").slice(block.start, block.end).join("\n").trimEnd();
