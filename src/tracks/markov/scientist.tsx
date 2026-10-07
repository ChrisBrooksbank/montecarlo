import { useMemo } from "react";
import { create } from "zustand";
import { ChartFrame, LineChart } from "../../components/charts";
import { CodeLab } from "../../components/CodeLab";
import { MatrixEditor } from "../../components/MatrixEditor";
import { StateDiagram } from "../../components/StateDiagram";
import { Tex } from "../../components/Tex";
import { Seg, Stat } from "../../components/ui";
import {
  absorbingStates, eigenvalues, isIrreducible, mixingTime, normalizeRows, period, spectralGap, stationary, tvCurve, validateStochastic, type Matrix,
} from "../../lib/markov";
import { MetropolisSampler } from "../../sims/Metropolis";
import { WEATHER_P } from "../../sims/weather";
import type { Track } from "../../types";

const cycle = (n: number): Matrix => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (j === (i + 1) % n ? 1 : 0)));
const lazy = (m: Matrix): Matrix => m.map((r, i) => r.map((v, j) => 0.5 * v + (i === j ? 0.5 : 0)));
const ehrenfest = (n: number): Matrix => Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (j === i - 1 ? i / n : j === i + 1 ? 1 - i / n : 0)));
const bottleneck = (eps: number): Matrix =>
  normalizeRows(
    Array.from({ length: 6 }, (_, i) =>
      Array.from({ length: 6 }, (_, j) => {
        const same = i < 3 === j < 3;
        return same ? 1 : (i === 2 && j === 3) || (i === 3 && j === 2) ? eps * 3 : 0;
      }),
    ),
  );

const PRESETS: Record<string, Matrix> = {
  Weather: WEATHER_P,
  "4-cycle (periodic)": cycle(4),
  "Lazy 4-cycle": lazy(cycle(4)),
  "Ehrenfest urn": ehrenfest(5),
  "Lazy Ehrenfest": lazy(ehrenfest(5)),
  Bottleneck: bottleneck(0.02),
  "Gambler's ruin": [
    [1, 0, 0, 0, 0],
    [0.5, 0, 0.5, 0, 0],
    [0, 0.5, 0, 0.5, 0],
    [0, 0, 0.5, 0, 0.5],
    [0, 0, 0, 0, 1],
  ],
};

const useLab = create<{ P: Matrix; preset: string; set: (P: Matrix, preset?: string) => void }>((set) => ({
  P: PRESETS.Bottleneck,
  preset: "Bottleneck",
  set: (P, preset = "") => set({ P, preset }),
}));

const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--ink-dim)", "var(--mc)"];

function resize(m: Matrix, n: number): Matrix {
  return normalizeRows(Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => m[i]?.[j] ?? (i === j ? 1 : 0))));
}

function analyse(P: Matrix) {
  const errs = validateStochastic(P);
  if (errs.length) return { ok: false, errs } as const;
  const irr = isIrreducible(P);
  const per = irr ? period(P) : null;
  const pi = stationary(P);
  const ev = eigenvalues(P);
  const gap = spectralGap(P);
  const absorbing = absorbingStates(P);
  let maxImbalance = 0;
  for (let i = 0; i < P.length; i++) for (let j = 0; j < P.length; j++) maxImbalance = Math.max(maxImbalance, Math.abs(pi[i] * P[i][j] - pi[j] * P[j][i]));
  const tmix = irr && per === 1 ? mixingTime(P, 0.25, 2000) : null;
  return { ok: true, errs, irr, per, pi, ev, gap, absorbing, reversible: maxImbalance < 1e-9, tmix } as const;
}

// ─── 1. Matrix lab ────────────────────────────────────────────────────

