import { describe, expect, it } from "vitest";
import { halton, mulberry32, secureRandomBigInt, sobol2 } from "../random";
import { INTEGRANDS, METHODS, birthdayExact, integrate, piConfidence, rmse, simulatePortfolio } from "../montecarlo";
import {
  buildTextModel, eigenvalues, googleMatrix, isIrreducible, matPow, mixingTime, period, predictNext,
  spectralGap, stationary, validateStochastic, vecMat,
} from "../markov";
import {
  babyStepGiantStep, bruteForceDlog, curvePoints, ecAdd, ecMul, ecOrbit, isGeneratorSafePrime, isProbablePrime,
  modPow, multiplicativeOrder, pohligHellman, primitiveRoots, randomSafePrime,
} from "../diffiehellman";

describe("random", () => {
  it("mulberry32 is deterministic and in [0,1)", () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it("halton base 2 is van der Corput", () => {
    expect([1, 2, 3, 4].map((i) => halton(i, 2))).toEqual([0.5, 0.25, 0.75, 0.125]);
  });
  it("sobol2 first points match the reference", () => {
    expect(sobol2(0)).toEqual([0, 0]);
    expect(sobol2(1)).toEqual([0.5, 0.5]);
    expect(sobol2(2)).toEqual([0.25, 0.75]);
    expect(sobol2(3)).toEqual([0.75, 0.25]);
  });
  it("secureRandomBigInt stays in range", () => {
    for (let i = 0; i < 200; i++) {
      const r = secureRandomBigInt(5n, 9n);
      expect(r >= 5n && r <= 9n).toBe(true);
    }
  });
});

describe("monte carlo", () => {
  it("π CI contains π for a large sample", () => {
    const rng = mulberry32(1);
    let hits = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) { const x = rng(), y = rng(); if (x * x + y * y <= 1) hits++; }
    const ci = piConfidence(hits, n);
    expect(ci.lo).toBeLessThan(Math.PI);
    expect(ci.hi).toBeGreaterThan(Math.PI);
  });
  it("every method is unbiased-ish on every integrand", () => {
    const rng = mulberry32(7);
    for (const g of INTEGRANDS) for (const m of METHODS) {
      expect(Math.abs(integrate(m.id, g, 20000, rng) - g.truth)).toBeLessThan(0.02 * Math.max(1, g.truth));
    }
  });
  it("variance reduction beats plain MC on smooth integrands", () => {
    const g = INTEGRANDS.find((x) => x.id === "exp")!;
    const plain = rmse("plain", g, 1000, 40, mulberry32(3));
    for (const m of ["antithetic", "stratified", "control", "importance", "quasi"] as const) {
      expect(rmse(m, g, 1000, 40, mulberry32(3))).toBeLessThan(plain);
    }
  });
  it("birthday problem: 23 people ≈ 50.7%", () => {
    expect(birthdayExact(23)).toBeCloseTo(0.5073, 3);
  });
  it("portfolio bands are ordered", () => {
    const r = simulatePortfolio({ start: 1000, monthly: 100, years: 5, annualReturn: 0.07, annualVol: 0.15, paths: 300 }, mulberry32(9));
    for (const b of r.bands) for (let i = 1; i < b.length; i++) expect(b[i]).toBeGreaterThanOrEqual(b[i - 1]);
    expect(r.contributed).toBe(1000 + 100 * 60);
  });
});

