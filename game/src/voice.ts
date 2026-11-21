import {getLanguage} from './i18n';
import type {Language} from './i18n';
// VoiceLab speech recognition (only STT provider). Realtime WebSocket first (ticket minted by our server,
// PCM16 mono 16 kHz binary frames, {"type":"commit"} -> {"event":"final","text"}), WAV upload fallback.
import { normalizeTranscript } from './alphabet.mjs';

export interface Recording { stop: () => void; cancel: () => void }
export interface RecorderEvents {
  onFinal: (text: string, mode: 'realtime' | 'upload') => void;
  onError: (message: string) => void;
  onStopped: () => void;
  onLevel?: (level: number) => void;
  onPhase?: (phase: 'listening' | 'transcribing') => void;
}

let lastLanguage:Language='uz';
let lastWav: Uint8Array | null = null; // kept only in memory for "retry"

function wavFrom(chunks: ArrayBuffer[]): Uint8Array {
  const length = chunks.reduce((n, x) => n + x.byteLength, 0);
  const wav = new Uint8Array(44 + length); const v = new DataView(wav.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) wav[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + length, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, length, true);
  let o = 44; for (const c of chunks) { wav.set(new Uint8Array(c), o); o += c.byteLength; }
  return wav;
}
function base64(bytes: Uint8Array) { const parts: string[] = []; for (let i = 0; i < bytes.length; i += 4096) parts.push(String.fromCharCode(...bytes.subarray(i, i + 4096))); return btoa(parts.join('')); }

