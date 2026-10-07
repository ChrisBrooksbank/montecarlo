import { useEffect, useMemo, useRef, useState } from "react";
import { LineChart } from "../../components/charts";
import { Slider, Stat } from "../../components/ui";
import { cssVar, setupCanvas, useThemeKey, useWidth } from "../../hooks";
import { birthdayExact } from "../../lib/montecarlo";
import { mulberry32, randomSeed } from "../../lib/random";
import { DartCanvas, DartEngine, useDartRunner } from "../../sims/darts";
import { useProgress } from "../../stores/progress";
import type { Track } from "../../types";

// ─── 1. Blindfolded darts ─────────────────────────────────────────────

function vibe(err: number, n: number): string {
  if (!n) return "Throw something! 🎯";
  if (n < 10) return "Way too early to tell. Keep going…";
  if (err < 0.001) return "🤯 Three decimal places. From pure chaos.";
  if (err < 0.01) return "🔥 Within 0.01 of π. Your blindfold is legendary.";
  if (err < 0.05) return "😎 Getting close! More darts = closer.";
  if (err < 0.2) return "🤔 Roughly π-ish. The randomness is still wobbling.";
  return "🙃 Not great yet — but look what happens with more darts.";
}

function DartGame() {
  const [engine, setEngine] = useState(() => new DartEngine("full"));
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState(200);
  const [version, bump] = useDartRunner(engine, running, rate);
  const award = useProgress((s) => s.award);
  const err = Math.abs(engine.estimate - Math.PI);

  useEffect(() => {
    if (engine.total >= 1) award("first-dart", "🎯", "First dart", "Welcome to Monte Carlo.");
    if (engine.total >= 100_000) award("dart-100k", "🏹", "100,000 darts", "Your arm must be tired.");
  }, [version, engine.total, award]);

  const throwN = (k: number) => {
    engine.throw(k);
    bump();
  };

  const hist = engine.hist.map(([n, e]) => [n, e] as [number, number]);
  return (
    <div className="split-wide">
      <div>
        <DartCanvas engine={engine} version={version} showLast={!running && engine.total < 200} onClick={() => throwN(1)} />
        <p className="faint" style={{ textAlign: "center", fontSize: "0.85rem", marginTop: 6 }}>
          Click the board to throw (you're blindfolded — it lands anywhere!)
        </p>
      </div>
      <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
        <div className="stats">
          <Stat label="Your π" value={engine.total ? engine.estimate.toFixed(5) : "—"} huge className={err < 0.01 ? "good" : ""} />
        </div>
        <div className="stats">
          <Stat label="Darts" value={engine.total.toLocaleString()} />
          <Stat label="Inside 🎯" value={engine.hits.toLocaleString()} />
          <Stat label="Off by" value={engine.total ? err.toFixed(4) : "—"} />
        </div>
        <div className="callout">{vibe(err, engine.total)}</div>
        <div className="btn-row">
          <button className="btn" onClick={() => throwN(1)}>
            Throw 1
          </button>
          <button className="btn" onClick={() => throwN(10)}>
            Throw 10
          </button>
          <button className="btn" onClick={() => throwN(1000)}>
            Throw 1,000
          </button>
          <button className="btn primary" onClick={() => setRunning((r) => !r)}>
            {running ? "⏸ Stop" : "🔥 Auto-fire"}
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setRunning(false);
              setEngine(new DartEngine("full"));
            }}
          >
            ↺ Reset
          </button>
        </div>
        <Slider label="Auto-fire speed" value={Math.log10(rate)} min={0} max={4.7} step={0.1} onChange={(v) => setRate(Math.round(10 ** v))} format={() => `${rate.toLocaleString()} darts/sec`} />
        {hist.length > 2 && (
          <LineChart
            height={170}
            title="Your π estimate as darts pile up"
            series={[{ data: hist, color: "var(--accent)", width: 2 }]}
            xDomain={[1, Math.max(10, engine.total)]}
            xLog
            yDomain={[2.4, 3.9]}
            hLines={[{ value: Math.PI, label: "π = 3.14159…", color: "var(--s3)" }]}
          />
        )}
      </div>
    </div>
  );
}

// ─── 2. Why does it work? ─────────────────────────────────────────────

