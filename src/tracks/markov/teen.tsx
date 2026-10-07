import { useEffect, useMemo, useRef, useState } from "react";
import { Bars, Histogram } from "../../components/charts";
import { MatrixEditor } from "../../components/MatrixEditor";
import { StateDiagram } from "../../components/StateDiagram";
import { Seg, Slider, Stat } from "../../components/ui";
import { useAnimationFrame } from "../../hooks";
import { histogram } from "../../lib/montecarlo";
import { normalizeRows, stationary, step, tokenize, vecMat, type Matrix } from "../../lib/markov";
import { mulberry32, randomSeed } from "../../lib/random";
import { useProgress } from "../../stores/progress";
import type { Track } from "../../types";

// ─── 1. Predictive text ───────────────────────────────────────────────

const CORPORA: Record<string, string> = {
  "Fairy tale": `Once upon a time there was a little fox who lived in a dark forest. The fox was clever and the fox was hungry. One day the fox met a tall bear in the forest. The bear was sleepy and the bear was grumpy. The little fox asked the bear for some honey. The bear laughed and the bear said no. So the clever fox found a tree full of honey and the fox climbed the tree. The bees were angry and the bees chased the fox out of the forest. The fox ran to the river and the fox jumped in the river. The bees went home and the fox laughed. Once upon a time there was a happy fox who lived by the river and never ate honey again. The end.`,
  "Group chat": `omg did you see that video it was so funny i literally cannot. i cannot believe he said that in class. did you finish the homework i did not finish the homework lol. i am so tired i literally slept for one hour. are you coming to the party on friday i am coming to the party if you are coming. omg that party was so good i cannot wait for the next party. did you see what she posted it was so cute. i literally cannot stop laughing at that video. are you free after school i am free after school. lol same i am so tired of homework. that is so funny i cannot.`,
  "Pirate log": `ahoy the captain says we sail at dawn. the sea be rough and the crew be hungry. the captain says the treasure be buried on the island. we found a map and the map says the treasure be under the old palm tree. the crew dug all day and the crew found nothing but sand. the parrot says the captain be a fool. the captain says the parrot be dinner. we sail at dawn to find the real treasure. the sea be calm and the crew be singing. ahoy the island be in sight and the treasure be ours.`,
};

type Model = Map<string, Map<string, number>>;

function buildModel(words: string[], order: number): Model {
  const m: Model = new Map();
  for (let i = order; i < words.length; i++) {
    const key = words.slice(i - order, i).join(" ");
    if (!m.has(key)) m.set(key, new Map());
    const row = m.get(key)!;
    row.set(words[i], (row.get(words[i]) ?? 0) + 1);
  }
  return m;
}

