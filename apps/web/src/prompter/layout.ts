import { isNil } from "es-toolkit";
import type { PacedLine } from "./playback";

export interface Line {
  top: number;
  height: number;
  firstWord: number;
  endWord: number;
}

export interface Layout {
  lines: readonly Line[];
  /** How many times faster than its line the gap below it (paragraph spacing, a Section marker) scrolls by. */
  gapPace: number;
}

export const EMPTY_LAYOUT: Layout = { lines: [], gapPace: 1 };

export const lineIndexOf = (layout: Layout, cursor: number): number => {
  const { lines } = layout;
  if (lines.length === 0) return -1;
  let lo = 0;
  let hi = lines.length - 1;

  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;

    if (lines.at(mid)!.firstWord <= cursor) lo = mid;
    else hi = mid - 1;
  }

  return lo;
};

const lineSpan = (layout: Layout, index: number): number => {
  const line = layout.lines.at(index)!;
  const next = layout.lines.at(index + 1);
  return !isNil(next) ? next.top - line.top : line.height;
};

/**
 * A line scrolls its own row at reading pace, then the gap below it at `gapPace` times that pace.
 * `rowShare` is the part of the line's progress spent on the row.
 */
const lineMotion = (layout: Layout, index: number) => {
  const line = layout.lines.at(index)!;
  const gap = Math.max(0, lineSpan(layout, index) - line.height);
  const stretch = 1 + gap / line.height / layout.gapPace;
  return { line, gap, stretch, rowShare: 1 / stretch };
};

/** Each line's first word and how far it scrolls relative to its own row, for pacing. */
export const pacedLines = (layout: Layout): PacedLine[] => {
  return layout.lines.map((line, index) => ({ start: line.firstWord, stretch: lineMotion(layout, index).stretch }));
};

export const cursorToY = (layout: Layout, cursor: number): number => {
  const index = lineIndexOf(layout, cursor);
  if (index < 0) return 0;
  const { line, gap, rowShare } = lineMotion(layout, index);
  const fraction = Math.min(1, Math.max(0, (cursor - line.firstWord) / (line.endWord - line.firstWord)));

  return fraction <= rowShare
    ? line.top + (fraction / rowShare) * line.height
    : line.top + line.height + ((fraction - rowShare) / (1 - rowShare)) * gap;
};

/**
 * How far below the Reading window's top edge the Current line starts. Smooth scrolling lifts the
 * line by one row while it is read, so it starts a row (or more, for taller windows) down and
 * finishes at the top edge, staying inside the window the whole time.
 */
export const readingOffset = (windowHeightLines: number, lineHeightPx: number): number => {
  return Math.floor(windowHeightLines / 2) * lineHeightPx;
};

export const yToCursor = (layout: Layout, y: number): number => {
  const { lines } = layout;
  if (lines.length === 0) return 0;
  const first = lines.at(0)!;
  if (y <= first.top) return first.firstWord;
  let lo = 0;
  let hi = lines.length - 1;

  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;

    if (lines.at(mid)!.top <= y) lo = mid;
    else hi = mid - 1;
  }

  const { line, gap, rowShare } = lineMotion(layout, lo);
  const offset = y - line.top;
  const fraction =
    offset <= line.height || gap === 0
      ? Math.min(1, offset / line.height) * rowShare
      : rowShare + Math.min(1, (offset - line.height) / gap) * (1 - rowShare);

  return line.firstWord + fraction * (line.endWord - line.firstWord);
};

/** Groups word spans (marked with data-word) by rendered row. Positions are relative to the container. */
export const measureLayout = (container: HTMLElement, gapPace: number): Layout => {
  const spans = container.querySelectorAll<HTMLElement>("[data-word]");
  const lines: Line[] = [];

  spans.forEach((span, word) => {
    const rowTop = span.offsetTop;
    const current = lines.at(-1);
    const lineHeight = parseFloat(getComputedStyle(span).lineHeight) || span.offsetHeight;

    if (!isNil(current) && Math.abs(current.top - (rowTop - (lineHeight - span.offsetHeight) / 2)) < 1) {
      current.endWord = word + 1;
      return;
    }

    lines.push({
      top: rowTop - (lineHeight - span.offsetHeight) / 2,
      height: lineHeight,
      firstWord: word,
      endWord: word + 1,
    });
  });

  return { lines, gapPace };
};
