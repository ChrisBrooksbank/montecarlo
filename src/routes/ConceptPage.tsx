import { lazy, Suspense, useEffect, useMemo, type ComponentType } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useInView } from "../hooks";
import { Quiz } from "../components/ui";
import { useAudience } from "../stores/audience";
import { useProgress } from "../stores/progress";
import { AUDIENCES, CONCEPTS, type Audience, type Chapter, type ConceptId, type Track } from "../types";

type Loader = () => Promise<{ default: Track }>;
const LOADERS: Record<ConceptId, Record<Audience, Loader>> = {
  montecarlo: {
    teen: () => import("../tracks/montecarlo/teen"),
    adult: () => import("../tracks/montecarlo/adult"),
    scientist: () => import("../tracks/montecarlo/scientist"),
  },
  markov: {
    teen: () => import("../tracks/markov/teen"),
    adult: () => import("../tracks/markov/adult"),
    scientist: () => import("../tracks/markov/scientist"),
  },
  dh: {
    teen: () => import("../tracks/dh/teen"),
    adult: () => import("../tracks/dh/adult"),
    scientist: () => import("../tracks/dh/scientist"),
  },
};

const cache = new Map<string, ComponentType>();
function trackComponent(concept: ConceptId, audience: Audience): ComponentType {
  const key = `${concept}/${audience}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      lazy(async () => {
        const { default: track } = await LOADERS[concept][audience]();
        return { default: () => <TrackView track={track} concept={concept} audience={audience} /> };
      }),
    );
  }
  return cache.get(key)!;
}

export default function ConceptPage({ concept }: { concept: ConceptId }) {
  const audience = useAudience((s) => s.audience);
  const View = useMemo(() => trackComponent(concept, audience), [concept, audience]);
  return (
    <div className="page">
      <Suspense fallback={<div className="lazy-placeholder">Loading simulations…</div>}>
        <View key={`${concept}/${audience}`} />
      </Suspense>
    </div>
  );
}

function ChapterView({ ch, index, k }: { ch: Chapter; index: number; k: string }) {
  const [ref, seen] = useInView<HTMLElement>("600px");
  const done = useProgress((s) => !!s.completed[k]);
  const complete = useProgress((s) => s.complete);
  const uncomplete = useProgress((s) => s.uncomplete);
  const { Widget } = ch;
  return (
    <section className="chapter" id={ch.id} ref={ref}>
      <div className="chapter-head">
        <span className="chapter-num">{String(index + 1).padStart(2, "0")}</span>
        <h2>
          {ch.emoji && <span aria-hidden>{ch.emoji} </span>}
          {ch.title}
        </h2>
      </div>
      <div className="chapter-intro">{ch.intro}</div>
      <div className="chapter-body card">{seen ? <ErrorBoundary><Widget /></ErrorBoundary> : <div className="lazy-placeholder">…</div>}</div>
      {ch.takeaway && <div className="takeaway">{ch.takeaway}</div>}
      {ch.quiz && <Quiz questions={ch.quiz} onPass={() => complete(k)} />}
      <div className="chapter-foot">
        <button className="btn small ghost done-btn" aria-pressed={done} onClick={() => (done ? uncomplete(k) : complete(k))}>
          {done ? "✓ Got it" : "Mark as understood"}
        </button>
      </div>
    </section>
  );
}

function TrackView({ track, concept, audience }: { track: Track; concept: ConceptId; audience: Audience }) {
  const completed = useProgress((s) => s.completed);
  const award = useProgress((s) => s.award);
  const keyOf = (id: string) => `${concept}/${audience}/${id}`;
  const doneCount = track.chapters.filter((c) => completed[keyOf(c.id)]).length;
  const c = CONCEPTS.find((x) => x.id === concept)!;
  const a = AUDIENCES.find((x) => x.id === audience)!;
  useEffect(() => {
    if (doneCount === track.chapters.length && doneCount > 0) award(`track-${concept}-${audience}`, c.emoji, `${c.label} · ${a.label} complete`, "Every chapter understood.");
  }, [doneCount, track.chapters.length, award, concept, audience, c, a]);
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.split("#")[2] ?? "");
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  return (
    <>
      <header className="track-hero">
        <div className="kicker">
          {c.emoji} {c.label} · {a.emoji} {a.label} track
        </div>
        <h1>{track.title}</h1>
        <p className="tagline">{track.tagline}</p>
        {track.history && (
          <div className="history">
            {track.history.map((h) => (
              <div className="moment" key={h.when}>
                <b>{h.when}</b>
                {h.what}
              </div>
            ))}
          </div>
        )}
      </header>
      <div className="track-layout">
        <aside className="toc" aria-label="Chapters">
          <div className="kicker">
            Progress {doneCount}/{track.chapters.length}
          </div>
          <div className="toc-progress">
            <div style={{ width: `${(doneCount / track.chapters.length) * 100}%` }} />
          </div>
          <ol>
            {track.chapters.map((ch, i) => (
              <li key={ch.id}>
                <a
                  href={`#/${concept}#${ch.id}`}
                  className={completed[keyOf(ch.id)] ? "done" : ""}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(ch.id)?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <span className="check">{completed[keyOf(ch.id)] ? "✓" : `${i + 1}.`}</span>
                  {ch.title}
                </a>
              </li>
            ))}
          </ol>
        </aside>
        <div>
          {track.chapters.map((ch, i) => (
            <ChapterView key={ch.id} ch={ch} index={i} k={keyOf(ch.id)} />
          ))}
        </div>
      </div>
    </>
  );
}
