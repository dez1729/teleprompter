import { cn } from "@/lib/utils";
import type { NudgeReadout } from "./usePrompter";
import { useShownFor } from "./useShownFor";

const HUD_VISIBLE_MS = 1200;

interface NudgeHudProps {
  readout: NudgeReadout | null;
}

export const NudgeHud = ({ readout }: NudgeHudProps) => {
  const visible = useShownFor(readout, HUD_VISIBLE_MS);

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-20 z-20 flex justify-center transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      <span className="rounded-lg border bg-popover/90 px-3 py-1.5 text-sm text-popover-foreground tabular-nums shadow-lg backdrop-blur">
        {readout?.text}
      </span>
    </div>
  );
};
