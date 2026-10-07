import { lazy, Suspense, useEffect } from "react";
import { Link, NavLink, Route, Routes, useLocation, useParams, Navigate } from "react-router-dom";
import { Toasts } from "./components/ui";
import { useAudience } from "./stores/audience";
import { AUDIENCES, CONCEPTS, type Audience, type ConceptId } from "./types";
import Home from "./routes/Home";

const ConceptPage = lazy(() => import("./routes/ConceptPage"));
const Connections = lazy(() => import("./routes/Connections"));

function AudienceSwitch() {
  const { audience, setAudience } = useAudience();
  return (
    <div className="audience-switch" role="group" aria-label="Audience level">
      {AUDIENCES.map((a) => (
        <button key={a.id} aria-pressed={audience === a.id} onClick={() => setAudience(a.id)} title={a.blurb}>
          {a.emoji} {a.label}
        </button>
      ))}
    </div>
  );
}

function ConceptRoute() {
  const { concept, audience } = useParams();
  const setAudience = useAudience((s) => s.setAudience);
  const valid = CONCEPTS.some((c) => c.id === concept);
  const validAud = AUDIENCES.some((a) => a.id === audience);
  useEffect(() => {
    if (validAud) setAudience(audience as Audience);
  }, [audience, validAud, setAudience]);
  if (!valid) return <Navigate to="/" replace />;
  return <ConceptPage concept={concept as ConceptId} />;
}

export default function App() {
  const audience = useAudience((s) => s.audience);
  const loc = useLocation();
  const concept = CONCEPTS.find((c) => loc.pathname.startsWith(`/${c.id}`))?.id ?? "montecarlo";
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  // Theme lives on <html> so body, scrollbars and overscroll all pick it up.
  useEffect(() => {
    document.documentElement.dataset.audience = audience;
    document.documentElement.dataset.concept = concept;
  }, [audience, concept]);
  return (
    <div id="app-root" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="shell-header">
        <Link to="/" className="logo">
          <span className="logo-die">🎲</span> Monte&nbsp;Carlo
        </Link>
        <nav className="concept-nav" aria-label="Concepts">
          {CONCEPTS.map((c) => (
            <NavLink key={c.id} to={`/${c.id}`} style={{ ["--c" as string]: c.color }}>
              {c.emoji} {c.short}
            </NavLink>
          ))}
          <NavLink to="/connections" style={{ ["--c" as string]: "var(--s4)" }}>
            🌀 Connections
          </NavLink>
        </nav>
        <div className="spacer" />
        <AudienceSwitch />
      </header>
      <main>
        <Suspense fallback={<div className="page lazy-placeholder">Shuffling the deck…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="/:concept" element={<ConceptRoute />} />
            <Route path="/:concept/:audience" element={<ConceptRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <footer className="footer">
        Built with randomness, Markov chains and modular arithmetic · MIT ·{" "}
        <a href="https://github.com/ChrisBrooksbank/montecarlo">source</a>
      </footer>
      <Toasts />
    </div>
  );
}