function WhyItWorks() {
  const [res, setRes] = useState(8);
  const [ref, w] = useWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useThemeKey();
  const size = Math.min(320, w / 2 - 10);
  const counts = useMemo(() => {
    let inside = 0;
    for (let i = 0; i < res; i++) for (let j = 0; j < res; j++) {
      const x = ((i + 0.5) / res) * 2 - 1;
      const y = ((j + 0.5) / res) * 2 - 1;
      if (x * x + y * y <= 1) inside++;
    }
    return inside;
  }, [res]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || size < 60) return;
    const ctx = setupCanvas(cv, size, size);
    ctx.fillStyle = cssVar("--bg");
    ctx.fillRect(0, 0, size, size);
    const cell = size / res;
    for (let i = 0; i < res; i++) for (let j = 0; j < res; j++) {
      const x = ((i + 0.5) / res) * 2 - 1;
      const y = ((j + 0.5) / res) * 2 - 1;
      ctx.fillStyle = x * x + y * y <= 1 ? cssVar("--s1") : cssVar("--s2");
      ctx.globalAlpha = 0.75;
      ctx.fillRect(i * cell + 0.5, j * cell + 0.5, cell - 1, cell - 1);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar("--s3");
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.stroke();
  }, [res, size, theme]);

  const ratio = counts / (res * res);
  return (
    <div ref={ref} className="split">
      <div>
        <canvas ref={canvasRef} style={{ width: size, display: "block", margin: "0 auto", borderRadius: 8 }} />
        <Slider label="Grid squares per side" value={res} min={2} max={80} onChange={setRes} />
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <ol className="step-list">
          <li>
            The square is <b>2 × 2 = 4</b> units of area.
          </li>
          <li>
            The circle inside it has radius 1, so its area is <b>π × 1² = π</b>.
          </li>
          <li>
            So the circle covers <b>π ÷ 4 ≈ 78.5%</b> of the square.
          </li>
          <li>
            Darts landing randomly hit the circle about <b>78.5%</b> of the time. Flip it around: <b>π ≈ 4 × (fraction inside)</b>.
          </li>
        </ol>
        <div className="stats">
          <Stat label="Squares inside" value={`${counts}/${res * res}`} />
          <Stat label="4 × fraction" value={(4 * ratio).toFixed(4)} className={Math.abs(4 * ratio - Math.PI) < 0.01 ? "good" : ""} />
        </div>
        <p className="dim" style={{ fontSize: "0.92rem" }}>
          Counting grid squares works in 2-D. But in 100 dimensions a grid with just 10 squares per side has 10¹⁰⁰ squares — more than atoms in the universe. Random darts don't care how many dimensions there are. <b>That's the superpower.</b>
        </p>
      </div>
    </div>
  );
}

// ─── 3. Pi Champion ───────────────────────────────────────────────────

