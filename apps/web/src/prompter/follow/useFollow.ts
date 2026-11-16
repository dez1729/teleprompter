import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import type { PlaybackEvent, PlaybackMode } from "../playback";
import type { Word } from "../script";
import { normalizeWord } from "@teleprompter/protocol";
import { FollowSession, type FollowPlace, type FollowStatus } from "./session";

const OFF: FollowStatus = { kind: "off" };

// Runs a FollowSession while the mode is following. `expectedWpm`, the Auto Speed, is the reader's pace until
// their own is measured. An error stays shown after Follow stops, until it starts again.
export const useFollow = (mode: PlaybackMode, words: readonly Word[], expectedWpm: number, dispatch: Dispatch<PlaybackEvent>): FollowStatus => {
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
  const expectedPace = useRef(expectedWpm / 60000);
  expectedPace.current = expectedWpm / 60000;

  // The session holds the microphone and the async work; the effect only starts and stops it.
  useEffect(() => {
    if (!following) return;
    const session = new FollowSession({ place: () => place.current, dispatch, onStatus: setStatus }, expectedPace.current);
    session.start();
    return () => session.stop();
  }, [following, dispatch]);

  return following || status.kind === "error" ? status : OFF;
};
