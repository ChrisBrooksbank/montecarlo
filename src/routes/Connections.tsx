import { useEffect, useMemo, useRef, useState } from "react";
import { Seg, Slider } from "../components/ui";
import { cssVar, setupCanvas, useAnimationFrame, useThemeKey, useWidth } from "../hooks";
import { mulberry32 } from "../lib/random";
import { MetropolisSampler } from "../sims/Metropolis";

/** IBM's infamous RANDU: x_{k+1} = 65539 · x_k mod 2^31. */
function randu(n: number, seed = 1): Float64Array {
  const out = new Float64Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = Number((BigInt(x) * 65539n) % 2147483648n);
    out[i] = x / 2147483648;
  }
  return out;
}

function RanduCube() {
  const [gen, setGen] = useState<"randu" | "good">("randu");
  const [angle, setAngle] = useState(0.3);
  const [spin, setSpin] = useState(true);
  const [ref, w] = useWidth<HTMLDivElement>();
  const cv = useRef<HTMLCanvasElement>(null);
  const theme = useThemeKey();
  const size = Math.min(440, w);
  const pts = useMemo(() => {
    const N = 3 * 6000;
    const s = gen === "randu" ? randu(N) : (() => {
      const r = mulberry32(1);
      return Float64Array.from({ length: N }, () => r());
    })();
    return s;
  }, [gen]);
  useAnimationFrame((dt) => setAngle((a) => a + dt * 0.35), spin);
  useEffect(() => {
    const c = cv.current;
    if (!c || size < 60) return;
    const ctx = setupCanvas(c, size, size);
    ctx.fillStyle = cssVar("--bg");
    ctx.fillRect(0, 0, size, size);
    const col = cssVar(gen === "randu" ? "--s1" : "--s2");
    // Rotate about the vertical axis, with a fixed tilt that reveals RANDU's planes at the right angle.
    const tilt = 0.42;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const S = size * 0.36;
    ctx.fillStyle = col;
    for (let i = 0; i + 2 < pts.length; i += 3) {
      const x = pts[i] - 0.5;
      const y = pts[i + 1] - 0.5;
      const z = pts[i + 2] - 0.5;
      const X = x * ca - y * sa;
      const Y = x * sa + y * ca;
      const Z2 = Y * st + z * ct;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(size / 2 + X * S * 1.6, size / 2 - Z2 * S * 1.6, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;
  }, [pts, angle, size, theme, gen]);
  return (
    <div className="split">
      <div ref={ref}>
        <canvas ref={cv} style={{ width: size, display: "block", margin: "0 auto", borderRadius: 8 }} />
        <div className="controls">
          <Seg options={[{ value: "randu", label: "RANDU (1960s)" }, { value: "good", label: "Modern PRNG" }]} value={gen} onChange={setGen} />
          <button className="btn" onClick={() => setSpin((s) => !s)}>
            {spin ? "⏸ Stop" : "▶ Spin"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setSpin(false);
              // View direction lies in the planes 9x − 6y + z = k when 9·sin a − 6·cos a = tan(tilt).
              setAngle(Math.atan2(-6, 9) * -1 + Math.asin(Math.tan(0.42) / Math.hypot(9, 6)));
            }}
          >
            🔍 Show me the planes
          </button>
        </div>
        <Slider label="Rotate" value={((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)} min={0} max={6.28} step={0.01} onChange={(v) => { setSpin(false); setAngle(v); }} format={(v) => `${Math.round((v * 180) / Math.PI)}°`} />
      </div>
      <div>
        <p>
          Each dot is three consecutive “random” numbers <span className="mono">(xₖ, xₖ₊₁, xₖ₊₂)</span> plotted as a point in a cube. A good generator fills the cube evenly from every angle.
        </p>
        <p>
          <b>RANDU</b> was IBM's standard generator in the 1960s and 70s: <span className="mono">xₖ₊₁ = 65539·xₖ mod 2³¹</span>. Spin the cube to ≈ 36° (or hit <b>Show me the planes</b>): every point lies on just <b>15 planes</b>. Because 65539 = 2¹⁶ + 3, one can show <span className="mono">xₖ₊₂ = 6xₖ₊₁ − 9xₖ (mod 2³¹)</span>.
        </p>
        <p className="dim">
          Donald Knuth called it “truly horrible”. Years of published Monte Carlo results had to be re-checked. The lesson for <b>simulation</b>: your randomness must be statistically good. The lesson for <b>cryptography</b> is harsher: it must also be <i>unpredictable</i>. Anyone who learns a PRNG's internal state can predict every future “secret” — which is why this app uses a seedable PRNG for simulations but <span className="mono">crypto.getRandomValues</span> for every Diffie–Hellman key.
        </p>
      </div>
    </div>
  );
}

export default function Connections() {
  return (
    <div className="page" data-concept="markov">
      <header className="track-hero" style={{ ["--accent" as string]: "var(--s4)" }}>
        <div className="kicker">🌀 Connections</div>
        <h1>Where the three ideas meet</h1>
        <p className="tagline">Monte Carlo + Markov chains = the algorithm behind modern Bayesian AI. And the random numbers that power simulations turn out to be a security minefield.</p>
      </header>
      <section className="chapter">
        <div className="chapter-head">
          <span className="chapter-num">01</span>
          <h2>🎲 Markov Chain Monte Carlo</h2>
        </div>
        <div className="chapter-intro">
          <p>
            Monte Carlo needs random samples from a distribution. But what if you can't sample from it directly — say, the probability of every possible protein shape, or every value of a model's parameters given your data? <b>Build a Markov chain whose stationary distribution is the one you want</b>, run it, and let it wander. Its long-run visits <i>are</i> your samples. That's MCMC, invented at Los Alamos in 1953 by Metropolis, the Rosenbluths and the Tellers.
          </p>
        </div>
        <div className="chapter-body card">
          <MetropolisSampler />
        </div>
      </section>
      <section className="chapter">
        <div className="chapter-head">
          <span className="chapter-num">02</span>
          <h2>🎰 When random numbers aren't</h2>
        </div>
        <div className="chapter-intro">
          <p>Computers can't flip coins. They fake randomness with formulas — and some fakes are terrible.</p>
        </div>
        <div className="chapter-body card">
          <RanduCube />
        </div>
      </section>
      <section className="chapter">
        <div className="chapter-head">
          <span className="chapter-num">03</span>
          <h2>🧵 The common thread</h2>
        </div>
        <div className="card">
          <table className="data">
            <thead>
              <tr>
                <th />
                <th>Randomness is used for…</th>
                <th>The key fact</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>🎯 Monte Carlo</td>
                <td>Estimation</td>
                <td>Error shrinks like 1/√N — in any number of dimensions.</td>
              </tr>
              <tr>
                <td>🔗 Markov chains</td>
                <td>Prediction</td>
                <td>Memoryless steps still converge to a stationary distribution.</td>
              </tr>
              <tr>
                <td>🔐 Diffie–Hellman</td>
                <td>Security</td>
                <td>Exponentiation is easy, the discrete log is hard.</td>
              </tr>
              <tr>
                <td>🎲 MCMC</td>
                <td>Sampling the impossible</td>
                <td>Design a chain whose stationary distribution is your target.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
