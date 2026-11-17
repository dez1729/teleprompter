import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import type { PlaybackEvent, PlaybackMode } from "../playback";
import type { Word } from "../script";
import { normalizeWord } from "@teleprompter/protocol";
import type { Microphone } from "./microphone";
import { FollowSession, type FollowPlace, type FollowStatus } from "./session";

const OFF: FollowStatus = { kind: "off" };

interface FollowOptions {
  // The reader's pace until their own is measured.
  expectedWpm: number;
  // Follow starts listening again when this changes.
  listen: () => Promise<Microphone>;
}

// Runs a FollowSession while the mode is following. An error stays shown after Follow stops, until it starts again.
export const useFollow = (mode: PlaybackMode, words: readonly Word[], options: FollowOptions, dispatch: Dispatch<PlaybackEvent>): FollowStatus => {
  const following = mode.kind === "following";
  const [status, setStatus] = useState<FollowStatus>(OFF);
  // Turning Follow on starts from "starting", not from whatever the last session ended on.
  const [wasFollowing, setWasFollowing] = useState(following);

  if (wasFollowing !== following) {
    setWasFollowing(following);
    if (following) setStatus({ kind: "starting" });
  }

  const script = useMemo(() => words.map((word) => normalizeWord(word.text)), [words]);
  const place = useRef<FollowPlace>({ script, target: 0 });
  place.current = { script, target: mode.kind === "following" ? mode.target : 0 };
  const { listen } = options;
  const expectedPace = useRef(options.expectedWpm / 60000);
  expectedPace.current = options.expectedWpm / 60000;

  // The session holds the microphone and the async work; the effect only starts and stops it.
  useEffect(() => {
    if (!following) return;
    const session = new FollowSession({ listen, place: () => place.current, dispatch, onStatus: setStatus }, expectedPace.current);
    session.start();
    return () => session.stop();
  }, [following, listen, dispatch]);

  return following || status.kind === "error" ? status : OFF;
};
