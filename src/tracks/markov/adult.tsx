import { useMemo, useRef, useState } from "react";
import { Bars, LineChart } from "../../components/charts";
import { MatrixEditor } from "../../components/MatrixEditor";
import { StateDiagram } from "../../components/StateDiagram";
import { AppCards, Seg, Slider } from "../../components/ui";
import { useAnimationFrame } from "../../hooks";
import { evolve, googleMatrix, stationary, step, validateStochastic, type Matrix } from "../../lib/markov";
import { mulberry32, randomSeed } from "../../lib/random";
import { WEATHER, WEATHER_P } from "../../sims/weather";
import { useProgress } from "../../stores/progress";
import type { Track } from "../../types";

// ─── 1. Weather simulator ─────────────────────────────────────────────

function WeatherSim() {
  const [days, setDays] = useState<number[]>([0]);
  const [trans, setTrans] = useState<{ from: number; to: number; key: number } | null>(null);
  const [auto, setAuto] = useState(false);
  const rng = useRef(mulberry32(randomSeed()));
  const acc = useRef(0);
  const today = days[days.length - 1];
  const counts = [0, 1, 2].map((s) => days.filter((d) => d === s).length);
  const pi = useMemo(() => stationary(WEATHER_P), []);
  const award = useProgress((s) => s.award);

  const advance = (k: number) => {
    const out: number[] = [];
    let s = today;
    let prev = s;
    for (let i = 0; i < k; i++) {
      prev = s;
      s = step(WEATHER_P, s, rng.current);
      out.push(s);
    }
    setTrans({ from: prev, to: s, key: Math.random() });
    setDays((d) => [...d, ...out]);
    if (days.length + k >= 365) award("year-of-weather", "📆", "A year of weather", "Simulated 365 days.");
  };
  useAnimationFrame((dt) => {
    acc.current += dt;
    if (acc.current > 0.5) {
      acc.current = 0;
      advance(1);
    }
  }, auto);

  return (
    <div className="split">
      <div>
        <StateDiagram states={WEATHER} matrix={WEATHER_P} active={today} transition={trans} height={300} dist={counts.map((c) => c / days.length)} />
        <p className="faint" style={{ fontSize: "0.85rem", textAlign: "center" }}>
          Arrow labels: chance of tomorrow's weather given today's. Drag the circles around if you like.
        </p>
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, fontSize: 20, minHeight: 34 }} aria-label="Recent days">
          {days.slice(-28).map((d, i, arr) => (
            <span key={days.length - arr.length + i} title={WEATHER[d].label} style={{ opacity: 0.4 + (0.6 * (i + 1)) / arr.length }}>
              {WEATHER[d].emoji}
            </span>
          ))}
        </div>
        <div className="callout">
          Day {days.length}: today is <b>{WEATHER[today].emoji} {WEATHER[today].label}</b>. Tomorrow:{" "}
          {WEATHER_P[today].map((p, j) => (
            <span key={j} className="pill" style={{ marginRight: 4 }}>
              {WEATHER[j].emoji} {Math.round(p * 100)}%
            </span>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn primary" onClick={() => advance(1)}>
            ☀️ Next day
          </button>
          <button className="btn" onClick={() => setAuto((a) => !a)}>
            {auto ? "⏸ Pause" : "▶ Play"}
          </button>
          <button className="btn" onClick={() => advance(365)}>
            ⏩ +1 year
          </button>
          <button className="btn ghost" onClick={() => setDays([today])}>
            ↺ Reset
          </button>
        </div>
        <Bars items={WEATHER.map((w, i) => ({ label: `${w.emoji} ${w.label}`, value: counts[i] / days.length, color: w.color, target: pi[i] }))} />
        <p className="faint" style={{ fontSize: "0.85rem" }}>
          Bars: share of simulated days. Black tick: the long-run share the maths predicts ({pi.map((p) => `${Math.round(p * 100)}%`).join(" / ")}).
        </p>
      </div>
    </div>
  );
}

// ─── 2. Edit the weather ──────────────────────────────────────────────

const PRESETS: Record<string, Matrix> = {
  "Mild climate": WEATHER_P,
  "Seattle 🌧️": [
    [0.4, 0.3, 0.3],
    [0.15, 0.4, 0.45],
    [0.05, 0.3, 0.65],
  ],
  "Desert 🏜️": [
    [0.92, 0.07, 0.01],
    [0.7, 0.25, 0.05],
    [0.6, 0.3, 0.1],
  ],
  "Stuck forever": [
    [1, 0, 0],
    [0.3, 0.4, 0.3],
    [0, 0, 1],
  ],
};

function EditWeather() {
  const [P, setP] = useState<Matrix>(WEATHER_P);
  const [start, setStart] = useState(2);
  const errs = validateStochastic(P);
  const ok = errs.length === 0;
  const traj = useMemo(() => (ok ? evolve([0, 1, 2].map((i) => (i === start ? 1 : 0)), P, 20) : []), [P, start, ok]);
  return (
    <div className="split">
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <Seg options={Object.keys(PRESETS).map((k) => ({ value: k, label: k }))} value={Object.keys(PRESETS).find((k) => PRESETS[k] === P) ?? ""} onChange={(k) => setP(PRESETS[k])} />
        <MatrixEditor matrix={P} labels={WEATHER.map((w) => w.emoji + " " + w.label)} colors={WEATHER.map((w) => w.color)} onChange={setP} />
        {!ok && <div className="callout bad">{errs[0]}</div>}
        <div>
          <div className="slider-top" style={{ marginBottom: 4 }}>
            Today's weather
          </div>
          <Seg options={WEATHER.map((w, i) => ({ value: i, label: `${w.emoji} ${w.label}` }))} value={start} onChange={setStart} />
        </div>
      </div>
      <div>
        {ok ? (
          <>
            <LineChart
              height={260}
              title="Chance of each weather, N days from today"
              xLabel="days ahead"
              yDomain={[0, 1]}
              formatY={(v) => `${Math.round(v * 100)}%`}
              series={WEATHER.map((w, k) => ({ data: traj.map((v, t) => [t, v[k]] as [number, number]), color: w.color, width: 2.5, dots: true }))}
              legend={WEATHER.map((w) => ({ label: `${w.emoji} ${w.label}`, color: w.color }))}
            />
            <p className="dim" style={{ fontSize: "0.92rem" }}>
              A forecast 1–2 days out depends a lot on today. A forecast 2 weeks out is basically the <b>climate</b> — the stationary distribution — no matter what today is. Change today's weather and watch the right side of the chart stay put. Then try the <b>Stuck forever</b> preset, where that breaks.
            </p>
          </>
        ) : (
          <div className="lazy-placeholder">Fix the matrix to see the forecast.</div>
        )}
      </div>
    </div>
  );
}

// ─── 3. Long-run convergence ──────────────────────────────────────────

function LongRun() {
  const [seed, setSeed] = useState(randomSeed);
  const [days, setDays] = useState(1000);
  const pi = useMemo(() => stationary(WEATHER_P), []);
  const runs = useMemo(() => {
    return [0, 1, 2].map((start) => {
      const rng = mulberry32(seed + start);
      let s = start;
      let sunny = 0;
      const pts: [number, number][] = [];
      for (let t = 1; t <= days; t++) {
        s = step(WEATHER_P, s, rng);
        if (s === 0) sunny++;
        if (t < 50 || t % Math.ceil(days / 300) === 0) pts.push([t, sunny / t]);
      }
      return pts;
    });
  }, [seed, days]);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <LineChart
        height={280}
        xLog
        xDomain={[1, days]}
        yDomain={[0, 1]}
        xLabel="days simulated (log scale)"
        title="Fraction of sunny days so far — three cities that started on different days"
        formatY={(v) => `${Math.round(v * 100)}%`}
        series={runs.map((r, i) => ({ data: r, color: WEATHER[i].color, width: 2 }))}
        hLines={[{ value: pi[0], label: `long-run ${(pi[0] * 100).toFixed(1)}%`, color: "var(--s1)" }]}
        legend={WEATHER.map((w) => ({ label: `started ${w.emoji} ${w.label}`, color: w.color }))}
      />
      <div className="controls">
        <Slider label="Days" value={Math.log10(days)} min={2} max={5} step={0.1} onChange={(v) => setDays(Math.round(10 ** v))} format={() => days.toLocaleString()} />
        <button className="btn" onClick={() => setSeed(randomSeed())}>
          🎲 New random weather
        </button>
      </div>
      <p className="dim">
        This is the <b>law of large numbers for Markov chains</b>: even though each day depends on the last, the long-run fraction of time in each state converges to the stationary distribution. It's why a single long simulation can stand in for the “average” behaviour of a system — and the foundation of MCMC.
      </p>
    </div>
  );
}

