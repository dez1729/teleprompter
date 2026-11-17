import { isNil } from "es-toolkit";
import { useQuery } from "@tanstack/react-query";
import { fetchVoices } from "@/lib/scriptApi";
import { voiceGroups, voiceLabel } from "./voiceNames";

interface Props {
  id: string;
  describedBy: string;
  value: string;
  onChange: (voice: string) => void;
}

// The Narrator's voices, asked of the server each time the settings open, so a voice added to Kokoro shows up.
export const VoiceSelect = ({ id, describedBy, value, onChange }: Props) => {
  const voices = useQuery({ queryKey: ["voices"], queryFn: fetchVoices, staleTime: 0 });
  const listed = voices.data?.voices ?? [];
  // A saved voice that Kokoro no longer has, or that could not be listed, stays chosen until another is picked.
  const groups = voiceGroups(value === "" || listed.includes(value) ? listed : [value, ...listed]);
  const defaultLabel = isNil(voices.data) ? "Server default" : `Server default: ${voiceLabel(voices.data.default)}`;

  return (
    <>
      <select
        id={id}
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&_optgroup]:bg-popover [&_optgroup]:text-popover-foreground [&_option]:bg-popover [&_option]:text-popover-foreground"
      >
        <option value="">{defaultLabel}</option>
        {groups.map((group) => (
          <optgroup
            key={group.language}
            label={group.language}
          >
            {group.voices.map((voice) => (
              <option
                key={voice.name}
                value={voice.name}
              >
                {voice.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {voices.isPending && <p className="text-xs text-muted-foreground">Asking Kokoro for its voices…</p>}
      {voices.isError && (
        <p
          role="alert"
          className="text-xs text-destructive"
        >
          {voices.error.message}
        </p>
      )}
    </>
  );
};
