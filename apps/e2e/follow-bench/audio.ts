// Speech for the Follow benches: Kokoro speaks, Whisper times each word, and the WAV is cut and padded for Chromium's
// fake microphone.
import { normalizeWord } from "@teleprompter/protocol";
import { isNil } from "es-toolkit";

const KOKORO_URL = process.env.KOKORO_URL ?? "http://127.0.0.1:8880";
const WHISPER_URL = process.env.TELEPROMPTER_WHISPER_URL ?? "http://127.0.0.1:2022";
const WHISPER_MODEL = process.env.TELEPROMPTER_WHISPER_MODEL ?? "Systran/faster-whisper-small";

export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface Pcm {
  fmt: Buffer;
  data: Buffer;
  rate: number;
  blockAlign: number;
}

export const speak = async (text: string, speed = 1): Promise<ArrayBuffer> => {
  const response = await fetch(new URL("/v1/audio/speech", KOKORO_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "kokoro", input: text, voice: "af_heart", response_format: "wav", speed }),
  });

  if (!response.ok) throw new Error(`Kokoro at ${KOKORO_URL} answered ${response.status}: ${await response.text()}`);
  return response.arrayBuffer();
};

export const timeWords = async (audio: ArrayBuffer, scriptWords: readonly string[]): Promise<TimedWord[]> => {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "speech.wav");
  form.append("model", WHISPER_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  const response = await fetch(new URL("/v1/audio/transcriptions", WHISPER_URL), { method: "POST", body: form });
  if (!response.ok) throw new Error(`Whisper at ${WHISPER_URL} answered ${response.status}: ${await response.text()}`);
  const { words } = (await response.json()) as { words: { word: string; start: number; end: number }[] };
  const heard = words.filter((w) => normalizeWord(w.word) !== "");

  if (heard.length !== scriptWords.length) {
    throw new Error(`Whisper heard ${heard.length} words in a Script of ${scriptWords.length}; reword the paragraph`);
  }

  return heard.map((w, i) => ({ word: scriptWords.at(i)!, start: w.start, end: w.end }));
};

export const parseWav = (wav: Buffer): Pcm => {
  let offset = 12;
  let fmt: Buffer | undefined;
  let data: Buffer | undefined;

  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    let size = wav.readUInt32LE(offset + 4);
    // A streamed WAV may leave the data size unset.
    if (id === "data" && (size === 0 || size === 0xffffffff || offset + 8 + size > wav.length)) size = wav.length - offset - 8;
    const body = wav.subarray(offset + 8, offset + 8 + size);
    if (id === "fmt ") fmt = body;
    if (id === "data") data = body;
    offset += 8 + size + (size % 2);
  }

  // Chromium's fake microphone plays 16-bit PCM; anything else would make every run silent.
  if (isNil(fmt) || isNil(data) || fmt.readUInt16LE(0) !== 1 || fmt.readUInt16LE(14) !== 16) {
    throw new Error("Kokoro did not send a 16-bit PCM WAV");
  }

  return { fmt, data, rate: fmt.readUInt32LE(4), blockAlign: fmt.readUInt16LE(12) };
};

const chunk = (id: string, body: Buffer) => {
  const header = Buffer.alloc(8);
  header.write(id, 0, "ascii");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
};

export const toWav = ({ fmt }: Pcm, data: Buffer) => {
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(4 + 8 + fmt.length + 8 + data.length, 4);
  riff.write("WAVE", 8, "ascii");
  return Buffer.concat([riff, chunk("fmt ", fmt), chunk("data", data)]);
};
