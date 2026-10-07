import { useMemo, useRef, useState } from "react";
import { Histogram, LineChart } from "../components/charts";
import { Seg, Slider, Stat } from "../components/ui";
import { useAnimationFrame } from "../hooks";
import { histogram } from "../lib/montecarlo";
import { gaussian, mulberry32, randomSeed } from "../lib/random";

interface Target {
  id: string;
  label: string;
  comps: { w: number; mu: number; s: number }[];
}

const TARGETS: Target[] = [
  { id: "bimodal", label: "Two peaks", comps: [{ w: 0.35, mu: -3, s: 0.8 }, { w: 0.65, mu: 2.5, s: 1.1 }] },
  { id: "far", label: "Far-apart peaks", comps: [{ w: 0.5, mu: -5, s: 0.6 }, { w: 0.5, mu: 5, s: 0.6 }] },
  { id: "skinny", label: "Skinny + wide", comps: [{ w: 0.3, mu: 0, s: 0.25 }, { w: 0.7, mu: 1, s: 2.5 }] },
];

const LO = -9;
const HI = 9;

function density(t: Target, x: number): number {
  return t.comps.reduce((s, c) => s + (c.w / (c.s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - c.mu) / c.s) ** 2), 0);
}

/** Effective sample size via the initial positive sequence of autocorrelations. */
function ess(xs: number[]): number {
  const n = xs.length;
  if (n < 20) return n;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  if (v === 0) return 1;
  let sum = 0;
  for (let lag = 1; lag < Math.min(1000, n / 2); lag++) {
    let c = 0;
    for (let i = 0; i + lag < n; i++) c += (xs[i] - mean) * (xs[i + lag] - mean);
    const rho = c / ((n - lag) * v);
    if (rho < 0.05) break;
    sum += rho;
  }
  return n / (1 + 2 * sum);
}

export function MetropolisSampler({ compact }: { compact?: boolean }) {
  const [tid, setTid] = useState("bimodal");
  const [sigma, setSigma] = useState(1.5);
  const [speed, setSpeed] = useState(20);
  const [running, setRunning] = useState(true);
  const t = TARGETS.find((x) => x.id === tid)!;
  const state = useRef({ x: 0, samples: [] as number[], accepted: 0, proposed: 0, rng: mulberry32(randomSeed()), lastProposal: 0, lastAccepted: true });
  const [, setVersion] = useState(0);
  const reset = () => {
    state.current = { x: 0, samples: [], accepted: 0, proposed: 0, rng: mulberry32(randomSeed()), lastProposal: 0, lastAccepted: true };
    setVersion((v) => v + 1);
  };

  useAnimationFrame(() => {
    const s = state.current;
    for (let i = 0; i < speed; i++) {
      const prop = s.x + sigma * gaussian(s.rng);
      const a = density(t, prop) / density(t, s.x);
      s.proposed++;
      s.lastProposal = prop;
      if (s.rng() < a) {
        s.x = prop;
        s.accepted++;
        s.lastAccepted = true;
      } else s.lastAccepted = false;
      s.samples.push(s.x);
    }
    if (s.samples.length > 60000) s.samples.splice(0, s.samples.length - 60000);
    setVersion((v) => v + 1);
  }, running);

  const s = state.current;
  const h = histogram(s.samples, 72, LO, HI);
  const curve = useMemo(() => Array.from({ length: 200 }, (_, i) => {
    const x = LO + ((HI - LO) * i) / 199;
    return [x, density(t, x)] as [number, number];
  }), [t]);
  const trace = s.samples.slice(-400).map((x, i) => [i, x] as [number, number]);
  const essVal = useMemo(() => ess(s.samples.slice(-4000)), [s.samples.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const acc = s.proposed ? s.accepted / s.proposed : 0;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="controls">
        <Seg options={TARGETS.map((x) => ({ value: x.id, label: x.label }))} value={tid} onChange={(v) => { setTid(v); reset(); }} />
        <Slider label="Proposal step size σ" value={sigma} min={0.05} max={12} step={0.05} onChange={setSigma} />
        {!compact && <Slider label="Steps per frame" value={speed} min={1} max={500} onChange={setSpeed} />}
        <div className="btn-row">
          <button className="btn" onClick={() => setRunning((r) => !r)}>
            {running ? "⏸" : "▶"}
          </button>
          <button className="btn ghost" onClick={reset}>
            ↺
          </button>
        </div>
      </div>
      <div className="split">
        <Histogram height={220} title="Samples (bars) vs target density (line)" counts={h.counts} lo={LO} hi={HI} normalize color="var(--s4)" overlay={[{ data: curve, color: "var(--s3)", width: 2.5 }]} formatY={() => ""} vLines={[{ value: s.x, color: "var(--s1)", dash: "0" }]} />
        <LineChart height={220} title="Trace: the chain's last 400 positions" xDomain={[0, 400]} yDomain={[LO, HI]} series={[{ data: trace, color: "var(--s2)", width: 1.3 }]} formatX={() => ""} />
      </div>
      <div className="stats">
        <Stat label="Steps" value={s.samples.length.toLocaleString()} />
        <Stat label="Acceptance rate" value={`${(acc * 100).toFixed(0)}%`} className={acc > 0.15 && acc < 0.6 ? "good" : "bad"} sub="sweet spot ≈ 25–50%" />
        <Stat label="Effective samples" value={Math.round(essVal).toLocaleString()} sub="per last 4,000 steps" />
      </div>
      <p className="dim" style={{ fontSize: "0.92rem" }}>
        <b>The rule:</b> propose a jump <i>x′ = x + σ·Z</i>. Accept with probability <i>min(1, p(x′)/p(x))</i>; otherwise stay put. That's a Markov chain whose stationary distribution is exactly <i>p</i> — and you only ever need <i>p</i> up to a constant. Tiny σ: almost every step accepted, but the chain crawls. Huge σ: proposals land in nowhere-land and get rejected. Try <b>Far-apart peaks</b> with small σ — the chain gets stuck in one peak for ages.
      </p>
    </div>
  );
}
