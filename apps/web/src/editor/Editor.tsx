import { Eye, MonitorPlay } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { PushRequest, Script, ScriptFormat } from "@teleprompter/protocol";
import { isNil } from "es-toolkit";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScriptStream, sendScript } from "@/lib/scriptApi";
import { EDITOR_WINDOW, openNamedWindow, PROMPTER_WINDOW } from "@/lib/windows";
import { normalizeLineBreaks } from "./changes";
import { createScriptEditor, type ScriptEditor } from "./codemirror";
import { HistoryMenu } from "./HistoryMenu";
import { ScriptSync, type SyncStatus } from "./scriptSync";

/** The markdown renderer is loaded when the preview is first opened. */
const Preview = lazy(() => import("./Preview").then((module) => ({ default: module.Preview })));

const STATUS_TEXT: Record<SyncStatus, string> = {
  saved: "Saved",
  pending: "Saving…",
  failed: "Could not save. Retrying…",
};

export const Editor = () => {
  const parent = useRef<HTMLDivElement>(null);
  const session = useRef<{ editor: ScriptEditor; sync: ScriptSync } | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [status, setStatus] = useState<SyncStatus>("saved");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    document.title = "Editor · Teleprompter";
    window.name ||= EDITOR_WINDOW;

    /** The Editor starts from the server's Script, so nothing can be typed over a Script it has not seen. */
    const start = (initial: Script) => {
      const sync = new ScriptSync(
        {
          doc: () => editor.text(),
          applyRemote: (changes) => editor.applyRemote(changes),
          send: (text, format) => sendScript({ kind: "edit", text, ...(format && { format }) } satisfies PushRequest as PushRequest),
          onState: (state) => {
            setStatus(state.status);
            setScript(state.script);
            // The editor is created with the Script's format; this keeps its highlighting in step afterwards.
            session.current?.editor.setFormat(state.script.format);
          },
        },
        initial
      );
      const editor = createScriptEditor({
        parent: parent.current!,
        text: normalizeLineBreaks(initial.text),
        format: initial.format,
        onChange: (next) => {
          setText(next);
          sync.documentChanged();
        },
      });

      setScript(initial);
      setText(editor.text());
      editor.focus();
      return { editor, sync };
    };

    const stream = new ScriptStream({
      onConnection: setConnected,
      onMessage: (message) => {
        if (session.current) session.current.sync.receive(message.script, message.type === "snapshot");
        else session.current = start(message.script);
      },
    });
    stream.start();

    const flush = () => session.current?.sync.flush();
    window.addEventListener("pagehide", flush);

    return () => {
      window.removeEventListener("pagehide", flush);
      stream.stop();
      session.current?.sync.dispose();
      session.current?.editor.destroy();
      session.current = null;
    };
  }, []);

  const format = script?.format;

  const chooseFormat = (next: ScriptFormat) => {
    if (next !== format) session.current?.sync.setFormat(next);
  };

  return (
    <div className="bg-background text-foreground flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2">
        <h1 className="text-sm font-medium">Script</h1>
        <p className="text-muted-foreground min-w-0 flex-1 truncate text-sm">{script?.source ? `Source: ${script.source}` : "No Source"}</p>
        <p
          role="status"
          className="text-muted-foreground text-xs"
        >
          {connected === false ? "Not connected to server" : script ? STATUS_TEXT[status] : "Connecting…"}
        </p>
        <ToggleGroup
          aria-label="Format"
          variant="outline"
          size="sm"
          spacing={0}
          disabled={isNil(script)}
          value={format ? [format] : []}
          onValueChange={(next) => next.at(0) !== undefined && chooseFormat(next.at(0) as ScriptFormat)}
        >
          <ToggleGroupItem value="markdown">Markdown</ToggleGroupItem>
          <ToggleGroupItem value="text">Text</ToggleGroupItem>
        </ToggleGroup>
        <Toggle
          variant="outline"
          size="sm"
          pressed={previewing}
          onPressedChange={setPreviewing}
        >
          <Eye data-icon="inline-start" />
          Preview
        </Toggle>
        <HistoryMenu revision={script?.revision ?? 0} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => openNamedWindow("/", PROMPTER_WINDOW)}
        >
          <MonitorPlay data-icon="inline-start" />
          Open Prompter
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <div
          ref={parent}
          className="min-w-0 flex-1"
        />
        {previewing && script && (
          <div className="min-w-0 flex-1 border-l">
            <Suspense>
              <Preview
                text={text}
                format={script.format}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
};
