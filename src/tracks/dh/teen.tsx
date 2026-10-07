import { useEffect, useMemo, useRef, useState } from "react";
import { Slider, Stat } from "../../components/ui";
import { modPow, modPowNum, randomSafePrime, smallestGeneratorSafePrime, type RGB, mixPaint, rgbCss } from "../../lib/diffiehellman";
import { secureRandomBigInt } from "../../lib/random";
import { Clock } from "../../sims/Clock";
import { useProgress } from "../../stores/progress";
import type { Track } from "../../types";

// ─── 1. Paint mixing ──────────────────────────────────────────────────

const PALETTE: { name: string; rgb: RGB }[] = [
  { name: "Red", rgb: [230, 57, 70] },
  { name: "Blue", rgb: [29, 111, 224] },
  { name: "Green", rgb: [46, 196, 92] },
  { name: "Purple", rgb: [142, 68, 173] },
  { name: "Pink", rgb: [255, 105, 180] },
  { name: "Teal", rgb: [0, 168, 168] },
  { name: "Black", rgb: [30, 30, 36] },
  { name: "White", rgb: [245, 245, 245] },
];
const PUBLIC: RGB = [255, 212, 0];

/** A mixture is a bag of ingredients; its colour is all of them stirred together in equal parts. */
type Bag = RGB[];
const colourOf = (bag: Bag) => mixPaint(...bag);

function Pot({ bag, label, sub, big, secret }: { bag: Bag; label: string; sub?: string; big?: boolean; secret?: boolean }) {
  const s = big ? 86 : 62;
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 4, textAlign: "center" }}>
      <div
        className="bounce"
        key={rgbCss(colourOf(bag))}
        style={{ width: s, height: s, borderRadius: "50%", background: rgbCss(colourOf(bag)), boxShadow: "inset 0 -8px 14px rgba(0,0,0,.25), 0 4px 14px rgba(0,0,0,.3)", border: secret ? "3px dashed var(--ink)" : "3px solid var(--bg-2)", transition: "background .5s" }}
      />
      <b style={{ fontSize: "0.9rem" }}>
        {secret ? "🔒 " : ""}
        {label}
      </b>
      {sub && <small className="faint">{sub}</small>}
    </div>
  );
}

