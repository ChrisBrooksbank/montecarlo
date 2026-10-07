import { secureRandomBigInt } from "./random";

/** Square-and-multiply modular exponentiation. BigInt keeps it exact for any size. */
export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

/** Every step of square-and-multiply, for teaching. */
export function modPowTrace(base: bigint, exp: bigint, mod: bigint) {
  const steps: { bit: string; square: bigint; result: bigint }[] = [];
  let result = 1n;
  let b = base % mod;
  for (const bit of exp.toString(2).split("").reverse()) {
    if (bit === "1") result = (result * b) % mod;
    steps.push({ bit, square: b, result });
    b = (b * b) % mod;
  }
  return { result, steps };
}

export function modInverse(a: bigint, m: bigint): bigint {
  let [oldR, r] = [((a % m) + m) % m, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1n) throw new Error("not invertible");
  return ((oldS % m) + m) % m;
}

const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];

/** Miller–Rabin. With these 13 bases it is deterministic for n < 3.3·10²⁴. */
export function isProbablePrime(n: bigint): boolean {
  if (n < 2n) return false;
  for (const p of SMALL_PRIMES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }
  outer: for (const a of SMALL_PRIMES) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1; i < s; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue outer;
    }
    return false;
  }
  return true;
}

export function randomPrime(bits: number): bigint {
  const lo = 1n << BigInt(bits - 1);
  const hi = (1n << BigInt(bits)) - 1n;
  for (;;) {
    const c = secureRandomBigInt(lo, hi) | 1n;
    if (isProbablePrime(c)) return c;
  }
}

/** Safe prime p = 2q + 1 with q prime. Fine for teaching sizes (≤ ~64 bits). */
export function randomSafePrime(bits: number): bigint {
  for (;;) {
    const q = randomPrime(bits - 1);
    const p = 2n * q + 1n;
    if (isProbablePrime(p)) return p;
  }
}

/** For a safe prime p = 2q+1, g generates the full group iff g² ≠ 1 and g^q ≠ 1. */
export function isGeneratorSafePrime(g: bigint, p: bigint): boolean {
  const q = (p - 1n) / 2n;
  return modPow(g, 2n, p) !== 1n && modPow(g, q, p) !== 1n;
}

export function smallestGeneratorSafePrime(p: bigint): bigint {
  for (let g = 2n; g < p; g++) if (isGeneratorSafePrime(g, p)) return g;
  throw new Error("no generator");
}

/** Trial-division factorisation (fine for numbers up to ~10¹²). */
export function factorize(n: number): Map<number, number> {
  const f = new Map<number, number>();
  let m = n;
  for (let d = 2; d * d <= m; d++) {
    while (m % d === 0) {
      f.set(d, (f.get(d) ?? 0) + 1);
      m /= d;
    }
  }
  if (m > 1) f.set(m, (f.get(m) ?? 0) + 1);
  return f;
}

/** Multiplicative order of g mod p (p prime, small). */
export function multiplicativeOrder(g: number, p: number): number {
  if (g % p === 0) return 0;
  let order = p - 1;
  for (const [q] of factorize(p - 1)) {
    while (order % q === 0 && modPowNum(g, order / q, p) === 1) order /= q;
  }
  return order;
}

export function modPowNum(b: number, e: number, m: number): number {
  return Number(modPow(BigInt(b), BigInt(e), BigInt(m)));
}

export function primitiveRoots(p: number): number[] {
  const out: number[] = [];
  for (let g = 2; g < p; g++) if (multiplicativeOrder(g, p) === p - 1) out.push(g);
  if (p === 2) out.push(1);
  return out;
}

