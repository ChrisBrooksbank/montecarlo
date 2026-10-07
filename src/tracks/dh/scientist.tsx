import { useMemo, useState } from "react";
import { ChartFrame } from "../../components/charts";
import { CodeLab } from "../../components/CodeLab";
import { Tex } from "../../components/Tex";
import { Seg, Slider, Stat } from "../../components/ui";
import {
  babyStepGiantStep, curvePoints, ecMul, ecOrbit, factorize, isPrimeNum, isProbablePrime, isValidCurve, modPowNum, multiplicativeOrder, pohligHellman, randomSafePrime, smallestGeneratorSafePrime, type Curve, type ECPoint,
} from "../../lib/diffiehellman";
import { secureRandomBigInt } from "../../lib/random";
import { Clock } from "../../sims/Clock";
import type { Track } from "../../types";

const PRIMES = Array.from({ length: 260 }, (_, i) => i).filter(isPrimeNum).filter((p) => p >= 5);
const ORDER_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--ink-dim)"];

function phi(n: number): number {
  let r = n;
  for (const [q] of factorize(n)) r = (r / q) * (q - 1);
  return r;
}

// ─── 1. Group explorer ────────────────────────────────────────────────

function GroupExplorer() {
  const [p, setP] = useState(23);
  const [g, setG] = useState(5);
  const orders = useMemo(() => Array.from({ length: p - 1 }, (_, i) => multiplicativeOrder(i + 1, p)), [p]);
  const divisors = useMemo(() => Array.from({ length: p - 1 }, (_, i) => i + 1).filter((d) => (p - 1) % d === 0), [p]);
  const ord = multiplicativeOrder(g, p);
  const nGen = orders.filter((o) => o === p - 1).length;
  const fact = [...factorize(p - 1)].map(([q, e]) => (e > 1 ? `${q}^${e}` : `${q}`)).join("\\cdot ");
  const gSafe = Math.min(g, p - 1);
  return (
    <div className="split">
      <div>
        <Clock p={p} g={gSafe} k={ord} maxSize={360} />
        <div className="controls">
          <Slider label="Prime p" value={PRIMES.indexOf(p)} min={0} max={PRIMES.length - 1} onChange={(i) => { setP(PRIMES[i]); setG((x) => Math.min(x, PRIMES[i] - 1)); }} format={() => String(p)} />
          <Slider label="Element g" value={gSafe} min={1} max={p - 1} onChange={setG} />
        </div>
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <p>
          <Tex>{`(\\mathbb Z/${p}\\mathbb Z)^\\times`}</Tex> is cyclic of order <Tex>{`${p - 1} = ${fact}`}</Tex>. Element <Tex>{`g=${gSafe}`}</Tex> generates a subgroup of order <b>{ord}</b>
          {ord === p - 1 ? " — the whole group: a primitive root." : `, a proper subgroup (index ${(p - 1) / ord}).`}
        </p>
        <div className="stats">
          <Stat label="ord(g)" value={ord} className={ord === p - 1 ? "good" : ""} />
          <Stat label="# generators" value={nGen} sub={<Tex>{`\\varphi(${p - 1}) = ${phi(p - 1)}`}</Tex>} />
          <Stat label="Subgroups" value={divisors.length} sub="one per divisor" />
        </div>
        <div>
          <div className="faint" style={{ fontSize: "0.82rem", marginBottom: 6 }}>
            Every element, coloured by its order (Lagrange: orders divide p − 1):
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {orders.map((o, i) => (
              <button key={i} onClick={() => setG(i + 1)} title={`ord(${i + 1}) = ${o}`} className="mono" style={{ width: 34, height: 26, fontSize: 11, borderRadius: 4, cursor: "pointer", border: i + 1 === gSafe ? "2px solid var(--ink)" : "1px solid var(--line)", background: `color-mix(in srgb, ${ORDER_COLORS[divisors.indexOf(o) % ORDER_COLORS.length]} ${o === p - 1 ? 60 : 22}%, var(--bg))`, color: "var(--ink)" }}>
                {i + 1}
              </button>
            ))}
          </div>
          <div className="legend">
            {divisors.map((d, i) => (
              <span key={d} style={{ ["--c" as string]: ORDER_COLORS[i % ORDER_COLORS.length] }}>
                order {d}: {orders.filter((o) => o === d).length}
              </span>
            ))}
          </div>
        </div>
        <p className="dim" style={{ fontSize: "0.9rem" }}>
          DH works in the subgroup <Tex>{"\\langle g\\rangle"}</Tex>, so its order — not <Tex>p</Tex> — sets the security. If <Tex>{"\\operatorname{ord}(g)"}</Tex> has only small prime factors, the DLP splits into easy pieces (next chapter). Hence <b>safe primes</b> <Tex>{"p=2q+1"}</Tex>: the only subgroups have order 1, 2, <Tex>q</Tex>, <Tex>2q</Tex>.
        </p>
      </div>
    </div>
  );
}

