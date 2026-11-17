import { isNil } from "es-toolkit";
import { useEffect, useRef, useState, type Dispatch } from "react";
import { lineStartAt, type PacedLine, type PlaybackEvent } from "../playback";
import type { TokenizedScript } from "../script";
import { Narration, type NarrationStatus } from "./narration";
import type { VoicePace } from "./pace";
import { passageAt } from "./passages";
import type { VoiceOutput } from "./voiceOutput";

const OFF: NarrationStatus = { kind: "off" };
// A move by hand starts the voice again once the reader has stopped moving for this long, not on every wheel tick.
const SETTLE_MS = 250;

interface ReadAloudOptions {
  // True while Read aloud is on and the Prompter is scrolling, in Auto or Follow.
  speaking: boolean;
  // Where the reader is, or is moving to: the voice starts at the beginning of this line.
  position: number;
  lines: readonly PacedLine[];
  // Changes on each move by hand, which starts the voice again from the new place.
  handMoves: number;
  tokens: TokenizedScript;
  wpm: number;
  // The Voice setting: a name, or "" for the server's default.
  voiceName: string;
  output: VoiceOutput;
}

// Runs a Narration while `speaking`, from the Current line, and again from where the reader moves by hand. An error
// stays shown after the voice stops, until it starts again.
export const useReadAloud = (
  { speaking, position, lines, handMoves, tokens, wpm, voiceName, output }: ReadAloudOptions,
  dispatch: Dispatch<PlaybackEvent>
): NarrationStatus => {
  const [status, setStatus] = useState<NarrationStatus>(OFF);
  const [wasSpeaking, setWasSpeaking] = useState(speaking);

  if (wasSpeaking !== speaking) {
    setWasSpeaking(speaking);
    if (speaking) setStatus({ kind: "starting" });
  }

  // Read when the voice starts and at each passage, not on every frame of scrolling.
  const latest = useRef({ position, lines, tokens, wpm, voiceName });
  latest.current = { position, lines, tokens, wpm, voiceName };
  const [paces] = useState(() => new Map<string, VoicePace>());
  const startedAtMove = useRef(handMoves);

  // The Narration holds the audio and the async work; the effect only starts and stops it.
  useEffect(() => {
    // Moves while paused are not seen here: playing starts from the new place anyway, and at once.
    const moved = startedAtMove.current !== handMoves;
    startedAtMove.current = handMoves;
    if (!speaking) return;
    let narration: Narration | null = null;

    const start = () => {
      narration = new Narration(
        {
          passageAt: (from, minWords) => passageAt(latest.current.tokens, from, minWords),
          wpm: () => latest.current.wpm,
          voice: () => latest.current.voiceName,
          dispatch,
          onStatus: setStatus,
        },
        output,
        lineStartAt(latest.current.lines, latest.current.position),
        paces
      );

      narration.start();
    };

    const settling = moved ? setTimeout(start, SETTLE_MS) : null;
    if (!moved) start();

    return () => {
      if (!isNil(settling)) clearTimeout(settling);
      narration?.stop();
    };
  }, [speaking, handMoves, output, paces, dispatch]);

  return speaking || status.kind === "error" ? status : OFF;
};
