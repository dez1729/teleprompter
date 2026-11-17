import { describe, expect, it } from "vitest";
import { tokenize } from "../script";
import { passageAt } from "./passages";

const passages = (text: string, from = 0) => {
  const tokens = tokenize({ text, format: "markdown" }, true);
  const out: string[] = [];

  for (let passage = passageAt(tokens, from); passage !== null; passage = passageAt(tokens, passage.end)) out.push(passage.text);
  return out;
};

describe("passageAt", () => {
  it("joins short sentences until the passage has enough words", () => {
    expect(passages("Hi. I am here. This is a longer sentence to read. Then one more.")).toEqual([
      "Hi. I am here. This is a longer sentence to read.",
      "Then one more.",
    ]);
  });

  it("can take a single short sentence, so the first words are heard sooner", () => {
    const tokens = tokenize({ text: "Hi. I am here. This is a longer sentence.", format: "text" }, true);
    expect(passageAt(tokens, 0, 1)?.text).toBe("Hi.");
  });

  it("stops at the end of a paragraph", () => {
    expect(passages("One short line.\n\nA new paragraph starts here.")).toEqual(["One short line.", "A new paragraph starts here."]);
  });

  it("splits a very long sentence", () => {
    const long = Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ");
    expect(passages(long).map((passage) => passage.split(" ").length)).toEqual([40, 10]);
  });

  it("starts from the word being read and reads what Spoken-only shows", () => {
    expect(passages("# Title\n\nWe *(smile)* begin **now** and carry on.", 1)).toEqual(["begin now and carry on."]);
  });

  it("has nothing past the end of the Script", () => {
    expect(passages("Done.", 1)).toEqual([]);
  });
});
