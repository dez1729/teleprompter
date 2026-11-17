import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { EMPTY_SCRIPT, type PushRequest, type Script } from "@teleprompter/protocol";
import { isNil } from "es-toolkit";
import { placementFor } from "./anchor";
import { commandForKey, type Command, type UiCommand } from "./keymap";
import { listenTo, openMicrophone } from "./follow/microphone";
import { useFollow } from "./follow/useFollow";
import { useReadAloud } from "./readAloud/useReadAloud";
import { VoiceOutput } from "./readAloud/voiceOutput";
import { initialPlayback, isScrolling, needsTick, playbackReducer } from "./playback";
import { restoreVersion, ScriptStream, sendScript, type ScriptMessage } from "@/lib/scriptApi";
import { EMPTY_TOKENS, tokenize } from "./script";
import { nudgeSetting, SETTING_DEFS, formatSettingValue, type DisplaySettings, type SettingKey } from "./settings";
import { useTimer } from "./useTimer";
import { clearLegacyDraft, clearLegacyScript, loadLegacyScript, loadSettings, saveSettings } from "./storage";

const MAX_FRAME_MS = 100;

const NON_TEXT_INPUT_TYPES = new Set(["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"]);

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type);
  return !isNil(target.closest('[contenteditable]:not([contenteditable="false"])'));
};

/** Widgets that use the arrow keys themselves; they keep the arrows, the Prompter gets the other keys. */
const consumesArrows = (target: EventTarget | null): boolean => {
  return target instanceof HTMLElement && !isNil(target.closest('input[type="range"], [role="slider"], [data-slot="toggle-group"]'));
};

export interface NudgeReadout {
  /** Changes on every nudge, so repeated nudges restart the fade. */
  seq: number;
  text: string;
}

/** A Replace that just arrived and the Version that undoes it. */
export interface ReplaceNotice {
  versionId: string;
  text: string;
}

/** The notice for a Replace that left a Version to go back to. Any other change clears the notice. */
const replaceNotice = (message: ScriptMessage, restored: boolean): ReplaceNotice | null => {
  if (message.type !== "change" || message.kind !== "replace" || isNil(message.previousVersionId)) return null;
  const { source } = message.script;
  const text = restored ? "Script restored" : source ? `Script replaced from ${source}` : "Script replaced";
  return { versionId: message.previousVersionId, text };
};

interface UiBridge {
  /** While true, only the help toggle acts; Esc is the dialog's own. */
  helpOpen: boolean;
  onUiCommand: (command: UiCommand) => void;
}

/** The Script used to live in this browser. If the server has none yet, it gets this one, once. */
const moveLegacyScript = () => {
  const legacy = loadLegacyScript();
  if (isNil(legacy)) return;
  sendScript({ kind: "replace", ...legacy } satisfies PushRequest as PushRequest).then(clearLegacyScript, () => {});
};

