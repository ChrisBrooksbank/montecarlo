import { useEffect, useMemo, useRef, useState } from "react";
import { useWidth } from "../hooks";
import type { Matrix } from "../lib/markov";

export interface DiagramState {
  label: string;
  emoji?: string;
  color: string;
}

interface Props {
  states: DiagramState[];
  matrix: Matrix;
  active?: number | null;
  /** Bump `key` to animate a token travelling along from→to. */
  transition?: { from: number; to: number; key: number } | null;
  /** Optional probability per state, drawn as a filled ring. */
  dist?: number[];
  height?: number;
  showWeights?: boolean;
  draggable?: boolean;
  onNodeClick?: (i: number) => void;
  onEdgeClick?: (from: number, to: number) => void;
  nodeRadius?: number;
  minEdge?: number;
}

type Pt = { x: number; y: number };

function circleLayout(n: number, w: number, h: number, r: number): Pt[] {
  const cx = w / 2;
  const cy = h / 2;
  if (n === 1) return [{ x: cx, y: cy }];
  const R = Math.max(40, Math.min(w, h) / 2 - r - 34);
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
}

function edgeGeom(a: Pt, b: Pt, r: number, bend: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const c = { x: (a.x + b.x) / 2 + nx * bend, y: (a.y + b.y) / 2 + ny * bend };
  const trim = (p: Pt, toward: Pt, d: number) => {
    const vx = toward.x - p.x;
    const vy = toward.y - p.y;
    const l = Math.hypot(vx, vy) || 1;
    return { x: p.x + (vx / l) * d, y: p.y + (vy / l) * d };
  };
  const s = trim(a, c, r + 2);
  const e = trim(b, c, r + 6);
  return { s, c, e };
}

function quadAt(s: Pt, c: Pt, e: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * s.x + 2 * u * t * c.x + t * t * e.x, y: u * u * s.y + 2 * u * t * c.y + t * t * e.y };
}

function selfLoop(p: Pt, center: Pt, r: number) {
  let dx = p.x - center.x;
  let dy = p.y - center.y;
  const l = Math.hypot(dx, dy);
  if (l < 1) {
    dx = 0;
    dy = -1;
  } else {
    dx /= l;
    dy /= l;
  }
  const ang = Math.atan2(dy, dx);
  const spread = 0.55;
  const s = { x: p.x + r * Math.cos(ang - spread), y: p.y + r * Math.sin(ang - spread) };
  const e = { x: p.x + (r + 4) * Math.cos(ang + spread), y: p.y + (r + 4) * Math.sin(ang + spread) };
  const k = r * 2.6;
  const c1 = { x: p.x + k * Math.cos(ang - 0.7), y: p.y + k * Math.sin(ang - 0.7) };
  const c2 = { x: p.x + k * Math.cos(ang + 0.7), y: p.y + k * Math.sin(ang + 0.7) };
  const label = { x: p.x + (r + 0.62 * k) * Math.cos(ang), y: p.y + (r + 0.62 * k) * Math.sin(ang) };
  return { d: `M${s.x},${s.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${e.x},${e.y}`, s, c1, c2, e, label, endDir: Math.atan2(e.y - c2.y, e.x - c2.x) };
}

function arrowHead(at: Pt, dir: number, size: number) {
  const a1 = dir + Math.PI - 0.45;
  const a2 = dir + Math.PI + 0.45;
  return `${at.x},${at.y} ${at.x + size * Math.cos(a1)},${at.y + size * Math.sin(a1)} ${at.x + size * Math.cos(a2)},${at.y + size * Math.sin(a2)}`;
}

