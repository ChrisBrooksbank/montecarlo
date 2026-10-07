import type { RNG } from "./random";

export type Matrix = number[][];
export type Vec = number[];

export interface Complex {
  re: number;
  im: number;
}

export const EPS = 1e-9;

/** Returns a list of human-readable problems; empty means the matrix is row-stochastic. */
export function validateStochastic(m: Matrix): string[] {
  const errs: string[] = [];
  m.forEach((row, i) => {
    if (row.length !== m.length) errs.push(`Row ${i + 1} has ${row.length} entries, expected ${m.length}.`);
    if (row.some((v) => !Number.isFinite(v) || v < -EPS)) errs.push(`Row ${i + 1} has a negative or invalid probability.`);
    const s = row.reduce((a, b) => a + b, 0);
    if (Math.abs(s - 1) > 1e-6) errs.push(`Row ${i + 1} sums to ${s.toFixed(3)}, not 1.`);
  });
  return errs;
}

/** Scale each row to sum to 1 (rows of all zeros become self-loops). */
export function normalizeRows(m: Matrix): Matrix {
  return m.map((row, i) => {
    const clean = row.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
    const s = clean.reduce((a, b) => a + b, 0);
    return s > 0 ? clean.map((v) => v / s) : clean.map((_, j) => (i === j ? 1 : 0));
  });
}

export function sampleIndex(probs: Vec, rng: RNG): number {
  let u = rng();
  for (let i = 0; i < probs.length; i++) {
    u -= probs[i];
    if (u < 0) return i;
  }
  // Floating-point slack: return the last state with positive probability.
  for (let i = probs.length - 1; i >= 0; i--) if (probs[i] > 0) return i;
  return probs.length - 1;
}

export function step(m: Matrix, state: number, rng: RNG): number {
  return sampleIndex(m[state], rng);
}

export function vecMat(v: Vec, m: Matrix): Vec {
  const n = m.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const vi = v[i];
    if (vi === 0) continue;
    for (let j = 0; j < n; j++) out[j] += vi * m[i][j];
  }
  return out;
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  const n = a.length;
  const k = b.length;
  const p = b[0].length;
  const out: Matrix = Array.from({ length: n }, () => new Array(p).fill(0));
  for (let i = 0; i < n; i++) for (let t = 0; t < k; t++) for (let j = 0; j < p; j++) out[i][j] += a[i][t] * b[t][j];
  return out;
}

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

/** M^k by repeated squaring. */
export function matPow(m: Matrix, k: number): Matrix {
  let result = identity(m.length);
  let base = m;
  while (k > 0) {
    if (k & 1) result = matMul(result, base);
    base = matMul(base, base);
    k >>= 1;
  }
  return result;
}

/** Evolve a distribution for `steps` steps, returning every intermediate distribution. */
export function evolve(pi0: Vec, m: Matrix, steps: number): Vec[] {
  const out = [pi0];
  let v = pi0;
  for (let t = 0; t < steps; t++) {
    v = vecMat(v, m);
    out.push(v);
  }
  return out;
}

/**
 * Stationary distribution: solve π(P − I) = 0 with Σπ = 1 by Gaussian elimination.
 * For reducible chains with several closed classes the answer isn't unique; we then fall back
 * to the Cesàro average of the uniform start, which is still a valid stationary distribution.
 */
export function stationary(m: Matrix): Vec {
  const n = m.length;
  // Build A = (P − I)^T with last row replaced by ones; solve A x = e_n.
  const a: Matrix = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => m[j][i] - (i === j ? 1 : 0)),
  );
  a[n - 1] = new Array(n).fill(1);
  const b = new Array(n).fill(0);
  b[n - 1] = 1;
  const x = solve(a, b);
  if (x && x.every((v) => v > -1e-7)) return x.map((v) => Math.max(0, v));
  let v = new Array(n).fill(1 / n);
  const acc = new Array(n).fill(0);
  const T = 2000;
  for (let t = 0; t < T; t++) {
    v = vecMat(v, m);
    for (let i = 0; i < n; i++) acc[i] += v[i] / T;
  }
  return acc;
}

