import type { ReactNode } from "react";
import { useWidth } from "../hooks";

type Scale = (v: number) => number;

export interface Series {
  data: [number, number][];
  color: string;
  width?: number;
  dash?: string;
  opacity?: number;
  label?: string;
  dots?: boolean;
  step?: boolean;
}

export interface Band {
  x: number[];
  lo: number[];
  hi: number[];
  color: string;
  opacity?: number;
}

export interface RefLine {
  value: number;
  color?: string;
  label?: string;
  dash?: string;
}

interface FrameProps {
  height?: number;
  xDomain: [number, number];
  yDomain: [number, number];
  xLog?: boolean;
  yLog?: boolean;
  xLabel?: string;
  yLabel?: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  hLines?: RefLine[];
  vLines?: RefLine[];
  title?: ReactNode;
  legend?: { label: string; color: string }[];
  children: (sx: Scale, sy: Scale, w: number, h: number) => ReactNode;
  ariaLabel?: string;
}

function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const span = hi - lo;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(Math.log10(lo) - 1e-9); e <= Math.floor(Math.log10(hi) + 1e-9); e++) out.push(10 ** e);
  return out;
}

export const fmt = (v: number, digits = 2): string => {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
  if (a >= 1e4) return (v / 1e3).toFixed(0) + "k";
  if (a >= 100) return v.toFixed(0);
  if (a < 1e-3) return v.toExponential(0);
  return String(+v.toFixed(digits));
};

const fmtLog = (v: number) => {
  const e = Math.round(Math.log10(v));
  if (e >= 0 && e <= 4) return String(10 ** e);
  if (e < 0 && e >= -2) return String(10 ** e);
  return `1e${e}`;
};

