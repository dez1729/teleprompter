import { formatDuration } from "./timer";
import { useTimerReading, type TimerReader } from "./useTimer";

const OVER_TARGET_COLOR = "#f87171";

interface Props {
  timer: TimerReader;
  // 0 means no target.
  targetMin: number;
  mirror: boolean;
}

// A low-key corner readout. Mirror flips it as it flips the text, since both are read in the same glass.
export const TimerReadout = ({ timer, targetMin, mirror }: Props) => {
  const { elapsedMs } = useTimerReading(timer);
  const targetMs = targetMin * 60_000;
  const over = targetMs > 0 && elapsedMs > targetMs;

  return (
    <p
      role="timer"
      className="text-sm tabular-nums opacity-60"
      style={{ color: over ? OVER_TARGET_COLOR : undefined, transform: mirror ? "scaleX(-1)" : undefined }}
    >
      {formatDuration(elapsedMs)}
      {targetMs > 0 && ` / ${formatDuration(targetMs)}`}
    </p>
  );
};