/** Gaussian elimination with partial pivoting; returns null if singular. */
export function solve(a0: Matrix, b0: Vec): Vec | null {
  const n = a0.length;
  const a = a0.map((r) => r.slice());
  const b = b0.slice();
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-12) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      if (f === 0) continue;
      for (let k = c; k < n; k++) a[r][k] -= f * a[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / a[i][i]);
}

export function tvDistance(p: Vec, q: Vec): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += Math.abs(p[i] - q[i]);
  return s / 2;
}

/** Worst-case total-variation distance to stationarity after t steps, for t = 0..steps. */
export function tvCurve(m: Matrix, steps: number): number[] {
  const pi = stationary(m);
  const n = m.length;
  const dists = Array.from({ length: n }, (_, i) => identity(n)[i]);
  const out: number[] = [];
  for (let t = 0; t <= steps; t++) {
    out.push(Math.max(...dists.map((d) => tvDistance(d, pi))));
    for (let i = 0; i < n; i++) dists[i] = vecMat(dists[i], m);
  }
  return out;
}

/** Smallest t with worst-case TV distance ≤ eps (or null if not reached within maxSteps). */
export function mixingTime(m: Matrix, eps = 0.25, maxSteps = 500): number | null {
  const c = tvCurve(m, maxSteps);
  const t = c.findIndex((d) => d <= eps);
  return t === -1 ? null : t;
}

// ─── Structure: irreducibility & periodicity ───────────────────────────

function reachable(m: Matrix, from: number): boolean[] {
  const seen = new Array(m.length).fill(false);
  const stack = [from];
  seen[from] = true;
  while (stack.length) {
    const i = stack.pop()!;
    m[i].forEach((p, j) => {
      if (p > EPS && !seen[j]) {
        seen[j] = true;
        stack.push(j);
      }
    });
  }
  return seen;
}

export function isIrreducible(m: Matrix): boolean {
  const n = m.length;
  for (let i = 0; i < n; i++) if (!reachable(m, i).every(Boolean)) return false;
  return true;
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return Math.abs(a);
}

/** Period of state 0's communicating class (assumes irreducible). 1 = aperiodic. */
export function period(m: Matrix): number {
  const n = m.length;
  const level = new Array(n).fill(-1);
  level[0] = 0;
  const queue = [0];
  let g = 0;
  while (queue.length) {
    const i = queue.shift()!;
    for (let j = 0; j < n; j++) {
      if (m[i][j] <= EPS) continue;
      if (level[j] === -1) {
        level[j] = level[i] + 1;
        queue.push(j);
      } else {
        g = gcd(g, level[i] + 1 - level[j]);
      }
    }
  }
  return g || 1;
}

export function absorbingStates(m: Matrix): number[] {
  return m.map((r, i) => (Math.abs(r[i] - 1) < EPS ? i : -1)).filter((i) => i >= 0);
}

// ─── Eigenvalues (small matrices) ───────────────────────────────────────

/** Characteristic polynomial coefficients via Faddeev–LeVerrier: λⁿ + c₁λⁿ⁻¹ + … + cₙ. */
export function charPoly(a: Matrix): number[] {
  const n = a.length;
  const coeffs = [1];
  let mk = identity(n).map((r) => r.map(() => 0)); // M_0 = 0
  let c = 1;
  for (let k = 1; k <= n; k++) {
    // M_k = A M_{k-1} + c_{k-1} I
    const am = matMul(a, mk);
    mk = am.map((row, i) => row.map((v, j) => v + (i === j ? c : 0)));
    const amk = matMul(a, mk);
    let tr = 0;
    for (let i = 0; i < n; i++) tr += amk[i][i];
    c = -tr / k;
    coeffs.push(c);
  }
  return coeffs;
}