function EigenPlot({ ev }: { ev: { re: number; im: number }[] }) {
  return (
    <ChartFrame height={240} xDomain={[-1.15, 1.15]} yDomain={[-1.15, 1.15]} title="Eigenvalues in ℂ (unit circle dashed)">
      {(sx, sy) => (
        <>
          <ellipse cx={sx(0)} cy={sy(0)} rx={sx(1) - sx(0)} ry={sy(0) - sy(1)} fill="none" stroke="var(--ink-faint)" strokeDasharray="4 4" />
          <line x1={sx(-1.15)} x2={sx(1.15)} y1={sy(0)} y2={sy(0)} stroke="var(--line)" />
          <line x1={sx(0)} x2={sx(0)} y1={sy(-1.15)} y2={sy(1.15)} stroke="var(--line)" />
          {ev.map((z, i) => (
            <circle key={i} cx={sx(z.re)} cy={sy(z.im)} r={i === 0 ? 7 : 5.5} fill={i === 0 ? "var(--s3)" : i === 1 ? "var(--s1)" : "var(--s2)"} opacity={0.85} stroke="var(--bg)" strokeWidth={1.5} />
          ))}
        </>
      )}
    </ChartFrame>
  );
}

function MatrixLab() {
  const { P, preset, set } = useLab();
  const n = P.length;
  const a = useMemo(() => analyse(P), [P]);
  const labels = Array.from({ length: n }, (_, i) => String(i));
  const states = labels.map((l, i) => ({ label: l, color: COLORS[i % COLORS.length] }));
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="controls">
        <Seg options={Object.keys(PRESETS).map((k) => ({ value: k, label: k }))} value={preset} onChange={(k) => set(PRESETS[k], k)} />
        <div>
          <div className="slider-top" style={{ marginBottom: 4 }}>
            States
          </div>
          <Seg options={[2, 3, 4, 5, 6, 7].map((k) => ({ value: k, label: String(k) }))} value={n} onChange={(k) => set(resize(P, k))} />
        </div>
      </div>
      <div className="split">
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <MatrixEditor matrix={P} labels={labels} colors={states.map((s) => s.color)} onChange={(m) => set(m)} />
          <StateDiagram states={states} matrix={P} dist={a.ok ? a.pi : undefined} height={280} />
        </div>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          {!a.ok ? (
            <div className="callout bad">
              <b>Not row-stochastic.</b>
              {a.errs.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          ) : (
            <>
              <div className="stats">
                <Stat label="Irreducible" value={a.irr ? "yes" : "no"} className={a.irr ? "good" : "bad"} />
                <Stat label="Period" value={a.per ?? "—"} className={a.per === 1 ? "good" : a.per ? "bad" : ""} />
                <Stat label="Reversible" value={a.reversible ? "yes" : "no"} sub="detailed balance" />
              </div>
              <div className="stats">
                <Stat label="|λ₂|" value={(1 - a.gap).toFixed(4)} />
                <Stat label="Spectral gap" value={a.gap.toFixed(4)} />
                <Stat label="t_mix(¼)" value={a.tmix ?? "∞ / n.a."} />
              </div>
              <div className="panel mono" style={{ fontSize: "0.85rem" }}>
                π = [{a.pi.map((p) => p.toFixed(4)).join(", ")}]
                {a.absorbing.length > 0 && <div className="faint">absorbing: {a.absorbing.join(", ")} (π not unique — shown: Cesàro limit from uniform start)</div>}
              </div>
              <EigenPlot ev={a.ev} />
            </>
          )}
        </div>
      </div>
      <div className="callout" style={{ fontSize: "0.92rem" }}>
        <b>Perron–Frobenius:</b> a stochastic matrix always has eigenvalue 1 (yellow) and all others in the unit disc. Irreducible ⇒ π unique and positive. Irreducible + aperiodic ⇒ <Tex>{"\\mu_0 P^t \\to \\pi"}</Tex> for every start. A period-<Tex>d</Tex> chain has eigenvalues at the <Tex>d</Tex>-th roots of unity — try the 4-cycle, then make it lazy (<Tex>{"\\tfrac12(I+P)"}</Tex>) and watch them shrink inside.
      </div>
    </div>
  );
}

// ─── 2. Mixing ────────────────────────────────────────────────────────