function PiChampion() {
  const [darts, setDarts] = useState(3);
  const [rounds, setRounds] = useState<{ n: number; est: number; win: boolean; pts: number }[]>([]);
  const best = useProgress((s) => s.bests["pi-champion"] ?? 0);
  const recordBest = useProgress((s) => s.recordBest);
  const award = useProgress((s) => s.award);
  const n = Math.round(10 ** darts);
  const score = rounds.reduce((s, r) => s + r.pts, 0);
  const streak = (() => {
    let k = 0;
    for (let i = rounds.length - 1; i >= 0 && rounds[i].win; i--) k++;
    return k;
  })();
  const pointsFor = (n: number) => Math.max(10, Math.round(2000 / Math.sqrt(n)) * 10);

  const play = () => {
    const rng = mulberry32(randomSeed());
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const x = rng() * 2 - 1;
      const y = rng() * 2 - 1;
      if (x * x + y * y <= 1) hits++;
    }
    const est = (4 * hits) / n;
    const win = Math.abs(est - Math.PI) <= 0.01;
    const pts = win ? pointsFor(n) : 0;
    const next = [...rounds, { n, est, win, pts }].slice(-12);
    setRounds(next);
    const total = next.reduce((s, r) => s + r.pts, 0);
    recordBest("pi-champion", total);
    if (win) award("pi-champion", "🥧", "Pi Champion", "Landed within 0.01 of π.");
    if (Math.abs(est - Math.PI) < 0.0005) award("pi-sniper", "🎯", "π Sniper", "Within 0.0005 of π!");
  };

  return (
    <div className="split">
      <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
        <p>
          <b>The challenge:</b> get within <b>0.01</b> of π. You choose how many darts to throw. Fewer darts = <b>way more points</b>, but you're far more likely to miss. How brave are you?
        </p>
        <Slider label="Darts this round" value={darts} min={1} max={6} step={0.1} onChange={setDarts} format={() => n.toLocaleString()} />
        <div className="stats">
          <Stat label="Points if you win" value={pointsFor(n).toLocaleString()} />
          <Stat label="Real chance of winning" value={`${(100 * winChance(n)).toFixed(0)}%`} sub="(the maths knows!)" />
        </div>
        <div className="btn-row">
          <button className="btn primary big" onClick={play}>
            🎯 Throw {n.toLocaleString()}
          </button>
          <button className="btn ghost" onClick={() => setRounds([])}>
            New game
          </button>
        </div>
        <div className="stats">
          <Stat label="Score" value={score.toLocaleString()} />
          <Stat label="Streak" value={`${streak}🔥`} />
          <Stat label="Personal best" value={best.toLocaleString()} />
        </div>
      </div>
      <div>
        <table className="data">
          <thead>
            <tr>
              <th className="num">Darts</th>
              <th className="num">Your π</th>
              <th className="num">Off by</th>
              <th className="num">Points</th>
            </tr>
          </thead>
          <tbody>
            {rounds
              .slice()
              .reverse()
              .map((r, i) => (
                <tr key={rounds.length - i} className={i === 0 ? "flash" : ""}>
                  <td className="num">{r.n.toLocaleString()}</td>
                  <td className="num">{r.est.toFixed(4)}</td>
                  <td className={`num ${r.win ? "good" : "bad"}`}>{Math.abs(r.est - Math.PI).toFixed(4)}</td>
                  <td className="num">{r.win ? `+${r.pts}` : "💥 0"}</td>
                </tr>
              ))}
            {!rounds.length && (
              <tr>
                <td colSpan={4} className="faint" style={{ textAlign: "center", padding: 20 }}>
                  No rounds yet. Pick your dart count and throw!
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="faint" style={{ fontSize: "0.85rem", marginTop: 10 }}>
          Secret: to be within 0.01 about 95% of the time you need roughly <b>100,000</b> darts. To get 10× closer you'd need 100× more darts. Randomness is fair… but slow.
        </p>
      </div>
    </div>
  );
}

/** P(|π̂ − π| ≤ 0.01) using the normal approximation. */
function winChance(n: number): number {
  const p = Math.PI / 4;
  const sd = 4 * Math.sqrt((p * (1 - p)) / n);
  return erf(0.01 / sd / Math.SQRT2);
}

function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

// ─── 4. Draw a shape ──────────────────────────────────────────────────

function DrawShape() {
  const [ref, w] = useWidth<HTMLDivElement>();
  const size = Math.min(420, w);
  const shapeRef = useRef<HTMLCanvasElement>(null);
  const dartRef = useRef<HTMLCanvasElement>(null);
  const [path, setPath] = useState<[number, number][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [stats, setStats] = useState({ n: 0, hits: 0 });
  const [truth, setTruth] = useState<number | null>(null);
  const maskRef = useRef<Uint8Array | null>(null);
  const theme = useThemeKey();
  const award = useProgress((s) => s.award);

  // Paint the shape and compute the exact (pixel) area mask.
  useEffect(() => {
    const cv = shapeRef.current;
    if (!cv || size < 60) return;
    const ctx = setupCanvas(cv, size, size);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = cssVar("--bg");
    ctx.fillRect(0, 0, size, size);
    if (path.length > 2) {
      ctx.beginPath();
      path.forEach(([x, y], i) => (i ? ctx.lineTo(x * size, y * size) : ctx.moveTo(x * size, y * size)));
      ctx.closePath();
      ctx.fillStyle = cssVar("--s4");
      ctx.globalAlpha = drawing ? 0.15 : 0.3;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = cssVar("--s3");
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (!drawing && path.length > 2) {
      // exact-ish area: rasterise the polygon at 300×300
      const R = 300;
      const off = document.createElement("canvas");
      off.width = R;
      off.height = R;
      const o = off.getContext("2d")!;
      o.beginPath();
      path.forEach(([x, y], i) => (i ? o.lineTo(x * R, y * R) : o.moveTo(x * R, y * R)));
      o.closePath();
      o.fillStyle = "#fff";
      o.fill();
      const data = o.getImageData(0, 0, R, R).data;
      const mask = new Uint8Array(R * R);
      let c = 0;
      for (let i = 0; i < R * R; i++) if (data[i * 4 + 3] > 127) {
        mask[i] = 1;
        c++;
      }
      maskRef.current = mask;
      setTruth(c / (R * R));
    }
  }, [path, drawing, size, theme]);

  const clearDarts = () => {
    const cv = dartRef.current;
    if (cv) setupCanvas(cv, size, size).clearRect(0, 0, size, size);
    setStats({ n: 0, hits: 0 });
  };

  useEffect(clearDarts, [size]); // eslint-disable-line react-hooks/exhaustive-deps

  const throwDarts = (k: number) => {
    const mask = maskRef.current;
    const cv = dartRef.current;
    if (!mask || !cv) return;
    const ctx = cv.getContext("2d")!;
    const rng = mulberry32(randomSeed());
    let hits = 0;
    const cin = cssVar("--s1");
    const cout = cssVar("--s2");
    const d = stats.n + k > 3000 ? 1.5 : 3;
    for (let i = 0; i < k; i++) {
      const x = rng();
      const y = rng();
      const inside = mask[Math.floor(y * 300) * 300 + Math.floor(x * 300)] === 1;
      if (inside) hits++;
      ctx.fillStyle = inside ? cin : cout;
      ctx.fillRect(x * size - d / 2, y * size - d / 2, d, d);
    }
    const next = { n: stats.n + k, hits: stats.hits + hits };
    setStats(next);
    if (truth !== null && next.n >= 1000 && Math.abs(next.hits / next.n - truth) < 0.01) award("shape-measurer", "✏️", "Shape Measurer", "Measured a weird shape with pure randomness.");
  };

  const pos = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))] as [number, number];
  };

  const est = stats.n ? stats.hits / stats.n : null;
  return (
    <div className="split">
      <div ref={ref}>
        <div
          className="canvas-wrap"
          style={{ width: size, margin: "0 auto", height: size, cursor: "crosshair", touchAction: "none" }}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            setDrawing(true);
            setPath([pos(e)]);
            clearDarts();
            setTruth(null);
            maskRef.current = null;
          }}
          onPointerMove={(e) => {
            if (!drawing) return;
            const pt = pos(e); // read the event now; currentTarget is null once the handler returns
            setPath((p) => [...p, pt]);
          }}
          onPointerUp={() => setDrawing(false)}
        >
          <canvas ref={shapeRef} style={{ position: "absolute", inset: 0 }} />
          <canvas ref={dartRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
          {path.length < 3 && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--ink-faint)", pointerEvents: "none", fontSize: "1.1rem" }}>
              ✏️ Draw any blob here!
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <p>
          Draw any wobbly shape — a cloud, a dinosaur, your initials. Nobody has a formula for its area. <b>Darts don't need one.</b> Fraction of darts inside ≈ fraction of the box your shape covers.
        </p>
        <div className="btn-row">
          <button className="btn" disabled={!truth} onClick={() => throwDarts(10)}>
            Throw 10
          </button>
          <button className="btn" disabled={!truth} onClick={() => throwDarts(100)}>
            Throw 100
          </button>
          <button className="btn primary" disabled={!truth} onClick={() => throwDarts(2000)}>
            Throw 2,000
          </button>
          <button className="btn ghost" onClick={clearDarts}>
            Clear darts
          </button>
        </div>
        <div className="stats">
          <Stat label="Darts" value={stats.n.toLocaleString()} />
          <Stat label="Dart estimate" value={est === null ? "—" : `${(est * 100).toFixed(1)}%`} />
          <Stat label="True area" value={truth === null ? "draw first" : `${(truth * 100).toFixed(1)}%`} sub="(counted pixel by pixel)" />
        </div>
      </div>
    </div>
  );
}

