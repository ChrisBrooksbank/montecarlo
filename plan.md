# Plan: Interactive Teaching App for Markov Chains, Monte Carlo, and Diffie-Hellman

## Context
Building a React + TypeScript interactive web app that teaches three concepts (Markov Chains, Monte Carlo Method, Diffie-Hellman Key Exchange) to three audience levels (teen, adult, scientist). Research completed in `research.md`. The app combines visual simulations, hands-on code editors, and guided step-by-step tutorials.

> **Status: implemented.** The app below is built. The notes marked *as built* record where the implementation deliberately differs from the original plan.

## Tech Stack
- **Vite + React 18 + TypeScript**
- **Zustand** for state management (60fps simulation state)
- **Framer Motion** for SVG animations
- **Canvas** for high-particle simulations (dartboard)
- **CodeMirror 6** for embedded code editors (scientist mode); user code runs in a **Web Worker** sandbox with a timeout (no `window`/`document` access, infinite loops can be killed)
- **KaTeX** for math rendering
- **Tailwind CSS** for styling with audience-specific themes
- **D3 utilities** (scales, shapes only) for data viz helpers
- **Radix UI** for accessible slider/tooltip primitives

*As built:* Vite + React 19 + TypeScript + Zustand + KaTeX. Framer Motion, D3, Tailwind, Radix and CodeMirror were dropped to keep the bundle small (~90 kB gzipped core). Charts are a small hand-written SVG library (`components/charts.tsx`), animation uses `requestAnimationFrame`, themes are CSS custom properties, and the code editor is a lightweight textarea with a line gutter. Code labs run in a throwaway Web Worker with network APIs removed and a 4 s kill switch.

## Architecture

### Audience Adaptation (3 mechanisms)
1. **Content objects** (`src/content/{concept}/{audience}.ts`) — swap text, analogies, quiz questions
2. **Conditional component rendering** — different simulation widgets per audience
3. **CSS theme variables** — typography, palette, density change per audience

### State Management (3 zustand stores)
- `audienceStore` — current audience, persisted to localStorage
- `progressStore` — 9 independent tracks (concept x audience), persisted
- `simulationStore` — play/pause/speed/step, NOT persisted

### Visualization Strategy
- **SVG + framer-motion** for state diagrams, flow diagrams (interactive, accessible)
- **Canvas** for particle simulations (dartboard with 100K+ points) — draw only new darts each frame onto a persistent canvas instead of redrawing every point
- **D3 utilities** for scales/interpolation only (no d3 DOM manipulation)

## Feature Matrix

### Markov Chains
| Teen | Adult | Scientist |
|------|-------|-----------|
| Text predictor (type & see Markov predictions) | Weather simulator (click through days) | Editable NxN matrix with validation |
| Playlist shuffler (song transitions) | Editable 3x3 matrix | Eigenvalue visualization |
| Emoji state builder sandbox | 1000-day convergence demo | Stationary distribution convergence |
| "Memoryless Master" achievement | Real-world application cards | Code lab (implement from scratch) |

### Monte Carlo
| Teen | Adult | Scientist |
|------|-------|-----------|
| Gamified dart throwing with scoring | Split view: dartboard + convergence | Formal MC estimator derivation |
| Speed slider + personal best leaderboard | Investment portfolio simulator (1000 runs) | Variance reduction comparison (4 methods) |
| "Why does this work?" visual explainer | Confidence interval visualization | Custom f(x) integration via code editor |
| "Pi Champion" challenge (estimate within 0.01) | Application cards (insurance, elections) | Quasi-MC (Halton/Sobol) visualizer |

### Diffie-Hellman
| Teen | Adult | Scientist |
|------|-------|-----------|
| Color picker paint-mixing game | TLS handshake walkthrough | Group theory explorer (cyclic groups) |
| "Be Eve" hacking challenge (50 attempts; p grows each round until 50 guesses can't cover the key space) | Small-number mod-arithmetic calculator | Elliptic curve DH visualizer |
| Small numbers version with calculator | One-way function speed demo | Parameter selection (safe primes) |
| Spy narrative quiz | Man-in-the-middle attack animation | Code lab: implement DH + ECDH |

## Project Structure (as built)
```
src/
├── main.tsx, App.tsx              shell, routing (HashRouter, so it works from any static host)
├── types.ts                       Audience, ConceptId, Track/Chapter/Quiz types
├── routes/                        Home, ConceptPage (lazy-loads one track per concept × audience), Connections
├── stores/                        audience, progress (zustand + localStorage: chapters, achievements, bests)
├── hooks/                         useAnimationFrame, useWidth, useInView, useThemeKey, setupCanvas, cssVar
├── components/                    charts (LineChart/Histogram/Bars), StateDiagram, MatrixEditor, CodeLab, Tex, ui, ErrorBoundary
├── sims/                          shared simulations: darts engine, Metropolis sampler, modular Clock, weather chain
├── tracks/{montecarlo,markov,dh}/{teen,adult,scientist}.tsx   9 tracks: chapters, widgets, quizzes
├── lib/                           random, montecarlo, markov, diffiehellman (+ __tests__)
└── styles/global.css              audience themes (teen neon / adult midnight / scientist paper)
```
Content lives next to its widgets in each track file rather than in separate `content/` files: each chapter's text, simulation and quiz are tightly coupled.

## Implementation Order
1. **Foundation** — Vite scaffold, routing, layout, zustand stores, shared components, CSS themes
2. **Monte Carlo** — Start here (most visual, simplest logic). DartBoard canvas, pi estimation, all 3 audiences
3. **Markov Chains** — StateDiagram SVG, transition matrix, text predictor, weather sim, eigenvalue viz
4. **Diffie-Hellman** — ColorMixer canvas, key exchange flow, Eve challenge, TLS walkthrough, ECDH
5. **Polish** — Responsive design, accessibility, lazy loading, PWA, cross-concept connections page
6. **Testing** — Unit tests (lib/), component tests (shared), manual test all 9 combinations

## Verification
- Run `npm run dev` and navigate all 9 concept x audience paths
- Verify simulations run at 60fps (especially dartboard at 100K points)
- Test audience switching mid-session preserves progress
- Verify code editor sandboxing (no access to window/document)
- Test on mobile viewports
- Run `npm run test` for unit + component tests