function Mixing() {
  const P = useLab((s) => s.P);
  const a = useMemo(() => analyse(P), [P]);
  const T = 80;
  const curve = useMemo(() => (a.ok ? tvCurve(P, T) : []), [P, a.ok]);
  if (!a.ok) return <div className="lazy-placeholder">Fix the matrix in the lab above.</div>;
  const lam = 1 - a.gap;
  const data = curve.map((d, t) => [t, Math.max(1e-12, d)] as [number, number]);
  const c = curve[1] ? curve[1] / Math.max(lam, 1e-12) : 1;
  return (
    <div className="split-wide">
      <LineChart
        height={300}
        yLog
        xDomain={[0, T]}
        yDomain={[1e-10, 1.2]}
        xLabel="t (steps)"
        yLabel="max₍ₓ₎ ‖Pᵗ(x,·) − π‖_TV"
        series={[
          { data, color: "var(--accent)", width: 2.5 },
          ...(lam > 0 && lam < 1 ? [{ data: data.map(([t]) => [t, Math.min(1.2, c * lam ** t)] as [number, number]), color: "var(--ink-faint)", dash: "5 5", width: 1.5 }] : []),
        ]}
        hLines={[{ value: 0.25, label: "¼", color: "var(--s1)" }]}
        legend={[
          { label: "worst-case TV distance", color: "var(--accent)" },
          { label: "C·|λ₂|ᵗ", color: "var(--ink-faint)" },
        ]}
      />
      <div>
        <p>
          For a reversible, ergodic chain the distance to equilibrium decays geometrically at the rate of the second-largest eigenvalue modulus:
        </p>
        <Tex block>{"\\max_x \\|P^t(x,\\cdot) - \\pi\\|_{TV} \\le \\frac{1}{2\\sqrt{\\pi_{\\min}}}\\,|\\lambda_2|^t"}</Tex>
        <p>
          so <Tex>{"t_{\\text{mix}} \\approx \\frac{1}{1-|\\lambda_2|}\\log\\frac{1}{\\pi_{\\min}}"}</Tex>: the <b>relaxation time</b> is the inverse spectral gap.
        </p>
        <p className="dim">
          Load <b>Bottleneck</b> in the lab: two well-mixed clusters joined by a thin bridge. <Tex>{"|\\lambda_2|"}</Tex> creeps toward 1 and mixing slows to a crawl — the same pathology that makes MCMC get stuck between modes (next chapter). Cheeger's inequality makes it precise: <Tex>{"\\Phi^2/2 \\le 1-\\lambda_2 \\le 2\\Phi"}</Tex> with <Tex>\Phi</Tex> the conductance of the worst cut.
        </p>
      </div>
    </div>
  );
}

// ─── 4. Code lab ──────────────────────────────────────────────────────

const STARTER = `// P is an array of rows; each row sums to 1.
// 1) Return the stationary distribution π (πP = π, Σπ = 1).
//    Power iteration is fine — but beware periodic chains!
function stationary(P) {
  const n = P.length;
  let v = new Array(n).fill(1 / n);
  // TODO
  return v;
}

// 2) Is the chain reversible? (detailed balance: π_i P_ij = π_j P_ji)
function isReversible(P, tol = 1e-8) {
  // TODO
  return false;
}
`;

const SOLUTION = `function stationary(P) {
  const n = P.length;
  // Iterate the lazy chain ½(I + P): same π, but aperiodic, so it converges.
  let v = new Array(n).fill(1 / n);
  for (let t = 0; t < 20000; t++) {
    const w = new Array(n).fill(0);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) w[j] += v[i] * (0.5 * P[i][j] + (i === j ? 0.5 : 0));
    const diff = w.reduce((s, x, i) => s + Math.abs(x - v[i]), 0);
    v = w;
    if (diff < 1e-14) break;
  }
  return v;
}

function isReversible(P, tol = 1e-8) {
  const pi = stationary(P);
  for (let i = 0; i < P.length; i++)
    for (let j = 0; j < P.length; j++)
      if (Math.abs(pi[i] * P[i][j] - pi[j] * P[j][i]) > tol) return false;
  return true;
}
`;