// ─── 5. Birthday party ────────────────────────────────────────────────

const FACES = ["😀", "😎", "🤓", "😺", "🐸", "🦄", "👽", "🤖", "🐼", "🦊", "🐙", "🐵", "🧛", "🧙", "🦖", "🐯", "🐨", "🐷", "🐻", "🐰", "🦁", "🐮", "🐧", "🐔", "🦉", "🐝", "🐞", "🦋", "🐢", "🐬", "🐳", "🦀", "🦜", "🦩", "🐿️", "🦔", "🦦", "🦥", "🐉", "🎃"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (d: number) => {
  const lens = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let m = 0;
  while (d >= lens[m]) d -= lens[m++];
  return `${MONTHS[m]} ${d + 1}`;
};

function BirthdayParty() {
  const [people, setPeople] = useState(23);
  const [room, setRoom] = useState<number[]>([]);
  const [parties, setParties] = useState({ n: 0, matches: 0 });
  const [guess, setGuess] = useState<number | null>(null);

  const party = () => {
    const rng = mulberry32(randomSeed());
    const r = Array.from({ length: people }, () => Math.floor(rng() * 365));
    setRoom(r);
    const hasMatch = new Set(r).size < r.length;
    setParties((p) => ({ n: p.n + 1, matches: p.matches + (hasMatch ? 1 : 0) }));
  };
  const thousand = () => {
    const rng = mulberry32(randomSeed());
    let m = 0;
    const seen = new Uint8Array(365);
    for (let k = 0; k < 1000; k++) {
      seen.fill(0);
      for (let i = 0; i < people; i++) {
        const d = Math.floor(rng() * 365);
        if (seen[d]) {
          m++;
          break;
        }
        seen[d] = 1;
      }
    }
    setParties((p) => ({ n: p.n + 1000, matches: p.matches + m }));
  };
  useEffect(() => {
    setParties({ n: 0, matches: 0 });
    setRoom([]);
  }, [people]);

  const dupes = new Set(room.filter((d, i) => room.indexOf(d) !== i));
  const curve = useMemo(() => Array.from({ length: 70 }, (_, k) => [k + 1, birthdayExact(k + 1)] as [number, number]), []);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {guess === null ? (
        <div className="callout">
          <b>Guess first:</b> in a room of 23 people, what's the chance two share a birthday?{" "}
          <span className="btn-row" style={{ display: "inline-flex", marginLeft: 8 }}>
            {[6, 25, 50, 90].map((g) => (
              <button key={g} className="btn small" onClick={() => setGuess(g)}>
                ~{g}%
              </button>
            ))}
          </span>
        </div>
      ) : (
        <div className="callout">
          You guessed ~{guess}%. Most people say about 6%. Let's find out by throwing parties… 🎉
        </div>
      )}
      <div className="split">
        <div>
          <Slider label="People at the party" value={people} min={2} max={70} onChange={setPeople} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, minHeight: 60 }}>
            {room.map((d, i) => (
              <span key={i} title={dayLabel(d)} className={dupes.has(d) ? "bounce" : ""} style={{ display: "inline-grid", placeItems: "center", width: 54, padding: "2px 0", borderRadius: 10, background: dupes.has(d) ? "color-mix(in srgb, var(--s3) 35%, transparent)" : "var(--bg-3)", border: dupes.has(d) ? "2px solid var(--s3)" : "2px solid transparent", fontSize: 22, lineHeight: 1.1 }}>
                {FACES[i % FACES.length]}
                <small style={{ fontSize: 10, color: "var(--ink-dim)" }}>{dayLabel(d)}</small>
              </span>
            ))}
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={party}>
              🎉 Throw a party
            </button>
            <button className="btn" onClick={thousand}>
              🎉×1000 parties
            </button>
          </div>
          {room.length > 0 && <p style={{ marginTop: 10 }}>{dupes.size ? <b className="good">🎂 Birthday twins! ({[...dupes].map(dayLabel).join(", ")})</b> : <span className="dim">No shared birthdays this time.</span>}</p>}
        </div>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div className="stats">
            <Stat label="Parties thrown" value={parties.n.toLocaleString()} />
            <Stat label="Had twins" value={parties.n ? `${((100 * parties.matches) / parties.n).toFixed(1)}%` : "—"} />
            <Stat label="Exact maths" value={`${(100 * birthdayExact(people)).toFixed(1)}%`} />
          </div>
          <LineChart
            height={180}
            title="Chance of birthday twins vs party size"
            series={[{ data: curve, color: "var(--s2)" }, ...(parties.n ? [{ data: [[people, parties.matches / parties.n]] as [number, number][], color: "var(--s1)", dots: true }] : [])]}
            yDomain={[0, 1]}
            xDomain={[1, 70]}
            formatY={(v) => `${Math.round(v * 100)}%`}
            vLines={[{ value: people, color: "var(--s1)" }]}
            hLines={[{ value: 0.5, label: "50%" }]}
          />
        </div>
      </div>
    </div>
  );
}