async function upload(wav: Uint8Array, signal?: AbortSignal,language:Language=getLanguage()): Promise<string> {
  const r = await fetch('/api/stt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: base64(wav),language }), signal });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(result.error || 'Nutq qayta işlanmadi.');
  return language==='uz'?normalizeTranscript(result.text || ''):String(result.text||'');
}

/** Re-send the last recording through the upload API (after a network or provider error). */
export async function retryLast(): Promise<string> {
  if (!lastWav) throw Error('Qayta yuboriş uçun yozuv yöq.');
  return upload(lastWav,undefined,lastLanguage);
}

function micError(e: unknown): string {
  const name = (e as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Mikrofonga ruxsat berilmadi. Manzil satridagi qulf belgisi orqali ruxsat bering va qayta urining.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Mikrofon topilmadi. Qurilmani ulang yoki matn kiriting.';
  if (name === 'NotReadableError') return 'Mikrofon boşqa dastur tomonidan band. Uni yoping va qayta urining.';
  return (e as Error)?.message || 'Mikrofon işga tuşmadi.';
}

export async function startRecording(ev: RecorderEvents): Promise<Recording> {
  const language=getLanguage();
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw Error('Brauzer mikrofonni qöllamaydi. Matn kiriting.');
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (e) { throw Error(micError(e)); }
  const context = new AudioContext();
  const chunks: ArrayBuffer[] = [];
  let node: AudioWorkletNode | undefined, source: MediaStreamAudioSourceNode | undefined, timer = 0;
  let finished = false, stopping = false;
  const abort = new AbortController();
  let ws: WebSocket | null = null, wsReady = false, wsFailed = false;
  const pending: ArrayBuffer[] = [];
  let finalResolve: ((t: string) => void) | null = null;

  const cleanupAudio = () => { clearTimeout(timer); stream.getTracks().forEach(t => t.stop()); node?.disconnect(); source?.disconnect(); if (context.state !== 'closed') void context.close().catch(() => {}); };
  const closeWs = () => { try { if (ws && ws.readyState <= 1) ws.close(1000, 'done'); } catch { /* ignore */ } ws = null; };
  const finish = (fn: () => void) => { if (finished) return; finished = true; cleanupAudio(); closeWs(); ev.onStopped(); fn(); };

  // ---- realtime socket (best effort; any failure silently switches to upload)
  void (async () => {
    try {
      const r = await fetch('/api/stt/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: abort.signal });
      if (!r.ok) throw Error('ticket');
      const { ticket, websocket_url } = await r.json();
      const sock = new WebSocket(`${websocket_url}?ticket=${encodeURIComponent(ticket)}`);
      sock.binaryType = 'arraybuffer'; ws = sock;
      const readyTimer = setTimeout(() => { if (!wsReady) { wsFailed = true; closeWs(); } }, 5000);
      sock.onmessage = m => {
        if (typeof m.data !== 'string') return;
        let msg: { event?: string; text?: string; code?: string; message?: string };
        try { msg = JSON.parse(m.data); } catch { return; }
        if (msg.event === 'ready') {
          clearTimeout(readyTimer);
          sock.send(JSON.stringify({ type: 'start', language, audio_format: 'pcm_s16le', sample_rate: 16000, channels: 1 }));
          wsReady = true; for (const c of pending.splice(0)) sock.send(c);
        } else if (msg.event === 'final') { finalResolve?.(msg.text || ''); }
        else if (msg.event === 'error') { wsFailed = true; if (msg.code === 'no_speech_detected') finalResolve?.(''); closeWs(); }
      };
      sock.onerror = () => { wsFailed = true; };
      sock.onclose = () => { if (!finalResolve) wsFailed = wsFailed || !wsReady; };
    } catch { wsFailed = true; }
  })();

  const deliver = async () => {
    cleanupAudio();
    if (finished) return;
    const samples = chunks.reduce((n, c) => n + c.byteLength / 2, 0);
    if (samples < 8000) { finish(() => ev.onError('Juda qisqa. Kamida yarim soniya gapiring.')); return; }
    ev.onPhase?.('transcribing');
    lastWav = wavFrom(chunks);lastLanguage=language;
    // Realtime: commit and wait for the single final result.
    if (ws && wsReady && !wsFailed) {
      const text = await new Promise<string | null>(resolve => {
        finalResolve = t => resolve(t);
        try { ws!.send(JSON.stringify({ type: 'commit' })); } catch { resolve(null); }
        setTimeout(() => resolve(null), 15000);
      });
      if (text !== null && text.trim()) { finish(() => ev.onFinal(language==='uz'?normalizeTranscript(text):text, 'realtime')); return; }
    }
    try { const t = await upload(lastWav, abort.signal,language); finish(() => (t ? ev.onFinal(t, 'upload') : ev.onError('Nutq aniqlanmadi. Qayta gapiring.'))); }
    catch (e) { if (!abort.signal.aborted) finish(() => ev.onError(`${(e as Error).message} "Qayta yuboriş" tugmasini bosing yoki matn kiriting.`)); }
  };

  const stop = () => { if (finished || stopping) return; stopping = true; clearTimeout(timer); node?.port.postMessage('flush'); };
  const cancel = () => { abort.abort(); try { ws?.send(JSON.stringify({ action: 'interrupt' })); } catch { /* ignore */ } finish(() => {}); };

  try {
    await context.audioWorklet.addModule('/voice-capture.js'); await context.resume();
    node = new AudioWorkletNode(context, 'huquqbek-capture');
    source = context.createMediaStreamSource(stream);
    const mute = context.createGain(); mute.gain.value = 0;
    source.connect(node); node.connect(mute); mute.connect(context.destination);
    node.port.onmessage = e => {
      if (e.data?.flushed) { void deliver(); return; }
      if (finished || !(e.data instanceof ArrayBuffer)) return;
      chunks.push(e.data);
      const pcm = new Int16Array(e.data); let sum = 0; for (let i = 0; i < pcm.length; i += 4) sum += (pcm[i] / 32768) ** 2;
      ev.onLevel?.(Math.min(1, Math.sqrt(sum / (pcm.length / 4)) * 6));
      if (ws && wsReady && !wsFailed) { try { ws.send(e.data.slice(0)); } catch { wsFailed = true; } } else if (!wsFailed) pending.push(e.data.slice(0));
    };
    ev.onPhase?.('listening');
    timer = window.setTimeout(stop, 30000); // documented realtime commit limit is 35 s
    return { stop, cancel };
  } catch (e) { finish(() => {}); throw Error(micError(e)); }
}
