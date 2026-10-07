import { useRef, useState } from "react";
import { useProgress } from "../stores/progress";

export interface CodeTest {
  name: string;
  /** JS expression evaluated after the user's code; must return true to pass. */
  expr: string;
}

interface Props {
  id: string;
  starter: string;
  solution?: string;
  tests: CodeTest[];
  /** Extra code appended after tests run, its console output is shown (e.g. a demo). */
  demo?: string;
  onPass?: () => void;
}

// Runs untrusted code in a throwaway Web Worker: no DOM, no window, network APIs removed,
// and killed after a timeout so infinite loops can't freeze the page.
const WORKER_SRC = `
self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined;
self.importScripts = undefined; self.indexedDB = undefined;
self.onmessage = (e) => {
  const { code, tests, demo } = e.data;
  const logs = [];
  const fmt = (v) => typeof v === "bigint" ? v + "n" : typeof v === "object" ? JSON.stringify(v, (k, x) => typeof x === "bigint" ? x + "n" : x) : String(v);
  const console = { log: (...a) => logs.push(a.map(fmt).join(" ")) };
  const results = [];
  try {
    const fn = new Function("console", code + "\\n;return (name, expr) => { try { return !!eval(expr); } catch (err) { return 'error: ' + err.message; } };");
    const check = fn(console);
    for (const t of tests) results.push({ name: t.name, ok: check(t.name, t.expr) });
    if (demo) new Function("console", code + "\\n;" + demo)(console);
    self.postMessage({ logs, results });
  } catch (err) {
    self.postMessage({ logs, results, error: String(err && err.message || err) });
  }
};`;

export function CodeLab({ id, starter, solution, tests, demo, onPass }: Props) {
  const [code, setCode] = useState(() => {
    try {
      return localStorage.getItem(`codelab:${id}`) ?? starter;
    } catch {
      return starter;
    }
  });
  const [out, setOut] = useState<{ logs: string[]; results: { name: string; ok: boolean | string }[]; error?: string; ms?: number } | null>(null);
  const [running, setRunning] = useState(false);
  const award = useProgress((s) => s.award);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lines = code.split("\n").length;

  const save = (v: string) => {
    setCode(v);
    try {
      localStorage.setItem(`codelab:${id}`, v);
    } catch {
      /* storage unavailable */
    }
  };

  const run = () => {
    setRunning(true);
    const blob = new Blob([WORKER_SRC], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    const t0 = performance.now();
    const kill = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      setOut({ logs: [], results: [], error: "⏱ Timed out after 4s — infinite loop? (The sandbox killed it.)" });
      setRunning(false);
    }, 4000);
    worker.onmessage = (e) => {
      clearTimeout(kill);
      worker.terminate();
      URL.revokeObjectURL(url);
      const data = { ...e.data, ms: performance.now() - t0 };
      setOut(data);
      setRunning(false);
      if (!data.error && data.results.length && data.results.every((r: { ok: unknown }) => r.ok === true)) {
        award(`codelab-${id}`, "💻", "Code Lab cleared", "All tests green.");
        onPass?.();
      }
    };
    worker.postMessage({ code, tests, demo });
  };

  return (
    <div>
      <div className="code-editor">
        <div className="code-gutter" aria-hidden>
          {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
        </div>
        <textarea
          ref={taRef}
          spellCheck={false}
          value={code}
          rows={Math.max(10, lines + 1)}
          aria-label="Code editor"
          onChange={(e) => save(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              const ta = e.currentTarget;
              const { selectionStart: s, selectionEnd: en } = ta;
              const v = code.slice(0, s) + "  " + code.slice(en);
              save(v);
              requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              run();
            }
          }}
        />
      </div>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={run} disabled={running}>
          {running ? "Running…" : "▶ Run tests"} <kbd className="faint" style={{ fontSize: "0.75em" }}>⌘↵</kbd>
        </button>
        <button className="btn ghost small" onClick={() => save(starter)}>
          ↺ Reset
        </button>
        {solution && (
          <button className="btn ghost small" onClick={() => save(solution)}>
            👀 Show a solution
          </button>
        )}
      </div>
      {out && (
        <div className="code-out">
          {out.error && <div className="fail">💥 {out.error}</div>}
          {out.results.map((r) => (
            <div key={r.name} className={r.ok === true ? "pass" : "fail"}>
              {r.ok === true ? "✔" : "✘"} {r.name}
              {typeof r.ok === "string" ? ` — ${r.ok}` : ""}
            </div>
          ))}
          {out.logs.length > 0 && (
            <>
              <div className="faint" style={{ marginTop: 6 }}>
                console:
              </div>
              {out.logs.slice(0, 200).map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </>
          )}
          {out.ms !== undefined && <div className="faint">ran in {out.ms.toFixed(0)} ms (sandboxed Web Worker)</div>}
        </div>
      )}
    </div>
  );
}
