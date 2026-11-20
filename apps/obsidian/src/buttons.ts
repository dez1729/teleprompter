import { RangeSetBuilder, type StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { isNil } from "es-toolkit";
import { editorInfoField, type MarkdownFileInfo, type MarkdownPostProcessor, setIcon } from "obsidian";
import { type Block, blockText, findBlocks } from "./blocks.ts";

/** Pushes a block's text as a Replace, with the note's title as its Source. */
export type PushBlock = (text: string, basename: string) => void;

const LABELS: Record<Block["kind"], string> = {
  default: "Replace the Teleprompter Script with this range",
  marked: "Replace the Teleprompter Script with this range",
  section: "Replace the Teleprompter Script with this section",
};

const pushButton = (block: Block, onClick: () => void): HTMLElement => {
  const button = document.createElement("button");
  button.className = "teleprompter-push clickable-icon";
  button.ariaLabel = LABELS[block.kind];
  setIcon(button, "presentation");
  // Keeps the editor's cursor where it is, so clicking does not reveal the markers.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
};

// Obsidian's typings reach @codemirror/state through their own symlink, which tsc treats as a second copy of the package.
const noteInfo = (view: EditorView): MarkdownFileInfo => view.state.field(editorInfoField as unknown as StateField<MarkdownFileInfo>);

class PushWidget extends WidgetType {
  private readonly block: Block;
  private readonly push: PushBlock;

  constructor(block: Block, push: PushBlock) {
    super();
    this.block = block;
    this.push = push;
  }

  override eq(other: PushWidget) {
    return other.block.kind === this.block.kind && other.block.buttonLine === this.block.buttonLine;
  }

  toDOM(view: EditorView) {
    return pushButton(this.block, () => {
      const text = view.state.doc.toString();
      const block = findBlocks(text).find((found) => found.buttonLine === this.block.buttonLine && found.kind === this.block.kind);
      if (!isNil(block)) this.push(blockText(text, block), noteInfo(view).file?.basename ?? "Obsidian");
    });
  }

  override ignoreEvent() {
    return true;
  }
}

const decorate = (view: EditorView, push: PushBlock): DecorationSet => {
  const builder = new RangeSetBuilder<Decoration>();
  for (const block of findBlocks(view.state.doc.toString())) {
    const line = view.state.doc.line(block.buttonLine + 1);
    builder.add(line.to, line.to, Decoration.widget({ widget: new PushWidget(block, push), side: 1 }));
  }
  return builder.finish();
};

/** Live Preview and Source mode: a button at the end of each marker and heading line. */
export const editorButtons = (push: PushBlock) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = decorate(view, push);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.decorations = decorate(update.view, push);
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );

/** Reading view: a button on each rendered section that holds a marker or a heading. */
export const readingButtons =
  (push: PushBlock, basename: (sourcePath: string) => string): MarkdownPostProcessor =>
  (element, context) => {
    const section = context.getSectionInfo(element);
    if (isNil(section)) return;

    for (const block of findBlocks(section.text)) {
      if (block.buttonLine < section.lineStart || block.buttonLine > section.lineEnd) continue;
      const target = element.querySelector("h1, h2, h3, h4, h5, h6") ?? element;
      target.append(pushButton(block, () => push(blockText(section.text, block), basename(context.sourcePath))));
    }
  };