describe("markov", () => {
  const W = [[0.7, 0.2, 0.1], [0.3, 0.4, 0.3], [0.2, 0.4, 0.4]];
  it("validates stochastic matrices", () => {
    expect(validateStochastic(W)).toEqual([]);
    expect(validateStochastic([[0.5, 0.4], [0, 1]]).length).toBe(1);
  });
  it("stationary distribution is fixed by P", () => {
    const pi = stationary(W);
    expect(pi[0]).toBeCloseTo(6 / 13, 6);
    vecMat(pi, W).forEach((v, i) => expect(v).toBeCloseTo(pi[i], 9));
  });
  it("matPow rows converge to π", () => {
    const pi = stationary(W);
    matPow(W, 60).forEach((row) => row.forEach((v, j) => expect(v).toBeCloseTo(pi[j], 6)));
  });
  it("eigenvalues of a stochastic matrix include 1", () => {
    const ev = eigenvalues(W);
    expect(ev[0].re).toBeCloseTo(1, 6);
    // trace = sum of eigenvalues
    expect(ev.reduce((s, z) => s + z.re, 0)).toBeCloseTo(1.5, 6);
  });
  it("detects complex eigenvalues of a rotation", () => {
    const ev = eigenvalues([[0, 1, 0], [0, 0, 1], [1, 0, 0]]);
    ev.forEach((z) => expect(Math.hypot(z.re, z.im)).toBeCloseTo(1, 6));
    expect(ev.filter((z) => Math.abs(z.im) > 0.5).length).toBe(2);
  });
  it("structure detection", () => {
    expect(isIrreducible(W)).toBe(true);
    expect(period(W)).toBe(1);
    const flip = [[0, 1], [1, 0]];
    expect(period(flip)).toBe(2);
    expect(isIrreducible([[1, 0], [0.5, 0.5]])).toBe(false);
    expect(spectralGap(flip)).toBeCloseTo(0, 6);
    expect(mixingTime(W)).toBeGreaterThan(0);
  });
  it("text model predicts frequencies", () => {
    const m = buildTextModel("the cat sat. the cat ran. the dog sat.");
    const p = predictNext(m, "the");
    expect(p[0]).toEqual({ word: "cat", p: 2 / 3 });
  });
  it("google matrix is stochastic, dangling pages teleport", () => {
    const G = googleMatrix([[1], [0, 2], []], 3);
    expect(validateStochastic(G)).toEqual([]);
  });
});

describe("diffie-hellman", () => {
  it("modPow matches the textbook example", () => {
    // p=23, g=5, a=6, b=15 → A=8, B=19, s=2
    expect(modPow(5n, 6n, 23n)).toBe(8n);
    expect(modPow(5n, 15n, 23n)).toBe(19n);
    expect(modPow(19n, 6n, 23n)).toBe(2n);
    expect(modPow(8n, 15n, 23n)).toBe(2n);
  });
  it("modPow is exact for huge numbers", () => {
    const p = (1n << 127n) - 1n;
    expect(modPow(3n, p - 1n, p)).toBe(1n); // Fermat
  });
  it("primality", () => {
    expect(isProbablePrime(2n ** 61n - 1n)).toBe(true);
    expect(isProbablePrime(561n)).toBe(false); // Carmichael
    const sp = randomSafePrime(24);
    expect(isProbablePrime(sp) && isProbablePrime((sp - 1n) / 2n)).toBe(true);
  });
  it("generators", () => {
    expect(primitiveRoots(23)).toContain(5);
    expect(multiplicativeOrder(2, 23)).toBe(11);
    expect(isGeneratorSafePrime(5n, 23n)).toBe(true);
    expect(isGeneratorSafePrime(2n, 23n)).toBe(false);
  });
  it("discrete log solvers agree", () => {
    const p = 1019n, g = 2n, h = modPow(g, 777n, p);
    const bf = bruteForceDlog(g, h, p).x!;
    expect(modPow(g, bf, p)).toBe(h);
    const bs = babyStepGiantStep(g, h, p, p - 1n)!;
    expect(modPow(g, bs, p)).toBe(h);
    const ph = pohligHellman(2, Number(h), 1019);
    expect(modPow(2n, BigInt(ph.x), 1019n)).toBe(h);
  });
  it("Pohlig–Hellman handles prime powers in p − 1", () => {
    // p − 1 = 2^4 · 3^3 · 5^2 · 7 · k for the first prime of that shape
    let p = 0;
    for (let k = 1; !p; k++) { const c = 16 * 27 * 25 * 7 * k + 1; if (isProbablePrime(BigInt(c))) p = c; }
    const g = primitiveRoots(p)[0];
    for (const x of [1, 2, 777, p - 2]) {
      const h = Number(modPow(BigInt(g), BigInt(x), BigInt(p)));
      expect(pohligHellman(g, h, p).x).toBe(x % (p - 1));
    }
  });
  it("elliptic curve group law", () => {
    const c = { a: 2, b: 3, p: 97 };
    const pts = curvePoints(c);
    pts.forEach(({ x, y }) => expect((y * y - (x ** 3 + 2 * x + 3)) % 97 === 0 || (((y * y - (x ** 3 + 2 * x + 3)) % 97) + 97) % 97 === 0).toBe(true));
    const P = pts[3];
    const orbit = ecOrbit(P, c);
    expect(ecMul(orbit.length + 1, P, c)).toBe(null); // order = |orbit| + 1 (orbit excludes infinity)
    expect(ecMul(orbit.length, P, c)).not.toBe(null);
    // ECDH: a(bP) = b(aP)
    expect(ecMul(7, ecMul(11, P, c), c)).toEqual(ecMul(11, ecMul(7, P, c), c));
    expect(ecAdd(P, null, c)).toEqual(P);
  });
});
