export const speakingRateText = (wpm: number | null): string => `${wpm ?? "--"} wpm`;

interface Props {
  wpm: number | null;
  mirror: boolean;
}

// Sits under the Timer, low-key like it, and flips with Mirror for the same reason.
export const SpeakingRateReadout = ({ wpm, mirror }: Props) => (
  <p
    aria-label="Speaking rate"
    data-speaking-rate
    className="text-sm tabular-nums opacity-60"
    style={{ transform: mirror ? "scaleX(-1)" : undefined }}
  >
    {speakingRateText(wpm)}
  </p>
);