export function isPrimeNum(n: number): boolean {
  if (n < 2 || !Number.isInteger(n)) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

/** Brute-force discrete log: smallest x ≥ 1 with g^x ≡ h (mod p). Returns tries too. */
export function bruteForceDlog(g: bigint, h: bigint, p: bigint, maxTries = 10_000_000) {
  let x = 1n;
  let cur = g % p;
  for (let tries = 1; tries <= maxTries; tries++) {
    if (cur === h) return { x, tries };
    cur = (cur * g) % p;
    x++;
  }
  return { x: null as bigint | null, tries: maxTries };
}

/** Baby-step giant-step: O(√n) time and memory. */
export function babyStepGiantStep(g: bigint, h: bigint, p: bigint, order: bigint): bigint | null {
  const m = BigInt(Math.ceil(Math.sqrt(Number(order))));
  const table = new Map<bigint, bigint>();
  let e = 1n;
  for (let j = 0n; j < m; j++) {
    if (!table.has(e)) table.set(e, j);
    e = (e * g) % p;
  }
  const factor = modPow(modInverse(g, p), m, p);
  let gamma = h % p;
  for (let i = 0n; i < m; i++) {
    const j = table.get(gamma);
    if (j !== undefined) return i * m + j;
    gamma = (gamma * factor) % p;
  }
  return null;
}

/**
 * Pohlig–Hellman: solve g^x = h when the group order n = p−1 is smooth.
 * Returns x and the per-prime-power sub-problems so the UI can show the attack.
 */
export function pohligHellman(g: number, h: number, p: number) {
  const n = p - 1;
  const parts: { q: number; e: number; x: number }[] = [];
  for (const [q, e] of factorize(n)) {
    const qe = q ** e;
    const gi = modPowNum(g, n / qe, p);
    const hi = modPowNum(h, n / qe, p);
    let x = 0;
    for (let k = 0; k < qe; k++) {
      if (modPowNum(gi, k, p) === hi) {
        x = k;
        break;
      }
    }
    parts.push({ q, e, x });
  }
  // Chinese remainder theorem.
  let x = 0;
  let mod = 1;
  for (const { q, e, x: r } of parts) {
    const qe = q ** e;
    while (x % qe !== r) x += mod;
    mod *= qe;
  }
  return { x, parts };
}

// ─── Elliptic curves over F_p (small, for visualisation) ──────────────

export type ECPoint = { x: number; y: number } | null; // null = point at infinity

export interface Curve {
  a: number;
  b: number;
  p: number;
}

const mod = (a: number, m: number) => ((a % m) + m) % m;

function invNum(a: number, p: number): number {
  return modPowNum(mod(a, p), p - 2, p);
}

export function isValidCurve(c: Curve): boolean {
  return isPrimeNum(c.p) && c.p > 3 && mod(4 * c.a ** 3 + 27 * c.b ** 2, c.p) !== 0;
}

export function curvePoints(c: Curve): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const sq = new Map<number, number[]>();
  for (let y = 0; y < c.p; y++) {
    const v = (y * y) % c.p;
    if (!sq.has(v)) sq.set(v, []);
    sq.get(v)!.push(y);
  }
  for (let x = 0; x < c.p; x++) {
    const rhs = mod(x * x * x + c.a * x + c.b, c.p);
    for (const y of sq.get(rhs) ?? []) pts.push({ x, y });
  }
  return pts;
}

export function ecAdd(P: ECPoint, Q: ECPoint, c: Curve): ECPoint {
  if (!P) return Q;
  if (!Q) return P;
  const p = c.p;
  if (P.x === Q.x && mod(P.y + Q.y, p) === 0) return null;
  let s: number;
  if (P.x === Q.x && P.y === Q.y) s = mod((3 * P.x * P.x + c.a) * invNum(2 * P.y, p), p);
  else s = mod((Q.y - P.y) * invNum(Q.x - P.x, p), p);
  const x = mod(s * s - P.x - Q.x, p);
  const y = mod(s * (P.x - x) - P.y, p);
  return { x, y };
}

export function ecMul(k: number, P: ECPoint, c: Curve): ECPoint {
  let R: ECPoint = null;
  let A = P;
  let n = k;
  while (n > 0) {
    if (n & 1) R = ecAdd(R, A, c);
    A = ecAdd(A, A, c);
    n >>= 1;
  }
  return R;
}

/** The sequence P, 2P, 3P, … until it returns to infinity. */
export function ecOrbit(P: ECPoint, c: Curve, limit = 5000): ECPoint[] {
  const out: ECPoint[] = [];
  let R: ECPoint = P;
  for (let i = 0; i < limit && R; i++) {
    out.push(R);
    R = ecAdd(R, P, c);
  }
  return out;
}

// ─── Paint mixing (the analogy) ───────────────────────────────────────

export type RGB = [number, number, number];

/** Pigment-ish mixing: average in linear light, then a touch of subtractive darkening. */
export function mixPaint(...cols: RGB[]): RGB {
  const toLin = (c: number) => (c / 255) ** 2.2;
  const toSrgb = (c: number) => Math.round(255 * Math.min(1, Math.max(0, c)) ** (1 / 2.2));
  const lin = cols.map((c) => c.map(toLin));
  const avg = [0, 1, 2].map((k) => lin.reduce((s, c) => s + c[k], 0) / lin.length);
  const geo = [0, 1, 2].map((k) => Math.exp(lin.reduce((s, c) => s + Math.log(c[k] + 1e-4), 0) / lin.length));
  return [0, 1, 2].map((k) => toSrgb(0.55 * avg[k] + 0.45 * geo[k])) as RGB;
}

export function rgbCss([r, g, b]: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function colorDistance(a: RGB, b: RGB): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
