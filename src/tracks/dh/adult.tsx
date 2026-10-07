import { useEffect, useRef, useState, type ReactNode } from "react";
import { LineChart } from "../../components/charts";
import { Seg, Stat } from "../../components/ui";
import { modPow, randomSafePrime, smallestGeneratorSafePrime } from "../../lib/diffiehellman";
import { secureRandomBigInt } from "../../lib/random";
import { useProgress } from "../../stores/progress";
import type { Track } from "../../types";

const RFC3526_2048 = BigInt(
  "0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF",
);

function Num({ v, max = 28 }: { v: bigint | string; max?: number }) {
  const [open, setOpen] = useState(false);
  const s = v.toString();
  if (s.length <= max) return <span className="mono">{s}</span>;
  return (
    <span className="mono" style={{ wordBreak: "break-all", cursor: "pointer" }} onClick={() => setOpen((o) => !o)} title="click to expand">
      {open ? s : `${s.slice(0, max - 8)}…${s.slice(-6)}`} <small className="faint">({s.length} digits)</small>
    </span>
  );
}

// ─── 1. Key exchange ──────────────────────────────────────────────────

type Size = "tiny" | "64" | "2048";

function KeyExchange() {
  const [size, setSize] = useState<Size>("tiny");
  const [step, setStep] = useState(0);
  const [params, setParams] = useState(() => make("tiny"));
  const award = useProgress((s) => s.award);
  function make(sz: Size) {
    let p: bigint, g: bigint;
    if (sz === "tiny") [p, g] = [23n, 5n];
    else if (sz === "64") {
      p = randomSafePrime(64);
      g = smallestGeneratorSafePrime(p);
    } else [p, g] = [RFC3526_2048, 2n];
    const a = secureRandomBigInt(2n, p - 2n);
    const b = secureRandomBigInt(2n, p - 2n);
    const A = modPow(g, a, p);
    const B = modPow(g, b, p);
    return { p, g, a, b, A, B, sA: modPow(B, a, p), sB: modPow(A, b, p) };
  }
  const reset = (sz: Size) => {
    setSize(sz);
    setParams(make(sz));
    setStep(0);
  };
  useEffect(() => {
    if (step === 4 && size === "2048") award("dh-2048", "🔐", "Real-world strength", "Did a 2048-bit Diffie–Hellman exchange.");
  }, [step, size, award]);
  const { p, g, a, b, A, B, sA, sB } = params;
  const row = (who: ReactNode, alice: ReactNode, pub: ReactNode, bob: ReactNode, show: boolean) =>
    show && (
      <div className="split-3" style={{ alignItems: "start", padding: "10px 0", borderTop: "1px solid var(--line)" }}>
        <div>{alice}</div>
        <div>
          {who}
          {pub}
        </div>
        <div>{bob}</div>
      </div>
    );
  const STEPS = ["Agree on public parameters", "Pick secrets", "Exchange public keys", "Compute the shared secret", "Compare"];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="controls">
        <Seg
          options={[
            { value: "tiny", label: "Tiny (p = 23)" },
            { value: "64", label: "64-bit" },
            { value: "2048", label: "2048-bit (real)" },
          ]}
          value={size}
          onChange={reset}
        />
        <div className="btn-row">
          <button className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            ←
          </button>
          <button className="btn primary" disabled={step === 4} onClick={() => setStep((s) => s + 1)}>
            {step < 4 ? `Step ${step + 2}: ${STEPS[step + 1]} →` : "Done"}
          </button>
          <button className="btn ghost" onClick={() => reset(size)}>
            🎲 New secrets
          </button>
        </div>
      </div>
      <div className="split-3" style={{ fontWeight: 700 }}>
        <div style={{ color: "var(--s1)" }}>👩 Alice (private)</div>
        <div style={{ color: "var(--s3)" }}>📢 The wire (Eve sees all)</div>
        <div style={{ color: "var(--s2)" }}>👨 Bob (private)</div>
      </div>
      {row(
        null,
        <span className="faint">knows p, g</span>,
        <div style={{ fontSize: "0.9rem" }}>
          prime p = <Num v={p} />
          <br />
          generator g = <Num v={g} />
        </div>,
        <span className="faint">knows p, g</span>,
        true,
      )}
      {row(
        null,
        <div style={{ fontSize: "0.9rem" }}>
          🔒 secret a = <Num v={a} />
        </div>,
        <span className="faint">(nothing sent)</span>,
        <div style={{ fontSize: "0.9rem" }}>
          🔒 secret b = <Num v={b} />
        </div>,
        step >= 1,
      )}
      {row(
        null,
        <div style={{ fontSize: "0.9rem" }}>
          A = g<sup>a</sup> mod p
        </div>,
        <div style={{ fontSize: "0.9rem" }}>
          A = <Num v={A} />
          <br />B = <Num v={B} />
        </div>,
        <div style={{ fontSize: "0.9rem" }}>
          B = g<sup>b</sup> mod p
        </div>,
        step >= 2,
      )}
      {row(
        null,
        <div style={{ fontSize: "0.9rem" }}>
          s = B<sup>a</sup> mod p
          <br />= <Num v={sA} />
        </div>,
        <span className="faint">Eve has p, g, A, B… but no a or b.</span>,
        <div style={{ fontSize: "0.9rem" }}>
          s = A<sup>b</sup> mod p
          <br />= <Num v={sB} />
        </div>,
        step >= 3,
      )}
      {step >= 4 && (
        <div className={`callout ${sA === sB ? "good" : "bad"}`}>
          {sA === sB ? "✅ Identical shared secret on both sides" : "❌ mismatch?!"} — because (g<sup>b</sup>)<sup>a</sup> = (g<sup>a</sup>)<sup>b</sup> = g<sup>ab</sup>. It never crossed the wire. In real systems it is then fed through a key-derivation function to make encryption keys.
        </div>
      )}
    </div>
  );
}