// ─── 4. PageRank ──────────────────────────────────────────────────────

const PAGES = [
  { label: "Home", emoji: "🏠", color: "var(--s1)" },
  { label: "Blog", emoji: "📝", color: "var(--s2)" },
  { label: "Shop", emoji: "🛒", color: "var(--s3)" },
  { label: "News", emoji: "📰", color: "var(--s4)" },
  { label: "Wiki", emoji: "📚", color: "var(--s5)" },
  { label: "Memes", emoji: "🐸", color: "var(--ink-dim)" },
];

function PageRank() {
  const [links, setLinks] = useState<number[][]>([[1, 2], [0, 4], [0], [0, 4, 5], [0, 3], [3]]);
  const [d, setD] = useState(0.85);
  const [sel, setSel] = useState<number | null>(null);
  const [surfer, setSurfer] = useState(0);
  const [visits, setVisits] = useState<number[]>(() => PAGES.map((_, i) => (i === 0 ? 1 : 0)));
  const [trans, setTrans] = useState<{ from: number; to: number; key: number } | null>(null);
  const [running, setRunning] = useState(true);
  const rng = useRef(mulberry32(randomSeed()));
  const acc = useRef(0);
  const G = useMemo(() => googleMatrix(links, PAGES.length, d), [links, d]);
  const pr = useMemo(() => stationary(G), [G]);
  const shown: Matrix = useMemo(() => PAGES.map((_, i) => PAGES.map((_, j) => (links[i].includes(j) ? 1 / links[i].length : 0))), [links]);
  const total = visits.reduce((a, b) => a + b, 0);

  useAnimationFrame((dt) => {
    acc.current += dt;
    if (acc.current < 0.25) return;
    acc.current = 0;
    const next = step(G, surfer, rng.current);
    setTrans({ from: surfer, to: next, key: Math.random() });
    setSurfer(next);
    setVisits((v) => v.map((x, i) => x + (i === next ? 1 : 0)));
  }, running);

  const click = (i: number) => {
    if (sel === null) return setSel(i);
    if (sel !== i) {
      setLinks((ls) => ls.map((l, k) => (k === sel ? (l.includes(i) ? l.filter((x) => x !== i) : [...l, i]) : l)));
      setVisits(PAGES.map(() => 0));
    }
    setSel(null);
  };

  const ranked = PAGES.map((p, i) => ({ ...p, i, pr: pr[i] })).sort((a, b) => b.pr - a.pr);
  return (
    <div className="split">
      <div>
        <StateDiagram states={PAGES.map((p, i) => ({ ...p, color: sel === i ? "var(--ink)" : p.color }))} matrix={shown} active={surfer} transition={trans} dist={pr} height={340} showWeights={false} onNodeClick={click} />
        <p className="faint" style={{ fontSize: "0.85rem", textAlign: "center" }}>
          {sel === null ? "Click a page, then another page, to add or remove a link." : `Now click where ${PAGES[sel].emoji} ${PAGES[sel].label} should link to (or click it again to cancel).`}
        </p>
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <p>
          A bored surfer (the dot) clicks a random link on each page. Every so often ({Math.round((1 - d) * 100)}% of clicks) they get bored and teleport to a random page. Where do they spend their time?
        </p>
        <Bars items={ranked.map((p) => ({ label: `${p.emoji} ${p.label}`, value: total ? visits[p.i] / total : 0, color: p.color, target: p.pr }))} max={Math.max(0.4, ...pr) * 1.1} />
        <p className="faint" style={{ fontSize: "0.85rem" }}>
          Bars: where the surfer actually went ({total} clicks). Tick: exact PageRank — the chain's stationary distribution.
        </p>
        <Slider label="Damping d (chance to follow a link)" value={d} min={0.05} max={0.99} step={0.01} onChange={setD} />
        <div className="btn-row">
          <button className="btn" onClick={() => setRunning((r) => !r)}>
            {running ? "⏸ Pause surfer" : "▶ Surf"}
          </button>
          <button className="btn ghost" onClick={() => setVisits(PAGES.map(() => 0))}>
            Reset visits
          </button>
        </div>
        <div className="callout">
          🏆 Top page: <b>{ranked[0].emoji} {ranked[0].label}</b> ({(ranked[0].pr * 100).toFixed(1)}%). Try making every page link to 🐸 Memes and watch it take over the internet.
        </div>
      </div>
    </div>
  );
}