function PaintMixing() {
  const [alice, setAlice] = useState(0);
  const [bob, setBob] = useState(1);
  const [step, setStep] = useState(0);
  const award = useProgress((s) => s.award);
  const A = PALETTE[alice].rgb;
  const B = PALETTE[bob].rgb;
  const alicePublic: Bag = [PUBLIC, A];
  const bobPublic: Bag = [PUBLIC, B];
  const aliceShared: Bag = [...bobPublic, A];
  const bobShared: Bag = [...alicePublic, B];
  const eveTry: Bag = [...alicePublic, ...bobPublic];
  useEffect(() => {
    if (step >= 4) award("paint-spy", "🎨", "Secret Painter", "Shared a secret colour in public.");
  }, [step, award]);
  const STEPS = [
    "Alice and Bob agree — out loud, so Eve hears — on a common paint: yellow.",
    "Each secretly picks their own colour. They never, ever share it.",
    "Each mixes their secret into the yellow and sends the result. Eve sees both mixtures.",
    "Each adds their OWN secret to the mixture they received…",
    "…and they end up with exactly the same colour! Eve is stuck.",
  ];
  const col = (title: string, color: string, children: React.ReactNode) => (
    <div className="panel" style={{ display: "grid", gap: 14, justifyItems: "center", alignContent: "start", borderTop: `4px solid ${color}` }}>
      <b style={{ color }}>{title}</b>
      {children}
    </div>
  );
  const picker = (value: number, set: (v: number) => void, who: string) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }} aria-label={`${who}'s secret colour`}>
      {PALETTE.map((c, i) => (
        <button key={c.name} title={c.name} onClick={() => set(i)} style={{ width: 26, height: 26, borderRadius: "50%", background: rgbCss(c.rgb), border: value === i ? "3px solid var(--ink)" : "2px solid var(--bg-2)", cursor: "pointer" }} />
      ))}
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="callout" style={{ fontSize: "1.05rem" }}>
        <b>Step {step + 1}/5:</b> {STEPS[step]}
      </div>
      <div className="split-3">
        {col("👩 ALICE", "var(--s1)", (
          <>
            {step >= 1 && <Pot bag={[A]} label="secret" sub={PALETTE[alice].name} secret />}
            {step >= 1 && step < 3 && picker(alice, setAlice, "Alice")}
            {step >= 2 && <Pot bag={alicePublic} label="yellow + secret" sub="sent to Bob" />}
            {step >= 3 && <Pot bag={aliceShared} label="Bob's mix + my secret" big />}
          </>
        ))}
        {col("📢 PUBLIC (Eve sees this)", "var(--s3)", (
          <>
            <Pot bag={[PUBLIC]} label="common paint" sub="yellow" />
            {step >= 2 && (
              <div style={{ display: "flex", gap: 14 }}>
                <Pot bag={alicePublic} label="from Alice" />
                <Pot bag={bobPublic} label="from Bob" />
              </div>
            )}
            {step >= 4 && (
              <>
                <Pot bag={eveTry} label="🕵️ Eve mixes both" sub="too much yellow — wrong!" />
              </>
            )}
          </>
        ))}
        {col("👦 BOB", "var(--s2)", (
          <>
            {step >= 1 && <Pot bag={[B]} label="secret" sub={PALETTE[bob].name} secret />}
            {step >= 1 && step < 3 && picker(bob, setBob, "Bob")}
            {step >= 2 && <Pot bag={bobPublic} label="yellow + secret" sub="sent to Alice" />}
            {step >= 3 && <Pot bag={bobShared} label="Alice's mix + my secret" big />}
          </>
        ))}
      </div>
      <div className="btn-row" style={{ justifyContent: "center" }}>
        <button className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          ← Back
        </button>
        <button className="btn primary" disabled={step === 4} onClick={() => setStep((s) => s + 1)}>
          Next step →
        </button>
        {step === 4 && (
          <button className="btn ghost" onClick={() => setStep(0)}>
            ↺ Again with new colours
          </button>
        )}
      </div>
      {step === 4 && (
        <p className="dim">
          Both secret colours are made of <b>yellow + Alice's colour + Bob's colour</b> — just stirred in a different order. Eve has the two public mixes, but combining them gives <b>two</b> parts yellow. To get it right she'd have to <b>un-mix</b> paint, and nobody can do that.
        </p>
      )}
    </div>
  );
}

// ─── 2. Clock maths ───────────────────────────────────────────────────

function ClockMaths() {
  const [a, setA] = useState(6);
  const p = 23;
  const g = 5;
  const steps = useMemo(() => {
    const out: { k: number; prev: number; times: number; result: number }[] = [];
    let v = 1;
    for (let k = 1; k <= a; k++) {
      const times = v * g;
      out.push({ k, prev: v, times, result: times % p });
      v = times % p;
    }
    return out;
  }, [a]);
  return (
    <div className="split">
      <div>
        <Clock p={p} g={g} k={a} />
        <Slider label="Secret number (how many times to multiply by 5)" value={a} min={1} max={22} onChange={setA} />
      </div>
      <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
        <p>
          Paint is a nice story, but computers use <b>clock maths</b>. On a 23-hour clock, after 22 comes 0 again. To “mix in” your secret number, start at 1 and multiply by 5, again and again, wrapping around the clock each time.
        </p>
        <div className="panel mono" style={{ fontSize: "0.88rem", maxHeight: 220, overflow: "auto" }}>
          {steps.map((s) => (
            <div key={s.k}>
              5<sup>{s.k}</sup>: {s.prev} × 5 = {s.times}
              {s.times >= p ? ` → wraps to ${s.result}` : ""}
            </div>
          ))}
        </div>
        <div className="callout">
          Going forward is easy: <b className="mono">5^{a} mod 23 = {modPowNum(g, a, p)}</b>. But look at the path on the clock — it jumps all over the place. If I told you only the answer, could you work out my secret number? That's the <b>one-way</b> trick.
        </div>
      </div>
    </div>
  );
}