export function ChartFrame(p: FrameProps) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = p.height ?? 220;
  const m = { l: p.yLabel ? 52 : 44, r: 14, t: 10, b: p.xLabel ? 38 : 24 };
  const iw = Math.max(10, w - m.l - m.r);
  const ih = Math.max(10, h - m.t - m.b);
  const mk = (dom: [number, number], log: boolean | undefined, r0: number, r1: number): Scale => {
    if (log) {
      const a = Math.log10(dom[0]);
      const b = Math.log10(dom[1]);
      return (v) => r0 + ((Math.log10(Math.max(v, 1e-300)) - a) / (b - a || 1)) * (r1 - r0);
    }
    return (v) => r0 + ((v - dom[0]) / (dom[1] - dom[0] || 1)) * (r1 - r0);
  };
  const sx = mk(p.xDomain, p.xLog, 0, iw);
  const sy = mk(p.yDomain, p.yLog, ih, 0);
  const xt = p.xLog ? logTicks(...p.xDomain) : niceTicks(...p.xDomain, Math.max(2, Math.floor(iw / 90)));
  const yt = p.yLog ? logTicks(...p.yDomain) : niceTicks(...p.yDomain, Math.max(2, Math.floor(ih / 45)));
  const fx = p.formatX ?? (p.xLog ? fmtLog : (v: number) => fmt(v));
  const fy = p.formatY ?? (p.yLog ? fmtLog : (v: number) => fmt(v));
  const clipId = `clip-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div ref={ref}>
      {p.title && <div className="chart-title">{p.title}</div>}
      <svg className="chart" width={w} height={h} role="img" aria-label={p.ariaLabel ?? (typeof p.title === "string" ? p.title : "chart")}>
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={-2} width={iw} height={ih + 4} />
          </clipPath>
        </defs>
        <g transform={`translate(${m.l},${m.t})`}>
          <g className="grid">
            {yt.map((t) => (
              <line key={t} x1={0} x2={iw} y1={sy(t)} y2={sy(t)} />
            ))}
          </g>
          <g className="axis">
            <line x1={0} x2={iw} y1={ih} y2={ih} />
            <line x1={0} x2={0} y1={0} y2={ih} />
            {xt.map((t) => (
              <text key={t} x={sx(t)} y={ih + 15} textAnchor="middle">
                {fx(t)}
              </text>
            ))}
            {yt.map((t) => (
              <text key={t} x={-6} y={sy(t) + 4} textAnchor="end">
                {fy(t)}
              </text>
            ))}
            {p.xLabel && (
              <text x={iw / 2} y={ih + 32} textAnchor="middle">
                {p.xLabel}
              </text>
            )}
            {p.yLabel && (
              <text transform={`translate(${-m.l + 12},${ih / 2}) rotate(-90)`} textAnchor="middle">
                {p.yLabel}
              </text>
            )}
          </g>
          <g clipPath={`url(#${clipId})`}>
            {p.children(sx, sy, iw, ih)}
            {p.hLines?.map((l, i) => (
              <g key={`h${i}`}>
                <line x1={0} x2={iw} y1={sy(l.value)} y2={sy(l.value)} stroke={l.color ?? "var(--ink-dim)"} strokeDasharray={l.dash ?? "5 4"} strokeWidth={1.5} />
                {l.label && (
                  <text x={iw - 4} y={sy(l.value) - 5} textAnchor="end" style={{ fill: l.color ?? "var(--ink-dim)" }}>
                    {l.label}
                  </text>
                )}
              </g>
            ))}
            {p.vLines?.map((l, i) => (
              <g key={`v${i}`}>
                <line x1={sx(l.value)} x2={sx(l.value)} y1={0} y2={ih} stroke={l.color ?? "var(--ink-dim)"} strokeDasharray={l.dash ?? "5 4"} strokeWidth={1.5} />
                {l.label && (
                  <text x={sx(l.value) + 4} y={12} style={{ fill: l.color ?? "var(--ink-dim)" }}>
                    {l.label}
                  </text>
                )}
              </g>
            ))}
          </g>
        </g>
      </svg>
      {p.legend && (
        <div className="legend">
          {p.legend.map((l) => (
            <span key={l.label} style={{ ["--c" as string]: l.color }}>
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function pathOf(data: [number, number][], sx: Scale, sy: Scale, step = false): string {
  let d = "";
  let prevY = 0;
  data.forEach(([x, y], i) => {
    if (!Number.isFinite(y)) return;
    const X = sx(x).toFixed(1);
    const Y = sy(y).toFixed(1);
    if (i === 0 || !d) d += `M${X},${Y}`;
    else if (step) d += `L${X},${prevY}L${X},${Y}`;
    else d += `L${X},${Y}`;
    prevY = +Y;
  });
  return d;
}

export interface LineChartProps extends Omit<FrameProps, "children" | "xDomain" | "yDomain"> {
  series: Series[];
  bands?: Band[];
  xDomain?: [number, number];
  yDomain?: [number, number];
}

export function LineChart({ series, bands, xDomain, yDomain, ...rest }: LineChartProps) {
  const all = series.flatMap((s) => s.data);
  const xs = all.map((d) => d[0]).filter(Number.isFinite);
  const ys = all.map((d) => d[1]).filter(Number.isFinite);
  const xd: [number, number] = xDomain ?? [Math.min(...xs, 0), Math.max(...xs, 1)];
  let yd: [number, number] = yDomain ?? [Math.min(...ys, 0), Math.max(...ys, 1)];
  if (!yDomain && bands) {
    const blo = Math.min(...bands.flatMap((b) => b.lo));
    const bhi = Math.max(...bands.flatMap((b) => b.hi));
    yd = [Math.min(yd[0], blo), Math.max(yd[1], bhi)];
  }
  return (
    <ChartFrame {...rest} xDomain={xd} yDomain={yd}>
      {(sx, sy) => (
        <>
          {bands?.map((b, i) => {
            const top = b.x.map((x, k) => `${sx(x).toFixed(1)},${sy(b.hi[k]).toFixed(1)}`);
            const bot = b.x.map((x, k) => `${sx(x).toFixed(1)},${sy(b.lo[k]).toFixed(1)}`).reverse();
            return <polygon key={i} points={[...top, ...bot].join(" ")} fill={b.color} opacity={b.opacity ?? 0.2} />;
          })}
          {series.map((s, i) => (
            <g key={i}>
              <path d={pathOf(s.data, sx, sy, s.step)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} opacity={s.opacity ?? 1} strokeLinejoin="round" strokeLinecap="round" />
              {s.dots && s.data.map(([x, y], k) => <circle key={k} cx={sx(x)} cy={sy(y)} r={3.2} fill={s.color} />)}
            </g>
          ))}
        </>
      )}
    </ChartFrame>
  );
}

export interface HistogramProps extends Omit<FrameProps, "children" | "xDomain" | "yDomain"> {
  counts: number[];
  lo: number;
  hi: number;
  color?: string;
  colorFor?: (binCenter: number) => string;
  normalize?: boolean;
  overlay?: Series[];
  yMax?: number;
}

export function Histogram({ counts, lo, hi, color = "var(--accent)", colorFor, normalize, overlay, yMax, ...rest }: HistogramProps) {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const w = (hi - lo) / counts.length;
  const vals = normalize ? counts.map((c) => c / total / w) : counts;
  const top = yMax ?? Math.max(1e-9, ...vals, ...(overlay?.flatMap((s) => s.data.map((d) => d[1])) ?? [])) * 1.08;
  return (
    <ChartFrame {...rest} xDomain={[lo, hi]} yDomain={[0, top]}>
      {(sx, sy) => (
        <>
          {vals.map((v, i) => {
            const x0 = sx(lo + i * w);
            const x1 = sx(lo + (i + 1) * w);
            return <rect key={i} x={x0 + 0.5} y={sy(v)} width={Math.max(0, x1 - x0 - 1)} height={Math.max(0, sy(0) - sy(v))} fill={colorFor ? colorFor(lo + (i + 0.5) * w) : color} opacity={0.85} rx={1.5} />;
          })}
          {overlay?.map((s, i) => (
            <path key={i} d={pathOf(s.data, sx, sy)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} />
          ))}
        </>
      )}
    </ChartFrame>
  );
}

/** Horizontal bars for categorical probabilities. */
export function Bars({ items, max = 1, format = (v: number) => `${(v * 100).toFixed(1)}%` }: { items: { label: ReactNode; value: number; color: string; target?: number }[]; max?: number; format?: (v: number) => string }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(70px, auto) 1fr 64px", gap: 10, alignItems: "center", fontSize: "0.92rem" }}>
          <span>{it.label}</span>
          <div style={{ position: "relative", height: 16, background: "var(--bg-3)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, (it.value / max) * 100)}%`, background: it.color, borderRadius: 99, transition: "width 0.25s" }} />
            {it.target !== undefined && <div title="target" style={{ position: "absolute", top: -2, bottom: -2, left: `${(it.target / max) * 100}%`, width: 2, background: "var(--ink)" }} />}
          </div>
          <span className="mono" style={{ textAlign: "right" }}>
            {format(it.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
