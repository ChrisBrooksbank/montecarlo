import { useEffect, useMemo, useState } from "react";
import { ChartFrame, Histogram, LineChart } from "../../components/charts";
import { AppCards, Seg, Slider, Stat } from "../../components/ui";
import { histogram, piConfidence, quantileSorted, simulatePortfolio } from "../../lib/montecarlo";
import { mulberry32, randomSeed } from "../../lib/random";
import { DartCanvas, DartEngine, useDartRunner } from "../../sims/darts";
import { useProgress } from "../../stores/progress";
import type { Track } from "../../types";

// ─── 1. Convergence with error bars ───────────────────────────────────

function Convergence() {
  const [engine, setEngine] = useState(() => new DartEngine("quarter"));
  const [ghosts, setGhosts] = useState<[number, number][][]>([]);
  const [running, setRunning] = useState(true);
  const [rate, setRate] = useState(800);
  const [version] = useDartRunner(engine, running, rate, 200_000);
  const ci = piConfidence(engine.hits, engine.total);
  const hist = engine.hist;
  const award = useProgress((s) => s.award);
  useEffect(() => {
    if (ghosts.length >= 4) award("multiverse", "🌌", "Multiverse explorer", "Ran 5 parallel universes of darts.");
  }, [ghosts.length, award]);

  const newRun = () => {
    if (hist.length > 2) setGhosts((g) => [...g.slice(-6), hist.map(([n, e]) => [n, e] as [number, number])]);
    setEngine(new DartEngine("quarter"));
    setRunning(true);
  };

  const N = Math.max(100, engine.total);
  return (
    <div className="split-wide">
      <div style={{ display: "grid", gap: 12 }}>
        <LineChart
          height={300}
          title="Estimate of π with its 95% confidence band"
          xLog
          xDomain={[10, Math.max(1000, N)]}
          yDomain={[2.6, 3.7]}
          xLabel="darts thrown (log scale)"
          series={[
            ...ghosts.map((g) => ({ data: g, color: "var(--ink-faint)", width: 1.2, opacity: 0.6 })),
            { data: hist.map(([n, e]) => [n, e] as [number, number]), color: "var(--s1)", width: 2.2 },
          ]}
          bands={hist.length > 1 ? [{ x: hist.map((h) => h[0]), lo: hist.map((h) => h[2]), hi: hist.map((h) => h[3]), color: "var(--s1)", opacity: 0.15 }] : []}
          hLines={[{ value: Math.PI, label: "π", color: "var(--s3)" }]}
        />
        <div className="stats">
          <Stat label="Estimate" value={engine.total ? ci.est.toFixed(5) : "—"} />
          <Stat label="± (95%)" value={engine.total ? (1.96 * ci.se).toFixed(5) : "—"} sub="the band's half-width" />
          <Stat label="Actual error" value={engine.total ? Math.abs(ci.est - Math.PI).toFixed(5) : "—"} />
          <Stat label="Darts" value={engine.total.toLocaleString()} />
        </div>
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <DartCanvas engine={engine} version={version} maxSize={330} />
        <div className="btn-row">
          <button className="btn primary" onClick={() => setRunning((r) => !r)}>
            {running ? "⏸ Pause" : "▶ Run"}
          </button>
          <button className="btn" onClick={newRun}>
            🌌 New universe
          </button>
        </div>
        <Slider label="Speed" value={Math.log10(rate)} min={1} max={4.7} step={0.1} onChange={(v) => setRate(Math.round(10 ** v))} format={() => `${rate.toLocaleString()}/s`} />
        <p className="dim" style={{ fontSize: "0.9rem" }}>
          Hit <b>New universe</b> a few times. Every run wanders differently at first, but they all get squeezed toward π — and the shaded band tells you, honestly, how far off you might still be.
        </p>
      </div>
    </div>
  );
}

// ─── 2. 100 confidence intervals ──────────────────────────────────────

