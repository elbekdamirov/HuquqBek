import {getLanguage,translateText} from './i18n';
// One courtroom voice at a time: VoiceLab TTS playback, lip-sync level, subtitle progress, replay/skip.
export interface Line { actor: string; text: string }
type Listener = (state: SpeechState) => void;
export interface SpeechState { line: Line | null; playing: boolean; loading: boolean; progress: number; error: string }

let token = 0;
let audio: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let url = '';
let raf = 0;
let level = 0;
let state: SpeechState = { line: null, playing: false, loading: false, progress: 0, error: '' };
const listeners = new Set<Listener>();
const set = (patch: Partial<SpeechState>) => { state = { ...state, ...patch }; listeners.forEach(l => l(state)); };
const blobs = new Map<string, Blob>(); // client cache of recent lines (replay without a new request)

export const speech = {
  subscribe(l: Listener) { listeners.add(l); l(state); return () => { listeners.delete(l); }; },
  /** Current mouth-open level 0..1 (read every frame by the 3D characters). */
  level: () => level,
  state: () => state,
  stop(keepLine = true) {
    token++;
    cancelAnimationFrame(raf); level = 0;
    if (audio) { audio.onended = null; audio.pause(); audio.src = ''; audio = null; }
    if (url) { URL.revokeObjectURL(url); url = ''; }
    set({ playing: false, loading: false, progress: keepLine ? 1 : 0, ...(keepLine ? {} : { line: null }) });
  },
  /** Speak a line. Without VoiceLab the subtitle still runs on a reading-speed timer so animation stays in sync. */
  async say(line: Line, voiceEnabled: boolean) {
    const language=getLanguage();line={...line,text:translateText(line.text)};
    speech.stop(false);
    const mine = ++token;
    set({ line, loading: voiceEnabled, playing: false, progress: 0, error: '' });
    if (!voiceEnabled) return speech.silent(line, mine);
    try {
      const key = `${language}\n${line.actor}\n${line.text}`;
      let blob = blobs.get(key);
      if (!blob) {
        const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...line,language}) });
        if (!r.ok) throw Error((await r.json().catch(() => ({}))).error || 'Ovoz yaratilmadi.');
        blob = await r.blob();
        blobs.set(key, blob); if (blobs.size > 20) blobs.delete(blobs.keys().next().value!);
      }
      if (mine !== token) return; // a newer line started meanwhile
      url = URL.createObjectURL(blob);
      const player = new Audio(url); audio = player;
      ctx ||= new AudioContext();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      ctx.createMediaElementSource(player).connect(analyser); analyser.connect(ctx.destination);
      const bins = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (mine !== token || !analyser) return;
        analyser.getByteTimeDomainData(bins);
        let sum = 0; for (const b of bins) { const v = (b - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / bins.length);
        level = level * 0.45 + Math.min(1, rms * 5.5) * 0.55;
        set({ progress: player.duration ? Math.min(1, player.currentTime / player.duration) : 0 });
        raf = requestAnimationFrame(tick);
      };
      player.onended = () => { if (mine === token) { cancelAnimationFrame(raf); level = 0; set({ playing: false, progress: 1 }); } };
      await player.play();
      if (mine !== token) { player.pause(); return; }
      set({ loading: false, playing: true }); tick();
    } catch (e) {
      if (mine !== token) return;
      set({ loading: false, error: `Ovoz: ${(e as Error).message}` });
      return speech.silent(line, mine);
    }
  },
  /** Timer-driven playback (no audio): ~14 characters per second, gentle synthetic mouth motion. */
  silent(line: Line, mine = ++token) {
    const duration = Math.max(1600, Math.min(16000, line.text.length * 70));
    const start = performance.now();
    set({ line, playing: true, loading: false });
    const tick = (now: number) => {
      if (mine !== token) return;
      const p = (now - start) / duration;
      level = p < 1 ? 0.25 + 0.25 * Math.abs(Math.sin(now / 90)) : 0;
      set({ progress: Math.min(1, p) });
      if (p < 1) raf = requestAnimationFrame(tick); else { level = 0; set({ playing: false, progress: 1 }); }
    };
    raf = requestAnimationFrame(tick);
  },
  replay(voiceEnabled: boolean) { if (state.line) void speech.say(state.line, voiceEnabled); },
  skip() { speech.stop(true); },
};