const track: Track = {
  title: "Throw darts. Discover π.",
  tagline: "You don't need to be good at maths to calculate π. You just need to be bad at darts — on purpose, and a lot.",
  history: [
    { when: "1777", what: "Comte de Buffon drops needles on a wooden floor — and finds π hiding in the result." },
    { when: "1946", what: "Stan Ulam, stuck in hospital playing solitaire, realises: just play 100 games and count the wins!" },
    { when: "1948", what: "ENIAC — a computer the size of a room — runs the first Monte Carlo simulations for physics." },
    { when: "Today", what: "Pixar movies, video-game lighting and weather forecasts all use this trick." },
  ],
  chapters: [
    {
      id: "darts",
      title: "Blindfolded darts",
      emoji: "🎯",
      intro: (
        <p>
          Here's a dartboard (a circle) inside a square. You're blindfolded, so your darts land <b>completely randomly</b> somewhere in the square. Count how many land in the circle, multiply the fraction by 4… and you get <b>π</b>. Seriously. Try it!
        </p>
      ),
      Widget: DartGame,
      takeaway: (
        <>
          <b>Big idea:</b> randomness, repeated many times, gives you real answers. Your first few darts are useless — your first <i>million</i> are amazing.
        </>
      ),
      quiz: [
        {
          q: "You throw 100 darts and 79 land inside the circle. What's your estimate of π?",
          options: ["0.79", "3.16", "7.9", "3.14 exactly"],
          answer: 1,
          explain: "π ≈ 4 × 79/100 = 3.16. Close! More darts would get you closer.",
        },
      ],
    },
    {
      id: "why",
      title: "Wait… why does that work?",
      emoji: "🤔",
      intro: <p>No magic — just areas. Slide the grid to see how “counting squares” and “throwing darts” are secretly the same idea.</p>,
      Widget: WhyItWorks,
      quiz: [
        {
          q: "Roughly what fraction of random darts land inside the circle?",
          options: ["About 50%", "About 78.5% (π/4)", "About 31.4%", "It changes every time, there's no pattern"],
          answer: 1,
          explain: "The circle's area is π and the square's is 4, so the fraction is π/4 ≈ 0.785. Each throw varies, but the long-run fraction doesn't.",
        },
      ],
    },
    {
      id: "champion",
      title: "Pi Champion challenge",
      emoji: "🥧",
      intro: <p>Time to gamble. Pick how many darts to throw. Hit within 0.01 of π and win points — the fewer darts you used, the more you win. Can you beat the odds?</p>,
      Widget: PiChampion,
      takeaway: (
        <>
          <b>The 100× rule:</b> to be 10× more accurate you need 100× more darts. Mathematicians write it as error ∝ 1/√N.
        </>
      ),
    },
    {
      id: "shape",
      title: "Measure any shape with darts",
      emoji: "✏️",
      intro: <p>Circles are easy. What about a shape nobody has a formula for? Draw one and let the darts measure it.</p>,
      Widget: DrawShape,
      takeaway: (
        <>
          <b>That's real science:</b> engineers measure weird shapes, volumes and probabilities exactly like this — when the formula is too hard, they simulate.
        </>
      ),
    },
    {
      id: "birthday",
      title: "The birthday party paradox",
      emoji: "🎂",
      intro: <p>Monte Carlo isn't just for shapes — it can answer probability questions that fool almost everyone. Throw some virtual parties.</p>,
      Widget: BirthdayParty,
      quiz: [
        {
          q: "With 23 people at a party, the chance two share a birthday is about…",
          options: ["6%", "23%", "50%", "100%"],
          answer: 2,
          explain: "About 50.7%! There are 253 possible pairs of people, and each pair is a chance for a match.",
        },
        {
          q: "Why is simulating 1,000 parties useful if we can also do the maths?",
          options: ["It isn't — maths is always better", "Simulations work even when the maths gets too hard to do by hand", "Computers are smarter than maths", "Because it's random"],
          answer: 1,
          explain: "For this question both work, which lets us check the simulation. For messier problems (leap years, twins, real birthday data) simulating is far easier.",
        },
      ],
    },
  ],
};

export default track;
