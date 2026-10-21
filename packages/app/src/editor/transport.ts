/**
 * The editor's transport (docs/INTERFAZ.md §4): playing forwards or
 * backwards, and how fast (J K L, as in Premiere). The playhead itself is in
 * the store (`editTime`), kept with the production's tab.
 */

import { create } from "zustand";

interface Transport {
  /** 0: stopped; 1, 2, 4: forwards; −1, −2, −4: backwards. */
  rate: number;
  set: (rate: number) => void;
}

export const useTransport = create<Transport>((set) => ({ rate: 0, set: (rate) => set({ rate }) }));

export const stop = () => useTransport.getState().set(0);
export const isPlaying = () => useTransport.getState().rate !== 0;
