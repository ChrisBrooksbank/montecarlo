import type { Matrix } from "../lib/markov";

export const WEATHER = [
  { label: "Sunny", emoji: "☀️", color: "var(--s3)" },
  { label: "Cloudy", emoji: "☁️", color: "var(--ink-dim)" },
  { label: "Rainy", emoji: "🌧️", color: "var(--s2)" },
];

export const WEATHER_P: Matrix = [
  [0.7, 0.2, 0.1],
  [0.3, 0.4, 0.3],
  [0.2, 0.4, 0.4],
];
