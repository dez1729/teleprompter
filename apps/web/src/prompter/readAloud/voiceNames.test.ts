import { describe, expect, it } from "vitest";
import { voiceGroups, voiceLabel } from "./voiceNames";

describe("voice names", () => {
  it("reads Kokoro's names as a person and their sex", () => {
    expect(voiceLabel("bf_emma")).toBe("Emma (female)");
    expect(voiceLabel("am_price_inno")).toBe("Price inno (male)");
    expect(voiceLabel("af_bella+af_sky")).toBe("af_bella+af_sky");
    expect(voiceLabel("custom")).toBe("custom");
  });

  it("groups voices by language, with names it does not know last", () => {
    expect(voiceGroups(["custom", "bf_emma", "af_heart", "jf_alpha", "af_sky"])).toEqual([
      {
        language: "American English",
        voices: [
          { name: "af_heart", label: "Heart (female)" },
          { name: "af_sky", label: "Sky (female)" },
        ],
      },
      { language: "British English", voices: [{ name: "bf_emma", label: "Emma (female)" }] },
      { language: "Japanese", voices: [{ name: "jf_alpha", label: "Alpha (female)" }] },
      { language: "Other", voices: [{ name: "custom", label: "custom" }] },
    ]);
  });
});
