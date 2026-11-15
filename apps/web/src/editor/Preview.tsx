import { useDeferredValue } from "react";
import Markdown from "react-markdown";
import type { ScriptFormat } from "@teleprompter/protocol";

interface PreviewProps {
  text: string;
  format: ScriptFormat;
}

export const Preview = ({ text, format }: PreviewProps) => {
  const shown = useDeferredValue(text);
  return (
    <div
      aria-label="Preview"
      className="script-preview h-full overflow-y-auto px-7 py-6"
    >
      {format === "markdown" ? <Markdown>{shown}</Markdown> : <div className="whitespace-pre-wrap">{shown}</div>}
    </div>
  );
};
