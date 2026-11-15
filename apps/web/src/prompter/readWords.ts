import { useLayoutEffect, useRef, type RefObject } from "react";
import { isNil } from "es-toolkit";

/** How many words the reader has read: those wholly before the cursor. */
export const readCount = (cursor: number, wordCount: number): number => {
  return Math.max(0, Math.min(wordCount, Math.floor(cursor)));
};

/**
 * Marks the first `count` words of the Script as read with a data-read attribute, which the stylesheet colors.
 * Only the words whose state changed are touched, so following the cursor costs nothing per frame.
 */
export const useReadWords = (textRef: RefObject<HTMLElement | null>, words: unknown, count: number) => {
  const marked = useRef<{ words: unknown; spans: HTMLElement[]; count: number }>({ words: null, spans: [], count: 0 });

  useLayoutEffect(() => {
    const text = textRef.current;
    if (isNil(text)) return;
    let { current } = marked;
    if (current.words !== words) {
      // New words are new elements, none of them marked yet.
      current = { words, spans: [...text.querySelectorAll<HTMLElement>("[data-word]")], count: 0 };
      marked.current = current;
    }

    const target = Math.min(count, current.spans.length);
    for (let i = current.count; i < target; i++) current.spans.at(i)!.dataset.read = "";
    for (let i = target; i < current.count; i++) delete current.spans.at(i)!.dataset.read;
    current.count = target;
  }, [textRef, words, count]);
};
