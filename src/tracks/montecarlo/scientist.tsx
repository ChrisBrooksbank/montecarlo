import { useEffect, useMemo, useRef, useState } from "react";
import { LineChart } from "../../components/charts";
import { CodeLab } from "../../components/CodeLab";
import { Tex } from "../../components/Tex";
import { Seg, Slider, Stat } from "../../components/ui";
import { cssVar, setupCanvas, useThemeKey, useWidth } from "../../hooks";
import { INTEGRANDS, METHODS, rmse, type MethodId } from "../../lib/montecarlo";
import { gaussian, halton, mulberry32, randomSeed, sobol2 } from "../../lib/random";
import type { Track } from "../../types";

// ─── helpers ──────────────────────────────────────────────────────────

function lnGamma(z: number): number {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
const ballVolume = (d: number) => Math.exp((d / 2) * Math.log(Math.PI) - lnGamma(d / 2 + 1));

/** Upper normal tail Q(a) = P(Z > a), via a high-accuracy erfc. */
function normalTail(a: number): number {
  const x = a / Math.SQRT2;
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  const erfc = x >= 0 ? y : 2 - y;
  return erfc / 2;
}

const METHOD_COLORS: Record<MethodId, string> = {
  plain: "var(--ink)",
  antithetic: "var(--s2)",
  stratified: "var(--s5)",
  control: "var(--s4)",
  importance: "var(--s1)",
  quasi: "var(--s3)",
};

// ─── 1. Estimator + dimension independence ────────────────────────────

function Estimator() {
  const [d, setD] = useState(2);
  const [logN, setLogN] = useState(4);
  const [seed, setSeed] = useState(randomSeed);
  const N = Math.round(10 ** logN);
  const res = useMemo(() => {
    const rng = mulberry32(seed);
    let hits = 0;
    for (let i = 0; i < N; i++) {
      let r2 = 0;
      for (let k = 0; k < d; k++) {
        const u = 2 * rng() - 1;
        r2 += u * u;
      }
      if (r2 <= 1) hits++;
    }
    const p = hits / N;
    const vol = 2 ** d * p;
    const se = 2 ** d * Math.sqrt((p * (1 - p)) / N);
    return { hits, vol, se };
  }, [d, N, seed]);
  const truth = ballVolume(d);
  const gridPoints = (10 ** d).toExponential(0);
  return (
    <div className="split">
      <div>
        <Tex block>{"\\theta = \\mathbb{E}[f(X)] \\quad\\Rightarrow\\quad \\hat\\theta_N = \\frac{1}{N}\\sum_{i=1}^{N} f(X_i)"}</Tex>
        <Tex block>{"\\mathbb{E}[\\hat\\theta_N] = \\theta, \\quad \\operatorname{Var}[\\hat\\theta_N] = \\frac{\\sigma^2}{N} \\;\\Rightarrow\\; \\text{RMSE} = \\frac{\\sigma}{\\sqrt N}"}</Tex>
        <Tex block>{"\\sqrt{N}\\,(\\hat\\theta_N - \\theta) \\xrightarrow{d} \\mathcal N(0, \\sigma^2) \\;\\Rightarrow\\; \\hat\\theta_N \\pm 1.96\\,\\hat\\sigma/\\sqrt N"}</Tex>
        <p className="dim">
          The rate <Tex>{"N^{-1/2}"}</Tex> has no <Tex>d</Tex> in it. A product quadrature rule with error <Tex>{"O(h^k)"}</Tex> needs <Tex>{"N = h^{-d}"}</Tex> points, so its error in terms of <Tex>N</Tex> is <Tex>{"O(N^{-k/d})"}</Tex> — the curse of dimensionality. The dimension hides in <Tex>{"\\sigma^2"}</Tex> instead.
        </p>
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <p>
          <b>Experiment:</b> volume of the unit <Tex>d</Tex>-ball by hit-or-miss in <Tex>{"[-1,1]^d"}</Tex>, <Tex>{"V_d = \\pi^{d/2}/\\Gamma(d/2+1)"}</Tex>.
        </p>
        <Slider label="Dimension d" value={d} min={1} max={20} onChange={setD} />
        <Slider label="Samples N" value={logN} min={2} max={6} step={0.25} onChange={setLogN} format={() => N.toLocaleString()} />
        <div className="stats">
          <Stat label="MC estimate" value={res.vol.toPrecision(5)} sub={`± ${(1.96 * res.se).toPrecision(2)}`} />
          <Stat label="Exact Vd" value={truth.toPrecision(5)} />
          <Stat label="Hit rate" value={`${((100 * res.hits) / N).toPrecision(3)}%`} className={res.hits < 10 ? "bad" : ""} />
        </div>
        <div className="callout">
          A 10-per-axis grid in {d}D needs <b className="mono">{gridPoints}</b> points. MC used {N.toLocaleString()}.{" "}
          {d >= 10 && (
            <>
              But notice the hit rate collapsing: the ball occupies a vanishing fraction of the cube, so <Tex>{"\\sigma^2/\\theta^2"}</Tex> explodes. That's a <i>rare event</i> problem — the cure is importance sampling (chapter 3).
            </>
          )}
        </div>
        <button className="btn" onClick={() => setSeed(randomSeed())}>
          Resample
        </button>
      </div>
    </div>
  );
}

// ─── 2. Variance reduction showdown ───────────────────────────────────

const NS = [10, 32, 100, 316, 1000, 3162, 10000];

function VarianceRace() {
  const [gid, setGid] = useState("exp");
  const [results, setResults] = useState<Partial<Record<MethodId, [number, number][]>>>({});
  const [running, setRunning] = useState(false);
  const runId = useRef(0);
  const g = INTEGRANDS.find((x) => x.id === gid)!;

  const run = () => {
    const id = ++runId.current;
    setResults({});
    setRunning(true);
    const seed = randomSeed();
    let k = 0;
    const tick = () => {
      if (id !== runId.current) return;
      const n = NS[k];
      const reps = 60;
      const row: Partial<Record<MethodId, number>> = {};
      for (const m of METHODS) row[m.id] = rmse(m.id, g, n, reps, mulberry32(seed + k * 7919 + m.id.length));
      setResults((prev) => {
        const next = { ...prev };
        for (const m of METHODS) next[m.id] = [...(prev[m.id] ?? []), [n, row[m.id]!]];
        return next;
      });
      k++;
      if (k < NS.length) setTimeout(tick, 16);
      else setRunning(false);
    };
    setTimeout(tick, 16);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, [gid]);

  const last = (m: MethodId) => results[m]?.find(([n]) => n === 10000)?.[1];
  const plainLast = last("plain");
  const all = Object.values(results).flatMap((s) => s!.map((d) => d[1])).filter((v) => v > 0);
  const ymin = all.length ? Math.max(1e-9, Math.min(...all) / 2) : 1e-6;
  const ymax = all.length ? Math.max(...all) * 2 : 1;
  const ref = (p: number, c: number) => NS.map((n) => [n, c * n ** -p] as [number, number]);
  const c0 = results.plain?.[0]?.[1] ? results.plain[0][1] * Math.sqrt(10) : 0.1;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="controls">
        <Seg options={INTEGRANDS.map((x) => ({ value: x.id, label: x.label.split("—")[0].trim() }))} value={gid} onChange={setGid} />
        <button className="btn primary" onClick={run} disabled={running}>
          {running ? "Racing…" : "🏁 Re-run race"}
        </button>
      </div>
      <Tex block>{g.tex}</Tex>
      <div className="split-wide">
        <LineChart
          height={320}
          xLog
          yLog
          xDomain={[10, 10000]}
          yDomain={[ymin, ymax]}
          xLabel="N (samples)"
          yLabel="RMSE over 60 runs"
          series={[
            { data: ref(0.5, c0), color: "var(--ink-faint)", dash: "6 5", width: 1.2 },
            { data: ref(1, c0), color: "var(--ink-faint)", dash: "2 4", width: 1.2 },
            ...METHODS.map((m) => ({ data: results[m.id] ?? [], color: METHOD_COLORS[m.id], width: 2.2, dots: true })),
          ]}
          legend={[...METHODS.map((m) => ({ label: m.label, color: METHOD_COLORS[m.id] })), { label: "slope −½ / −1", color: "var(--ink-faint)" }]}
        />
        <table className="data">
          <thead>
            <tr>
              <th>Method</th>
              <th className="num">Variance cut (plain ÷ method)</th>
            </tr>
          </thead>
          <tbody>
            {METHODS.map((m) => {
              const v = last(m.id);
              const ratio = v && plainLast ? (plainLast / v) ** 2 : null;
              return (
                <tr key={m.id}>
                  <td>
                    <b style={{ color: METHOD_COLORS[m.id] }}>{m.label}</b>
                    <div className="faint" style={{ fontSize: "0.8rem" }}>
                      {m.id === "importance" ? <Tex>{g.pdfTex}</Tex> : m.blurb}
                    </div>
                  </td>
                  <td className="num">{ratio === null ? "…" : ratio >= 100 ? `${ratio.toExponential(1)}×` : `${ratio.toFixed(1)}×`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="dim">
        Stratified and quasi-MC beat the <Tex>{"N^{-1/2}"}</Tex> slope outright for smooth 1-D integrands (stratification gives <Tex>{"O(N^{-3/2})"}</Tex> here; QMC ≈ <Tex>{"O(N^{-1}\\log N)"}</Tex>). The others keep slope <Tex>{"-\\tfrac12"}</Tex> but shift the line down by shrinking <Tex>{"\\sigma"}</Tex>. Try the spike <Tex>{"x^{10}"}</Tex>: a density matched to the integrand's shape wins big; the linear control variate barely helps.
      </p>
    </div>
  );
}

// ─── 3. Rare events ───────────────────────────────────────────────────

function RareEvents() {
  const [a, setA] = useState(3);
  const [logN, setLogN] = useState(4);
  const [seed, setSeed] = useState(randomSeed);
  const N = Math.round(10 ** logN);
  const truth = normalTail(a);
  const est = useMemo(() => {
    const rng = mulberry32(seed);
    let hits = 0;
    let s = 0;
    let s2 = 0;
    for (let i = 0; i < N; i++) {
      if (gaussian(rng) > a) hits++;
      const x = a + gaussian(rng); // proposal N(a, 1)
      const w = x > a ? Math.exp(-a * x + (a * a) / 2) : 0;
      s += w;
      s2 += w * w;
    }
    const pm = hits / N;
    const im = s / N;
    const iv = s2 / N - im * im;
    return { plain: pm, plainSe: Math.sqrt((pm * (1 - pm)) / N), is: im, isSe: Math.sqrt(Math.max(0, iv) / N) };
  }, [a, N, seed]);
  const relErr = (v: number) => (truth > 0 ? Math.abs(v - truth) / truth : 0);
  return (
    <div className="split">
      <div>
        <p>
          Estimate a tail probability <Tex>{"p = P(Z > a)"}</Tex>. Plain MC has relative error <Tex>{"\\sqrt{(1-p)/(Np)}"}</Tex>, so you need about <Tex>{"100/p"}</Tex> samples for 10% accuracy. At <Tex>a = 6</Tex> that's 10¹¹ samples.
        </p>
        <p>
          Importance sampling draws from <Tex>{"q = \\mathcal N(a,1)"}</Tex> instead, so half the samples land in the tail, and reweights:
        </p>
        <Tex block>{"\\hat p_{IS} = \\frac1N\\sum_{i} \\mathbb 1[X_i>a]\\,\\frac{\\varphi(X_i)}{\\varphi(X_i-a)} = \\frac1N\\sum_i \\mathbb 1[X_i>a]\\,e^{-aX_i + a^2/2}"}</Tex>
        <Slider label="Threshold a" value={a} min={0.5} max={7} step={0.25} onChange={setA} format={(v) => `${v}σ`} />
        <Slider label="Samples N" value={logN} min={2} max={6} step={0.25} onChange={setLogN} format={() => N.toLocaleString()} />
        <button className="btn" onClick={() => setSeed(randomSeed())}>
          Resample
        </button>
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <Stat label="True p" value={truth.toExponential(3)} />
        <div className="stats">
          <Stat label="Plain MC" value={est.plain === 0 ? "0 (no hits!)" : est.plain.toExponential(3)} sub={`rel. error ${(100 * relErr(est.plain)).toFixed(1)}%`} className={relErr(est.plain) > 0.2 ? "bad" : ""} />
          <Stat label="Importance" value={est.is.toExponential(3)} sub={`rel. error ${(100 * relErr(est.is)).toFixed(1)}%`} className={relErr(est.is) < 0.05 ? "good" : ""} />
        </div>
        <div className="stats">
          <Stat label="Plain: N for 10%" value={(100 * (1 - truth) / truth).toExponential(1)} />
          <Stat label="IS variance gain" value={est.isSe > 0 ? `${((est.plainSe || Math.sqrt(truth / N)) ** 2 / est.isSe ** 2).toExponential(1)}×` : "—"} />
        </div>
        <p className="dim" style={{ fontSize: "0.92rem" }}>
          This is how banks estimate 1-in-10,000-year losses, how chip designers estimate SRAM failure rates of 10⁻⁹, and how particle physicists simulate rare decays. A bad proposal, though, can make the variance <i>infinite</i> — try imagining <Tex>q</Tex> with lighter tails than <Tex>{"\\varphi"}</Tex>.
        </p>
      </div>
    </div>
  );
}

// ─── 4. Quasi-Monte Carlo ─────────────────────────────────────────────

type PtGen = (i: number, rng: () => number) => [number, number];
const GENS: { id: string; label: string; gen: PtGen; color: string }[] = [
  { id: "pseudo", label: "Pseudo-random", gen: (_i, rng) => [rng(), rng()], color: "--s2" },
  { id: "halton", label: "Halton (2, 3)", gen: (i) => [halton(i + 1, 2), halton(i + 1, 3)], color: "--s5" },
  { id: "sobol", label: "Sobol", gen: (i) => sobol2(i + 1), color: "--s3" },
];

function PointSet({ gen, n, color, seed }: { gen: PtGen; n: number; color: string; seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [wrap, w] = useWidth<HTMLDivElement>();
  const theme = useThemeKey();
  const size = Math.min(260, w);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || size < 50) return;
    const ctx = setupCanvas(cv, size, size);
    ctx.fillStyle = cssVar("--bg");
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = cssVar("--line");
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    const rng = mulberry32(seed);
    const d = n > 2000 ? 1.4 : n > 400 ? 2.2 : 3.4;
    ctx.fillStyle = cssVar(color);
    for (let i = 0; i < n; i++) {
      const [x, y] = gen(i, rng);
      ctx.fillRect(x * size - d / 2, (1 - y) * size - d / 2, d, d);
    }
  }, [gen, n, color, size, seed, theme]);
  return (
    <div ref={wrap}>
      <canvas ref={ref} style={{ width: size, display: "block", margin: "0 auto", borderRadius: 4 }} />
    </div>
  );
}

function QuasiMC() {
  const [logN, setLogN] = useState(2.5);
  const [seed, setSeed] = useState(randomSeed);
  const n = Math.round(10 ** logN);
  const conv = useMemo(() => {
    const out: Record<string, [number, number][]> = {};
    for (const g of GENS) {
      const rng = mulberry32(seed);
      let hits = 0;
      const series: [number, number][] = [];
      let next = 16;
      for (let i = 0; i < 65536; i++) {
        const [x, y] = g.gen(i, rng);
        if (x * x + y * y <= 1) hits++;
        if (i + 1 === next) {
          series.push([i + 1, Math.max(1e-6, Math.abs((4 * hits) / (i + 1) - Math.PI))]);
          next *= 2;
        }
      }
      out[g.id] = series;
    }
    return out;
  }, [seed]);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="split-3">
        {GENS.map((g) => (
          <div key={g.id}>
            <div className="chart-title" style={{ textAlign: "center" }}>
              <b style={{ color: `var(${g.color})` }}>{g.label}</b>
            </div>
            <PointSet gen={g.gen} n={n} color={g.color} seed={seed} />
          </div>
        ))}
      </div>
      <div className="controls">
        <Slider label="Points" value={logN} min={1} max={4} step={0.05} onChange={setLogN} format={() => n.toLocaleString()} />
        <button className="btn" onClick={() => setSeed(randomSeed())}>
          New pseudo-random seed
        </button>
      </div>
      <div className="split">
        <LineChart
          height={240}
          xLog
          yLog
          xDomain={[16, 65536]}
          yDomain={[1e-6, 1]}
          xLabel="N"
          yLabel="|π̂ − π|"
          title="Error estimating π (quarter circle)"
          series={[
            ...GENS.map((g) => ({ data: conv[g.id], color: `var(${g.color})`, width: 2, dots: true })),
            { data: [16, 65536].map((x) => [x, 1.6 / Math.sqrt(x)] as [number, number]), color: "var(--ink-faint)", dash: "6 5", width: 1.2 },
            { data: [16, 65536].map((x) => [x, 3 / x] as [number, number]), color: "var(--ink-faint)", dash: "2 4", width: 1.2 },
          ]}
          legend={[...GENS.map((g) => ({ label: g.label, color: `var(${g.color})` })), { label: "N^-½ and N^-1", color: "var(--ink-faint)" }]}
        />
        <div>
          <p>
            Low-discrepancy sequences fill space <i>deliberately</i> evenly. The Koksma–Hlawka inequality bounds the error by variation × discrepancy:
          </p>
          <Tex block>{"\\left|\\frac1N\\sum f(x_i) - \\int f\\right| \\le V_{HK}(f)\\, D^*_N, \\qquad D^*_N = O\\!\\left(\\frac{(\\log N)^d}{N}\\right)"}</Tex>
          <p className="dim">
            Nearly <Tex>{"N^{-1}"}</Tex> instead of <Tex>{"N^{-1/2}"}</Tex>. The catch: no free error bar (the points aren't random), so in practice one uses randomised QMC (random shifts / scrambling) and repeats. The hit-or-miss indicator is discontinuous, so here QMC's edge is smaller than for smooth integrands — but still visible.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── 5. Code lab ──────────────────────────────────────────────────────

const STARTER = `// Implement plain Monte Carlo integration on [0, 1].
// Return the estimate AND its standard error (σ̂ / √n).
function mcIntegrate(f, n) {
  let sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    const y = f(Math.random());
    // TODO: accumulate
  }
  const mean = 0;   // TODO
  const variance = 0; // TODO: sample variance of f(U)
  return { estimate: mean, stderr: Math.sqrt(variance / n) };
}

// Now beat it: antithetic variates. Pair U with 1 − U.
function antithetic(f, n) {
  // TODO: return { estimate, stderr } using n/2 pairs
  return mcIntegrate(f, n);
}
`;

const SOLUTION = `function mcIntegrate(f, n) {
  let sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    const y = f(Math.random());
    sum += y; sumSq += y * y;
  }
  const mean = sum / n;
  const variance = (sumSq - n * mean * mean) / (n - 1);
  return { estimate: mean, stderr: Math.sqrt(variance / n) };
}

function antithetic(f, n) {
  const m = Math.floor(n / 2);
  return mcIntegrate((u) => (f(u) + f(1 - u)) / 2, m);
}
`;

function Lab() {
  return (
    <CodeLab
      id="mc-integrate"
      starter={STARTER}
      solution={SOLUTION}
      tests={[
        { name: "∫ x² dx ≈ 1/3 (n = 100k)", expr: "Math.abs(mcIntegrate(x => x*x, 1e5).estimate - 1/3) < 0.01" },
        { name: "∫ eˣ dx ≈ e − 1", expr: "Math.abs(mcIntegrate(Math.exp, 1e5).estimate - (Math.E - 1)) < 0.01" },
        { name: "stderr matches σ/√n for x² (σ² = 4/45)", expr: "Math.abs(mcIntegrate(x => x*x, 1e5).stderr / Math.sqrt(4/45/1e5) - 1) < 0.1" },
        { name: "antithetic is accurate", expr: "Math.abs(antithetic(Math.exp, 1e5).estimate - (Math.E - 1)) < 0.005" },
        { name: "antithetic has ≥ 10× smaller variance for eˣ", expr: "(mcIntegrate(Math.exp, 1e5).stderr / antithetic(Math.exp, 1e5).stderr) ** 2 > 10" },
      ]}
      demo={`for (const n of [100, 1000, 10000, 100000]) { const r = mcIntegrate(Math.exp, n), a = antithetic(Math.exp, n); console.log("n=" + n, "plain", r.estimate.toFixed(5), "±", r.stderr.toFixed(5), "| antithetic", a.estimate.toFixed(5), "±", a.stderr.toFixed(5)); }`}
    />
  );
}

const track: Track = {
  title: "Monte Carlo, rigorously",
  tagline: "Unbiased estimators, the CLT, the N^−½ wall — and the bag of tricks (stratification, control variates, importance sampling, low-discrepancy sequences) for climbing over it.",
  history: [
    { when: "1949", what: "Metropolis & Ulam, “The Monte Carlo Method”, JASA 44:335 — the name enters print." },
    { when: "1951", what: "Kahn & Harris develop importance sampling and splitting for neutron shielding." },
    { when: "1967", what: "Sobol's LPτ sequences; Halton (1960) and Hammersley before him seed quasi-Monte Carlo." },
    { when: "1990s", what: "Owen's scrambled nets give QMC randomised error bars; QMC enters finance (Paskov & Traub, 1995)." },
  ],
  chapters: [
    {
      id: "estimator",
      title: "The estimator and the curse it dodges",
      emoji: "∑",
      intro: <p>The whole method in three lines, and an experiment in up to 20 dimensions showing both its superpower and its Achilles' heel.</p>,
      Widget: Estimator,
      quiz: [
        {
          q: "Plain MC's RMSE is σ/√N. Which quantity carries the dependence on dimension?",
          options: ["N", "σ²", "The exponent ½", "Nothing — MC is fully dimension-free"],
          answer: 1,
          explain: "The rate N^−½ is dimension-free; the constant σ² (variance of f(X)) is where high-dimensional difficulty shows up — e.g. the d-ball hit rate collapsing.",
        },
      ],
    },
    {
      id: "variance",
      title: "Variance reduction showdown",
      emoji: "🏁",
      intro: <p>Six estimators, same budget, four integrands. Each point is the RMSE over 60 independent runs; slopes tell you the convergence order, offsets tell you the variance constant.</p>,
      Widget: VarianceRace,
      quiz: [
        {
          q: "With importance density p, the IS estimator has zero variance when…",
          options: ["p is uniform", "p ∝ |f|", "p ∝ f²", "p has heavier tails than f"],
          answer: 1,
          explain: "For f ≥ 0, p* = f/∫f makes f(X)/p(X) constant. It requires knowing ∫f — the answer — but approximating p* is the whole art.",
        },
      ],
    },
    {
      id: "rare",
      title: "Rare events & importance sampling",
      emoji: "🦢",
      intro: <p>When the event you care about almost never happens, plain MC almost never sees it. Change the measure and reweight.</p>,
      Widget: RareEvents,
    },
    {
      id: "qmc",
      title: "Quasi-Monte Carlo: less random, more accurate",
      emoji: "⠿",
      intro: <p>Pseudo-random points clump and leave holes. Halton and Sobol sequences are engineered to avoid both.</p>,
      Widget: QuasiMC,
    },
    {
      id: "lab",
      title: "Code lab: build an estimator",
      emoji: "💻",
      intro: <p>Implement plain MC with an honest standard error, then antithetic variates. Runs in a sandboxed Web Worker with a 4-second kill switch.</p>,
      Widget: Lab,
    },
  ],
};

export default track;
