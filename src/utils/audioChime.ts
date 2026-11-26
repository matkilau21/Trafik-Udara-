// 100% Procedural Web Audio API Aviation Chime Synthesizer
// Produces subtle, clean airport departure/arrival/alert chimes with zero external audio files.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {
      // Autoplay blocked until user interacts; safely ignore
    });
  }
  return audioCtx;
}

export function playAviationChime(severity: 'info' | 'success' | 'warning' | 'alert'): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  const now = ctx.currentTime;

  // Distinct harmonic intervals per notification type
  const notes: number[] =
    severity === 'warning' || severity === 'alert'
      ? [587.33, 440.0] // D5 -> A4 gentle advisory cadence
      : severity === 'success'
      ? [523.25, 659.25, 783.99] // C5 -> E5 -> G5 bright arrival chime
      : [493.88, 659.25]; // B4 -> E5 clean terminal departure bell

  notes.forEach((freq, idx) => {
    const startTime = now + idx * 0.14;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.055, startTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.6);
  });
}

export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}
