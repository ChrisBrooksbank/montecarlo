import { useCallback, useEffect, useRef, useState } from "react";
import { cssVar, setupCanvas, useAnimationFrame, useThemeKey, useWidth } from "../hooks";
import { piConfidence } from "../lib/montecarlo";
import { mulberry32, randomSeed, type RNG } from "../lib/random";

export type DartVariant = "quarter" | "full";

const CAP = 400_000;

/** Holds darts and running statistics. Rendering pulls new darts incrementally. */
export class DartEngine {
  xs = new Float32Array(CAP);
  ys = new Float32Array(CAP);
  inside = new Uint8Array(CAP);
  total = 0;
  hits = 0;
  /** [n, estimate, ciLo, ciHi] sampled at roughly log-spaced n. */
  hist: [number, number, number, number][] = [];
  private nextHist = 1;
  private pending: number[] = [];
  rng: RNG;
  constructor(public variant: DartVariant = "quarter", seed = randomSeed()) {
    this.rng = mulberry32(seed);
  }
  isInside(x: number, y: number) {
    if (this.variant === "full") {
      const a = 2 * x - 1;
      const b = 2 * y - 1;
      return a * a + b * b <= 1;
    }
    return x * x + y * y <= 1;
  }
  throw(k: number) {
    for (let i = 0; i < k; i++) {
      const x = this.rng();
      const y = this.rng();
      const inside = this.isInside(x, y);
      if (inside) this.hits++;
      if (this.total < CAP) {
        this.xs[this.total] = x;
        this.ys[this.total] = y;
        this.inside[this.total] = inside ? 1 : 0;
      }
      if (this.pending.length < 60_000) this.pending.push(x, y, inside ? 1 : 0);
      this.total++;
      if (this.total >= this.nextHist) {
        const ci = piConfidence(this.hits, this.total);
        this.hist.push([this.total, ci.est, ci.lo, ci.hi]);
        this.nextHist = Math.max(this.total + 1, Math.ceil(this.total * 1.04));
      }
    }
  }
  drain(): number[] {
    const p = this.pending;
    this.pending = [];
    return p;
  }
  last(): [number, number, boolean] | null {
    if (!this.total || this.total > CAP) return null;
    const i = this.total - 1;
    return [this.xs[i], this.ys[i], !!this.inside[i]];
  }
  get estimate() {
    return this.total ? (4 * this.hits) / this.total : NaN;
  }
}

/** Animates an engine at `rate` darts/second while running. Returns a version counter for re-rendering. */
export function useDartRunner(engine: DartEngine, running: boolean, rate: number, maxDarts = Infinity) {
  const [version, setVersion] = useState(0);
  const acc = useRef(0);
  useAnimationFrame((dt) => {
    acc.current += rate * dt;
    let k = Math.floor(acc.current);
    acc.current -= k;
    k = Math.min(k, maxDarts - engine.total);
    if (k > 0) {
      engine.throw(k);
      setVersion((v) => v + 1);
    }
  }, running && engine.total < maxDarts);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  return [version, bump] as const;
}

interface CanvasProps {
  engine: DartEngine;
  version: number;
  maxSize?: number;
  /** Highlight the latest dart (for slow, dramatic throws). */
  showLast?: boolean;
  onClick?: () => void;
}

export function DartCanvas({ engine, version, maxSize = 460, showLast, onClick }: CanvasProps) {
  const [wrapRef, w] = useWidth<HTMLDivElement>();
  const size = Math.min(maxSize, w);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useThemeKey();
  const drawnFor = useRef<DartEngine | null>(null);
  const colors = useRef({ in: "#f0f", out: "#0ff", bg: "#000", line: "#888", gold: "#ff0" });

  const pad = 6;
  const S = size - pad * 2;
  const toPx = useCallback((x: number, y: number) => [pad + x * S, pad + (1 - y) * S] as const, [S]);

  const dotSize = (n: number) => (n < 300 ? 5 : n < 3000 ? 3 : n < 30000 ? 1.8 : 1.1);

  const drawFrame = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const c = colors.current;
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(pad, pad, S, S);
    },
    [size, S],
  );

  const drawCurve = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const c = colors.current;
      ctx.strokeStyle = c.gold;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (engine.variant === "full") ctx.arc(pad + S / 2, pad + S / 2, S / 2, 0, Math.PI * 2);
      else ctx.arc(pad, pad + S, S, -Math.PI / 2, 0);
      ctx.stroke();
    },
    [engine.variant, S],
  );

  const fullRedraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || size < 50) return;
    colors.current = { in: cssVar("--s1"), out: cssVar("--s2"), bg: cssVar("--bg"), line: cssVar("--line"), gold: cssVar("--s3") };
    const ctx = setupCanvas(cv, size, size);
    drawFrame(ctx);
    const n = Math.min(engine.total, CAP);
    const d = dotSize(engine.total);
    for (let i = 0; i < n; i++) {
      const [px, py] = toPx(engine.xs[i], engine.ys[i]);
      ctx.fillStyle = engine.inside[i] ? colors.current.in : colors.current.out;
      ctx.fillRect(px - d / 2, py - d / 2, d, d);
    }
    engine.drain();
    drawCurve(ctx);
    drawnFor.current = engine;
  }, [engine, size, toPx, drawFrame, drawCurve]);

  // Full redraw on resize / theme / engine change.
  useEffect(() => {
    fullRedraw();
  }, [fullRedraw, theme]);

  // Incremental draw of new darts.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || drawnFor.current !== engine) return fullRedraw();
    if (engine.total === 0) return fullRedraw();
    const ctx = cv.getContext("2d")!;
    const pts = engine.drain();
    const d = dotSize(engine.total);
    for (let i = 0; i < pts.length; i += 3) {
      const [px, py] = toPx(pts[i], pts[i + 1]);
      ctx.fillStyle = pts[i + 2] ? colors.current.in : colors.current.out;
      ctx.fillRect(px - d / 2, py - d / 2, d, d);
    }
    if (pts.length) drawCurve(ctx);
  }, [version, engine, toPx, fullRedraw, drawCurve]);

  const last = showLast ? engine.last() : null;
  return (
    <div ref={wrapRef} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <div className="canvas-wrap" style={{ width: size }}>
        <canvas ref={canvasRef} onClick={onClick} style={{ cursor: onClick ? "crosshair" : undefined }} aria-label={`Dartboard with ${engine.total} darts, ${engine.hits} inside`} />
        {last && (
          <span
            key={engine.total}
            className="bounce"
            style={{
              position: "absolute",
              left: toPx(last[0], last[1])[0] - 14,
              top: toPx(last[0], last[1])[1] - 30,
              fontSize: 28,
              pointerEvents: "none",
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,.5))",
            }}
          >
            {last[2] ? "🎯" : "💨"}
          </span>
        )}
      </div>
    </div>
  );
}