export function StateDiagram({
  states,
  matrix,
  active,
  transition,
  dist,
  height = 320,
  showWeights = true,
  draggable = true,
  onNodeClick,
  onEdgeClick,
  nodeRadius,
  minEdge = 0.001,
}: Props) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = states.length;
  const r = nodeRadius ?? (n > 6 ? 22 : 28);
  const [pos, setPos] = useState<Pt[]>(() => circleLayout(n, w, height, r));
  const dragging = useRef<{ i: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setPos(circleLayout(n, w, height, r));
  }, [n, w, height, r]);

  const center = useMemo(() => ({ x: w / 2, y: height / 2 }), [w, height]);

  // Travelling token.
  const [token, setToken] = useState<Pt | null>(null);
  useEffect(() => {
    if (!transition || !pos[transition.from] || !pos[transition.to]) return;
    const { from, to } = transition;
    let raf = 0;
    const t0 = performance.now();
    const dur = 420;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      if (from === to) {
        const L = selfLoop(pos[from], center, r);
        const u = 1 - ease;
        setToken({
          x: u ** 3 * L.s.x + 3 * u * u * ease * L.c1.x + 3 * u * ease * ease * L.c2.x + ease ** 3 * L.e.x,
          y: u ** 3 * L.s.y + 3 * u * u * ease * L.c1.y + 3 * u * ease * ease * L.c2.y + ease ** 3 * L.e.y,
        });
      } else {
        const g = edgeGeom(pos[from], pos[to], r, 22);
        setToken(quadAt(g.s, g.c, g.e, ease));
      }
      if (k < 1) raf = requestAnimationFrame(tick);
      else setToken(null);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transition?.key]);

  const toLocal = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg
        ref={svgRef}
        width={w}
        height={height}
        style={{ display: "block", touchAction: draggable ? "none" : undefined, userSelect: "none" }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const p = toLocal(e);
          dragging.current.moved = true;
          const i = dragging.current.i;
          setPos((ps) => ps.map((q, k) => (k === i ? { x: Math.max(r, Math.min(w - r, p.x)), y: Math.max(r, Math.min(height - r, p.y)) } : q)));
        }}
        onPointerUp={() => {
          const d = dragging.current;
          dragging.current = null;
          if (d && !d.moved) onNodeClick?.(d.i);
        }}
        onPointerLeave={() => (dragging.current = null)}
        role="img"
        aria-label={`State diagram with ${n} states`}
      >
        {/* Edges */}
        {pos.length === n &&
          matrix.map((row, i) =>
            row.map((p, j) => {
              if (p < minEdge || !pos[i] || !pos[j]) return null;
              const hot = transition && transition.from === i && transition.to === j;
              const sw = 1 + p * 5;
              const col = states[i].color;
              if (i === j) {
                const L = selfLoop(pos[i], center, r);
                return (
                  <g key={`${i}-${j}`} onClick={() => onEdgeClick?.(i, j)} style={{ cursor: onEdgeClick ? "pointer" : undefined }}>
                    <path d={L.d} fill="none" stroke={col} strokeWidth={sw} opacity={hot ? 1 : 0.55} />
                    <polygon points={arrowHead(L.e, L.endDir, 9)} fill={col} opacity={hot ? 1 : 0.7} />
                    {showWeights && (
                      <text x={L.label.x} y={L.label.y + 4} textAnchor="middle" style={{ fill: col, fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                        {p.toFixed(2).replace(/^0/, "")}
                      </text>
                    )}
                  </g>
                );
              }
              const g = edgeGeom(pos[i], pos[j], r, 22);
              const mid = quadAt(g.s, g.c, g.e, 0.5);
              const dir = Math.atan2(g.e.y - g.c.y, g.e.x - g.c.x);
              return (
                <g key={`${i}-${j}`} onClick={() => onEdgeClick?.(i, j)} style={{ cursor: onEdgeClick ? "pointer" : undefined }}>
                  <path d={`M${g.s.x},${g.s.y} Q${g.c.x},${g.c.y} ${g.e.x},${g.e.y}`} fill="none" stroke={col} strokeWidth={sw} opacity={hot ? 1 : 0.5} />
                  <polygon points={arrowHead(g.e, dir, 10)} fill={col} opacity={hot ? 1 : 0.75} />
                  {showWeights && (
                    <g>
                      <rect x={mid.x - 17} y={mid.y - 10} width={34} height={18} rx={9} fill="var(--bg-2)" opacity={0.92} />
                      <text x={mid.x} y={mid.y + 3.5} textAnchor="middle" style={{ fill: col, fontSize: 11.5, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                        {p.toFixed(2).replace(/^0/, "")}
                      </text>
                    </g>
                  )}
                </g>
              );
            }),
          )}
        {/* Nodes */}
        {pos.length === n &&
          states.map((s, i) => {
            const p = pos[i];
            const isActive = active === i;
            const frac = dist?.[i];
            return (
              <g
                key={i}
                transform={`translate(${p.x},${p.y})`}
                style={{ cursor: draggable ? "grab" : onNodeClick ? "pointer" : undefined }}
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  dragging.current = { i, moved: false };
                  if (!draggable) {
                    dragging.current = null;
                    onNodeClick?.(i);
                  }
                }}
              >
                {isActive && <circle r={r + 9} fill={s.color} opacity={0.22} className="pulse-ring" />}
                <circle r={r} fill="var(--bg-2)" stroke={s.color} strokeWidth={isActive ? 4 : 2.5} />
                {frac !== undefined && (
                  <circle
                    r={r - 5}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={6}
                    strokeDasharray={`${2 * Math.PI * (r - 5) * Math.min(1, frac)} 999`}
                    transform="rotate(-90)"
                    opacity={0.6}
                  />
                )}
                {s.emoji ? (
                  <text y={8} textAnchor="middle" style={{ fontSize: r * 0.95 }}>
                    {s.emoji}
                  </text>
                ) : (
                  <text y={4} textAnchor="middle" style={{ fill: s.color, fontWeight: 700, fontSize: 12 }}>
                    {s.label}
                  </text>
                )}
                {s.emoji && (
                  <text y={r + 15} textAnchor="middle" style={{ fill: "var(--ink-dim)", fontSize: 11.5, fontWeight: 600 }}>
                    {s.label}
                  </text>
                )}
              </g>
            );
          })}
        {token && <circle cx={token.x} cy={token.y} r={7} fill="var(--ink)" stroke="var(--accent)" strokeWidth={3} />}
      </svg>
    </div>
  );
}
