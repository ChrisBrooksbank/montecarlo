import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Calls `cb(dtSeconds)` every animation frame while `running`. */
export function useAnimationFrame(cb: (dt: number) => void, running: boolean) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      ref.current(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}

/** Observed content-box width of an element. */
export function useWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || fallback);
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w] as const;
}

/** Resolve a CSS custom property (for canvas drawing). Re-reads when the theme changes. */
export function cssVar(name: string, el: Element = document.documentElement): string {
  const root = document.querySelector("[data-audience]") ?? el;
  const v = getComputedStyle(root).getPropertyValue(name).trim();
  return v || "#888";
}

/** True once the element has scrolled near the viewport (and stays true). */
export function useInView<T extends HTMLElement>(margin = "300px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin, seen]);
  return [ref, seen] as const;
}

/** Bumps whenever the audience theme changes so canvases can repaint with new colours. */
export function useThemeKey(): string {
  const [key, setKey] = useState(() => document.querySelector("[data-audience]")?.getAttribute("data-audience") ?? "");
  useEffect(() => {
    const el = document.querySelector("[data-audience]");
    if (!el) return;
    const mo = new MutationObserver(() => setKey(el.getAttribute("data-audience") ?? ""));
    mo.observe(el, { attributes: true, attributeFilter: ["data-audience", "data-concept"] });
    return () => mo.disconnect();
  }, []);
  return key;
}

/** Device-pixel-ratio aware canvas setup. Returns the 2D context scaled to CSS pixels. */
export function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  canvas.style.aspectRatio = `${w} / ${h}`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
