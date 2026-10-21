// A soft two-note chime made with Web Audio, so there's no sound file to ship.
// Browsers only allow audio after the page has been clicked, so `primeAudio()`
// runs on the Start button; if audio is still blocked, the chime is skipped.

let ctx: AudioContext | undefined;

export function primeAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // no audio available
  }
}

/** Rising notes when focus ends (time for a break), falling when a break ends. */
export function playChime(kind: 'focus-done' | 'break-done'): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') return;
    const notes = kind === 'focus-done' ? [659.25, 987.77] : [987.77, 659.25];
    const t0 = ctx.currentTime + 0.02;
    notes.forEach((freq, i) => {
      const start = t0 + i * 0.22;
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 1.5);
    });
  } catch {
    // no audio available
  }
}