function TextPredictor() {
  const [corpus, setCorpus] = useState("Fairy tale");
  const [custom, setCustom] = useState("");
  const [order, setOrder] = useState(1);
  const [text, setText] = useState("the fox");
  const source = corpus === "Your own" ? custom : CORPORA[corpus];
  const words = useMemo(() => tokenize(source), [source]);
  const model = useMemo(() => buildModel(words, order), [words, order]);
  const typed = tokenize(text);
  const key = typed.slice(-order).join(" ");
  const row = model.get(key);
  const total = row ? [...row.values()].reduce((a, b) => a + b, 0) : 0;
  const preds = row ? [...row.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6) : [];
  const award = useProgress((s) => s.award);

  const append = (w: string) => setText((t) => (/[.!?]/.test(w) ? t.trimEnd() + w : `${t.trimEnd()} ${w}`));
  const autocomplete = () => {
    const rng = mulberry32(randomSeed());
    const out = tokenize(text);
    for (let i = 0; i < 25; i++) {
      const r = model.get(out.slice(-order).join(" "));
      if (!r) break;
      const entries = [...r.entries()];
      let u = rng() * entries.reduce((a, [, c]) => a + c, 0);
      let pick = entries[0][0];
      for (const [w, c] of entries) {
        u -= c;
        if (u < 0) {
          pick = w;
          break;
        }
      }
      out.push(pick);
    }
    setText(out.join(" ").replace(/ ([.!?])/g, "$1"));
    award("babbler", "🦜", "Markov Babbler", "Generated text from a Markov chain.");
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="controls">
        <Seg options={[...Object.keys(CORPORA), "Your own"].map((c) => ({ value: c, label: c }))} value={corpus} onChange={setCorpus} />
        <div>
          <div className="slider-top" style={{ marginBottom: 4 }}>
            Memory
          </div>
          <Seg
            options={[
              { value: 1, label: "1 word" },
              { value: 2, label: "2 words" },
              { value: 3, label: "3 words" },
            ]}
            value={order}
            onChange={setOrder}
          />
        </div>
      </div>
      {corpus === "Your own" && <textarea className="text-input" placeholder="Paste a song, a story, your messages… anything! More text = smarter predictions." value={custom} onChange={(e) => setCustom(e.target.value)} />}
      <input className="text-input" style={{ fontSize: "1.15rem" }} value={text} onChange={(e) => setText(e.target.value)} aria-label="Type here" />
      <div>
        <div className="faint" style={{ fontSize: "0.85rem", marginBottom: 6 }}>
          After “<b className="mono">{key || "…"}</b>” the chain predicts:
        </div>
        {preds.length ? (
          <Bars
            items={preds.map(([w, c], i) => ({
              label: (
                <button className="word-chip" onClick={() => append(w)}>
                  {w}
                </button>
              ),
              value: c / total,
              color: i === 0 ? "var(--accent)" : "var(--s4)",
            }))}
          />
        ) : (
          <div className="callout">🤷 The chain has never seen “{key}” followed by anything. It's stuck! Try another word from the text.</div>
        )}
      </div>
      <div className="btn-row">
        <button className="btn primary" onClick={autocomplete} disabled={!preds.length}>
          ✨ Let the chain write 25 words
        </button>
        <button className="btn ghost" onClick={() => setText(typed.slice(0, 2).join(" "))}>
          ↺ Shorten
        </button>
      </div>
      <p className="dim" style={{ fontSize: "0.92rem" }}>
        With <b>1 word</b> of memory it's creative but chaotic. With <b>3 words</b> it mostly copies the original text — it has seen too few 3-word combos. That trade-off (more memory needs way more data) is exactly why real AI needed the whole internet.
      </p>
    </div>
  );
}

// ─── 2. Playlist shuffler ─────────────────────────────────────────────

const GENRES = [
  { label: "Rock", emoji: "🎸", color: "var(--s1)", songs: ["Thunder Road Trip", "Amp It Up", "Garage Gods", "Loud & Proud"] },
  { label: "Pop", emoji: "🎤", color: "var(--s3)", songs: ["Glitter Heart", "Summer Text", "Bubblegum Sky", "Replay Me"] },
  { label: "Lo-fi", emoji: "🎧", color: "var(--s2)", songs: ["Rainy Window", "Study Cat", "3am Noodles", "Soft Static"] },
  { label: "Classical", emoji: "🎻", color: "var(--s4)", songs: ["Moonlight-ish", "Four Seasons Remix", "Waltz of Snacks", "Tiny Symphony"] },
];

function playlistMatrix(sticky: number): Matrix {
  const base: Matrix = [
    [0, 0.5, 0.3, 0.2],
    [0.4, 0, 0.5, 0.1],
    [0.2, 0.4, 0, 0.4],
    [0.1, 0.2, 0.7, 0],
  ];
  return base.map((row, i) => row.map((v, j) => (i === j ? sticky : v * (1 - sticky))));
}

