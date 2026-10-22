// Gedeelde AudioContext. Safari/iOS start pas geluid na een aanraking, dus unlock() hangt aan de eerste klik.
let ctx = null;
let master = null;
let busses = null;

export function getAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    busses = {
      piano: gainTo(master, 1),
      other: gainTo(master, 0.55), // andere hand / voorbeeld
      accomp: gainTo(master, 0.45),
      drums: gainTo(master, 0.6),
      click: gainTo(master, 0.5),
    };
  }
  return { ctx, master, busses };
}

function gainTo(dest, value) {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(dest);
  return g;
}

export function setVolume(v) {
  getAudio().master.gain.value = v;
}

export async function unlockAudio() {
  const { ctx } = getAudio();
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      /* negeer */
    }
  }
  // iOS: een kort stil buffertje afspelen ontgrendelt de uitvoer definitief.
  const b = ctx.createBuffer(1, 1, 22050);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(ctx.destination);
  s.start(0);
}

/** performance.now()-tijd (ms) omrekenen naar AudioContext-tijd (s). */
export function perfToAudioTime(perfMs) {
  const { ctx } = getAudio();
  return ctx.currentTime + (perfMs - performance.now()) / 1000;
}

let noiseBuffer = null;
export function getNoise() {
  const { ctx } = getAudio();
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}
