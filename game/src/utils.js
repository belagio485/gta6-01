// Shared math helpers and a deterministic random generator for Marisol Bay.
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, smoothing, dt) {
  return lerp(current, target, 1 - Math.exp(-smoothing * dt));
}

// Shortest-arc angle interpolation, in radians.
export function dampAngle(current, target, smoothing, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-smoothing * dt));
}

export function angleDifference(from, to) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function distance2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Mulberry32: small fast seeded PRNG so the city layout is identical every run.
export function makeRng(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickRandom(rng, array) {
  return array[Math.floor(rng() * array.length)];
}

export function rangeRandom(rng, min, max) {
  return min + rng() * (max - min);
}

export function formatMoney(amount) {
  const sign = amount < 0 ? '-' : '';
  return sign + '$' + Math.abs(Math.round(amount)).toLocaleString('en-US');
}

export function formatClock(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = Math.floor(totalMinutes) % 60;
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}
