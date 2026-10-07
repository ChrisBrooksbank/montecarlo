import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Audience } from "../types";

interface AudienceState {
  audience: Audience;
  setAudience: (a: Audience) => void;
}

export const useAudience = create<AudienceState>()(
  persist((set) => ({ audience: "adult", setAudience: (audience) => set({ audience }) }), { name: "mc-audience" }),
);
