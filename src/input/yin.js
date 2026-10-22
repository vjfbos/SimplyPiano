// Toonhoogtebepaling met het YIN-algoritme
// (de Cheveigné & Kawahara, "YIN, a fundamental frequency estimator for speech and music", JASA 2002).
// Eigen implementatie van de stappen uit het artikel:
//   1. verschilfunctie d(tau)
//   2. cumulatief-gemiddeld genormaliseerde verschilfunctie d'(tau)
//   3. absolute drempel: eerste tau met d'(tau) < drempel, daarna lokaal minimum zoeken
//   4. parabolische interpolatie rond het minimum voor sub-sample nauwkeurigheid

/**
 * @param {Float32Array} buf  tijdsignaal (minstens window + maxTau samples)
 * @param {number} sampleRate
 * @param {object} opts { minFreq, maxFreq, threshold, window }
 * @returns {{freq:number, clarity:number}|null}
 */
export function yin(buf, sampleRate, { minFreq = 55, maxFreq = 1600, threshold = 0.15, window } = {}) {
  const maxTau = Math.min(Math.floor(sampleRate / minFreq), Math.floor(buf.length / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  const W = Math.min(window || buf.length - maxTau, buf.length - maxTau);
  if (W <= 0 || maxTau <= minTau) return null;

  const d = new Float32Array(maxTau + 1);
  // Stap 1: verschilfunctie
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // Stap 2: cumulatief gemiddelde normalisatie
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  // Stap 3: absolute drempel
  let tauEst = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (d[tau] < threshold) {
      while (tau + 1 <= maxTau && d[tau + 1] < d[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  if (tauEst === -1) return null;
  // Stap 4: parabolische interpolatie
  let better = tauEst;
  if (tauEst > 1 && tauEst < maxTau) {
    const s0 = d[tauEst - 1];
    const s1 = d[tauEst];
    const s2 = d[tauEst + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) better = tauEst + (s2 - s0) / denom;
  }
  return { freq: sampleRate / better, clarity: 1 - d[tauEst] };
}

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}
