import { useState, type ReactNode } from "react";
import { useProgress } from "../stores/progress";
import type { QuizQuestion } from "../types";

export function Slider(props: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const { label, value, min, max, step = 1, onChange, format, disabled } = props;
  return (
    <label className="slider">
      <span className="slider-top">
        <span>{label}</span>
        <output>{format ? format(value) : value}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

export function Seg<T extends string | number>(props: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={String(o.value)} aria-pressed={o.value === props.value} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, className, huge }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string; huge?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${huge ? "huge" : ""} ${className ?? ""}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Quiz({ questions, onPass }: { questions: QuizQuestion[]; onPass?: () => void }) {
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));
  const correct = picked.filter((p, i) => p === questions[i].answer).length;
  const allAnswered = picked.every((p) => p !== null);
  return (
    <div className="quiz">
      <h4>
        🧠 Check yourself{" "}
        {allAnswered && (
          <span className={`pill ${correct === questions.length ? "accent" : ""}`}>
            {correct}/{questions.length}
          </span>
        )}
      </h4>
      {questions.map((q, qi) => (
        <div className="quiz-q" key={qi}>
          <p>{q.q}</p>
          <div className="quiz-opts">
            {q.options.map((o, oi) => {
              const chosen = picked[qi] === oi;
              const show = picked[qi] !== null;
              const cls = show && oi === q.answer ? "right" : chosen ? "wrong" : "";
              return (
                <button
                  key={oi}
                  className={`quiz-opt ${cls}`}
                  disabled={picked[qi] !== null && picked[qi] === q.answer}
                  onClick={() => {
                    const next = picked.slice();
                    next[qi] = oi;
                    setPicked(next);
                    if (next.every((p, i) => p === questions[i].answer)) onPass?.();
                  }}
                >
                  {o}
                </button>
              );
            })}
          </div>
          {picked[qi] !== null && <div className="quiz-explain">{picked[qi] === q.answer ? "✅ " : "❌ Not quite. "}{q.explain}</div>}
        </div>
      ))}
    </div>
  );
}

export function Toasts() {
  const toasts = useProgress((s) => s.toasts);
  const dismiss = useProgress((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" onClick={() => dismiss(t.id)} role="status">
          <span className="toast-emoji">{t.emoji}</span>
          <div>
            <b>Achievement unlocked: {t.title}</b>
            {t.detail && <small>{t.detail}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AppCards({ items }: { items: { emoji: string; title: string; body: ReactNode }[] }) {
  return (
    <div className="app-cards">
      {items.map((c) => (
        <div className="app-card" key={c.title}>
          <div className="emoji">{c.emoji}</div>
          <h4>{c.title}</h4>
          <p>{c.body}</p>
        </div>
      ))}
    </div>
  );
}

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="step-list">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  );
}
