import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingState {
  completed: boolean;
  complete: () => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(persist((set) => ({
  completed: false,
  complete: () => set({ completed: true }),
  reset: () => set({ completed: false }),
}), {
  name: "docsys-onboarding",
  version: 1,
}));
