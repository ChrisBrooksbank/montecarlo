// Randomness for simulations and for cryptography.
// Simulations use a fast, *seedable* PRNG so runs are reproducible.
// Cryptographic secrets must NEVER use it — see secureRandomBigInt.

export type RNG = () => number;

/** mulberry32: tiny, fast, decent-quality 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}

/** Standard normal via Box–Muller. */
export function gaussian(rng: RNG): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** i-th element (i ≥ 1) of the Halton / van der Corput sequence in a prime base. */
export function halton(i: number, base: number): number {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

// Sobol direction numbers for the first two dimensions (32-bit).
// Dim 1 is van der Corput in base 2 (m_k = 1). Dim 2 uses primitive polynomial x + 1:
// m_k = 2·m_{k−1} XOR m_{k−1}  →  1, 3, 5, 15, 17, 51, …
const SOBOL_V: [Uint32Array, Uint32Array] = (() => {
  const v1 = new Uint32Array(32);
  const v2 = new Uint32Array(32);
  let m = 1;
  for (let k = 0; k < 32; k++) {
    v1[k] = (1 << (31 - k)) >>> 0;
    if (k > 0) m = (2 * m) ^ m;
    v2[k] = (m << (31 - k)) >>> 0;
  }
  return [v1, v2];
})();

/** i-th 2-D Sobol point (i ≥ 0), via the direct (non-Gray-code) definition. */
export function sobol2(i: number): [number, number] {
  let x = 0;
  let y = 0;
  for (let k = 0; i > 0; k++, i >>>= 1) {
    if (i & 1) {
      x ^= SOBOL_V[0][k];
      y ^= SOBOL_V[1][k];
    }
  }
  return [(x >>> 0) / 4294967296, (y >>> 0) / 4294967296];
}

/** Cryptographically secure random BigInt in [min, max]. Uses rejection sampling (no modulo bias). */
export function secureRandomBigInt(min: bigint, max: bigint): bigint {
  if (max < min) throw new Error("max < min");
  const range = max - min + 1n;
  const bits = range.toString(2).length;
  const bytes = Math.ceil(bits / 8);
  const mask = (1n << BigInt(bits)) - 1n;
  const buf = new Uint8Array(bytes);
  for (;;) {
    crypto.getRandomValues(buf);
    let r = 0n;
    for (const b of buf) r = (r << 8n) | BigInt(b);
    r &= mask;
    if (r < range) return min + r;
  }
}

export function shuffle<T>(arr: T[], rng: RNG = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
