import { gaussian, halton, type RNG } from "./random";

export function inQuarterCircle(x: number, y: number): boolean {
  return x * x + y * y <= 1;
}

/** 95% confidence interval for π from `hits` out of `n` darts (normal approximation). */
export function piConfidence(hits: number, n: number, z = 1.96) {
  const p = n ? hits / n : 0;
  const est = 4 * p;
  const se = n ? 4 * Math.sqrt((p * (1 - p)) / n) : Infinity;
  return { est, se, lo: est - z * se, hi: est + z * se };
}

// ─── Integration with variance reduction ──────────────────────────────

export interface Integrand {
  id: string;
  label: string;
  tex: string;
  f: (x: number) => number;
  truth: number;
  /** Importance-sampling density on [0,1] and a sampler for it. */
  pdf: (x: number) => number;
  sample: (rng: RNG) => number;
  pdfTex: string;
}

export const INTEGRANDS: Integrand[] = [
  {
    id: "pi",
    label: "4 / (1 + x²)  — secretly π",
    tex: "\\int_0^1 \\frac{4}{1+x^2}\\,dx = \\pi",
    f: (x) => 4 / (1 + x * x),
    truth: Math.PI,
    pdf: (x) => (4 - 2 * x) / 3,
    sample: (rng) => 2 - Math.sqrt(4 - 3 * rng()),
    pdfTex: "p(x) = (4-2x)/3",
  },
  {
    id: "exp",
    label: "eˣ",
    tex: "\\int_0^1 e^x\\,dx = e - 1",
    f: Math.exp,
    truth: Math.E - 1,
    pdf: (x) => (2 * (1 + x)) / 3,
    sample: (rng) => -1 + Math.sqrt(1 + 3 * rng()),
    pdfTex: "p(x) = 2(1+x)/3",
  },
  {
    id: "spike",
    label: "x¹⁰  — a nasty spike",
    tex: "\\int_0^1 x^{10}\\,dx = \\tfrac{1}{11}",
    f: (x) => x ** 10,
    truth: 1 / 11,
    pdf: (x) => 6 * x ** 5,
    sample: (rng) => rng() ** (1 / 6),
    pdfTex: "p(x) = 6x^5",
  },
  {
    id: "sin",
    label: "sin(πx)",
    tex: "\\int_0^1 \\sin(\\pi x)\\,dx = \\tfrac{2}{\\pi}",
    f: (x) => Math.sin(Math.PI * x),
    truth: 2 / Math.PI,
    pdf: (x) => 6 * x * (1 - x),
    // Beta(2,2) is the distribution of the median of three uniforms.
    sample: (rng) => {
      const a = [rng(), rng(), rng()].sort((p, q) => p - q);
      return a[1];
    },
    pdfTex: "p(x) = 6x(1-x)",
  },
];

export type MethodId = "plain" | "antithetic" | "stratified" | "control" | "importance" | "quasi";

export const METHODS: { id: MethodId; label: string; blurb: string }[] = [
  { id: "plain", label: "Plain MC", blurb: "Average f at N uniform points." },
  { id: "antithetic", label: "Antithetic", blurb: "Pair every U with 1−U so errors cancel." },
  { id: "stratified", label: "Stratified", blurb: "One sample in each of N equal slices." },
  { id: "control", label: "Control variate", blurb: "Subtract β·(x − ½), whose mean we know is 0." },
  { id: "importance", label: "Importance", blurb: "Sample where f is big, reweight by f/p." },
  { id: "quasi", label: "Quasi-MC (Halton)", blurb: "Low-discrepancy points + a random shift." },
];

