import { describe, expect, it } from "vitest";
import { appendText, fittedWpm, guessFormat, normalizeWord, PushRequestSchema } from "./index.ts";

describe("appendText", () => {
  it("joins with a blank line and drops trailing whitespace", () => {
    expect(appendText("a b\n\n", "c")).toBe("a b\n\nc");
  });

  it("does not lead with a blank line when the Script is empty", () => {
    expect(appendText("  \n", "c")).toBe("c");
  });
});

describe("guessFormat", () => {
  it("detects markdown headings and plain text", () => {
    expect(guessFormat("# Title\nbody")).toBe("markdown");
    expect(guessFormat("just words")).toBe("text");
  });
});

describe("PushRequestSchema", () => {
  it("rejects blank text, unknown kinds and unknown keys", () => {
    expect(PushRequestSchema.safeParse({ kind: "replace", text: "  " }).success).toBe(false);
    expect(PushRequestSchema.safeParse({ kind: "nope", text: "a" }).success).toBe(false);
    expect(PushRequestSchema.safeParse({ kind: "replace", text: "a", extra: 1 }).success).toBe(false);
  });

  it("accepts empty text only for an Edit", () => {
    expect(PushRequestSchema.safeParse({ kind: "edit", text: "" }).success).toBe(true);
    expect(PushRequestSchema.safeParse({ kind: "append", text: "" }).success).toBe(false);
  });

  it("accepts a minimal request", () => {
    expect(PushRequestSchema.safeParse({ kind: "append", text: "a" }).success).toBe(true);
  });
});

describe("normalizeWord", () => {
  it("keeps only lowercase letters and digits, folding accents", () => {
    expect(normalizeWord("Delivery,")).toBe("delivery");
    expect(normalizeWord("Café")).toBe("cafe");
    expect(normalizeWord("—")).toBe("");
  });
});

describe("fittedWpm", () => {
  const steady = (count: number) => Array.from({ length: count }, (_, i) => ({ position: i * 2.5, at: i * 1000 }));

  it("is the words per minute along the points", () => {
    expect(fittedWpm(steady(5))).toBe(150);
  });

  it("waits for three points over two seconds", () => {
    expect(fittedWpm(steady(2))).toBeNull();
    expect(fittedWpm(steady(3))).toBe(150);
    expect(fittedWpm(steady(3).map((point) => ({ ...point, at: point.at / 2 })))).toBeNull();
  });

  it("evens out one point a couple of words off", () => {
    const points = steady(8).map((point, i) => (i === 4 ? { ...point, position: point.position + 2 } : point));
    expect(fittedWpm(points)).toBeGreaterThan(140);
    expect(fittedWpm(points)).toBeLessThan(160);
  });
});
