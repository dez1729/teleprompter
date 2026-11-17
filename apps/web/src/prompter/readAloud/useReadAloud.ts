import { useEffect, useRef, useState, type Dispatch } from "react";
import type { PlaybackEvent } from "../playback";
import type { TokenizedScript } from "../script";
import { Narration, type NarrationStatus } from "./narration";
import { INITIAL_PACE } from "./pace";
import { passageAt } from "./passages";
import type { VoiceOutput } from "./voiceOutput";

const OFF: NarrationStatus = { kind: "off" };

interface ReadAloudOptions {
  // True while Read aloud is on and the Prompter is scrolling, in Auto or Follow.
  speaking: boolean;
  // The Current line's word when the voice starts.
  cursor: number;
  tokens: TokenizedScript;
  wpm: number;
  voice: VoiceOutput;
}

// Runs a Narration while `speaking`, from the Current line. An error stays shown after the voice stops, until it
// starts again.
export const useReadAloud = ({ speaking, cursor, tokens, wpm, voice }: ReadAloudOptions, dispatch: Dispatch<PlaybackEvent>): NarrationStatus => {
  const [status, setStatus] = useState<NarrationStatus>(OFF);
  const [wasSpeaking, setWasSpeaking] = useState(speaking);

  if (wasSpeaking !== speaking) {
    setWasSpeaking(speaking);
    if (speaking) setStatus({ kind: "starting" });
  }

  const latest = useRef({ cursor, tokens, wpm });
  latest.current = { cursor, tokens, wpm };
  const pace = useRef(INITIAL_PACE);

  // The Narration holds the audio and the async work; the effect only starts and stops it.
  useEffect(() => {
    if (!speaking) return;

    const narration = new Narration(
      {
        passageAt: (from, minWords) => passageAt(latest.current.tokens, from, minWords),
        wpm: () => latest.current.wpm,
        dispatch,
        onStatus: setStatus,
      },
      voice,
      latest.current.cursor,
      pace.current
    );

    narration.start();

    return () => {
      pace.current = narration.pace;
      narration.stop();
    };
  }, [speaking, voice, dispatch]);

  return speaking || status.kind === "error" ? status : OFF;
};