// ─── 3. Be Eve ────────────────────────────────────────────────────────

interface Round {
  p: bigint;
  g: bigint;
  label: string;
}

const ROUNDS: Round[] = [
  { p: 23n, g: 5n, label: "Tiny clock" },
  { p: 107n, g: 2n, label: "Small clock" },
  { p: 1019n, g: 2n, label: "Medium clock" },
  { p: 0n, g: 0n, label: "A 30-bit clock" },
  { p: 0n, g: 0n, label: "A real-world clock (2048 bits)" },
];

function BeEve() {
  const [round, setRound] = useState(0);
  const [params, setParams] = useState(() => newRound(0));
  const [guess, setGuess] = useState("");
  const [tries, setTries] = useState<{ x: string; v: string; ok: boolean }[]>([]);
  const [won, setWon] = useState(false);
  const [bot, setBot] = useState<string | null>(null);
  const award = useProgress((s) => s.award);
  const botRun = useRef(0);
  const LIMIT = 50;
  const left = LIMIT - tries.length;

  function newRound(r: number) {
    let { p, g } = ROUNDS[r];
    if (r === 3) {
      p = randomSafePrime(30);
      g = smallestGeneratorSafePrime(p);
    }
    if (r === 4) {
      // RFC 3526 group 14 (2048-bit MODP), generator 2.
      p = BigInt("0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF");
      g = 2n;
    }
    const a = secureRandomBigInt(2n, p - 2n);
    return { p, g, a, A: modPow(g, a, p) };
  }

  const start = (r: number) => {
    botRun.current++;
    setRound(r);
    setParams(newRound(r));
    setTries([]);
    setWon(false);
    setBot(null);
    setGuess("");
  };

  const submit = () => {
    if (!guess.trim() || won || left <= 0) return;
    let x: bigint;
    try {
      x = BigInt(guess.trim());
    } catch {
      return;
    }
    const v = modPow(params.g, x, params.p);
    const ok = v === params.A;
    setTries((t) => [...t, { x: x.toString(), v: v.toString(), ok }]);
    setGuess("");
    if (ok) {
      setWon(true);
      award(`eve-${round}`, "🕵️", `Eve cracked round ${round + 1}`, `Found the secret for p = ${params.p.toString().slice(0, 12)}`);
    }
  };

  const unleash = () => {
    if (round === 4) {
      setBot("🤖 Even trying a trillion guesses per second, checking every possibility would take around 10⁵⁹⁷ years. The universe is about 1.4 × 10¹⁰ years old. (Clever algorithms do much better than guessing, but 2048-bit keys still hold.)");
      return;
    }
    // Brute force in chunks (plain Numbers are exact here: p < 2^31, g < 2^8) so the page stays responsive.
    const P = Number(params.p);
    const G = Number(params.g);
    const target = Number(params.A);
    const t0 = performance.now();
    let cur = 1;
    let x = 0;
    const id = ++botRun.current;
    setBot("🤖 Trying every number…");
    const chunk = () => {
      if (id !== botRun.current) return;
      for (let i = 0; i < 4_000_000; i++) {
        if (cur === target) {
          const ms = performance.now() - t0;
          setBot(`🤖 The computer tried ${x.toLocaleString()} numbers in ${ms < 1000 ? `${ms.toFixed(1)} ms` : `${(ms / 1000).toFixed(2)} s`} and found the secret: a = ${x}. For a computer, ${round < 3 ? "this clock is a joke" : "a 30-bit clock is still easy"}.`);
          return;
        }
        cur = (cur * G) % P;
        x++;
      }
      setBot(`🤖 Tried ${x.toLocaleString()} numbers so far…`);
      setTimeout(chunk, 0);
    };
    setTimeout(chunk, 0);
  };

  const pStr = params.p.toString();
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="btn-row">
        {ROUNDS.map((r, i) => (
          <button key={i} className={`btn small ${i === round ? "primary" : ""}`} onClick={() => start(i)}>
            {i + 1}. {r.label}
          </button>
        ))}
      </div>
      <div className="split">
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div className="panel mono" style={{ fontSize: "0.9rem", wordBreak: "break-all" }}>
            <div>clock size p = {pStr.length > 40 ? `${pStr.slice(0, 24)}…(${pStr.length} digits)` : pStr}</div>
            <div>multiplier g = {params.g.toString()}</div>
            <div>
              Alice sent A = <b style={{ color: "var(--accent)" }}>{params.A.toString().length > 40 ? params.A.toString().slice(0, 24) + "…" : params.A.toString()}</b>
            </div>
          </div>
          <p>
            🕵️ You're Eve. Find Alice's secret number <b>a</b> so that <span className="mono">g^a mod p = A</span>. You get {LIMIT} guesses.
          </p>
          <div className="btn-row">
            <input className="text-input mono" style={{ width: 200 }} inputMode="numeric" placeholder="your guess for a" value={guess} disabled={won || left <= 0} onChange={(e) => setGuess(e.target.value.replace(/[^0-9]/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} />
            <button className="btn primary" onClick={submit} disabled={won || left <= 0}>
              Guess
            </button>
            <button className="btn" onClick={unleash}>
              🤖 Unleash a computer
            </button>
          </div>
          <div className="stats">
            <Stat label="Guesses left" value={left} className={left < 10 ? "bad" : ""} />
            <Stat label="Possible secrets" value={pStr.length > 12 ? `~10^${pStr.length - 1}` : (params.p - 2n).toLocaleString()} />
          </div>
          {won && <div className="callout good">🎉 Cracked it! a = {tries[tries.length - 1].x}. {round < 4 ? "Ready for a bigger clock?" : ""}</div>}
          {!won && left <= 0 && <div className="callout bad">💥 Out of guesses. The secret was {params.a.toString().length > 30 ? "…a very long number" : params.a.toString()}.</div>}
          {bot && <div className="callout">{bot}</div>}
          {won && round < 4 && (
            <button className="btn primary" onClick={() => start(round + 1)}>
              Next round →
            </button>
          )}
        </div>
        <div>
          <div className="faint" style={{ fontSize: "0.85rem", marginBottom: 6 }}>
            Your guesses — notice the answers give no “warmer/colder” clue:
          </div>
          <div className="panel mono" style={{ fontSize: "0.85rem", maxHeight: 300, overflow: "auto", display: "grid", gap: 2 }}>
            {tries.length === 0 && <span className="faint">No guesses yet.</span>}
            {tries
              .slice()
              .reverse()
              .map((t, i) => (
                <div key={i} className={t.ok ? "good" : ""}>
                  a = {t.x} → {t.v.length > 30 ? t.v.slice(0, 24) + "…" : t.v} {t.ok ? "✅" : "✗"}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 4. Spy story ─────────────────────────────────────────────────────

function SpyBriefing() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="callout" style={{ fontSize: "1.02rem", lineHeight: 1.7 }}>
        📁 <b>MISSION BRIEFING.</b> Agents Alice and Bob have never met. Every message between them passes through a café Wi-Fi run by the notorious Eve, who logs everything. Headquarters needs them to agree on a secret code word <i>tonight</i>. They have a clock size p = 23 and multiplier g = 5.
        <br />
        Alice picks secret <b>a = 6</b> and sends <b>A = 5⁶ mod 23 = 8</b>. Bob picks secret <b>b = 15</b> and sends <b>B = 5¹⁵ mod 23 = 19</b>.
        <br />
        Alice computes 19⁶ mod 23. Bob computes 8¹⁵ mod 23. Use the quiz below to complete the mission.
      </div>
    </div>
  );
}

const track: Track = {
  title: "Share a secret while everyone's watching",
  tagline: "How do you agree on a password with a friend if someone is reading every single message? It sounds impossible. It's how every padlock icon on the internet works.",
  history: [
    { when: "Ancient times", what: "To send secret messages you first had to MEET to agree on a key. Armies used couriers. Couriers got caught." },
    { when: "1974", what: "Student Ralph Merkle invents a public key idea for a class project. His professor rejects it." },
    { when: "1976", what: "Whitfield Diffie & Martin Hellman publish the trick you're about to learn. It changes the world." },
    { when: "1997", what: "Plot twist: British spies at GCHQ had secretly invented it first — and weren't allowed to tell anyone." },
  ],
  chapters: [
    {
      id: "paint",
      title: "The paint-mixing trick",
      emoji: "🎨",
      intro: <p>Pick secret colours for Alice and Bob, then step through the exchange. Keep an eye on what Eve can see.</p>,
      Widget: PaintMixing,
      takeaway: (
        <>
          <b>One-way function:</b> easy to do (mixing), practically impossible to undo (un-mixing). Every bit of internet security is built on things like this.
        </>
      ),
      quiz: [
        {
          q: "What does Eve NEVER get to see?",
          options: ["The yellow paint", "Alice's mixed paint", "Bob's mixed paint", "Alice's and Bob's secret colours"],
          answer: 3,
          explain: "The secrets never leave home. Everything else is public — and that's fine.",
        },
      ],
    },
    {
      id: "clock",
      title: "Clock maths: the real thing",
      emoji: "🕐",
      intro: <p>Computers can't mix paint, so they use a clock instead. Slide the secret number and watch the answer jump around.</p>,
      Widget: ClockMaths,
    },
    {
      id: "eve",
      title: "Be Eve: crack the code",
      emoji: "🕵️",
      intro: <p>You see everything Alice sends. Can you find her secret? Start with a tiny clock — then watch what happens as it grows.</p>,
      Widget: BeEve,
      takeaway: (
        <>
          <b>Size is security.</b> With a 23-hour clock you can guess the secret. Real clocks have more than 600 digits — more possible secrets than atoms in the universe.
        </>
      ),
    },
    {
      id: "mission",
      title: "Mission: secret code word",
      emoji: "📁",
      intro: <p>Put it all together. Do the maths with Alice and Bob — and prove Eve is out of luck.</p>,
      Widget: SpyBriefing,
      quiz: [
        {
          q: "Alice computes 19⁶ mod 23. Bob computes 8¹⁵ mod 23. What secret do they both get?",
          options: ["8", "19", "2", "They get different numbers"],
          answer: 2,
          explain: "Both get 2! Because (5¹⁵)⁶ = (5⁶)¹⁵ = 5⁹⁰ — the same number, just multiplied in a different order. That's the paint trick in maths.",
        },
        {
          q: "Eve knows p = 23, g = 5, A = 8 and B = 19. Why can't she just multiply A × B?",
          options: ["She can — the secret is 8 × 19", "That gives 5⁶⁺¹⁵, not 5⁶ˣ¹⁵ — like mixing both paints with double yellow", "Multiplying is illegal", "Because 23 is prime"],
          answer: 1,
          explain: "A × B = 5²¹ mod 23, but the secret is 5⁹⁰ mod 23. Eve would need a or b to get there.",
        },
        {
          q: "With p = 23, could Eve crack it anyway?",
          options: ["No, never", "Yes — there are only 22 possibilities to try", "Only with a quantum computer", "Only if she knows the colour"],
          answer: 1,
          explain: "Tiny numbers are easy to brute force. That's why real systems use numbers with hundreds of digits.",
        },
      ],
    },
  ],
};

export default track;