function Applications() {
  return (
    <AppCards
      items={[
        { emoji: "🔎", title: "Search engines", body: "PageRank: the stationary distribution of a random surfer on the web graph. It made Google." },
        { emoji: "💳", title: "Credit ratings", body: "Banks use rating-transition matrices (AAA → AA → … → default) to price loans and estimate risk over years." },
        { emoji: "🧬", title: "DNA & proteins", body: "Hidden Markov models find genes in DNA and align protein families." },
        { emoji: "🗣️", title: "Speech recognition", body: "For decades, voice assistants decoded speech with hidden Markov models over sounds." },
        { emoji: "🏥", title: "Healthcare", body: "Disease progression models (healthy → sick → recovered) help evaluate treatments and costs." },
        { emoji: "🎮", title: "Games & queues", body: "Board games, call centres and server queues are all analysed as Markov chains." },
      ]}
    />
  );
}

const track: Track = {
  title: "The future depends only on now",
  tagline: "Markov chains model anything that hops between states at random — weather, web surfing, credit ratings — and they reveal what happens in the long run.",
  history: [
    { when: "1906", what: "Andrey Markov sets out to refute rival Pavel Nekrasov, who claimed averages only settle down for independent events." },
    { when: "1913", what: "Markov tallies 20,000 letters of Pushkin's Eugene Onegin by hand — the first statistical model of language." },
    { when: "1948", what: "Claude Shannon's information theory uses Markov chains to model and generate English text." },
    { when: "1998", what: "Brin & Page publish PageRank — the stationary distribution of a random surfer." },
  ],
  chapters: [
    {
      id: "weather",
      title: "A weather simulator",
      emoji: "🌦️",
      intro: <p>Three kinds of day, and fixed chances of switching between them. Step through a few days, then fast-forward a year.</p>,
      Widget: WeatherSim,
      takeaway: (
        <>
          <b>Markov property:</b> tomorrow depends only on today. It doesn't matter if it rained all last week.
        </>
      ),
      quiz: [
        {
          q: "It's been sunny for 10 days straight. In this model, the chance tomorrow is sunny is…",
          options: ["Higher than usual — it's on a streak", "Lower — rain is 'due'", "Exactly 70%, same as after any sunny day", "Impossible to say"],
          answer: 2,
          explain: "Memoryless! Only today's state matters. Believing rain is 'due' is the gambler's fallacy.",
        },
      ],
    },
    {
      id: "edit",
      title: "Change the climate",
      emoji: "🎛️",
      intro: <p>Each row is “if today is X, the chances for tomorrow”. Edit them, pick today's weather, and see how far ahead today still matters.</p>,
      Widget: EditWeather,
    },
    {
      id: "longrun",
      title: "1,000 days later",
      emoji: "⏳",
      intro: <p>Run three long simulations starting from different weather. Watch the fraction of sunny days in each.</p>,
      Widget: LongRun,
      quiz: [
        {
          q: "Three simulations start on a sunny, cloudy and rainy day. After 100,000 days, the fraction of sunny days in each is…",
          options: ["Very different, depending on the start", "Almost exactly the same", "Exactly 1/3 in each", "Always 100% sunny"],
          answer: 1,
          explain: "All converge to the stationary share (≈46% here). The starting day is forgotten.",
        },
      ],
    },
    {
      id: "pagerank",
      title: "How Google ranked the web",
      emoji: "🌐",
      intro: <p>A tiny internet of six pages. Rewire the links and watch which page becomes most important.</p>,
      Widget: PageRank,
      takeaway: (
        <>
          <b>PageRank</b> isn't about how many links a page has — it's about how often a random surfer ends up there. A link from an important page counts for more.
        </>
      ),
    },
    {
      id: "apps",
      title: "Markov chains in the wild",
      emoji: "🧭",
      intro: <p>Once you see states and transitions, you see them everywhere.</p>,
      Widget: Applications,
    },
  ],
};

export default track;
