// Notification & success sounds using Web Audio API (no external files needed)
let audioCtx = null;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

/** Double-ding notification sound */
export function playNotificationSound() {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;

    // First ding
    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.connect(g1);
    g1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, t);
    g1.gain.setValueAtTime(0.4, t);
    g1.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    osc1.start(t);
    osc1.stop(t + 0.25);

    // Second ding (higher pitch, slight delay)
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.connect(g2);
    g2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1175, t + 0.18);  // D6
    g2.gain.setValueAtTime(0, t);
    g2.gain.setValueAtTime(0.4, t + 0.18);
    g2.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    osc2.start(t + 0.18);
    osc2.stop(t + 0.5);
  } catch { /* audio not available */ }
}

/** Ascending chime for task/solicitation completion */
export function playSuccessSound() {
  try {
    const ctx = getCtx();
    const notes = [523, 659, 784]; // C5, E5, G5 (major chord)
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.35);

      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.35);
    });
  } catch { /* audio not available */ }
}
