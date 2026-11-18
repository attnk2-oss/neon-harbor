// All of Port Kessel's sound is synthesised here with WebAudio: the two-chord ambient loop,
// an engine note that climbs with speed, tyre squeal, the siren, gunshots, footfalls and the
// little stingers for a mission or a death. No audio files. Nothing is created until a real
// user gesture, and every entry point is guarded, so a browser without WebAudio still plays.
import { SOUND_KEY } from './config.js';

const A_CHORD = [146.83, 174.61, 220.0, 261.63];
const B_CHORD = [116.54, 146.83, 174.61, 220.0];

function readEnabled() {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writeEnabled(value) {
  try {
    window.localStorage.setItem(SOUND_KEY, value ? 'on' : 'off');
  } catch {
    // Storage off: the setting lasts this visit only.
  }
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = readEnabled();
  let started = false;
  let failed = false;
  const pad = { oscillators: [], gain: null, filter: null };
  const engine = { oscillators: [], gain: null, filter: null };
  const siren = { osc: null, gain: null, lfo: null };
  const squeal = { gain: null, filter: null, source: null };
  let chordIndex = 0;
  let padTimer = 0;
  let pluckTimer = 0;
  let lastCompleted = 0;

  function buildNoise() {
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 1234567;
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 16807) % 2147483647;
      data[index] = (seed / 2147483647) * 2 - 1;
    }
    return buffer;
  }

  function connect(node, destination) {
    node.connect(destination);
    return node;
  }

  function buildAmbient() {
    pad.filter = ctx.createBiquadFilter();
    pad.filter.type = 'lowpass';
    pad.filter.frequency.value = 460;
    pad.filter.Q.value = 0.4;
    pad.gain = ctx.createGain();
    pad.gain.gain.value = 0.035;
    pad.filter.connect(pad.gain);
    pad.gain.connect(master);
    A_CHORD.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 0 ? 'triangle' : 'sine';
      osc.frequency.value = frequency;
      osc.detune.value = (index - 1.5) * 4;
      const voice = ctx.createGain();
      voice.gain.value = index === 0 ? 0.5 : 0.3;
      osc.connect(voice);
      voice.connect(pad.filter);
      osc.start();
      pad.oscillators.push(osc);
    });
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 73.42;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.28;
    sub.connect(subGain);
    subGain.connect(pad.gain);
    sub.start();
    pad.oscillators.push(sub);
  }

  function buildEngine() {
    engine.filter = ctx.createBiquadFilter();
    engine.filter.type = 'lowpass';
    engine.filter.frequency.value = 420;
    engine.gain = ctx.createGain();
    engine.gain.gain.value = 0;
    engine.filter.connect(engine.gain);
    engine.gain.connect(master);
    for (const [type, detune, level] of [['sawtooth', 0, 0.5], ['sawtooth', 9, 0.35], ['triangle', -5, 0.5]]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.detune.value = detune;
      osc.frequency.value = 52;
      const voice = ctx.createGain();
      voice.gain.value = level;
      osc.connect(voice);
      voice.connect(engine.filter);
      osc.start();
      engine.oscillators.push(osc);
    }
  }

  function buildSiren() {
    siren.osc = ctx.createOscillator();
    siren.osc.type = 'square';
    siren.osc.frequency.value = 720;
    const shape = ctx.createBiquadFilter();
    shape.type = 'lowpass';
    shape.frequency.value = 1400;
    siren.gain = ctx.createGain();
    siren.gain.gain.value = 0;
    siren.osc.connect(shape);
    shape.connect(siren.gain);
    siren.gain.connect(master);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.62;
    const depth = ctx.createGain();
    depth.gain.value = 230;
    lfo.connect(depth);
    depth.connect(siren.osc.frequency);
    lfo.start();
    siren.osc.start();
  }

  function buildSqueal() {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    squeal.filter = ctx.createBiquadFilter();
    squeal.filter.type = 'bandpass';
    squeal.filter.frequency.value = 2100;
    squeal.filter.Q.value = 5.5;
    squeal.gain = ctx.createGain();
    squeal.gain.gain.value = 0;
    source.connect(squeal.filter);
    squeal.filter.connect(squeal.gain);
    squeal.gain.connect(master);
    source.start();
    squeal.source = source;
  }

  function init() {
    if (started || failed) return;
    started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        failed = true;
        return;
      }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.5 : 0;
      master.connect(ctx.destination);
      noiseBuffer = buildNoise();
      buildAmbient();
      buildEngine();
      buildSiren();
      buildSqueal();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      lastCompleted = 0;
    } catch {
      failed = true;
      ctx = null;
    }
  }

  function resume() {
    try {
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch {
      // A suspended context that refuses to resume is silent, not broken.
    }
  }

  function tone(frequency, duration, type, volume, slideTo) {
    if (!ctx || !enabled) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch {
      // One dropped sound is not a reason to stop the game.
    }
  }

  function noise(duration, type, frequency, volume) {
    if (!ctx || !enabled) return;
    try {
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(now, Math.random() * 1.4, duration);
    } catch {
      // As above.
    }
  }

  function chime() {
    tone(392.0, 0.28, 'triangle', 0.06);
    setTimeout(() => tone(523.25, 0.34, 'triangle', 0.05), 140);
    setTimeout(() => tone(659.25, 0.5, 'triangle', 0.045), 290);
  }

  const handlers = {
    shot: () => {
      noise(0.16, 'highpass', 700, 0.22);
      tone(95, 0.14, 'square', 0.08, 55);
    },
    punch: () => {
      tone(78, 0.14, 'sine', 0.13, 45);
      noise(0.1, 'lowpass', 380, 0.09);
    },
    thud: () => tone(62, 0.2, 'sine', 0.12, 34),
    crash: () => {
      noise(0.34, 'lowpass', 620, 0.16);
      tone(52, 0.3, 'sine', 0.1, 30);
    },
    explosion: () => {
      noise(0.9, 'lowpass', 460, 0.3);
      tone(46, 0.8, 'sine', 0.22, 26);
    },
    step: () => noise(0.05, 'highpass', 1800, 0.028),
    enter: () => {
      tone(240, 0.08, 'square', 0.05);
      setTimeout(() => tone(320, 0.1, 'square', 0.04), 70);
    },
    exit: () => tone(200, 0.1, 'square', 0.04, 140),
    horn: () => {
      tone(320, 0.42, 'square', 0.06);
      tone(404, 0.42, 'square', 0.045);
    },
    hurt: () => noise(0.18, 'bandpass', 900, 0.12),
    death: () => {
      tone(220, 0.8, 'triangle', 0.12, 55);
      noise(0.7, 'lowpass', 300, 0.15);
    },
    dry: () => tone(1400, 0.04, 'square', 0.03, 900),
    impact: () => noise(0.06, 'highpass', 1200, 0.04),
  };

  function handle(events) {
    if (!ctx || !enabled) return;
    for (const event of events) {
      const handler = handlers[event.type];
      if (handler) handler();
    }
  }

  function update(world) {
    if (!ctx) return;
    if (!enabled) return;
    try {
      const now = ctx.currentTime;
      const player = world.player;
      const car = player.onFoot ? null : player.car;
      const speed = car ? Math.hypot(car.vx, car.vy) : 0;

      const engineGain = car ? 0.045 + Math.min(0.06, speed / 460 * 0.075) : 0;
      engine.gain.gain.setTargetAtTime(engineGain, now, 0.12);
      const pitch = 46 + speed * 0.38;
      engine.filter.frequency.setTargetAtTime(260 + speed * 2.4, now, 0.1);
      for (const osc of engine.oscillators) osc.frequency.setTargetAtTime(pitch * (osc.type === 'triangle' ? 2 : 1), now, 0.1);

      const drift = car ? Math.abs(car.steer || 0) * Math.min(1, speed / 260) : 0;
      squeal.gain.gain.setTargetAtTime(drift > 0.45 && speed > 130 ? 0.018 + drift * 0.03 : 0, now, 0.08);

      let nearest = Infinity;
      const px = player.onFoot ? player.x : player.car.x;
      const py = player.onFoot ? player.y : player.car.y;
      for (const cop of world.cars) {
        if (cop.driver !== 'police') continue;
        nearest = Math.min(nearest, Math.hypot(cop.x - px, cop.y - py));
      }
      for (const cop of world.cops) {
        if (cop.state === 'down') continue;
        nearest = Math.min(nearest, Math.hypot(cop.x - px, cop.y - py));
      }
      const sirenLevel = world.wanted > 0 && nearest < 1600 ? Math.min(0.12, 0.11 / (1 + nearest / 520)) : 0;
      siren.gain.gain.setTargetAtTime(sirenLevel, now, 0.25);

      padTimer += 1 / 60;
      if (padTimer > 9) {
        padTimer = 0;
        chordIndex = 1 - chordIndex;
        const chord = chordIndex === 0 ? A_CHORD : B_CHORD;
        for (let index = 0; index < pad.oscillators.length - 1; index += 1) {
          pad.oscillators[index].frequency.setTargetAtTime(chord[index], now, 1.2);
        }
      }
      pluckTimer += 1 / 60;
      if (pluckTimer > 2.6) {
        pluckTimer = 0;
        const chord = chordIndex === 0 ? A_CHORD : B_CHORD;
        const note = chord[Math.floor(Math.random() * chord.length)] * 2;
        tone(note, 1.4, 'sine', 0.018);
      }
      if (world.mission.completed !== lastCompleted) {
        lastCompleted = world.mission.completed;
        chime();
      }
    } catch {
      // Never let the mix stop the simulation or the render.
    }
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    writeEnabled(enabled);
    try {
      if (master && ctx) master.gain.setTargetAtTime(enabled ? 0.5 : 0, ctx.currentTime, 0.05);
    } catch {
      // Ignore.
    }
  }

  return {
    init,
    resume,
    update,
    handle,
    setEnabled,
    isEnabled: () => enabled,
    toggle: () => {
      setEnabled(!enabled);
      return enabled;
    },
  };
}