export function integrate(method: MethodId, g: Integrand, n: number, rng: RNG): number {
  const f = g.f;
  switch (method) {
    case "plain": {
      let s = 0;
      for (let i = 0; i < n; i++) s += f(rng());
      return s / n;
    }
    case "antithetic": {
      const m = Math.max(1, Math.floor(n / 2));
      let s = 0;
      for (let i = 0; i < m; i++) {
        const u = rng();
        s += (f(u) + f(1 - u)) / 2;
      }
      return s / m;
    }
    case "stratified": {
      let s = 0;
      for (let i = 0; i < n; i++) s += f((i + rng()) / n);
      return s / n;
    }
    case "control": {
      // Control variate h(x) = x with known mean 1/2; β estimated from the same samples.
      const xs = new Float64Array(n);
      const fs = new Float64Array(n);
      let mf = 0;
      let mx = 0;
      for (let i = 0; i < n; i++) {
        const u = rng();
        xs[i] = u;
        fs[i] = f(u);
        mf += fs[i];
        mx += u;
      }
      mf /= n;
      mx /= n;
      let cov = 0;
      let vx = 0;
      for (let i = 0; i < n; i++) {
        cov += (fs[i] - mf) * (xs[i] - mx);
        vx += (xs[i] - mx) ** 2;
      }
      const beta = vx > 0 ? cov / vx : 0;
      return mf - beta * (mx - 0.5);
    }
    case "importance": {
      let s = 0;
      for (let i = 0; i < n; i++) {
        const x = g.sample(rng);
        s += f(x) / g.pdf(x);
      }
      return s / n;
    }
    case "quasi": {
      const shift = rng();
      let s = 0;
      for (let i = 1; i <= n; i++) s += f((halton(i, 2) + shift) % 1);
      return s / n;
    }
  }
}

/** Root-mean-square error of `method` over `reps` independent repetitions. */
export function rmse(method: MethodId, g: Integrand, n: number, reps: number, rng: RNG): number {
  let s = 0;
  for (let r = 0; r < reps; r++) s += (integrate(method, g, n, rng) - g.truth) ** 2;
  return Math.sqrt(s / reps);
}

// ─── Portfolio simulation (geometric Brownian motion) ──────────────────

export interface PortfolioParams {
  start: number;
  monthly: number;
  years: number;
  annualReturn: number; // e.g. 0.07
  annualVol: number; // e.g. 0.15
  paths: number;
}

export interface PortfolioResult {
  /** percentile bands per month: p5, p25, p50, p75, p95 */
  bands: number[][];
  finals: Float64Array;
  samplePaths: number[][];
  contributed: number;
}

export function simulatePortfolio(p: PortfolioParams, rng: RNG): PortfolioResult {
  const months = Math.round(p.years * 12);
  const dt = 1 / 12;
  const drift = (p.annualReturn - 0.5 * p.annualVol ** 2) * dt;
  const vol = p.annualVol * Math.sqrt(dt);
  const values = Array.from({ length: months + 1 }, () => new Float64Array(p.paths));
  for (let j = 0; j < p.paths; j++) values[0][j] = p.start;
  for (let t = 1; t <= months; t++) {
    const prev = values[t - 1];
    const cur = values[t];
    for (let j = 0; j < p.paths; j++) {
      cur[j] = prev[j] * Math.exp(drift + vol * gaussian(rng)) + p.monthly;
    }
  }
  const qs = [0.05, 0.25, 0.5, 0.75, 0.95];
  const bands = values.map((row) => {
    const s = Float64Array.from(row).sort();
    return qs.map((q) => quantileSorted(s, q));
  });
  const samplePaths: number[][] = [];
  for (let j = 0; j < Math.min(40, p.paths); j++) samplePaths.push(values.map((r) => r[j]));
  return { bands, finals: values[months], samplePaths, contributed: p.start + p.monthly * months };
}

export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Simple histogram: returns bin edges and counts. */
export function histogram(values: ArrayLike<number>, bins: number, min?: number, max?: number) {
  let lo = min ?? Infinity;
  let hi = max ?? -Infinity;
  if (min === undefined || max === undefined) {
    for (let i = 0; i < values.length; i++) {
      if (min === undefined) lo = Math.min(lo, values[i]);
      if (max === undefined) hi = Math.max(hi, values[i]);
    }
  }
  if (hi <= lo) hi = lo + 1;
  const counts = new Array(bins).fill(0);
  const w = (hi - lo) / bins;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < lo || v > hi) continue;
    counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  }
  return { lo, hi, width: w, counts };
}

/** Birthday problem: fraction of simulated rooms with a shared birthday. */
export function birthdayCollisionRate(people: number, rooms: number, rng: RNG): number {
  let hits = 0;
  const seen = new Uint8Array(365);
  for (let r = 0; r < rooms; r++) {
    seen.fill(0);
    for (let k = 0; k < people; k++) {
      const d = Math.floor(rng() * 365);
      if (seen[d]) {
        hits++;
        break;
      }
      seen[d] = 1;
    }
  }
  return hits / rooms;
}

export function birthdayExact(people: number): number {
  let p = 1;
  for (let k = 0; k < people; k++) p *= (365 - k) / 365;
  return 1 - p;
}
