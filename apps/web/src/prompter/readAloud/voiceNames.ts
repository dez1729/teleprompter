// Kokoro names a voice by language, then sex, then name: `bf_emma` is British English, female, Emma.
const LANGUAGES: Record<string, string> = {
  a: "American English",
  b: "British English",
  e: "Spanish",
  f: "French",
  h: "Hindi",
  i: "Italian",
  j: "Japanese",
  p: "Brazilian Portuguese",
  z: "Mandarin Chinese",
};

const OTHER = "Other";

export interface VoiceGroup {
  language: string;
  voices: { name: string; label: string }[];
}

/** "bf_emma" reads as "Emma (female)". A name Kokoro did not follow its pattern for is shown as it is. */
export const voiceLabel = (name: string): string => {
  const match = /^[a-z]([fm])_([^+]+)$/.exec(name);
  if (!match) return name;
  const [, sex, rest] = match;
  const person = rest!.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
  return `${person} (${sex === "f" ? "female" : "male"})`;
};

/** Voices grouped by language, in the order Kokoro uses, with Other last. */
export const voiceGroups = (names: readonly string[]): VoiceGroup[] => {
  const groups = new Map<string, VoiceGroup["voices"]>();

  for (const name of names) {
    const language = /^[a-z][fm]_/.test(name) ? (LANGUAGES[name.at(0)!] ?? OTHER) : OTHER;
    groups.set(language, [...(groups.get(language) ?? []), { name, label: voiceLabel(name) }]);
  }

  const order = [...Object.values(LANGUAGES), OTHER];
  return [...groups].map(([language, voices]) => ({ language, voices })).sort((a, b) => order.indexOf(a.language) - order.indexOf(b.language));
};