export const usePrompter = (ui: UiBridge) => {
  const [current, setCurrent] = useState<Script>(EMPTY_SCRIPT);
  const [connected, setConnected] = useState<boolean | null>(null);
  const script = current.text.trim() === "" ? null : current;
  const [settings, setSettings] = useState<DisplaySettings>(loadSettings);
  const tokens = useMemo(() => (!isNil(script) ? tokenize(script, settings.spokenOnly) : EMPTY_TOKENS), [script, settings.spokenOnly]);

  const [playback, dispatch] = useReducer(playbackReducer, tokens, (initial) =>
    playbackReducer(initialPlayback, {
      type: "SET_SCRIPT",
      wordCount: initial.words.length,
      paragraphStarts: initial.paragraphStarts,
      sentenceEnds: initial.sentenceEnds,
      place: "reset",
    })
  );

  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const [voice] = useState(() => new VoiceOutput());
  const readingAloud = settings.readAloud && isScrolling(playback.mode);
  const narration = useReadAloud(
    {
      speaking: readingAloud,
      position: playback.animTarget ?? playback.cursor,
      lines: playback.lines,
      handMoves: playback.handMoves,
      tokens,
      wpm: settings.voiceWpm,
      voiceName: settings.voice,
      output: voice,
    },
    dispatch
  );

  const listenToVoice = useCallback(() => {
    const { context, output } = voice.open();
    return listenTo(context, output);
  }, [voice]);

  // Reading aloud, Follow hears the voice at its own pace instead of the reader through the microphone.
  const { status: follow, wpm: speakingWpm } = useFollow(
    playback.mode,
    tokens.words,
    settings.readAloud ? { expectedWpm: settings.voiceWpm, listen: listenToVoice } : { expectedWpm: settings.speedWpm, listen: openMicrophone },
    dispatch
  );

  const timer = useTimer(isScrolling(playback.mode), settings.timerFollowsPlayback);
  const { rewind } = timer;

  const [readout, setReadout] = useState<NudgeReadout | null>(null);
  const [replaced, setReplaced] = useState<ReplaceNotice | null>(null);
  /** True from an Undo click until the Replace it causes arrives, so that one reads as a restore. */
  const restoring = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const live = useRef({ current, tokens });
  live.current = { current, tokens };
  const uiRef = useRef(ui);
  uiRef.current = ui;

  useEffect(clearLegacyDraft, []);

  const active = needsTick(playback);

  useEffect(() => {
    if (!active) return;
    let last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      dispatch({
        type: "TICK",
        dtMs: Math.min(now - last, MAX_FRAME_MS),
        wpm: settingsRef.current.speedWpm,
        minLineMs: settingsRef.current.minLineSec * 1000,
      });

      last = now;
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  /** Turning Spoken-only on or off changes which words exist, so the reader stays on the same words as through an Edit. */
  const changeSettings = useCallback((next: DisplaySettings) => {
    const previous = settingsRef.current;
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next);
    if (next.spokenOnly === previous.spokenOnly) return;
    const { current, tokens: before } = live.current;
    const after = tokenize(current, next.spokenOnly);
    live.current = { current, tokens: after };

    dispatch({
      type: "SET_SCRIPT",
      wordCount: after.words.length,
      paragraphStarts: after.paragraphStarts,
      sentenceEnds: after.sentenceEnds,
      place: placementFor("edit", before, after),
    });
  }, []);

  const updateSetting = useCallback(
    <K extends SettingKey>(key: K, value: DisplaySettings[K]) => changeSettings({ ...settingsRef.current, [key]: value }),
    [changeSettings]
  );

  /**
   * The only way a Script reaches playback. Pushes, Edits and restored Versions
   * all arrive here as a change from the server.
   */
  const receive = useCallback(
    (message: ScriptMessage) => {
      const { current: before, tokens: beforeTokens } = live.current;
      const incoming = message.script;
      if (message.type === "snapshot" && incoming.revision === 0) moveLegacyScript();
      if (message.type === "snapshot" ? incoming.revision === before.revision : incoming.revision <= before.revision) return;

      const nextTokens = tokenize(incoming, settingsRef.current.spokenOnly);
      // A snapshot that differs is whatever happened while disconnected, so it anchors like an Edit.
      const kind = message.type === "change" ? message.kind : "edit";
      const place = placementFor(kind, beforeTokens, nextTokens);

      live.current = { current: incoming, tokens: nextTokens };
      setCurrent(incoming);

      dispatch({
        type: "SET_SCRIPT",
        wordCount: nextTokens.words.length,
        paragraphStarts: nextTokens.paragraphStarts,
        sentenceEnds: nextTokens.sentenceEnds,
        place,
      });

      if (kind === "replace") rewind();
      setReplaced(replaceNotice(message, restoring.current));
      if (kind === "replace") restoring.current = false;
    },
    [rewind]
  );

  // A ref callback for the Prompter's stage, so the stream is open exactly while the window shows the Script.
  const connect = useCallback(() => {
    const stream = new ScriptStream({ onMessage: receive, onConnection: setConnected });
    stream.start();
    return () => stream.stop();
  }, [receive]);

  /** Restores the Version saved just before the Replace. The Script changes when the server's change comes back. */
  const undoReplace = useCallback((notice: ReplaceNotice) => {
    restoring.current = true;
    setReplaced(null);

    restoreVersion(notice.versionId).catch(() => {
      restoring.current = false;
      setReplaced(notice);
    });
  }, []);

  const showReadout = useCallback((text: string) => setReadout((current) => ({ seq: (current?.seq ?? 0) + 1, text })), []);

  const run = useCallback(
    (command: Command) => {
      const { countdown } = settingsRef.current;
      const countdownSec = countdown === "off" ? 0 : settingsRef.current.countdownSec;
      const countdownAtStartOnly = countdown === "start";

      switch (command.type) {
        case "toggle":
          if (playbackRef.current.mode.kind === "paused" && settingsRef.current.scrollMode === "follow") return dispatch({ type: "FOLLOW" });
          return dispatch({ type: "TOGGLE", countdownSec, countdownAtStartOnly });
        case "restart":
          dispatch({ type: "RESTART" });
          rewind();
          return;
        case "nudge": {
          const next = nudgeSetting(settingsRef.current, command.setting, command.direction);
          changeSettings(next);
          return showReadout(`${SETTING_DEFS[command.setting].label}: ${formatSettingValue(command.setting, next[command.setting])}`);
        }
        case "flip": {
          const on = !settingsRef.current[command.setting];
          changeSettings({ ...settingsRef.current, [command.setting]: on });
          return showReadout(`${SETTING_DEFS[command.setting].label}: ${on ? "on" : "off"}`);
        }
        case "stepLine":
          return dispatch({ type: "STEP_LINE", delta: command.delta, keepPlaying: settingsRef.current.keepPlayingOnMove });
        case "stepParagraph":
          return dispatch({ type: "STEP_PARAGRAPH", delta: command.delta, keepPlaying: settingsRef.current.keepPlayingOnMove });
        case "openSettings":
        case "openEditor":
        case "toggleHelp":
        case "toggleTimer":
          return uiRef.current.onUiCommand(command);
        case "switchScrollMode": {
          const scrollMode = settingsRef.current.scrollMode === "auto" ? "follow" : "auto";
          changeSettings({ ...settingsRef.current, scrollMode });
          // Switching while scrolling carries on in the other mode, from the same place.
          const { mode } = playbackRef.current;

          if (mode.kind !== "paused") {
            dispatch({ type: "PAUSE" });
            dispatch(scrollMode === "follow" ? { type: "FOLLOW" } : { type: "PLAY", countdownSec: 0, countdownAtStartOnly });
          }

          return showReadout(`Scroll mode: ${scrollMode === "follow" ? "Follow" : "Auto"}`);
        }
      }
    },
    [changeSettings, rewind, showReadout]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key.startsWith("Arrow") && consumesArrows(event.target)) return;
      const command = commandForKey(event);
      if (isNil(command)) return;
      if (uiRef.current.helpOpen && command.type !== "toggleHelp") return;
      event.preventDefault();
      // Capture phase, so keep a focused slider from also acting on Home.
      event.stopPropagation();
      if (event.repeat && (command.type === "toggle" || command.type === "restart")) return;
      run(command);
    };

    // Stops Space from clicking a focused button when released.
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " " && !isTypingTarget(event.target)) event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [run]);

  return {
    script,
    connected,
    tokens,
    settings,
    playback,
    follow,
    speakingWpm,
    narration,
    readout,
    replaced,
    timer,
    connect,
    undoReplace,
    dispatch,
    updateSetting,
    run,
  };
};