// ─── 2. Attacks & parameter choice ────────────────────────────────────

function smoothPrime(bits: number): number {
  const small = [2, 3, 5, 7, 11, 13, 17, 19, 23];
  for (;;) {
    let n = 2;
    while (Math.log2(n) < bits - 1) n *= small[Math.floor(Math.random() * small.length)];
    if (Math.log2(n) > bits + 0.5) continue;
    if (isProbablePrime(BigInt(n + 1))) return n + 1;
  }
}

interface AttackResult {
  name: string;
  steps: number;
  ms: number;
  ok: boolean;
  note: string;
}

function Attacks() {
  const [bits, setBits] = useState(28);
  const [kind, setKind] = useState<"smooth" | "safe">("smooth");
  const [res, setRes] = useState<{ p: number; g: number; x: number; fac: string; results: AttackResult[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const p = kind === "smooth" ? smoothPrime(bits) : Number(randomSafePrime(bits));
      let g = 2;
      if (kind === "safe") g = Number(smallestGeneratorSafePrime(BigInt(p)));
      else while (multiplicativeOrder(g, p) !== p - 1) g++;
      const x = Number(secureRandomBigInt(2n, BigInt(p - 2)));
      const h = modPowNum(g, x, p);
      const results: AttackResult[] = [];
      const factors = factorize(p - 1);
      const fac = [...factors].map(([q, e]) => (e > 1 ? `${q}^{${e}}` : `${q}`)).join("\\cdot ");

      // Brute force (Number arithmetic; capped).
      {
        const t0 = performance.now();
        let cur = 1;
        let k = 0;
        const cap = 2e8;
        while (cur !== h && k < cap) {
          cur = (cur * g) % p;
          k++;
        }
        results.push({ name: "Brute force", steps: k, ms: performance.now() - t0, ok: cur === h, note: cur === h ? "O(n)" : `gave up after ${cap.toExponential(0)} steps` });
      }
      // BSGS
      {
        const t0 = performance.now();
        const r = babyStepGiantStep(BigInt(g), BigInt(h), BigInt(p), BigInt(p - 1));
        results.push({ name: "Baby-step giant-step", steps: 2 * Math.ceil(Math.sqrt(p - 1)), ms: performance.now() - t0, ok: r !== null && modPowNum(g, Number(r), p) === h, note: "O(√n) time and memory" });
      }
      // Pohlig–Hellman (only feasible when p−1 is smooth)
      const maxQe = Math.max(...[...factors].map(([q, e]) => q ** e));
      if (maxQe < 5e6) {
        const t0 = performance.now();
        const r = pohligHellman(g, h, p);
        results.push({ name: "Pohlig–Hellman", steps: [...factors].reduce((s, [q, e]) => s + e * q, 0), ms: performance.now() - t0, ok: modPowNum(g, r.x, p) === h, note: `${r.parts.length} sub-problems + CRT` });
      } else {
        results.push({ name: "Pohlig–Hellman", steps: maxQe, ms: NaN, ok: false, note: `largest prime-power factor ≈ ${maxQe.toExponential(1)} — no shortcut` });
      }
      setRes({ p, g, x, fac, results });
      setBusy(false);
    }, 30);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="controls">
        <Seg options={[{ value: "smooth", label: "p − 1 smooth (bad)" }, { value: "safe", label: "safe prime p = 2q + 1" }]} value={kind} onChange={setKind} />
        <Slider label="Bits" value={bits} min={16} max={34} onChange={setBits} />
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy ? "Attacking…" : "⚔️ Generate & attack"}
        </button>
      </div>
      {res && (
        <>
          <div className="panel" style={{ fontSize: "0.92rem" }}>
            <Tex>{`p = ${res.p},\\quad p-1 = ${res.fac},\\quad g = ${res.g},\\quad h = g^x,\\; x = ${res.x}`}</Tex>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>Attack</th>
                <th className="num">group ops</th>
                <th className="num">time</th>
                <th>result</th>
              </tr>
            </thead>
            <tbody>
              {res.results.map((r) => (
                <tr key={r.name}>
                  <td>
                    <b>{r.name}</b>
                    <div className="faint" style={{ fontSize: "0.8rem" }}>
                      {r.note}
                    </div>
                  </td>
                  <td className="num">{r.steps.toLocaleString()}</td>
                  <td className="num">{Number.isFinite(r.ms) ? `${r.ms.toFixed(1)} ms` : "—"}</td>
                  <td className={r.ok ? "good" : "bad"}>{r.ok ? "✓ recovered x" : "✗"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="split">
        <div>
          <p>
            <b>Pohlig–Hellman</b> reduces a DLP in a group of order <Tex>{"n=\\prod q_i^{e_i}"}</Tex> to DLPs in subgroups of order <Tex>{"q_i^{e_i}"}</Tex> (map with <Tex>{"h\\mapsto h^{n/q_i^{e_i}}"}</Tex>), then glues with the CRT. Cost <Tex>{"\\tilde O\\big(\\sum e_i\\sqrt{q_i}\\big)"}</Tex>: only the <i>largest prime factor</i> of the group order matters.
          </p>
        </div>
        <div>
          <p>
            <b>Generic lower bound</b> (Shoup 1997): any algorithm using only group operations needs <Tex>{"\\Omega(\\sqrt{q})"}</Tex> steps in a group of prime order <Tex>q</Tex>. BSGS and Pollard-ρ are optimal generically. In <Tex>{"\\mathbb F_p^\\times"}</Tex>, index calculus / NFS exploit extra structure — subexponential <Tex>{"L_p[1/3, 1.923]"}</Tex> — which is why finite-field DH needs 2048+ bits while elliptic curves (no known index calculus) get away with 256.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── 3. Elliptic curves ───────────────────────────────────────────────

function RealCurve() {
  const [a, setA] = useState(-2);
  const [b, setB] = useState(2);
  const [xp, setXp] = useState(-1.4);
  const [xq, setXq] = useState(0.6);
  const f = (x: number) => x ** 3 + a * x + b;
  const yAt = (x: number) => (f(x) >= 0 ? Math.sqrt(f(x)) : NaN);
  const P = { x: xp, y: yAt(xp) };
  const Q = { x: xq, y: yAt(xq) };
  const valid = Number.isFinite(P.y) && Number.isFinite(Q.y);
  let R: { x: number; y: number } | null = null;
  let third: { x: number; y: number } | null = null;
  let slope = 0;
  if (valid) {
    if (Math.abs(P.x - Q.x) < 1e-9) slope = (3 * P.x ** 2 + a) / (2 * P.y);
    else slope = (Q.y - P.y) / (Q.x - P.x);
    const x3 = slope ** 2 - P.x - Q.x;
    const y3 = slope * (P.x - x3) - P.y;
    R = { x: x3, y: y3 };
    third = { x: x3, y: -y3 };
  }
  const pts: string[] = [];
  const neg: string[] = [];
  return (
    <div>
      <ChartFrame height={300} xDomain={[-3, 3.5]} yDomain={[-5, 5]} title="Chord-and-tangent over ℝ: P + Q = −(third intersection)">
        {(sx, sy) => {
          pts.length = 0;
          neg.length = 0;
          for (let i = 0; i <= 900; i++) {
            const x = -3 + (6.5 * i) / 900;
            const y = yAt(x);
            if (Number.isFinite(y)) {
              pts.push(`${sx(x)},${sy(y)}`);
              neg.push(`${sx(x)},${sy(-y)}`);
            } else {
              pts.push("|");
              neg.push("|");
            }
          }
          const seg = (arr: string[]) => arr.join(" ").split("|").filter((s) => s.trim()).map((s, i) => <polyline key={i} points={s} fill="none" stroke="var(--accent)" strokeWidth={2.2} />);
          return (
            <>
              {seg(pts)}
              {seg(neg)}
              {valid && R && third && (
                <>
                  <line x1={sx(-3)} y1={sy(P.y + slope * (-3 - P.x))} x2={sx(3.5)} y2={sy(P.y + slope * (3.5 - P.x))} stroke="var(--ink-faint)" strokeWidth={1.3} />
                  <line x1={sx(third.x)} y1={sy(third.y)} x2={sx(R.x)} y2={sy(R.y)} stroke="var(--ink-faint)" strokeDasharray="4 4" />
                  {[
                    { pt: P, l: "P", c: "var(--s1)" },
                    { pt: Q, l: "Q", c: "var(--s2)" },
                    { pt: third, l: "", c: "var(--ink-faint)" },
                    { pt: R, l: "P+Q", c: "var(--s5)" },
                  ].map(({ pt, l, c }, i) => (
                    <g key={i}>
                      <circle cx={sx(pt.x)} cy={sy(pt.y)} r={6} fill={c} />
                      {l && (
                        <text x={sx(pt.x) + 9} y={sy(pt.y) - 8} style={{ fill: c, fontWeight: 700, fontSize: 13 }}>
                          {l}
                        </text>
                      )}
                    </g>
                  ))}
                </>
              )}
            </>
          );
        }}
      </ChartFrame>
      <div className="controls">
        <Slider label="a" value={a} min={-4} max={2} step={0.1} onChange={setA} />
        <Slider label="b" value={b} min={-1} max={4} step={0.1} onChange={setB} />
        <Slider label="P.x" value={xp} min={-3} max={3} step={0.01} onChange={setXp} />
        <Slider label="Q.x" value={xq} min={-3} max={3} step={0.01} onChange={setXq} />
      </div>
      {!valid && <p className="faint">Move P or Q onto the curve (where x³ + ax + b ≥ 0).</p>}
    </div>
  );
}

function FiniteCurve() {
  const [p, setP] = useState(97);
  const [a, setA] = useState(2);
  const [b, setB] = useState(3);
  const [gi, setGi] = useState(3);
  const [k, setK] = useState(5);
  const [sa, setSa] = useState(7);
  const [sb, setSb] = useState(11);
  const c: Curve = { a, b, p };
  const valid = isValidCurve(c);
  const pts = useMemo(() => (valid ? curvePoints(c) : []), [a, b, p, valid]); // eslint-disable-line react-hooks/exhaustive-deps
  const G: ECPoint = pts[gi % Math.max(1, pts.length)] ?? null;
  const orbit = useMemo(() => (G ? ecOrbit(G, c) : []), [G?.x, G?.y, a, b, p]); // eslint-disable-line react-hooks/exhaustive-deps
  const order = orbit.length + 1;
  const kG = G ? ecMul(k, G, c) : null;
  const A = G ? ecMul(sa, G, c) : null;
  const B = G ? ecMul(sb, G, c) : null;
  const S1 = ecMul(sa, B, c);
  const S2 = ecMul(sb, A, c);
  const show = (P: ECPoint) => (P ? `(${P.x}, ${P.y})` : "𝒪");
  const visible = orbit.slice(0, k);
  return (
    <div className="split">
      <div>
        <ChartFrame height={340} xDomain={[-1, p]} yDomain={[-1, p]} title={`y² = x³ + ${a}x + ${b}  over 𝔽${p} — ${pts.length + 1} points (incl. 𝒪)`}>
          {(sx, sy) => (
            <>
              {visible.length > 1 && <polyline points={visible.map((P) => `${sx(P!.x)},${sy(P!.y)}`).join(" ")} fill="none" stroke="var(--s4)" strokeWidth={1} opacity={0.6} />}
              {pts.map((P, i) => (
                <circle key={i} cx={sx(P.x)} cy={sy(P.y)} r={i === gi % pts.length ? 6 : 3.2} fill={i === gi % pts.length ? "var(--s3)" : "var(--s2)"} opacity={0.85} style={{ cursor: "pointer" }} onClick={() => setGi(i)} />
              ))}
              {kG && <circle cx={sx(kG.x)} cy={sy(kG.y)} r={8} fill="none" stroke="var(--s1)" strokeWidth={3} />}
            </>
          )}
        </ChartFrame>
        <p className="faint" style={{ fontSize: "0.82rem" }}>
          Click a point to make it the base point G (yellow). Pink ring: kG. Purple path: G, 2G, …, kG — note how it scatters.
        </p>
      </div>
      <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
        <div className="controls" style={{ margin: 0 }}>
          <Slider label="p" value={PRIMES.indexOf(p)} min={PRIMES.indexOf(11)} max={PRIMES.length - 1} onChange={(i) => setP(PRIMES[i])} format={() => String(p)} />
          <Slider label="a" value={a} min={0} max={10} onChange={setA} />
          <Slider label="b" value={b} min={0} max={10} onChange={setB} />
        </div>
        {!valid && <div className="callout bad">Singular curve (4a³ + 27b² ≡ 0 mod p) — pick other a, b.</div>}
        {G && (
          <>
            <Slider label="k" value={k} min={1} max={Math.max(1, order)} onChange={setK} />
            <div className="stats">
              <Stat label="G" value={show(G)} />
              <Stat label="ord(G)" value={order} sub={isPrimeNum(order) ? "prime ✓" : `= ${[...factorize(order)].map(([q, e]) => (e > 1 ? `${q}^${e}` : q)).join("·")}`} />
              <Stat label="kG" value={show(kG)} />
            </div>
            <div className="panel" style={{ display: "grid", gap: 6 }}>
              <b>ECDH on this curve</b>
              <div className="controls" style={{ margin: 0 }}>
                <Slider label="Alice's a" value={sa} min={1} max={Math.max(2, order - 1)} onChange={setSa} />
                <Slider label="Bob's b" value={sb} min={1} max={Math.max(2, order - 1)} onChange={setSb} />
              </div>
              <div className="mono" style={{ fontSize: "0.88rem" }}>
                A = aG = {show(A)} · B = bG = {show(B)}
                <br />
                a·B = {show(S1)} · b·A = {show(S2)} <span className={JSON.stringify(S1) === JSON.stringify(S2) ? "good" : "bad"}>{JSON.stringify(S1) === JSON.stringify(S2) ? "✓ equal" : "✗"}</span>
              </div>
            </div>
          </>
        )}
        <p className="dim" style={{ fontSize: "0.9rem" }}>
          Same protocol, different group: scalar multiplication <Tex>{"k\\mapsto kG"}</Tex> replaces exponentiation. Hasse: <Tex>{"|\\#E(\\mathbb F_p) - (p+1)| \\le 2\\sqrt p"}</Tex>. Real curves (Curve25519, P-256) have <Tex>{"p\\approx 2^{255}"}</Tex> and a base point of large prime order, so the best attack is Pollard-ρ at ~2¹²⁸ operations.
        </p>
      </div>
    </div>
  );
}

function Curves() {
  const [mode, setMode] = useState<"real" | "finite">("real");
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Seg options={[{ value: "real", label: "Geometry over ℝ" }, { value: "finite", label: "The group over 𝔽ₚ" }]} value={mode} onChange={setMode} />
      {mode === "real" ? <RealCurve /> : <FiniteCurve />}
    </div>
  );
}

// ─── 4. Code lab ──────────────────────────────────────────────────────

const STARTER = `// Implement modular exponentiation with BigInt (square-and-multiply).
// Never compute base ** exp directly — it would have billions of digits.
function modPow(base, exp, mod) {
  let result = 1n;
  // TODO
  return result;
}

// Full Diffie–Hellman: return both parties' shared secrets.
function dh(p, g, a, b) {
  const A = modPow(g, a, p);
  const B = 0n; // TODO
  return { alice: 0n /* TODO */, bob: 0n /* TODO */ };
}
`;

const SOLUTION = `function modPow(base, exp, mod) {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
}

function dh(p, g, a, b) {
  const A = modPow(g, a, p);
  const B = modPow(g, b, p);
  return { alice: modPow(B, a, p), bob: modPow(A, b, p) };
}
`;

function Lab() {
  return (
    <CodeLab
      id="dh-modpow"
      starter={STARTER}
      solution={SOLUTION}
      tests={[
        { name: "5^6 mod 23 = 8", expr: "modPow(5n, 6n, 23n) === 8n" },
        { name: "Fermat: 3^(p−1) ≡ 1 for p = 2^127 − 1", expr: "modPow(3n, (1n << 127n) - 2n, (1n << 127n) - 1n) === 1n" },
        { name: "Edge: anything^0 = 1", expr: "modPow(12345n, 0n, 97n) === 1n" },
        { name: "textbook DH: p=23, g=5, a=6, b=15 → 2", expr: "(() => { const r = dh(23n, 5n, 6n, 15n); return r.alice === 2n && r.bob === 2n; })()" },
        { name: "2048-bit-ish exponents agree", expr: "(() => { const p = (1n << 521n) - 1n; const r = dh(p, 3n, 0xdeadbeefcafebaben ** 8n, 0x1234567890abcdefn ** 8n); return r.alice === r.bob && r.alice > 1n; })()" },
      ]}
    />
  );
}

const track: Track = {
  title: "Diffie–Hellman: groups, attacks, curves",
  tagline: "Cyclic groups, the discrete logarithm problem, why parameter choice is everything, and the move from 𝔽ₚ* to elliptic curves.",
  history: [
    { when: "1976", what: "Diffie & Hellman, IEEE Trans. Inf. Theory IT-22(6): public key distribution from the DLP; Merkle's puzzles (1974/78)." },
    { when: "1978", what: "Pohlig & Hellman: DLP is only as hard as the largest prime factor of the group order." },
    { when: "1985", what: "Koblitz and Miller independently propose elliptic-curve cryptography." },
    { when: "2006 / 2015", what: "Bernstein's Curve25519; Logjam shows many servers still accepted 512-bit export-grade DH groups." },
  ],
  chapters: [
    {
      id: "groups",
      title: "Cyclic groups on a clock",
      emoji: "🔁",
      intro: <p>The multiplicative group modulo a prime, its generators and its subgroup structure — the stage on which DH plays out.</p>,
      Widget: GroupExplorer,
      quiz: [
        {
          q: "How many primitive roots does a prime p have?",
          options: ["p − 1", "φ(p − 1)", "(p − 1)/2", "Exactly one"],
          answer: 1,
          explain: "The group is cyclic of order p − 1, and a cyclic group of order n has φ(n) generators.",
        },
      ],
    },
    {
      id: "attacks",
      title: "Attacks and parameter selection",
      emoji: "⚔️",
      intro: <p>Generate a prime with smooth p − 1 and a safe prime of the same size, then throw three discrete-log algorithms at each.</p>,
      Widget: Attacks,
      quiz: [
        {
          q: "Why are safe primes p = 2q + 1 preferred for finite-field DH?",
          options: ["They are faster to exponentiate", "The group order has a large prime factor q, defeating Pohlig–Hellman and small-subgroup attacks", "They make g = 2 always a generator", "They resist quantum computers"],
          answer: 1,
          explain: "With p − 1 = 2q the only subgroups are tiny (1, 2) or huge (q, 2q). Checking that received values aren't ±1 rules out small-subgroup confinement.",
        },
      ],
    },
    {
      id: "curves",
      title: "Elliptic-curve Diffie–Hellman",
      emoji: "➰",
      intro: <p>Points on a cubic curve form a group under chord-and-tangent addition. Over a finite field that group replaces 𝔽ₚ* — with much smaller keys for the same security.</p>,
      Widget: Curves,
    },
    {
      id: "lab",
      title: "Code lab: modPow & DH",
      emoji: "💻",
      intro: <p>Implement square-and-multiply with BigInt, then a full exchange. The last test uses a 521-bit Mersenne prime and enormous exponents.</p>,
      Widget: Lab,
    },
  ],
};

export default track;
