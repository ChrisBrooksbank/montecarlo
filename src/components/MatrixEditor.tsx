import { normalizeRows, type Matrix } from "../lib/markov";

interface Props {
  matrix: Matrix;
  labels: string[];
  colors?: string[];
  onChange: (m: Matrix) => void;
  step?: number;
}

/** Editable transition matrix. Each row shows its sum and turns red if it isn't 1. */
export function MatrixEditor({ matrix, labels, colors, onChange, step = 0.05 }: Props) {
  const n = matrix.length;
  const set = (i: number, j: number, v: number) => onChange(matrix.map((row, a) => row.map((x, b) => (a === i && b === j ? v : x))));
  return (
    <div style={{ maxWidth: "100%", overflowX: "auto" }}>
      <div className="matrix-grid" style={{ gridTemplateColumns: `auto repeat(${n}, auto) auto` }}>
        <span className="hdr">from ↓ to →</span>
        {labels.map((l, j) => (
          <span key={j} className="hdr" style={{ color: colors?.[j] }}>
            {l}
          </span>
        ))}
        <span className="hdr">Σ</span>
        {matrix.map((row, i) => {
          const sum = row.reduce((a, b) => a + b, 0);
          const ok = Math.abs(sum - 1) < 1e-6;
          return [
            <span key={`l${i}`} className="hdr" style={{ textAlign: "right", color: colors?.[i] }}>
              {labels[i]}
            </span>,
            ...row.map((v, j) => (
              <input
                key={`${i}-${j}`}
                className="num-input"
                style={n > 4 ? { width: "4.4em", padding: "4px 4px", fontSize: "0.82rem" } : undefined}
                type="number"
                min={0}
                max={1}
                step={step}
                value={+v.toFixed(3)}
                aria-label={`P(${labels[i]} → ${labels[j]})`}
                onChange={(e) => set(i, j, Math.max(0, Math.min(1, +e.target.value || 0)))}
              />
            )),
            <span key={`s${i}`} className={`rowsum ${ok ? "good" : "bad"}`}>
              {sum.toFixed(2)}
            </span>,
          ];
        })}
      </div>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn small" onClick={() => onChange(normalizeRows(matrix))}>
          ⚖️ Normalize rows
        </button>
        <button
          className="btn small ghost"
          onClick={() =>
            onChange(
              normalizeRows(matrix.map((row) => row.map(() => Math.random() ** 2))),
            )
          }
        >
          🎲 Randomize
        </button>
      </div>
    </div>
  );
}
