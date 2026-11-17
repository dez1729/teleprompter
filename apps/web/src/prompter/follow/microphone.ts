import { isNil } from "es-toolkit";

/** Long enough to hold several words for the aligner, short enough that Whisper answers quickly. */
export const CLIP_MS = 4000;
/** Whisper's native rate; anything higher only makes the upload bigger. */
const WAV_RATE = 16000;
/** Below this loudness a 100 ms stretch counts as silence. */
const SPEECH_RMS = 0.01;
/** A clip is worth transcribing while there was speech this recently. */
const RECENT_MS = 1500;
/** The reader has stopped once this long has been silent: longer than a breath between phrases. */
export const QUIET_MS = 700;
/** Short enough to notice the pause at the end of a sentence. */
const VOICED_MS = 200;

// Runs until it is told to stop: the voice's AudioContext outlives each capture, so it cannot be left to closing.
const CAPTURE_WORKLET = `
registerProcessor('tp-capture', class extends AudioWorkletProcessor {
  constructor() {
    super()
    this.running = true
    this.port.onmessage = () => {
      this.running = false
      this.port.close()
    }
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (this.running && channel) this.port.postMessage(channel.slice(0))
    return this.running
  }
})`;

export interface Microphone {
  /** False once the last QUIET_MS has been silent. */
  speaking(): boolean;
  /** True while there is speech right now, in the last VOICED_MS. */
  voiced(): boolean;
  /** The last CLIP_MS of audio as a WAV file, or null when the reader has been silent lately. */
  clip(): Blob | null;
  stop(): void;
}

// Each AudioContext loads the capture worklet once; registering it a second time throws.
const workletLoads = new WeakMap<BaseAudioContext, Promise<void>>();

const loadWorklet = (context: BaseAudioContext): Promise<void> => {
  const loading = workletLoads.get(context);
  if (!isNil(loading)) return loading;
  const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "text/javascript" }));
  const loaded = context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
  workletLoads.set(context, loaded);
  return loaded;
};

// Hears what `source` plays. `release` runs on stop, after the capture is disconnected.
const capture = async (context: AudioContext, source: AudioNode, release: () => void): Promise<Microphone> => {
  try {
    await loadWorklet(context);
  }
  catch (error) {
    release();
    throw error;
  }

  const rate = context.sampleRate;
  const ring = new Float32Array(Math.round((rate * CLIP_MS) / 1000));
  let written = 0;

  const node = new AudioWorkletNode(context, "tp-capture");

  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    for (const sample of event.data) ring[written++ % ring.length] = sample;
  };

  source.connect(node);

  // Copied in two blocks, oldest first; reading it sample by sample is many times slower.
  const recent = (): Float32Array => {
    if (written < ring.length) return ring.slice(0, written);
    const split = written % ring.length;
    const out = new Float32Array(ring.length);
    out.set(ring.subarray(split));
    out.set(ring.subarray(0, split), ring.length - split);
    return out;
  };

  const lastMs = (samples: Float32Array, ms: number) => samples.subarray(Math.max(0, samples.length - Math.round((rate * ms) / 1000)));

  return {
    speaking: () => loud(lastMs(recent(), QUIET_MS), rate),
    voiced: () => loud(lastMs(recent(), VOICED_MS), rate),
    clip() {
      const samples = recent();
      if (!loud(lastMs(samples, RECENT_MS), rate)) return null;
      return wav(resample(samples, rate, WAV_RATE), WAV_RATE);
    },
    stop() {
      node.port.onmessage = null;
      node.port.postMessage("stop");
      source.disconnect(node);
      node.disconnect();
      release();
    },
  };
};

export const openMicrophone = async (): Promise<Microphone> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });

  const context = new AudioContext();

  return capture(context, context.createMediaStreamSource(stream), () => {
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
  });
};

// Hears what plays through `output`, such as Read aloud's voice, as if it were the microphone.
export const listenTo = (context: AudioContext, output: AudioNode): Promise<Microphone> => capture(context, output, () => {});

const loud = (samples: Float32Array, rate: number): boolean => {
  const window = Math.round(rate / 10);

  for (let start = 0; start + window <= samples.length; start += window) {
    let sum = 0;
    for (const sample of samples.subarray(start, start + window)) sum += sample ** 2;
    if (Math.sqrt(sum / window) >= SPEECH_RMS) return true;
  }

  return false;
};

/** Averages each output sample's span of input samples, which also filters out what the lower rate cannot hold. */
export const resample = (samples: Float32Array, from: number, to: number): Float32Array => {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));

  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (const sample of samples.subarray(start, end)) sum += sample;
    out[i] = sum / (end - start);
  }

  return out;
};

/** 16-bit mono PCM in a WAV container. */
export const wav = (samples: Float32Array, rate: number): Blob => {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };

  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 0x7fff), true));
  return new Blob([view.buffer], { type: "audio/wav" });
};