function ConfidenceIntervals() {
  const [n, setN] = useState(500);
  const [level, setLevel] = useState(95);
  const [seed, setSeed] = useState(randomSeed);
  const z = { 80: 1.2816, 90: 1.6449, 95: 1.96, 99: 2.5758 }[level as 80 | 90 | 95 | 99];
  const intervals = useMemo(() => {
    const rng = mulberry32(seed);
    return Array.from({ length: 100 }, () => {
      let hits = 0;
      for (let i = 0; i < n; i++) {
        const x = rng();
        const y = rng();
        if (x * x + y * y <= 1) hits++;
      }
      return piConfidence(hits, n, z);
    });
  }, [n, seed, z]);
  const misses = intervals.filter((c) => c.lo > Math.PI || c.hi < Math.PI).length;
  const width = Math.max(0.15, ...intervals.map((c) => Math.max(Math.abs(c.lo - Math.PI), Math.abs(c.hi - Math.PI))));
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="controls">
        <Slider label="Darts per experiment" value={Math.log10(n)} min={1.5} max={4.5} step={0.05} onChange={(v) => setN(Math.round(10 ** v))} format={() => n.toLocaleString()} />
        <div>
          <div className="slider-top" style={{ marginBottom: 4 }}>
            Confidence level
          </div>
          <Seg options={[80, 90, 95, 99].map((v) => ({ value: v, label: `${v}%` }))} value={level} onChange={setLevel} />
        </div>
        <button className="btn primary" onClick={() => setSeed(randomSeed())}>
          🔁 Run 100 new experiments
        </button>
      </div>
      <ChartFrame height={360} xDomain={[Math.PI - width, Math.PI + width]} yDomain={[0, 101]} formatY={() => ""} title={`100 independent experiments, each with a ${level}% interval`} vLines={[{ value: Math.PI, color: "var(--s3)", label: "true π", dash: "0" }]}>
        {(sx, sy) =>
          intervals.map((c, i) => {
            const miss = c.lo > Math.PI || c.hi < Math.PI;
            return (
              <g key={i}>
                <line x1={sx(c.lo)} x2={sx(c.hi)} y1={sy(i + 1)} y2={sy(i + 1)} stroke={miss ? "var(--bad)" : "var(--s2)"} strokeWidth={miss ? 2.5 : 1.6} opacity={miss ? 1 : 0.7} />
                <circle cx={sx(c.est)} cy={sy(i + 1)} r={2} fill={miss ? "var(--bad)" : "var(--ink)"} />
              </g>
            );
          })
        }
      </ChartFrame>
      <div className="stats">
        <Stat label="Intervals that caught π" value={`${100 - misses}/100`} className={Math.abs(100 - misses - level) <= 4 ? "good" : ""} />
        <Stat label="Expected" value={`≈ ${level}`} />
        <Stat label="Interval width" value={`± ${(z * 4 * Math.sqrt((Math.PI / 4) * (1 - Math.PI / 4) / n)).toFixed(4)}`} />
      </div>
      <p className="dim">
        This is what “95% confident” <i>actually</i> means: if you repeated the whole experiment many times, about 95 out of 100 of your intervals would contain the truth. The red ones are honest bad luck — and you never know which one you got.
      </p>
    </div>
  );
}

// ─── 3. Portfolio ─────────────────────────────────────────────────────

