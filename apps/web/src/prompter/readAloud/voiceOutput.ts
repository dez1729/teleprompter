import { isNil } from "es-toolkit";

export interface VoiceNodes {
  context: AudioContext;
  output: GainNode;
}

// Where Read aloud's voice plays: the speakers, and Follow when it listens to the voice. One per Prompter, made on
// first use, after a key press or click has let the page play sound.
export class VoiceOutput {
  #nodes: VoiceNodes | null = null;

  open(): VoiceNodes {
    if (isNil(this.#nodes) || this.#nodes.context.state === "closed") {
      const context = new AudioContext();
      const output = context.createGain();
      output.connect(context.destination);
      this.#nodes = { context, output };
    }

    return this.#nodes;
  }
}
