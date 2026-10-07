import { useWidth } from "../hooks";
import { modPowNum } from "../lib/diffiehellman";

interface Props {
  p: number;
  g: number;
  /** Draw hops g¹ → g² → … → gᵏ. */
  k: number;
  maxSize?: number;
  color?: string;
  /** Values to ring (e.g. a target Eve is hunting for). */
  mark?: number[];
  showLabels?: boolean;
}

/** A modular "clock": the numbers 0…p−1 around a circle, with the powers of g hopping between them. */
export function Clock({ p, g, k, maxSize = 380, color = "var(--accent)", mark = [], showLabels }: Props) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const size = Math.min(maxSize, w);
  const c = size / 2;
  const R = c - (p > 60 ? 14 : 24);
  const at = (v: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * v) / p;
    return { x: c + R * Math.cos(a), y: c + R * Math.sin(a) };
  };
  const powers: number[] = [];
  for (let i = 1; i <= Math.min(k, 4 * p); i++) powers.push(modPowNum(g, i, p));
  const labels = showLabels ?? p <= 40;
  const cur = powers[powers.length - 1];
  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <svg width={size} height={size} role="img" aria-label={`Clock modulo ${p} showing powers of ${g}`}>
        <circle cx={c} cy={c} r={R} fill="none" stroke="var(--line)" strokeWidth={1.5} />
        {powers.length > 1 && (
          <polyline
            points={powers.map((v) => `${at(v).x},${at(v).y}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={p > 100 ? 0.8 : 1.6}
            opacity={0.65}
            strokeLinejoin="round"
          />
        )}
        {Array.from({ length: p }, (_, v) => {
          const pt = at(v);
          const visited = powers.includes(v);
          const isMark = mark.includes(v);
          return (
            <g key={v}>
              <circle cx={pt.x} cy={pt.y} r={p > 100 ? 1.8 : p > 40 ? 3 : 4.5} fill={visited ? color : "var(--bg-3)"} stroke={isMark ? "var(--s1)" : "none"} strokeWidth={2.5} />
              {labels && (
                <text x={c + (R + 14) * Math.cos(-Math.PI / 2 + (2 * Math.PI * v) / p)} y={c + (R + 14) * Math.sin(-Math.PI / 2 + (2 * Math.PI * v) / p) + 4} textAnchor="middle" style={{ fontSize: 10.5, fill: v === cur ? "var(--ink)" : "var(--ink-faint)", fontWeight: v === cur ? 700 : 400, fontFamily: "var(--font-mono)" }}>
                  {v}
                </text>
              )}
            </g>
          );
        })}
        {cur !== undefined && (
          <>
            <circle cx={at(cur).x} cy={at(cur).y} r={p > 100 ? 5 : 9} fill="none" stroke="var(--ink)" strokeWidth={2.5} />
            <text x={c} y={c - 6} textAnchor="middle" style={{ fontSize: 13, fill: "var(--ink-dim)", fontFamily: "var(--font-mono)" }}>
              {g}
              <tspan dy={-6} style={{ fontSize: 10 }}>
                {powers.length}
              </tspan>
              <tspan dy={6}> mod {p}</tspan>
            </text>
            <text x={c} y={c + 22} textAnchor="middle" style={{ fontSize: 26, fill: color, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              = {cur}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
