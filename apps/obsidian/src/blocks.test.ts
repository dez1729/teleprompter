import { describe, expect, it } from "vitest";
import { blockText, findBlocks } from "./blocks.ts";

const note = [
  "---",
  "title: Talk",
  "---",
  "# Talk",
  "",
  "%% tp-default %%",
  "Good evening.",
  "%% /tp %%",
  "",
  "## Opening",
  "%% tp %%",
  "Thanks for coming.",
  "```",
  "# not a heading",
  "```",
  "%% /tp %%",
  "",
  "## Close",
  "Goodnight.",
  "",
].join("\n");

const textOf = (kind: string, nth = 0) => {
  const block = findBlocks(note)
    .filter((found) => found.kind === kind)
    .at(nth)!;
  return blockText(note, block);
};

describe("findBlocks", () => {
  it("finds the marked ranges and every heading, skipping frontmatter and code", () => {
    expect(findBlocks(note).map(({ kind, buttonLine }) => [kind, buttonLine])).toEqual([
      ["section", 3],
      ["default", 5],
      ["section", 9],
      ["marked", 10],
      ["section", 17],
    ]);
  });

  it("Pushes the text between the markers, without them", () => {
    expect(textOf("default")).toBe("Good evening.");
    expect(textOf("marked")).toBe("Thanks for coming.\n```\n# not a heading\n```");
  });

  it("ends a section at the next heading of the same or a higher level", () => {
    expect(textOf("section", 1)).toBe("## Opening\n%% tp %%\nThanks for coming.\n```\n# not a heading\n```\n%% /tp %%");
    expect(textOf("section", 0)).toBe(note.split("\n").slice(3).join("\n").trimEnd());
  });

  it("runs an unclosed range to the end of the note", () => {
    const [block] = findBlocks("%%tp%%\nOne.\nTwo.");
    expect(blockText("%%tp%%\nOne.\nTwo.", block!)).toBe("One.\nTwo.");
  });
});
