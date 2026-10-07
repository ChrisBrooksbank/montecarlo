import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Toast {
  id: number;
  emoji: string;
  title: string;
  detail?: string;
}

interface ProgressState {
  /** key: `${concept}/${audience}/${chapterId}` */
  completed: Record<string, number>;
  achievements: Record<string, number>;
  bests: Record<string, number>;
  toasts: Toast[];
  complete: (key: string) => void;
  uncomplete: (key: string) => void;
  award: (id: string, emoji: string, title: string, detail?: string) => void;
  /** Record a score; `lowerIsBetter` for things like error. Returns true if it's a new best. */
  recordBest: (id: string, value: number, lowerIsBetter?: boolean) => boolean;
  dismissToast: (id: number) => void;
  reset: () => void;
}

let toastId = 0;

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      completed: {},
      achievements: {},
      bests: {},
      toasts: [],
      complete: (key) => {
        if (get().completed[key]) return;
        set((s) => ({ completed: { ...s.completed, [key]: Date.now() } }));
      },
      uncomplete: (key) =>
        set((s) => {
          const c = { ...s.completed };
          delete c[key];
          return { completed: c };
        }),
      award: (id, emoji, title, detail) => {
        if (get().achievements[id]) return;
        const t = { id: ++toastId, emoji, title, detail };
        set((s) => ({ achievements: { ...s.achievements, [id]: Date.now() }, toasts: [...s.toasts, t] }));
        setTimeout(() => get().dismissToast(t.id), 5000);
      },
      recordBest: (id, value, lowerIsBetter = false) => {
        const prev = get().bests[id];
        const better = prev === undefined || (lowerIsBetter ? value < prev : value > prev);
        if (better) set((s) => ({ bests: { ...s.bests, [id]: value } }));
        return better;
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      reset: () => set({ completed: {}, achievements: {}, bests: {} }),
    }),
    { name: "mc-progress", partialize: (s) => ({ completed: s.completed, achievements: s.achievements, bests: s.bests }) },
  ),
);