/** All complex roots of a monic polynomial (coeffs high→low) via Durand–Kerner. */
export function polyRoots(coeffs: number[]): Complex[] {
  const n = coeffs.length - 1;
  if (n < 1) return [];
  const evalAt = (z: Complex): Complex => {
    let re = 1;
    let im = 0;
    for (let k = 1; k <= n; k++) {
      const nre = re * z.re - im * z.im + coeffs[k];
      const nim = re * z.im + im * z.re;
      re = nre;
      im = nim;
    }
    return { re, im };
  };
  let roots: Complex[] = Array.from({ length: n }, (_, k) => {
    const r = 0.4 + 0.9 * (k / n);
    const ang = (2 * Math.PI * k) / n + 0.4;
    return { re: r * Math.cos(ang), im: r * Math.sin(ang) };
  });
  for (let iter = 0; iter < 500; iter++) {
    let delta = 0;
    roots = roots.map((z, i) => {
      const num = evalAt(z);
      let dre = 1;
      let dim = 0;
      roots.forEach((w, j) => {
        if (i === j) return;
        const are = z.re - w.re;
        const aim = z.im - w.im;
        const nre = dre * are - dim * aim;
        dim = dre * aim + dim * are;
        dre = nre;
      });
      const den = dre * dre + dim * dim || 1e-30;
      const qre = (num.re * dre + num.im * dim) / den;
      const qim = (num.im * dre - num.re * dim) / den;
      delta = Math.max(delta, Math.hypot(qre, qim));
      return { re: z.re - qre, im: z.im - qim };
    });
    if (delta < 1e-13) break;
  }
  return roots.map((z) => ({ re: Math.abs(z.re) < 1e-9 ? 0 : z.re, im: Math.abs(z.im) < 1e-7 ? 0 : z.im }));
}

export function eigenvalues(m: Matrix): Complex[] {
  return polyRoots(charPoly(m)).sort((a, b) => Math.hypot(b.re, b.im) - Math.hypot(a.re, a.im));
}

/** Spectral gap 1 − |λ₂| (largest non-unit eigenvalue modulus). */
export function spectralGap(m: Matrix): number {
  const ev = eigenvalues(m).map((z) => Math.hypot(z.re, z.im));
  if (ev.length < 2) return 1;
  return Math.max(0, 1 - ev[1]);
}

// ─── Text model ─────────────────────────────────────────────────────────

export type TextModel = Map<string, Map<string, number>>;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s.!?]/g, " ")
    .replace(/([.!?])/g, " $1 ")
    .split(/\s+/)
    .filter(Boolean);
}

export function buildTextModel(text: string): TextModel {
  const words = tokenize(text);
  const model: TextModel = new Map();
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (!model.has(a)) model.set(a, new Map());
    const row = model.get(a)!;
    row.set(b, (row.get(b) ?? 0) + 1);
  }
  return model;
}

export function predictNext(model: TextModel, word: string, k = 5): { word: string; p: number }[] {
  const row = model.get(word.toLowerCase());
  if (!row) return [];
  const total = [...row.values()].reduce((a, b) => a + b, 0);
  return [...row.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([w, c]) => ({ word: w, p: c / total }));
}

export function sampleNext(model: TextModel, word: string, rng: RNG): string | null {
  const row = model.get(word);
  if (!row) return null;
  const entries = [...row.entries()];
  const total = entries.reduce((a, [, c]) => a + c, 0);
  let u = rng() * total;
  for (const [w, c] of entries) {
    u -= c;
    if (u < 0) return w;
  }
  return entries[entries.length - 1][0];
}

// ─── PageRank ───────────────────────────────────────────────────────────

/** Google matrix for a link graph: follow a random link with prob d, teleport otherwise. */
export function googleMatrix(links: number[][], n: number, d = 0.85): Matrix {
  return Array.from({ length: n }, (_, i) => {
    const out = links[i] ?? [];
    return Array.from({ length: n }, (_, j) => {
      const follow = out.length ? (out.includes(j) ? 1 / out.length : 0) : 1 / n;
      return d * follow + (1 - d) / n;
    });
  });
}
