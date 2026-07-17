// Procedural sound for the sandbox. Everything is synthesized on the fly
// with the Web Audio API: no sample files, nothing to load. The simulation
// calls the trigger functions below and this file worries about not turning
// two hundred events a frame into a wall of noise.
//
// Browsers refuse to start audio without a user gesture, so nothing happens
// until unlock() is called from a pointer event.

const sound = (function () {
  let actx = null;
  let master = null;
  let noiseBuf = null;
  let humGain = null;

  let enabled = true;
  try { enabled = localStorage.getItem('sound') !== 'off'; } catch (e) {}

  // Per-channel rate limits so a hundred simultaneous reactions read as one
  // sound, not a machine gun.
  const lastAt = {};
  function gate(name, ms) {
    const now = performance.now();
    if (lastAt[name] && now - lastAt[name] < ms) return false;
    lastAt[name] = now;
    return true;
  }

  function ready() { return enabled && actx !== null; }

  function unlock() {
    if (!enabled) return;
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { enabled = false; return; }
      actx = new AC();

      // Everything runs through one gain and a limiter, so pile-ups get
      // squashed instead of clipping.
      master = actx.createGain();
      master.gain.value = 0.6;
      const limiter = actx.createDynamicsCompressor();
      limiter.threshold.value = -20;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      master.connect(limiter);
      limiter.connect(actx.destination);

      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (actx.state === 'suspended') actx.resume();
  }

  // A burst of filtered noise with a decaying envelope. The workhorse.
  function hiss(vol, dur, type, freq, freqEnd, delay) {
    const t = actx.currentTime + (delay || 0);
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = actx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // A plain enveloped oscillator, optionally gliding down in pitch.
  function tone(vol, dur, shape, freq, freqEnd, delay) {
    const t = actx.currentTime + (delay || 0);
    const o = actx.createOscillator();
    o.type = shape;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  return {
    unlock: unlock,

    on: function () { return enabled; },

    toggle: function () {
      enabled = !enabled;
      try { localStorage.setItem('sound', enabled ? 'on' : 'off'); } catch (e) {}
      if (!enabled && actx) actx.suspend();
      if (enabled) unlock();
      return enabled;
    },

    state: function () { return actx ? actx.state : 'none'; },

    // Big blast. Size runs 0 to 1; a sub thump, a falling noise wall, and a
    // rumble tail on the large ones.
    boom: function (r) {
      if (!ready() || !gate('boom', 90)) return;
      const size = Math.min(1, r / 12);
      tone(0.9 * size, 0.5 + 0.3 * size, 'sine', 100 + Math.random() * 40, 32);
      hiss(0.7 * size, 0.35 + 0.25 * size, 'lowpass', 2600, 180);
      if (size > 0.6) hiss(0.2, 1.2, 'lowpass', 300, 60);
      // The really big ones get a second, deeper shove and a long tail.
      if (r > 14) {
        tone(0.8, 1.6, 'sine', 55, 24, 0.05);
        hiss(0.25, 2.4, 'lowpass', 200, 40, 0.1);
      }
    },

    // Small crack, used for gunpowder pops.
    pop: function () {
      if (!ready() || !gate('pop', 45)) return;
      hiss(0.16, 0.06, 'bandpass', 900 + Math.random() * 1200);
      tone(0.1, 0.05, 'square', 400 + Math.random() * 300, 150);
    },

    // Bright crash plus a few staggered tinks, like pieces landing.
    shatter: function () {
      if (!ready() || !gate('shatter', 120)) return;
      hiss(0.35, 0.2, 'highpass', 2800);
      for (let k = 0; k < 3; k++) {
        tone(0.09, 0.09, 'sine', 2200 + Math.random() * 3200, null, 0.03 + k * 0.045);
      }
    },

    // Water meeting something hot.
    sizzle: function (intensity) {
      if (!ready() || !gate('sizzle', 90)) return;
      hiss(0.1 + 0.12 * (intensity || 0.5), 0.3, 'bandpass', 3800, 2200);
    },

    // Boulder landing.
    thud: function () {
      if (!ready() || !gate('thud', 70)) return;
      tone(0.4, 0.12, 'sine', 90, 45);
      hiss(0.2, 0.1, 'lowpass', 400, 120);
    },

    // Condensation falling off the ceiling.
    drip: function () {
      if (!ready() || !gate('drip', 250)) return;
      tone(0.08, 0.07, 'sine', 900, 350);
    },

    // A seed taking. Two small rising notes.
    sprout: function () {
      if (!ready() || !gate('sprout', 400)) return;
      tone(0.07, 0.1, 'sine', 520, 660);
      tone(0.06, 0.12, 'sine', 780, 900, 0.09);
    },

    // Lit tnt hissing away.
    fuse: function () {
      if (!ready() || !gate('fuse', 130)) return;
      hiss(0.05, 0.12, 'bandpass', 5200);
    },

    // Firework leaving the pad.
    whoosh: function () {
      if (!ready() || !gate('whoosh', 200)) return;
      hiss(0.12, 0.5, 'bandpass', 400, 1400);
    },

    // Firework opening up: a crack, then sparkle.
    burst: function () {
      if (!ready() || !gate('burst', 150)) return;
      hiss(0.3, 0.15, 'lowpass', 2400, 400);
      for (let k = 0; k < 5; k++) {
        hiss(0.06, 0.05, 'bandpass', 1500 + Math.random() * 3000, null, 0.08 + k * 0.06);
      }
    },

    // Brush feedback while actually placing cells.
    paint: function (kind) {
      if (!ready() || !gate('paint', 55)) return;
      if (kind === 'liquid') {
        tone(0.05, 0.08, 'sine', 280 + Math.random() * 60, 160);
      } else if (kind === 'gas') {
        hiss(0.04, 0.15, 'bandpass', 900);
      } else if (kind === 'solid') {
        hiss(0.05, 0.04, 'bandpass', 420);
      } else if (kind === 'erase') {
        hiss(0.03, 0.06, 'highpass', 2200);
      } else {
        hiss(0.05, 0.08, 'bandpass', 1800 + Math.random() * 800);
      }
    },

    // Called once per simulation frame with rough activity counts. Drives
    // the fire crackle and the black hole hum.
    ambience: function (fireCount, emberCount, holeCount) {
      if (!ready()) return;

      const heat = fireCount + emberCount * 0.5;
      if (heat > 0 && Math.random() < Math.min(0.5, heat / 400)) {
        hiss(0.04 + Math.random() * 0.06, 0.03, 'bandpass', 700 + Math.random() * 2400);
      }

      if (!humGain) {
        humGain = actx.createGain();
        humGain.gain.value = 0;
        const a = actx.createOscillator();
        const b = actx.createOscillator();
        a.type = 'sine'; b.type = 'sine';
        a.frequency.value = 50;
        b.frequency.value = 52.3;
        a.connect(humGain); b.connect(humGain);
        humGain.connect(master);
        a.start(); b.start();
      }
      const target = holeCount > 0 ? Math.min(0.1, 0.04 + holeCount * 0.02) : 0;
      humGain.gain.setTargetAtTime(target, actx.currentTime, 0.25);
    },
  };
})();