// ─── 2. One-way race ──────────────────────────────────────────────────

function OneWayRace() {
  const [rows, setRows] = useState<{ bits: number; fwd: number; brute: number }[]>([]);
  const [running, setRunning] = useState(false);
  const cancel = useRef(0);
  const run = async () => {
    const id = ++cancel.current;
    setRunning(true);
    setRows([]);
    for (let bits = 8; bits <= 34; bits += 2) {
      if (id !== cancel.current) return;
      const p = randomSafePrime(bits);
      const g = smallestGeneratorSafePrime(p);
      const a = secureRandomBigInt(2n, p - 2n);
      // forward: time many modPows at the same size
      const t0 = performance.now();
      let A = 0n;
      for (let i = 0; i < 2000; i++) A = modPow(g, a, p);
      const fwd = (performance.now() - t0) / 2000;
      // backward: brute force with plain Numbers (exact for these sizes), in chunks
      const P = Number(p);
      const G = Number(g);
      const target = Number(A);
      const t1 = performance.now();
      let cur = 1;
      let found = false;
      while (!found) {
        for (let i = 0; i < 3_000_000; i++) {
          if (cur === target) {
            found = true;
            break;
          }
          cur = (cur * G) % P;
        }
        await new Promise((r) => setTimeout(r, 0));
        if (id !== cancel.current) return;
      }
      const brute = performance.now() - t1;
      setRows((r) => [...r, { bits, fwd, brute }]);
      if (brute > 2500) break;
    }
    setRunning(false);
  };
  useEffect(() => () => void cancel.current++, []);
  // Extrapolate brute force: time doubles per bit.
  const last = rows[rows.length - 1];
  const extrap = last ? Array.from({ length: 30 }, (_, i) => {
    const bits = last.bits + i * 4;
    return [bits, last.brute * 2 ** (bits - last.bits)] as [number, number];
  }) : [];
  const yearMs = 3.156e10;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="btn-row">
        <button className="btn primary" onClick={run} disabled={running}>
          {running ? "Racing…" : "🏁 Start the race"}
        </button>
        <span className="faint">Real timings, measured in your browser right now.</span>
      </div>
      <div className="split-wide">
        <LineChart
          height={300}
          yLog
          xDomain={[8, 128]}
          yDomain={[1e-4, 1e25]}
          xLabel="key size (bits)"
          yLabel="milliseconds"
          formatY={(v) => {
            const e = Math.round(Math.log10(v));
            return e % 5 === 0 ? `1e${e}` : "";
          }}
          series={[
            { data: rows.map((r) => [r.bits, r.fwd] as [number, number]), color: "var(--s5)", width: 2.5, dots: true },
            { data: rows.map((r) => [r.bits, r.brute] as [number, number]), color: "var(--s1)", width: 2.5, dots: true },
            { data: extrap, color: "var(--s1)", width: 1.5, dash: "5 5" },
          ]}
          hLines={[
            { value: 1000, label: "1 second", color: "var(--ink-faint)" },
            { value: yearMs, label: "1 year", color: "var(--ink-faint)" },
            { value: 1.38e10 * yearMs, label: "age of the universe", color: "var(--s3)" },
          ]}
          legend={[
            { label: "computing gᵃ mod p (easy)", color: "var(--s5)" },
            { label: "finding a by brute force (hard)", color: "var(--s1)" },
          ]}
        />
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          {last && (
            <div className="stats">
              <Stat label={`Forward @ ${last.bits} bits`} value={`${(last.fwd * 1000).toFixed(1)} µs`} />
              <Stat label={`Backward @ ${last.bits} bits`} value={`${(last.brute / 1000).toFixed(2)} s`} />
            </div>
          )}
          <p className="dim" style={{ fontSize: "0.92rem" }}>
            Going forward barely gets slower as numbers grow (square-and-multiply needs only ~2 multiplications per bit). Going backward by brute force <b>doubles</b> with every extra bit. The dashed line extrapolates: brute force passes the age of the universe somewhere around 100 bits.
          </p>
          <p className="dim" style={{ fontSize: "0.92rem" }}>
            Real attackers use much smarter algorithms than brute force (the number field sieve), which is why real DH uses 2048+ bits rather than 128 — but the gap between forward and backward stays astronomical.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── 3. Man in the middle ─────────────────────────────────────────────

function MITM() {
  const [mallory, setMallory] = useState(true);
  const [signed, setSigned] = useState(false);
  const [stage, setStage] = useState(0);
  const p = 23n;
  const g = 5n;
  const [a, b, m] = [6n, 15n, 13n];
  const A = modPow(g, a, p);
  const B = modPow(g, b, p);
  const M = modPow(g, m, p);
  const kAlice = mallory && !signed ? modPow(M, a, p) : modPow(B, a, p);
  const kBob = mallory && !signed ? modPow(M, b, p) : modPow(A, b, p);
  const attackLive = mallory && !signed;
  const box = (title: string, color: string, body: ReactNode) => (
    <div className="panel" style={{ borderTop: `4px solid ${color}`, display: "grid", gap: 6, alignContent: "start", fontSize: "0.92rem" }}>
      <b style={{ color }}>{title}</b>
      {body}
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="controls">
        <label className="btn-row">
          <input type="checkbox" checked={mallory} onChange={(e) => setMallory(e.target.checked)} /> 😈 Mallory controls the network
        </label>
        <label className="btn-row">
          <input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} /> ✍️ Public keys are signed (certificates)
        </label>
        <div className="btn-row">
          <button className="btn" disabled={stage === 0} onClick={() => setStage((s) => s - 1)}>
            ←
          </button>
          <button className="btn primary" disabled={stage === 2} onClick={() => setStage((s) => s + 1)}>
            {["Exchange keys →", "Send a message →", "Done"][stage]}
          </button>
        </div>
      </div>
      <div className="split-3">
        {box("👩 Alice", "var(--s1)", (
          <>
            <div>secret a = {a.toString()}, sends A = {A.toString()}</div>
            {stage >= 1 && <div>received “Bob's” key: <b>{attackLive ? M.toString() : B.toString()}</b>{attackLive && <span className="bad"> (actually Mallory's!)</span>}</div>}
            {stage >= 1 && <div>her key: <b className="mono">{kAlice.toString()}</b></div>}
            {stage >= 2 && <div>✉️ sends 🔒[“Meet at 9pm”] with key {kAlice.toString()}</div>}
          </>
        ))}
        {box(mallory ? "😈 Mallory (in the middle)" : "🕵️ Eve (just listening)", mallory ? "var(--bad)" : "var(--s3)", (
          <>
            {!mallory && <div>Sees A = {A.toString()} and B = {B.toString()}. Can't compute the key without a or b.</div>}
            {mallory && signed && <div>Tries to swap in her own key M = {M.toString()}… but she can't forge Alice's or Bob's <b>signature</b>. Both sides reject the fake. 🛡️</div>}
            {attackLive && (
              <>
                <div>Intercepts A and B. Sends her own M = {M.toString()} to both.</div>
                {stage >= 1 && <div>Key with Alice: <b className="mono">{modPow(A, m, p).toString()}</b> · key with Bob: <b className="mono">{modPow(B, m, p).toString()}</b></div>}
                {stage >= 2 && (
                  <div className="bad">
                    Decrypts “Meet at 9pm”, rewrites it to <b>“Meet at 10pm”</b>, re-encrypts with Bob's key. Nobody notices. 😱
                  </div>
                )}
              </>
            )}
          </>
        ))}
        {box("👨 Bob", "var(--s2)", (
          <>
            <div>secret b = {b.toString()}, sends B = {B.toString()}</div>
            {stage >= 1 && <div>received “Alice's” key: <b>{attackLive ? M.toString() : A.toString()}</b>{attackLive && <span className="bad"> (actually Mallory's!)</span>}</div>}
            {stage >= 1 && <div>his key: <b className="mono">{kBob.toString()}</b></div>}
            {stage >= 2 && <div>📬 decrypts: <b className={attackLive ? "bad" : "good"}>“Meet at {attackLive ? "10pm" : "9pm"}”</b></div>}
          </>
        ))}
      </div>
      {stage >= 1 && (
        <div className={`callout ${attackLive ? "bad" : "good"}`}>
          {attackLive
            ? `Alice's key (${kAlice}) ≠ Bob's key (${kBob}). Each thinks they're talking to the other — they're both talking to Mallory.`
            : `Alice and Bob share key ${kAlice}. ${mallory ? "Signatures stopped Mallory." : "Eve can only watch."}`}
        </div>
      )}
      <p className="dim">
        Diffie–Hellman alone protects against <b>eavesdroppers</b>, not against someone who can <b>change</b> messages. That's why your browser checks the website's <b>certificate</b>: the server signs its DH share, and a certificate authority vouches for whose signature it is.
      </p>
    </div>
  );
}

