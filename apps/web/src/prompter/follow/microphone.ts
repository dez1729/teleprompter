/** Long enough to hold several words for the aligner, short enough that Whisper answers quickly. */
export const CLIP_MS = 4000
/** Whisper's native rate; anything higher only makes the upload bigger. */
const WAV_RATE = 16000
/** Below this loudness a 100 ms stretch counts as silence. */
const SPEECH_RMS = 0.01
/** A clip is worth transcribing while there was speech this recently. */
const RECENT_MS = 1500
/** The reader has stopped once this long has been silent: longer than a breath between phrases. */
export const QUIET_MS = 700

const CAPTURE_WORKLET = `
registerProcessor('tp-capture', class extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel) this.port.postMessage(channel.slice(0))
    return true
  }
})`

export interface Microphone {
  /** False once the last QUIET_MS has been silent. */
  speaking(): boolean
  /** The last CLIP_MS of audio as a WAV file, or null when the reader has been silent lately. */
  clip(): Blob | null
  stop(): void
}

export async function openMicrophone(): Promise<Microphone> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  })
  const context = new AudioContext()
  try {
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'text/javascript' }))
    await context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url))
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    void context.close()
    throw error
  }
  const rate = context.sampleRate
  const ring = new Float32Array(Math.round((rate * CLIP_MS) / 1000))
  let written = 0

  const source = context.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(context, 'tp-capture')
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    for (const sample of event.data) ring[written++ % ring.length] = sample
  }
  source.connect(node)

  const recent = (): Float32Array => {
    const length = Math.min(written, ring.length)
    const out = new Float32Array(length)
    for (let i = 0; i < length; i++) out[i] = ring[(written - length + i) % ring.length]!
    return out
  }

  const lastMs = (samples: Float32Array, ms: number) => samples.subarray(Math.max(0, samples.length - Math.round((rate * ms) / 1000)))

  return {
    speaking: () => loud(lastMs(recent(), QUIET_MS), rate),
    clip() {
      const samples = recent()
      if (!loud(lastMs(samples, RECENT_MS), rate)) return null
      return wav(resample(samples, rate, WAV_RATE), WAV_RATE)
    },
    stop() {
      node.port.onmessage = null
      source.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      void context.close()
    },
  }
}

function loud(samples: Float32Array, rate: number): boolean {
  const window = Math.round(rate / 10)
  for (let start = 0; start + window <= samples.length; start += window) {
    let sum = 0
    for (let i = start; i < start + window; i++) sum += samples[i]! ** 2
    if (Math.sqrt(sum / window) >= SPEECH_RMS) return true
  }
  return false
}

/** Averages each output sample's span of input samples, which also filters out what the lower rate cannot hold. */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples
  const ratio = from / to
  const out = new Float32Array(Math.floor(samples.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += samples[j]!
    out[i] = sum / (end - start)
  }
  return out
}

/** 16-bit mono PCM in a WAV container. */
export function wav(samples: Float32Array, rate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 0x7fff), true))
  return new Blob([view.buffer], { type: 'audio/wav' })
}
