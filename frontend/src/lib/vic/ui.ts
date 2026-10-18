import { create } from "zustand"

export type ChangeMode = "replace" | "swap" | "pair" | "cover"

export interface MemberSheetOpen {
  mode?: ChangeMode
  binome?: string
  inEmail?: string
  inName?: string
  codes?: string
  /** opened from this alert: it is resolved once the change is done */
  alertId?: string
}

export const RADIUS_DEFAULT = "0.875rem"

function savedPalette(): string {
  try {
    return localStorage.getItem("vic-palette") || "vic"
  } catch {
    return "vic"
  }
}

interface UiStore {
  customizerOpen: boolean
  setCustomizerOpen: (o: boolean) => void
  /** palette and corner radius: shared by the header's customizer drawer and the Appearance page */
  palette: string
  setPalette: (p: string) => void
  radius: string
  setRadius: (r: string) => void
  /** Change members sheet (replace / swap / new binome / cover): opened from the Binomes page, an unpaired row, a table row */
  memberSheet: (MemberSheetOpen & { open: boolean; nonce: number }) | null
  openMemberSheet: (o?: MemberSheetOpen) => void
  closeMemberSheet: () => void
  /** Move an interviewee to another binome */
  moveDialog: { open: boolean; code?: string; binome?: string; alertId?: string; nonce: number } | null
  openMoveDialog: (o?: { code?: string; binome?: string; alertId?: string }) => void
  closeMoveDialog: () => void
}

/** Small UI flags shared between the header, the shell and the pages that open the two work panels. */
export const useUi = create<UiStore>((set, get) => ({
  customizerOpen: false,
  setCustomizerOpen: (customizerOpen) => set({ customizerOpen }),
  palette: savedPalette(),
  setPalette: (palette) => {
    try {
      localStorage.setItem("vic-palette", palette)
    } catch {
      /* private mode: the choice just won't persist */
    }
    set({ palette })
  },
  radius: RADIUS_DEFAULT,
  setRadius: (radius) => set({ radius }),
  memberSheet: null,
  openMemberSheet: (o = {}) => set({ memberSheet: { ...o, open: true, nonce: (get().memberSheet?.nonce ?? 0) + 1 } }),
  closeMemberSheet: () => set((s) => (s.memberSheet ? { memberSheet: { ...s.memberSheet, open: false } } : s)),
  moveDialog: null,
  openMoveDialog: (o = {}) => set({ moveDialog: { ...o, open: true, nonce: (get().moveDialog?.nonce ?? 0) + 1 } }),
  closeMoveDialog: () => set((s) => (s.moveDialog ? { moveDialog: { ...s.moveDialog, open: false } } : s)),
}))
