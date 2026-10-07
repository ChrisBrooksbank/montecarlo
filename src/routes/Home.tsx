import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { cssVar, setupCanvas, useThemeKey } from "../hooks";
import { mixPaint, type RGB } from "../lib/diffiehellman";
import { mulberry32, randomSeed } from "../lib/random";
import { useAudience } from "../stores/audience";
import { useProgress } from "../stores/progress";
import { AUDIENCES, CONCEPTS, type ConceptId } from "../types";

const CHAPTERS_BY_AUD: Record<ConceptId, Record<string, number>> = {
  montecarlo: { teen: 5, adult: 5, scientist: 5 },
  markov: { teen: 5, adult: 5, scientist: 4 },
  dh: { teen: 4, adult: 5, scientist: 4 },
};

/** Full-bleed background: darts raining into a circle, with a live π estimate. */
function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useThemeKey();
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const rng = mulberry32(randomSeed());
    let raf = 0;
    let w = 0;
    let h = 0;
    let ctx: CanvasRenderingContext2D;
    const cols = [cssVar("--s1"), cssVar("--s2"), cssVar("--s3"), cssVar("--s4")];
    const bg = cssVar("--bg");
    const resize = () => {
      w = cv.clientWidth;
      h = cv.clientHeight;
      ctx = setupCanvas(cv, w, h);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    const frame = () => {
      ctx.fillStyle = bg;
      ctx.globalAlpha = 0.04;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      const r = Math.min(w, h) * 0.42;
      for (let i = 0; i < 18; i++) {
        const x = rng() * w;
        const y = rng() * h;
        const inside = (x - w / 2) ** 2 + (y - h / 2) ** 2 < r * r;
        ctx.fillStyle = inside ? cols[0] : cols[(i % 3) + 1];
        ctx.globalAlpha = inside ? 0.9 : 0.45;
        ctx.fillRect(x, y, 2.2, 2.2);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    if (!reduce) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [theme]);
  return <canvas ref={ref} aria-hidden />;
}

/** Small looping animations for each concept card. */
function MiniCanvas({ kind }: { kind: ConceptId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useThemeKey();
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const w = cv.clientWidth || 360;
    const h = 170;
    const ctx = setupCanvas(cv, w, h);
    const rng = mulberry32(randomSeed());
    const c = { s1: cssVar("--s1"), s2: cssVar("--s2"), s3: cssVar("--s3"), s4: cssVar("--s4"), bg: cssVar("--bg"), ink: cssVar("--ink-dim") };
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);
    let raf = 0;
    let t = 0;
    let hits = 0;
    let n = 0;
    // Markov state
    const nodes = [0, 1, 2].map((i) => ({ x: w / 2 + 70 * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / 3), y: h / 2 + 8 + 58 * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / 3) }));
    const P = [[0.6, 0.3, 0.1], [0.2, 0.5, 0.3], [0.3, 0.3, 0.4]];
    let cur = 0;
    let next = 1;
    let prog = 0;
    const visits = [1, 0, 0];
    const frame = () => {
      t++;
      if (kind === "montecarlo") {
        const S = h - 20;
        const ox = w / 2 - S / 2;
        for (let i = 0; i < 6; i++) {
          const x = rng();
          const y = rng();
          const inside = x * x + y * y <= 1;
          n++;
          if (inside) hits++;
          ctx.fillStyle = inside ? c.s1 : c.s2;
          ctx.fillRect(ox + x * S, 10 + (1 - y) * S, 1.6, 1.6);
        }
        ctx.fillStyle = c.bg;
        ctx.fillRect(w - 118, 8, 112, 24);
        ctx.fillStyle = c.s3;
        ctx.font = "600 15px ui-monospace, monospace";
        ctx.fillText(`π≈${((4 * hits) / n).toFixed(4)}`, w - 112, 26);
        if (n > 14000) {
          n = 0;
          hits = 0;
          ctx.fillStyle = c.bg;
          ctx.fillRect(0, 0, w, h);
        }
      } else if (kind === "markov") {
        ctx.fillStyle = c.bg;
        ctx.fillRect(0, 0, w, h);
        const cols = [c.s1, c.s2, c.s3];
        const total = visits.reduce((a, b) => a + b, 0);
        nodes.forEach((a, i) =>
          nodes.forEach((b, j) => {
            if (i === j) return;
            ctx.strokeStyle = cols[i];
            ctx.globalAlpha = 0.25 + P[i][j];
            ctx.lineWidth = 1 + P[i][j] * 4;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo((a.x + b.x) / 2 + (b.y - a.y) * 0.15, (a.y + b.y) / 2 - (b.x - a.x) * 0.15, b.x, b.y);
            ctx.stroke();
          }),
        );
        ctx.globalAlpha = 1;
        nodes.forEach((p, i) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 16 + 14 * (visits[i] / total), 0, Math.PI * 2);
          ctx.fillStyle = c.bg;
          ctx.fill();
          ctx.strokeStyle = cols[i];
          ctx.lineWidth = 3;
          ctx.stroke();
        });
        prog += 0.06;
        if (prog >= 1) {
          prog = 0;
          cur = next;
          visits[cur]++;
          let u = rng();
          next = 0;
          while (u > P[cur][next] && next < 2) u -= P[cur][next++];
        }
        const a = nodes[cur];
        const b = nodes[next];
        const e = prog < 0.5 ? 2 * prog * prog : 1 - (-2 * prog + 2) ** 2 / 2;
        ctx.beginPath();
        ctx.arc(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e, 6, 0, Math.PI * 2);
        ctx.fillStyle = c.ink;
        ctx.fill();
      } else {
        ctx.fillStyle = c.bg;
        ctx.fillRect(0, 0, w, h);
        const Y: RGB = [255, 212, 0];
        const R: RGB = [230, 57, 70];
        const B: RGB = [29, 111, 224];
        const phase = (t / 90) % 4;
        const k = Math.min(1, phase % 1 * 1.6);
        const blob = (x: number, y: number, col: RGB, r = 20) => {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${col.join(",")})`;
          ctx.fill();
        };
        const L = w * 0.18;
        const Rr = w * 0.82;
        const M = w / 2;
        blob(M, 40, Y);
        blob(L, 40, R, 14);
        blob(Rr, 40, B, 14);
        if (phase >= 1) {
          blob(L + (M - L) * (phase >= 2 ? 1 : k) * 0.6, 100, mixPaint(Y, R));
          blob(Rr - (Rr - M) * (phase >= 2 ? 1 : k) * 0.6, 100, mixPaint(Y, B));
        }
        if (phase >= 2) {
          const sh = mixPaint(Y, R, B);
          blob(L, 140, sh, phase >= 3 ? 22 : 22 * k);
          blob(Rr, 140, sh, phase >= 3 ? 22 : 22 * k);
          if (phase >= 3) {
            ctx.fillStyle = c.ink;
            ctx.font = "600 14px system-ui";
            ctx.textAlign = "center";
            ctx.fillText("same secret ✓", M, 145);
            ctx.textAlign = "start";
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    if (!reduce) raf = requestAnimationFrame(frame);
    else frame();
    return () => cancelAnimationFrame(raf);
  }, [kind, theme]);
  return <canvas ref={ref} aria-hidden />;
}

export default function Home() {
  const { audience, setAudience } = useAudience();
  const completed = useProgress((s) => s.completed);
  const achievements = useProgress((s) => Object.keys(s.achievements).length);
  const reset = useProgress((s) => s.reset);
  const count = (c: ConceptId, a: string) => Object.keys(completed).filter((k) => k.startsWith(`${c}/${a}/`)).length;
  return (
    <>
      <section className="home-hero">
        <HeroCanvas />
        <div className="inner">
          <div className="kicker" style={{ marginBottom: 12 }}>
            An interactive playground for randomness
          </div>
          <h1>
            Roll the dice.
            <br />
            <span className="grad">Learn the universe.</span>
          </h1>
          <p>
            Throw darts at π. Teach the weather to forget. Whisper a secret across a crowded room.
            <br />
            Three beautiful ideas — Monte Carlo, Markov chains and Diffie–Hellman — explained by playing with them.
          </p>
          <div className="who" role="group" aria-label="Who are you today?">
            {AUDIENCES.map((a) => (
              <button key={a.id} aria-pressed={audience === a.id} onClick={() => setAudience(a.id)}>
                <b>
                  {a.emoji} {a.label}
                </b>
                <small>{a.blurb}</small>
              </button>
            ))}
          </div>
        </div>
      </section>
      <div className="page" style={{ paddingTop: 10 }}>
        <div className="concept-cards">
          {CONCEPTS.map((c) => (
            <Link key={c.id} to={`/${c.id}`} className="concept-card" style={{ ["--c" as string]: c.color }}>
              <MiniCanvas kind={c.id} />
              <div className="body">
                <h3>
                  {c.emoji} {c.label}
                </h3>
                <p>{c.tagline}</p>
                <div className="go">
                  Start the {AUDIENCES.find((a) => a.id === audience)!.label.toLowerCase()} track →
                </div>
              </div>
            </Link>
          ))}
        </div>

        <h2 className="section-title">Three ideas, one theme: randomness as a tool</h2>
        <div className="split-3">
          <div className="card">
            <div className="kicker" style={{ color: "var(--mc)" }}>
              Estimation
            </div>
            <h3>🎯 Monte Carlo</h3>
            <p className="dim">Can't solve it? Simulate it. Random samples reveal answers too tangled for formulas — from π to pension funds to Pixar's lighting.</p>
          </div>
          <div className="card">
            <div className="kicker" style={{ color: "var(--mk)" }}>
              Prediction
            </div>
            <h3>🔗 Markov chains</h3>
            <p className="dim">Random steps that forget the past still have a predictable long run. Your keyboard, Google and the weather all ride on it.</p>
          </div>
          <div className="card">
            <div className="kicker" style={{ color: "var(--dh)" }}>
              Security
            </div>
            <h3>🔐 Diffie–Hellman</h3>
            <p className="dim">Random secrets plus one-way maths let strangers agree on a key in public. Every 🔒 in your browser starts this way.</p>
          </div>
        </div>
        <p style={{ marginTop: 18 }}>
          <Link to="/connections" className="btn wrap">
            🌀 See how they connect: MCMC & the dark side of random numbers →
          </Link>
        </p>

        <h2 className="section-title">Your progress</h2>
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="data">
            <thead>
              <tr>
                <th />
                {AUDIENCES.map((a) => (
                  <th key={a.id} className="num">
                    {a.emoji} {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CONCEPTS.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b style={{ color: c.color }}>
                      {c.emoji} {c.label}
                    </b>
                  </td>
                  {AUDIENCES.map((a) => {
                    const done = count(c.id, a.id);
                    const total = CHAPTERS_BY_AUD[c.id][a.id];
                    return (
                      <td key={a.id} className="num">
                        <Link to={`/${c.id}/${a.id}`} className={done === total ? "good" : ""} style={{ textDecoration: "none" }}>
                          {done === total ? "✓ " : ""}
                          {done}/{total}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <span className="pill accent">🏅 {achievements} achievements</span>
            <button className="btn small ghost" onClick={() => confirm("Reset all progress and achievements?") && reset()}>
              Reset progress
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