function Playlist() {
  const [sticky, setSticky] = useState(0.4);
  const P = useMemo(() => playlistMatrix(sticky), [sticky]);
  const [state, setState] = useState(0);
  const [history, setHistory] = useState<number[]>([0]);
  const [counts, setCounts] = useState([1, 0, 0, 0]);
  const [trans, setTrans] = useState<{ from: number; to: number; key: number } | null>(null);
  const [auto, setAuto] = useState(false);
  const rng = useRef(mulberry32(randomSeed()));
  const timer = useRef(0);
  const pi = useMemo(() => stationary(P), [P]);
  const total = counts.reduce((a, b) => a + b, 0);

  const next = (k = 1) => {
    let s = state;
    const c = counts.slice();
    const h: number[] = [];
    let last = s;
    for (let i = 0; i < k; i++) {
      last = s;
      s = step(P, s, rng.current);
      c[s]++;
      h.push(s);
    }
    setTrans({ from: last, to: s, key: Date.now() + Math.random() });
    setState(s);
    setCounts(c);
    setHistory((old) => [...old, ...h].slice(-12));
  };
  useAnimationFrame((dt) => {
    timer.current += dt;
    if (timer.current > 0.6) {
      timer.current = 0;
      next();
    }
  }, auto);

  const song = (g: number, i: number) => GENRES[g].songs[(i * 7 + g * 3) % 4];
  return (
    <div className="split">
      <div>
        <StateDiagram states={GENRES} matrix={P} active={state} transition={trans} height={320} dist={counts.map((c) => c / total)} />
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <div className="callout" style={{ fontSize: "1.1rem" }}>
          ▶️ Now playing: <b>{GENRES[state].emoji} {song(state, history.length)}</b> <span className="faint">({GENRES[state].label})</span>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", fontSize: 22 }} aria-label="Recently played">
          {history.map((g, i) => (
            <span key={i} style={{ opacity: 0.35 + (0.65 * (i + 1)) / history.length }}>
              {GENRES[g].emoji}
            </span>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn primary" onClick={() => next()}>
            ⏭ Next song
          </button>
          <button className="btn" onClick={() => setAuto((a) => !a)}>
            {auto ? "⏸ Stop shuffle" : "🔀 Auto-shuffle"}
          </button>
          <button className="btn" onClick={() => next(1000)}>
            ⏩ Skip 1,000 songs
          </button>
        </div>
        <Slider label="Stickiness (chance to stay in the same genre)" value={sticky} min={0} max={0.9} step={0.05} onChange={setSticky} format={(v) => `${Math.round(v * 100)}%`} />
        <div>
          <div className="faint" style={{ fontSize: "0.85rem", marginBottom: 6 }}>
            Share of songs played (bar) vs long-run share the maths predicts (line), after {total.toLocaleString()} songs
          </div>
          <Bars items={GENRES.map((g, i) => ({ label: `${g.emoji} ${g.label}`, value: counts[i] / total, color: g.color, target: pi[i] }))} />
        </div>
      </div>
    </div>
  );
}

// ─── 3. Emoji state builder ───────────────────────────────────────────

const EMOJI_BANK = ["😴", "🍕", "🎮", "📚", "🏀", "📱", "🛁", "🐶", "🎨", "😂"];
const COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];

function EmojiBuilder() {
  const [picked, setPicked] = useState<string[]>(["😴", "🍕", "🎮"]);
  const [P, setP] = useState<Matrix>(() => normalizeRows([[5, 3, 2], [2, 1, 6], [3, 4, 3]]));
  const [state, setState] = useState(0);
  const [counts, setCounts] = useState<number[]>([1, 0, 0]);
  const [trans, setTrans] = useState<{ from: number; to: number; key: number } | null>(null);
  const [running, setRunning] = useState(false);
  const rng = useRef(mulberry32(randomSeed()));
  const acc = useRef(0);

  const toggle = (e: string) => {
    const next = picked.includes(e) ? picked.filter((x) => x !== e) : [...picked, e];
    if (next.length < 2 || next.length > 5) return;
    const n = next.length;
    setPicked(next);
    setP(normalizeRows(Array.from({ length: n }, () => Array.from({ length: n }, () => 0.2 + rng.current()))));
    setState(0);
    setCounts(Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0)));
  };
  useAnimationFrame((dt) => {
    acc.current += dt;
    if (acc.current < 0.35) return;
    acc.current = 0;
    const s = step(P, state, rng.current);
    setTrans({ from: state, to: s, key: Math.random() });
    setState(s);
    setCounts((c) => c.map((v, i) => v + (i === s ? 1 : 0)));
  }, running);

  const states = picked.map((e, i) => ({ label: `state ${i + 1}`, emoji: e, color: COLORS[i] }));
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <div className="faint" style={{ fontSize: "0.85rem", marginBottom: 6 }}>
          Pick 2–5 things you do (your states):
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {EMOJI_BANK.map((e) => (
            <button key={e} className="btn" aria-pressed={picked.includes(e)} style={{ fontSize: 22, padding: "4px 10px", borderColor: picked.includes(e) ? "var(--accent)" : undefined }} onClick={() => toggle(e)}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <div className="split">
        <StateDiagram states={states} matrix={P} active={state} transition={trans} dist={counts.map((c) => c / total)} height={300} />
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <MatrixEditor matrix={P} labels={picked} colors={COLORS} onChange={setP} step={0.1} />
          <div className="btn-row">
            <button className="btn primary" onClick={() => setRunning((r) => !r)}>
              {running ? "⏸ Pause" : "▶ Run my day"}
            </button>
            <button className="btn ghost" onClick={() => setCounts(picked.map((_, i) => (i === state ? 1 : 0)))}>
              Reset counts
            </button>
          </div>
          <p className="dim" style={{ fontSize: "0.9rem" }}>
            Each row says “if I'm doing <i>this</i>, what do I do next?”. Rows must add up to 1 — hit <b>Normalize</b> if they don't. The coloured rings fill up with how often you've been in each state.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── 4. Snakes & Ladders ──────────────────────────────────────────────

const BOARD = 36;
const JUMPS: Record<number, number> = { 3: 16, 8: 12, 14: 26, 21: 31, 17: 4, 24: 10, 33: 20, 29: 22 };

function snakesMatrix(): Matrix {
  const P: Matrix = Array.from({ length: BOARD + 1 }, () => new Array(BOARD + 1).fill(0));
  for (let s = 0; s <= BOARD; s++) {
    if (s === BOARD) {
      P[s][s] = 1;
      continue;
    }
    for (let d = 1; d <= 6; d++) {
      let t = s + d;
      if (t > BOARD) t = s; // must land exactly
      t = JUMPS[t] ?? t;
      P[s][t] += 1 / 6;
    }
  }
  return P;
}

function Snakes() {
  const P = useMemo(snakesMatrix, []);
  const [pos, setPos] = useState(0);
  const [rolls, setRolls] = useState(0);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [games, setGames] = useState<number[]>([]);
  const rng = useRef(mulberry32(randomSeed()));
  // exact distribution of game length: P(finished by turn t)
  const exact = useMemo(() => {
    let v = new Array(BOARD + 1).fill(0);
    v[0] = 1;
    const pmf: number[] = [];
    let prev = 0;
    for (let t = 1; t <= 150; t++) {
      v = vecMat(v, P);
      pmf.push(v[BOARD] - prev);
      prev = v[BOARD];
    }
    const mean = pmf.reduce((s, p, i) => s + p * (i + 1), 0);
    return { pmf, mean };
  }, [P]);

  const roll = () => {
    const d = 1 + Math.floor(rng.current() * 6);
    let t = pos + d;
    if (t > BOARD) t = pos;
    t = JUMPS[t] ?? t;
    setLastRoll(d);
    setPos(t);
    setRolls((r) => r + 1);
    if (t === BOARD) setGames((g) => [...g, rolls + 1]);
  };
  const simulate = () => {
    const out: number[] = [];
    for (let g = 0; g < 5000; g++) {
      let s = 0;
      let n = 0;
      while (s !== BOARD && n < 1000) {
        s = step(P, s, rng.current);
        n++;
      }
      out.push(n);
    }
    setGames((g) => [...g, ...out]);
  };
  const h = histogram(games, 40, 0.5, 80.5);
  const avg = games.length ? games.reduce((a, b) => a + b, 0) / games.length : 0;
  const cells = Array.from({ length: BOARD }, (_, i) => i + 1);
  const rowOf = (n: number) => Math.floor((n - 1) / 6);
  return (
    <div className="split">
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4, maxWidth: 360, margin: "0 auto" }}>
          {cells
            .slice()
            .sort((a, b) => rowOf(b) - rowOf(a) || (rowOf(a) % 2 ? b - a : a - b))
            .map((n) => {
              const j = JUMPS[n];
              return (
                <div key={n} style={{ aspectRatio: "1", borderRadius: 8, background: pos === n ? "var(--accent)" : "var(--bg-3)", color: pos === n ? "var(--bg)" : "var(--ink-dim)", display: "grid", placeItems: "center", fontSize: 12, position: "relative", border: j ? `2px solid ${j > n ? "var(--s5)" : "var(--bad)"}` : "2px solid transparent" }} title={j ? `${j > n ? "Ladder" : "Snake"} to ${j}` : undefined}>
                  <span>{n}</span>
                  {j && <span style={{ fontSize: 15, position: "absolute", bottom: 1 }}>{j > n ? `🪜${j}` : `🐍${j}`}</span>}
                  {pos === n && <span style={{ position: "absolute", top: -2, fontSize: 18 }}>🧍</span>}
                </div>
              );
            })}
        </div>
        <div className="btn-row" style={{ marginTop: 12, justifyContent: "center" }}>
          <button className="btn primary big" onClick={roll} disabled={pos === BOARD}>
            🎲 Roll {lastRoll !== null && <span className="mono">({lastRoll})</span>}
          </button>
          <button className="btn" onClick={() => { setPos(0); setRolls(0); setLastRoll(null); }}>
            New game
          </button>
        </div>
        <p className="faint" style={{ textAlign: "center", fontSize: "0.85rem" }}>
          {pos === BOARD ? `🏆 You won in ${rolls} rolls!` : `Square ${pos} · ${rolls} rolls · must land exactly on 36`}
        </p>
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <p>
          Your next square depends <b>only</b> on where you are now plus the dice — not how you got there. That makes this a pure Markov chain, so maths can predict the whole game.
        </p>
        <button className="btn" onClick={simulate}>
          🤖 Simulate 5,000 games
        </button>
        <Histogram height={180} title="How many rolls a game takes" counts={h.counts} lo={h.lo} hi={h.hi} normalize color="var(--s4)" overlay={[{ data: exact.pmf.slice(0, 80).map((p, i) => [i + 1, p] as [number, number]), color: "var(--s3)", width: 2 }]} formatY={() => ""} xLabel="rolls" />
        <div className="stats">
          <Stat label="Games simulated" value={games.length.toLocaleString()} />
          <Stat label="Average (simulated)" value={games.length ? avg.toFixed(2) : "—"} />
          <Stat label="Average (exact maths)" value={exact.mean.toFixed(2)} />
        </div>
        <p className="faint" style={{ fontSize: "0.85rem" }}>
          The yellow line is computed exactly by pushing probability through the transition matrix one roll at a time — no simulation needed.
        </p>
      </div>
    </div>
  );
}

// ─── 5. Memoryless Master ─────────────────────────────────────────────

const SCENARIOS = [
  { text: "A board game where your next square depends only on your current square and a dice roll.", markov: true, why: "Classic Markov: the dice don't care how you got here." },
  { text: "Blackjack, where the cards already dealt change what's left in the deck.", markov: false, why: "History matters — unless you make the state the whole remaining deck (card counters do exactly that!)." },
  { text: "A frog hopping between lily pads, choosing randomly among the pads next to it.", markov: true, why: "Next pad depends only on the current pad." },
  { text: "Your mood today depends on your mood the last 7 days.", markov: false, why: "With one-day state, that's not Markov… but make the state “last 7 moods” and it becomes one. That trick is used everywhere." },
  { text: "A robot vacuum that picks a random direction each time it bumps a wall.", markov: true, why: "The next move depends only on where it is now." },
  { text: "A streaming service suggesting your next song based on every song you've ever played.", markov: false, why: "It uses your whole history — not memoryless (although many simple shufflers are)." },
];

function MemorylessMaster() {
  const [answers, setAnswers] = useState<(boolean | null)[]>(SCENARIOS.map(() => null));
  const award = useProgress((s) => s.award);
  const score = answers.filter((a, i) => a === SCENARIOS[i].markov).length;
  const done = answers.every((a) => a !== null);
  useEffect(() => {
    if (done && score === SCENARIOS.length) award("memoryless-master", "🧠", "Memoryless Master", "Spotted every Markov chain.");
  }, [done, score, award]);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {SCENARIOS.map((s, i) => {
        const a = answers[i];
        return (
          <div key={i} className="panel">
            <p style={{ margin: 0 }}>{s.text}</p>
            <div className="btn-row" style={{ marginTop: 8 }}>
              {[true, false].map((v) => (
                <button key={String(v)} className={`btn small ${a === v ? (v === s.markov ? "good" : "bad") : ""}`} disabled={a !== null} onClick={() => setAnswers((x) => x.map((y, j) => (j === i ? v : y)))}>
                  {v ? "🔗 Markov" : "🧳 Has memory"}
                </button>
              ))}
              {a !== null && (
                <span className={a === s.markov ? "good" : "bad"} style={{ fontSize: "0.9rem" }}>
                  {a === s.markov ? "✓ " : "✗ "}
                  {s.why}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div className="stats">
        <Stat label="Score" value={`${score}/${SCENARIOS.length}`} className={done && score === SCENARIOS.length ? "good" : ""} />
      </div>
      {done && (
        <button className="btn ghost" onClick={() => setAnswers(SCENARIOS.map(() => null))}>
          Try again
        </button>
      )}
    </div>
  );
}

const track: Track = {
  title: "Chains with no memory",
  tagline: "Your phone guesses your next word. Your playlist picks your next song. Both are running the same simple trick — and it was invented out of spite in 1906.",
  history: [
    { when: "1906", what: "Andrey Markov invents his chains to win an argument with a rival mathematician. Petty? Yes. Genius? Also yes." },
    { when: "1913", what: "Markov counts 20,000 letters of a Russian poem BY HAND to show vowels and consonants follow his chain rules." },
    { when: "1948", what: "Claude Shannon uses Markov chains to generate fake English — the great-great-grandparent of chatbots." },
    { when: "1998", what: "Two students model a bored web surfer clicking random links. That chain becomes Google." },
  ],
  chapters: [
    {
      id: "predict",
      title: "Your phone's predictive text",
      emoji: "📱",
      intro: <p>Type something. The chain looks at your last word, checks what came next in its training text, and guesses. That's it — a Markov chain made of words.</p>,
      Widget: TextPredictor,
      takeaway: (
        <>
          <b>The Markov property:</b> the next step depends <i>only</i> on the current state (here, your last word or two). Everything before that is forgotten.
        </>
      ),
      quiz: [
        {
          q: "In the training text, “the fox” is followed by “was” 2 times and “ran” 1 time. With 2-word memory, what's the chance it predicts “ran”?",
          options: ["1/2", "1/3", "2/3", "It always picks the most common word"],
          answer: 1,
          explain: "1 out of 3 times. A Markov chain picks randomly, weighted by how often each word followed.",
        },
      ],
    },
    {
      id: "playlist",
      title: "The memoryless playlist",
      emoji: "🎵",
      intro: <p>A shuffle that picks the next genre based only on the current one. Hit play, then skip 1,000 songs and watch something spooky: the mix always settles to the same shares.</p>,
      Widget: Playlist,
      takeaway: (
        <>
          <b>The settling-down share is called the stationary distribution.</b> It doesn't depend on which song you started with — only on the arrows.
        </>
      ),
    },
    {
      id: "builder",
      title: "Build your own chain",
      emoji: "🧩",
      intro: <p>Design a Markov chain of your day. Choose your states, set the chances, and let it run your life (virtually).</p>,
      Widget: EmojiBuilder,
    },
    {
      id: "snakes",
      title: "Snakes & Ladders is a Markov chain",
      emoji: "🐍",
      intro: <p>Play a few rolls, then let the computer play thousands of games. Then compare with the exact answer worked out from the chain.</p>,
      Widget: Snakes,
      quiz: [
        {
          q: "Why is Snakes & Ladders a Markov chain?",
          options: ["Because there are snakes", "Your next square depends only on your current square and the dice", "Because it's random", "Because the board has 36 squares"],
          answer: 1,
          explain: "Random isn't enough — it's memorylessness that makes it Markov.",
        },
      ],
    },
    {
      id: "master",
      title: "Memoryless Master",
      emoji: "🧠",
      intro: <p>Is it a Markov chain, or does it remember the past? Get all six to unlock the achievement.</p>,
      Widget: MemorylessMaster,
    },
  ],
};

export default track;
