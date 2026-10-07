import type { ComponentType, ReactNode } from "react";

export type Audience = "teen" | "adult" | "scientist";
export type ConceptId = "montecarlo" | "markov" | "dh";

export const AUDIENCES: { id: Audience; label: string; emoji: string; blurb: string }[] = [
  { id: "teen", label: "Teen", emoji: "🧃", blurb: "Games, darts and dares" },
  { id: "adult", label: "Adult", emoji: "☕", blurb: "Real-world, hands-on" },
  { id: "scientist", label: "Scientist", emoji: "🧪", blurb: "Proofs, spectra, code" },
];

export const CONCEPTS: { id: ConceptId; label: string; short: string; emoji: string; color: string; tagline: string }[] = [
  { id: "montecarlo", label: "Monte Carlo", short: "Monte Carlo", emoji: "🎯", color: "var(--mc)", tagline: "If you can't solve it, simulate it a million times." },
  { id: "markov", label: "Markov Chains", short: "Markov", emoji: "🔗", color: "var(--mk)", tagline: "The future depends only on now." },
  { id: "dh", label: "Diffie–Hellman", short: "Diffie–Hellman", emoji: "🔐", color: "var(--dh)", tagline: "Agree on a secret while the whole world listens." },
];

export interface QuizQuestion {
  q: ReactNode;
  options: ReactNode[];
  answer: number;
  explain: ReactNode;
}

export interface Chapter {
  id: string;
  title: string;
  emoji?: string;
  intro: ReactNode;
  Widget: ComponentType;
  takeaway?: ReactNode;
  quiz?: QuizQuestion[];
}

export interface Track {
  title: ReactNode;
  tagline: ReactNode;
  history?: { when: string; what: ReactNode }[];
  chapters: Chapter[];
}