const money = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}k`);

function Portfolio() {
  const [start, setStart] = useState(20000);
  const [monthly, setMonthly] = useState(500);
  const [years, setYears] = useState(25);
  const [ret, setRet] = useState(7);
  const [vol, setVol] = useState(15);
  const [goal, setGoal] = useState(500000);
  const [seed, setSeed] = useState(randomSeed);
  const res = useMemo(
    () => simulatePortfolio({ start, monthly, years, annualReturn: ret / 100, annualVol: vol / 100, paths: 1000 }, mulberry32(seed)),
    [start, monthly, years, ret, vol, seed],
  );
  const sorted = useMemo(() => Float64Array.from(res.finals).sort(), [res]);
  const pGoal = res.finals.filter((v) => v >= goal).length / res.finals.length;
  const x = res.bands.map((_, i) => i / 12);
  const top = quantileSorted(sorted, 0.97);
  const h = histogram(res.finals, 40, 0, top);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="controls">
        <Slider label="Starting pot" value={start} min={0} max={200000} step={5000} onChange={setStart} format={money} />
        <Slider label="Monthly saving" value={monthly} min={0} max={3000} step={50} onChange={setMonthly} format={(v) => `$${v}`} />
        <Slider label="Years" value={years} min={1} max={45} onChange={setYears} />
        <Slider label="Avg yearly return" value={ret} min={0} max={12} step={0.5} onChange={setRet} format={(v) => `${v}%`} />
        <Slider label="Volatility (wildness)" value={vol} min={0} max={40} onChange={setVol} format={(v) => `${v}%`} />
        <Slider label="Goal" value={goal} min={50000} max={3000000} step={50000} onChange={setGoal} format={money} />
      </div>
      <div className="split-wide">
        <LineChart
          height={300}
          title="1,000 possible futures (median, 50% and 90% ranges)"
          xLabel="years"
          formatY={(v) => money(v)}
          yDomain={[0, quantileSorted(sorted, 0.96) * 1.05]}
          bands={[
            { x, lo: res.bands.map((b) => b[0]), hi: res.bands.map((b) => b[4]), color: "var(--s2)", opacity: 0.15 },
            { x, lo: res.bands.map((b) => b[1]), hi: res.bands.map((b) => b[3]), color: "var(--s2)", opacity: 0.25 },
          ]}
          series={[
            ...res.samplePaths.slice(0, 25).map((p) => ({ data: p.map((v, i) => [i / 12, v] as [number, number]), color: "var(--s4)", width: 0.8, opacity: 0.35 })),
            { data: res.bands.map((b, i) => [i / 12, b[2]] as [number, number]), color: "var(--s3)", width: 2.5 },
            { data: x.map((t) => [t, start + monthly * t * 12] as [number, number]), color: "var(--ink-faint)", width: 1.5, dash: "4 4" },
          ]}
          hLines={[{ value: goal, label: "goal", color: "var(--s1)" }]}
          legend={[
            { label: "median future", color: "var(--s3)" },
            { label: "money you put in", color: "var(--ink-faint)" },
            { label: "individual futures", color: "var(--s4)" },
          ]}
        />
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <Histogram height={170} title="Where you end up" counts={h.counts} lo={h.lo} hi={h.hi} colorFor={(c) => (c >= goal ? "var(--s5)" : "var(--s2)")} formatX={money} formatY={() => ""} vLines={[{ value: Math.min(goal, top), color: "var(--s1)" }]} />
          <div className="stats">
            <Stat label="Chance of hitting goal" value={`${(pGoal * 100).toFixed(0)}%`} className={pGoal > 0.75 ? "good" : pGoal < 0.3 ? "bad" : ""} />
            <Stat label="Median outcome" value={money(quantileSorted(sorted, 0.5))} />
          </div>
          <div className="stats">
            <Stat label="Bad luck (5%)" value={money(quantileSorted(sorted, 0.05))} />
            <Stat label="Good luck (95%)" value={money(quantileSorted(sorted, 0.95))} />
          </div>
          <button className="btn" onClick={() => setSeed(randomSeed())}>
            🎲 Re-roll 1,000 futures
          </button>
        </div>
      </div>
      <p className="dim">
        Try cranking volatility up while keeping the same average return: the <b>median</b> outcome drops, even though the average yearly return didn't change. That's “volatility drag” — and a single-number forecast would never show it. This is why financial planners run Monte Carlo instead of a spreadsheet. <i>(Toy model — not financial advice!)</i>
      </p>
    </div>
  );
}

// ─── 4. Project deadline ──────────────────────────────────────────────

interface Task {
  name: string;
  min: number;
  likely: number;
  max: number;
}

function triangular(u: number, a: number, c: number, b: number): number {
  if (b <= a) return a;
  const f = (c - a) / (b - a);
  return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

function ProjectRisk() {
  const [tasks, setTasks] = useState<Task[]>([
    { name: "Design", min: 3, likely: 5, max: 10 },
    { name: "Build", min: 10, likely: 15, max: 30 },
    { name: "Test", min: 4, likely: 6, max: 15 },
    { name: "Launch prep", min: 2, likely: 3, max: 8 },
  ]);
  const [deadline, setDeadline] = useState(32);
  const naive = tasks.reduce((s, t) => s + t.likely, 0);
  const totals = useMemo(() => {
    const rng = mulberry32(12345);
    return Float64Array.from({ length: 10000 }, () => tasks.reduce((s, t) => s + triangular(rng(), t.min, Math.min(Math.max(t.likely, t.min), t.max), t.max), 0)).sort();
  }, [tasks]);
  const pOnTime = totals.filter((v) => v <= deadline).length / totals.length;
  const h = histogram(totals, 40);
  const pNaive = totals.filter((v) => v <= naive).length / totals.length;
  const update = (i: number, k: keyof Task, v: string) => setTasks((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: k === "name" ? v : Math.max(0, +v || 0) } : t)));
  return (
    <div className="split">
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Task</th>
              <th className="num">Best</th>
              <th className="num">Likely</th>
              <th className="num">Worst</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tasks.map((t, i) => (
              <tr key={i}>
                <td>
                  <input className="text-input" style={{ padding: "4px 8px" }} value={t.name} onChange={(e) => update(i, "name", e.target.value)} />
                </td>
                {(["min", "likely", "max"] as const).map((k) => (
                  <td key={k} className="num">
                    <input className="num-input" type="number" value={t[k]} onChange={(e) => update(i, k, e.target.value)} aria-label={`${t.name} ${k}`} />
                  </td>
                ))}
                <td>
                  <button className="btn small ghost" onClick={() => setTasks((ts) => ts.filter((_, j) => j !== i))} aria-label="remove task">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn small" style={{ marginTop: 8 }} onClick={() => setTasks((ts) => [...ts, { name: "New task", min: 2, likely: 4, max: 9 }])}>
          + Add task
        </button>
        <div style={{ marginTop: 14 }}>
          <Slider label="Deadline (days)" value={deadline} min={5} max={120} onChange={setDeadline} />
        </div>
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <Histogram height={200} title="10,000 simulated projects: total days" counts={h.counts} lo={h.lo} hi={h.hi} colorFor={(c) => (c <= deadline ? "var(--s5)" : "var(--s1)")} vLines={[{ value: deadline, label: "deadline", color: "var(--ink)" }, { value: naive, label: "plan", color: "var(--s3)" }]} formatY={() => ""} xLabel="days" />
        <div className="stats">
          <Stat label="P(on time)" value={`${(pOnTime * 100).toFixed(0)}%`} className={pOnTime > 0.8 ? "good" : pOnTime < 0.5 ? "bad" : ""} />
          <Stat label="'Likely' plan" value={`${naive} d`} sub={`only ${(pNaive * 100).toFixed(0)}% hit it!`} />
          <Stat label="80% safe" value={`${quantileSorted(totals, 0.8).toFixed(0)} d`} />
        </div>
        <p className="dim" style={{ fontSize: "0.92rem" }}>
          Adding up the “likely” durations gives a plan you'll usually <b>miss</b> — because things can go much worse than they can go better. Monte Carlo shows the whole range, so you can promise a date you'll actually hit.
        </p>
      </div>
    </div>
  );
}

function Applications() {
  return (
    <AppCards
      items={[
        { emoji: "🛡️", title: "Insurance", body: "Simulate millions of possible years of storms, crashes and claims to set premiums that won't bankrupt the insurer." },
        { emoji: "🗳️", title: "Election forecasts", body: "Forecasters simulate the election tens of thousands of times using polls + uncertainty, then report how often each candidate wins." },
        { emoji: "🎬", title: "Movies & games", body: "Path tracing fires random light rays per pixel — that grain in a fast render is Monte Carlo noise shrinking like 1/√N." },
        { emoji: "💊", title: "Drug trials", body: "Simulated trials pick sample sizes so a real effect is unlikely to be missed (statistical power)." },
        { emoji: "🌍", title: "Climate", body: "Ensembles of perturbed simulations turn one forecast into a range of plausible futures." },
        { emoji: "🚀", title: "Space missions", body: "Landing ellipses on Mars come from simulating thousands of entries with random winds, densities and sensor errors." },
      ]}
    />
  );
}

const track: Track = {
  title: "Simulate it a million times",
  tagline: "When a problem is too tangled to solve with a formula, you can still answer it: play out thousands of random versions and look at what happens.",
  history: [
    { when: "1930s", what: "Enrico Fermi secretly uses random sampling to predict neutron behaviour, stunning colleagues." },
    { when: "1946", what: "Ulam & von Neumann formalise the idea for nuclear physics at Los Alamos. Metropolis names it after the casino." },
    { when: "1955", what: "RAND publishes A Million Random Digits — a 600-page bestseller of pure noise, still in print." },
    { when: "1990s→", what: "Monte Carlo becomes standard in finance (VaR), engineering and movies." },
  ],
  chapters: [
    {
      id: "converge",
      title: "Watch the answer sharpen",
      emoji: "📉",
      intro: (
        <p>
          Random darts in a quarter circle estimate π. But how much should you <b>trust</b> an estimate? The shaded band is a 95% confidence interval: the honest “give or take”. Watch it shrink — and notice how slowly.
        </p>
      ),
      Widget: Convergence,
      takeaway: (
        <>
          <b>The 1/√N law:</b> the error band halves only when you <b>quadruple</b> the darts. That one fact drives the cost of every simulation on Earth.
        </>
      ),
      quiz: [
        {
          q: "You have an estimate with ±0.02 error after 10,000 samples. Roughly how many samples to get ±0.01?",
          options: ["20,000", "40,000", "100,000", "1,000,000"],
          answer: 1,
          explain: "Error ∝ 1/√N, so halving the error needs 4× the samples: 40,000.",
        },
      ],
    },
    {
      id: "confidence",
      title: "What “95% confident” really means",
      emoji: "📏",
      intro: <p>Statistics' most misunderstood phrase, made visible. Each line is a separate experiment with its own confidence interval.</p>,
      Widget: ConfidenceIntervals,
      quiz: [
        {
          q: "A 95% confidence interval means…",
          options: [
            "There's a 95% chance π is in this particular interval",
            "95% of experiments done this way produce an interval containing the truth",
            "The estimate is 95% accurate",
            "5% of the darts were wasted",
          ],
          answer: 1,
          explain: "The 95% is a property of the method, not one interval. Any particular interval either contains π or doesn't.",
        },
      ],
    },
    {
      id: "portfolio",
      title: "Your savings, 1,000 times",
      emoji: "💰",
      intro: <p>Spreadsheets give one answer: “7% a year forever”. Real markets wobble. Simulate a thousand possible futures and see the full range of where your savings might end up.</p>,
      Widget: Portfolio,
      quiz: [
        {
          q: "Two portfolios have the same average yearly return, but one is far more volatile. Typically, the volatile one has…",
          options: ["The same median outcome", "A lower median outcome", "A higher median outcome", "A guaranteed loss"],
          answer: 1,
          explain: "Losses hurt more than equal gains help (−50% then +50% leaves you at 75%). Volatility drags the median down — something only shows up when you simulate.",
        },
      ],
    },
    {
      id: "project",
      title: "Will the project be late?",
      emoji: "📅",
      intro: <p>Give each task a best case, likely case and worst case. Monte Carlo runs the project 10,000 times and tells you the chance you'll make the deadline.</p>,
      Widget: ProjectRisk,
    },
    {
      id: "apps",
      title: "Where Monte Carlo runs your life",
      emoji: "🌐",
      intro: <p>You've used Monte Carlo results today without knowing it.</p>,
      Widget: Applications,
    },
  ],
};

export default track;

