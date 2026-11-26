// All sound is synthesised with the Web Audio API — no audio files, no network.
// An engine hum follows the throttle, wind follows the speed, and rings, landings and
// crashes get their own short phrases. Nothing starts until the first user gesture.
export function createAudio() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let wind = null;
  let windGain = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
      engine = ctx.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 55;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engine.connect(engineFilter).connect(engineGain).connect(ctx.destination);
      engine.start();

      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      wind = ctx.createBufferSource();
      wind.buffer = buffer;
      wind.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 500;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      wind.connect(windFilter).connect(windGain).connect(ctx.destination);
      wind.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, delay = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  return {
    /** Call from any user gesture: unlocks the audio context. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') void ctx.resume();
    },
    update(throttle, speed, flying) {
      if (!ctx || muted) return;
      const target = flying ? 0.05 + throttle * 0.075 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engine.frequency.setTargetAtTime(48 + throttle * 46 + speed * 0.25, ctx.currentTime, 0.1);
      windGain.gain.setTargetAtTime(flying ? Math.min(0.12, speed * 0.0011) : 0, ctx.currentTime, 0.15);
    },
    ring(perfect) {
      tone(880, 0.16, 'sine', 0.16);
      tone(1318, 0.22, 'sine', 0.14, 0.07);
      if (perfect) tone(1760, 0.3, 'sine', 0.14, 0.14);
    },
    crash() {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime;
      const noise = ctx.createBufferSource();
      noise.buffer = wind ? wind.buffer : null;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      noise.connect(filter).connect(gain).connect(ctx.destination);
      noise.start(t0);
      noise.stop(t0 + 0.75);
      tone(70, 0.5, 'sine', 0.25);
    },
    land() {
      tone(523, 0.18, 'triangle', 0.16);
      tone(659, 0.18, 'triangle', 0.16, 0.12);
      tone(784, 0.35, 'triangle', 0.18, 0.24);
    },
    toggleMute() {
      muted = !muted;
      if (ctx) {
        engineGain.gain.value = 0;
        windGain.gain.value = 0;
      }
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