// ─── 4. Real crypto in your browser ───────────────────────────────────

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");

interface Party {
  keys: CryptoKeyPair;
  pubHex: string;
}

function RealMessenger() {
  const [alice, setAlice] = useState<Party | null>(null);
  const [bob, setBob] = useState<Party | null>(null);
  const [shared, setShared] = useState<{ a: string; b: string; aesA: CryptoKey; aesB: CryptoKey } | null>(null);
  const [msg, setMsg] = useState("Meet me by the old oak tree at midnight 🌳");
  const [wire, setWire] = useState<{ iv: Uint8Array; ct: ArrayBuffer } | null>(null);
  const [received, setReceived] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const award = useProgress((s) => s.award);
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;

  const gen = async (): Promise<Party> => {
    const keys = (await subtle!.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"])) as CryptoKeyPair;
    const raw = await subtle!.exportKey("raw", keys.publicKey);
    return { keys, pubHex: hex(raw) };
  };
  const setup = async () => {
    try {
      setErr(null);
      setShared(null);
      setWire(null);
      setReceived(null);
      const [a, b] = await Promise.all([gen(), gen()]);
      setAlice(a);
      setBob(b);
      const bitsA = await subtle!.deriveBits({ name: "ECDH", public: b.keys.publicKey }, a.keys.privateKey, 256);
      const bitsB = await subtle!.deriveBits({ name: "ECDH", public: a.keys.publicKey }, b.keys.privateKey, 256);
      const kdf = async (bits: ArrayBuffer) => {
        const base = await subtle!.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
        return subtle!.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(16), info: new TextEncoder().encode("montecarlo demo") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      };
      setShared({ a: hex(bitsA), b: hex(bitsB), aesA: await kdf(bitsA), aesB: await kdf(bitsB) });
    } catch (e) {
      setErr(`Web Crypto isn't available here (${String(e)}). It needs a secure (https or localhost) page.`);
    }
  };
  useEffect(() => {
    if (subtle) void setup();
    else setErr("Web Crypto isn't available here. It needs a secure (https or localhost) page.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const send = async () => {
    if (!shared) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle!.encrypt({ name: "AES-GCM", iv }, shared.aesA, new TextEncoder().encode(msg));
    setWire({ iv, ct });
    const pt = await subtle!.decrypt({ name: "AES-GCM", iv }, shared.aesB, ct);
    setReceived(new TextDecoder().decode(pt));
    award("real-crypto", "📨", "Real crypto", "Sent an ECDH + AES-GCM encrypted message.");
  };
  if (err) return <div className="callout bad">{err}</div>;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="split-3">
        <div className="panel" style={{ borderTop: "4px solid var(--s1)", display: "grid", gap: 8, alignContent: "start" }}>
          <b style={{ color: "var(--s1)" }}>👩 Alice's browser</b>
          <small className="faint">private key: locked inside Web Crypto (non-extractable)</small>
          <textarea className="text-input" value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} />
          <button className="btn primary" onClick={send} disabled={!shared}>
            🔒 Encrypt & send
          </button>
        </div>
        <div className="panel" style={{ borderTop: "4px solid var(--s3)", display: "grid", gap: 8, alignContent: "start", fontSize: "0.82rem" }}>
          <b style={{ color: "var(--s3)" }}>📢 The wire (Eve's view)</b>
          <div>
            Alice's public key: <span className="mono" style={{ wordBreak: "break-all" }}>{alice?.pubHex.slice(0, 42)}…</span>
          </div>
          <div>
            Bob's public key: <span className="mono" style={{ wordBreak: "break-all" }}>{bob?.pubHex.slice(0, 42)}…</span>
          </div>
          {wire && (
            <div>
              Ciphertext: <span className="mono" style={{ wordBreak: "break-all", color: "var(--s1)" }}>{hex(wire.ct)}</span>
            </div>
          )}
        </div>
        <div className="panel" style={{ borderTop: "4px solid var(--s2)", display: "grid", gap: 8, alignContent: "start" }}>
          <b style={{ color: "var(--s2)" }}>👨 Bob's browser</b>
          {received !== null ? (
            <div className="callout good" style={{ fontSize: "1.05rem" }}>
              📬 {received}
            </div>
          ) : (
            <span className="faint">waiting for a message…</span>
          )}
        </div>
      </div>
      {shared && (
        <div className="panel mono" style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>
          <div>Alice's shared secret: {shared.a}</div>
          <div>Bob's shared secret:&nbsp;&nbsp; {shared.b}</div>
          <div className={shared.a === shared.b ? "good" : "bad"}>{shared.a === shared.b ? "✅ identical — and never transmitted" : "❌ mismatch"}</div>
        </div>
      )}
      <div className="btn-row">
        <button className="btn ghost" onClick={setup}>
          🎲 New key pairs
        </button>
        <span className="faint" style={{ fontSize: "0.85rem" }}>
          ECDH on curve P-256 → HKDF-SHA256 → AES-256-GCM. The same building blocks your browser used to load this page.
        </span>
      </div>
    </div>
  );
}

// ─── 5. TLS walkthrough ───────────────────────────────────────────────

const TLS_STEPS: { from: "C" | "S"; msg: string; enc: boolean; dh?: boolean; explain: string }[] = [
  { from: "C", msg: "ClientHello + key_share", enc: false, dh: true, explain: "Your browser says hello, lists the ciphers it supports, and — already — sends its Diffie–Hellman public value (usually on curve X25519). That's 'A'." },
  { from: "S", msg: "ServerHello + key_share", enc: false, dh: true, explain: "The server picks a cipher and sends its own DH public value 'B'. Both sides can now compute the shared secret. Everything after this is encrypted." },
  { from: "S", msg: "Certificate", enc: true, explain: "The server's certificate: its long-term public key, signed by a certificate authority your browser trusts." },
  { from: "S", msg: "CertificateVerify", enc: true, explain: "The server signs the handshake so far (including both DH values) with its certificate key. This is what defeats the man in the middle." },
  { from: "S", msg: "Finished", enc: true, explain: "A MAC over the whole handshake, keyed from the DH secret — proves nothing was tampered with." },
  { from: "C", msg: "Finished", enc: true, explain: "The browser checks the certificate and signature, then sends its own Finished." },
  { from: "C", msg: "GET /  (application data)", enc: true, explain: "Your actual request, encrypted with keys derived from the DH secret. One round trip, and the padlock appears 🔒." },
];

function TLSWalkthrough() {
  const [i, setI] = useState(0);
  return (
    <div className="split">
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>💻 Your browser</span>
          <span>🖥️ example.com</span>
        </div>
        {TLS_STEPS.map((s, k) => (
          <div
            key={k}
            onClick={() => setI(k)}
            style={{
              cursor: "pointer",
              opacity: k <= i ? 1 : 0.25,
              display: "flex",
              justifyContent: s.from === "C" ? "flex-start" : "flex-end",
              transition: "opacity .3s",
            }}
          >
            <div
              style={{
                width: "78%",
                padding: "8px 12px",
                borderRadius: 10,
                background: s.dh ? "color-mix(in srgb, var(--accent) 22%, var(--bg-3))" : "var(--bg-3)",
                border: k === i ? "2px solid var(--accent)" : "2px solid transparent",
                fontSize: "0.9rem",
                textAlign: s.from === "C" ? "left" : "right",
              }}
            >
              {s.from === "C" ? "→ " : "← "}
              {s.enc ? "🔒 " : ""}
              <b>{s.msg}</b>
              {s.dh && <span className="pill accent" style={{ marginLeft: 6 }}>DH</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <div className="kicker">
          Step {i + 1} of {TLS_STEPS.length}
        </div>
        <h3 style={{ margin: 0 }}>{TLS_STEPS[i].msg}</h3>
        <p>{TLS_STEPS[i].explain}</p>
        <div className="btn-row">
          <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>
            ← Back
          </button>
          <button className="btn primary" disabled={i === TLS_STEPS.length - 1} onClick={() => setI(i + 1)}>
            Next →
          </button>
        </div>
        <p className="dim" style={{ fontSize: "0.9rem" }}>
          TLS 1.3 (2018) made ephemeral Diffie–Hellman <b>mandatory</b>: fresh secrets for every connection, thrown away afterwards. Even if the server's long-term key leaks years later, old recordings can't be decrypted. That property is called <b>forward secrecy</b>.
        </p>
      </div>
    </div>
  );
}

const track: Track = {
  title: "A secret shouted across a crowded room",
  tagline: "Every padlock in your browser starts with two computers that have never met agreeing on a secret key — in public — in a few milliseconds. Here's how.",
  history: [
    { when: "Pre-1970s", what: "Every cipher needed a key shared in advance: diplomats carried them in locked briefcases." },
    { when: "1976", what: "Diffie & Hellman's “New Directions in Cryptography” opens: “We stand today on the brink of a revolution in cryptography.”" },
    { when: "1997", what: "GCHQ reveals James Ellis, Clifford Cocks and Malcolm Williamson had found the same ideas years earlier, in secret." },
    { when: "2018", what: "TLS 1.3 makes ephemeral (EC)DH mandatory for every HTTPS connection." },
  ],
  chapters: [
    {
      id: "exchange",
      title: "The exchange, step by step",
      emoji: "🔑",
      intro: <p>Walk through a real Diffie–Hellman exchange. Start tiny so you can check the arithmetic, then switch to the 2048-bit group used on the real internet.</p>,
      Widget: KeyExchange,
      quiz: [
        {
          q: "Which values does an eavesdropper see?",
          options: ["a and b", "p, g, A and B", "Only the shared secret", "Nothing at all"],
          answer: 1,
          explain: "Everything sent is public. The security comes from how hard it is to get a or b back from A or B.",
        },
      ],
    },
    {
      id: "oneway",
      title: "Easy one way, impossible the other",
      emoji: "⏱️",
      intro: <p>Race the two directions on your own computer: computing gᵃ mod p versus recovering a from the answer.</p>,
      Widget: OneWayRace,
    },
    {
      id: "mitm",
      title: "The man in the middle",
      emoji: "😈",
      intro: <p>Diffie–Hellman has one famous weakness. Let Mallory take over the network and see what goes wrong — then fix it.</p>,
      Widget: MITM,
      quiz: [
        {
          q: "What stops a man-in-the-middle attack on Diffie–Hellman?",
          options: ["Bigger prime numbers", "Authenticating the public values (signatures/certificates)", "Sending the secret twice", "Using paint"],
          answer: 1,
          explain: "Bigger numbers stop eavesdroppers; only authentication stops someone who can substitute messages.",
        },
      ],
    },
    {
      id: "real",
      title: "Real cryptography, in your browser",
      emoji: "📨",
      intro: <p>No toy numbers this time. Your browser just generated two real elliptic-curve key pairs. Send a message from Alice to Bob.</p>,
      Widget: RealMessenger,
    },
    {
      id: "tls",
      title: "What happened when you loaded this page",
      emoji: "🔒",
      intro: <p>The TLS 1.3 handshake, message by message. Diffie–Hellman is in the very first two messages.</p>,
      Widget: TLSWalkthrough,
    },
  ],
};

export default track;