function Lab() {
  const near = (a: string, b: string) => `${a}.every((x, i) => Math.abs(x - ${b}[i]) < 1e-6)`;
  return (
    <CodeLab
      id="markov-stationary"
      starter={STARTER}
      solution={SOLUTION}
      tests={[
        { name: "weather chain: π = (6/13, 4/13, 3/13)", expr: near("stationary([[0.7,0.2,0.1],[0.3,0.4,0.3],[0.2,0.4,0.4]])", "[6/13, 4/13, 3/13]") },
        { name: "periodic 2-cycle: π = (½, ½)", expr: near("stationary([[0,1],[1,0]])", "[0.5, 0.5]") },
        { name: "Ehrenfest urn (n=3): binomial π", expr: near("stationary([[0,1,0,0],[1/3,0,2/3,0],[0,2/3,0,1/3],[0,0,1,0]])", "[1/8,3/8,3/8,1/8]") },
        { name: "birth–death chains are reversible", expr: "isReversible([[0.5,0.5,0],[0.25,0.5,0.25],[0,0.5,0.5]]) === true" },
        { name: "a biased 3-cycle is not", expr: "isReversible([[0,0.9,0.1],[0.1,0,0.9],[0.9,0.1,0]]) === false" },
      ]}
    />
  );
}

const track: Track = {
  title: "Markov chains: spectra, mixing, MCMC",
  tagline: "From Perron–Frobenius to spectral gaps to Metropolis–Hastings: why chains converge, how fast, and how to build one that samples any distribution you like.",
  history: [
    { when: "1906–13", what: "A. A. Markov: law of large numbers for dependent variables; analysis of vowel/consonant chains in Eugene Onegin." },
    { when: "1907–12", what: "Perron and Frobenius: spectral theory of positive and non-negative matrices." },
    { when: "1953", what: "Metropolis, A. & M. Rosenbluth, A. & E. Teller: the Metropolis algorithm, run on MANIAC." },
    { when: "1970 / 1990", what: "Hastings generalises to asymmetric proposals; Gelfand & Smith ignite the MCMC revolution in Bayesian statistics." },
  ],
  chapters: [
    {
      id: "lab",
      title: "The N×N matrix lab",
      emoji: "🧮",
      intro: <p>Edit any transition matrix up to 7×7 and get its full classification: communicating structure, period, stationary distribution, reversibility, spectrum and mixing time — all live.</p>,
      Widget: MatrixLab,
      quiz: [
        {
          q: "The 4-cycle has eigenvalues 1, i, −1, −i. Why doesn't μ₀Pᵗ converge?",
          options: ["It isn't irreducible", "Its period is 4, so eigenvalues other than 1 have modulus 1", "Its stationary distribution doesn't exist", "Rows don't sum to 1"],
          answer: 1,
          explain: "π = uniform exists and is unique, but |λ| = 1 for the non-unit eigenvalues, so those components never decay — the distribution rotates forever.",
        },
      ],
    },
    {
      id: "mixing",
      title: "Mixing time and the spectral gap",
      emoji: "⏱️",
      intro: <p>How fast does the chain forget its start? Uses the matrix from the lab above, so try different presets.</p>,
      Widget: Mixing,
    },
    {
      id: "mcmc",
      title: "Metropolis–Hastings: chains that sample",
      emoji: "🎲",
      intro: (
        <p>
          Flip the question: instead of finding π for a given P, <b>design</b> a P whose stationary distribution is a target <Tex>p</Tex>. The Metropolis acceptance rule enforces detailed balance <Tex>{"p(x)P(x,y) = p(y)P(y,x)"}</Tex>, so <Tex>p</Tex> is stationary — and only ratios <Tex>{"p(y)/p(x)"}</Tex> are needed, so normalising constants cancel.
        </p>
      ),
      Widget: MetropolisSampler,
      takeaway: (
        <>
          <b>Markov chain + Monte Carlo = MCMC.</b> Bayesian statistics, statistical physics and much of probabilistic ML run on this two-line algorithm.
        </>
      ),
      quiz: [
        {
          q: "Why does Metropolis only need the target density up to a normalising constant?",
          options: ["It doesn't — it needs the exact density", "The acceptance probability uses the ratio p(x′)/p(x)", "Because the proposal is Gaussian", "Because the chain is periodic"],
          answer: 1,
          explain: "Any constant cancels in the ratio — which is exactly why it works for posteriors p(θ|data) ∝ p(data|θ)p(θ) whose evidence term is intractable.",
        },
      ],
    },
    {
      id: "code",
      title: "Code lab: stationary distributions",
      emoji: "💻",
      intro: <p>Implement π and a detailed-balance check. One test is a periodic chain — naive power iteration oscillates forever on it.</p>,
      Widget: Lab,
    },
  ],
};

export default track;
