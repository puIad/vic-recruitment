import { create } from "zustand"

export type ChangeMode = "replace" | "swap" | "cover"

export interface MemberSheetOpen {
  mode?: ChangeMode
  binome?: string
  inEmail?: string
  inName?: string
  codes?: string
}

interface UiStore {
  customizerOpen: boolean
  setCustomizerOpen: (o: boolean) => void
  /** Change members sheet (replace / swap / cover): opened from the Binomes page, an unpaired row, a table row */
  memberSheet: (MemberSheetOpen & { open: boolean; nonce: number }) | null
  openMemberSheet: (o?: MemberSheetOpen) => void
  closeMemberSheet: () => void
  /** Move an interviewee to another binome */
  moveDialog: { open: boolean; code?: string; binome?: string; nonce: number } | null
  openMoveDialog: (o?: { code?: string; binome?: string }) => void
  closeMoveDialog: () => void
}

/** Small UI flags shared between the header, the shell and the pages that open the two work panels. */
export const useUi = create<UiStore>((set, get) => ({
  customizerOpen: false,
  setCustomizerOpen: (customizerOpen) => set({ customizerOpen }),
  memberSheet: null,
  openMemberSheet: (o = {}) => set({ memberSheet: { ...o, open: true, nonce: (get().memberSheet?.nonce ?? 0) + 1 } }),
  closeMemberSheet: () => set((s) => (s.memberSheet ? { memberSheet: { ...s.memberSheet, open: false } } : s)),
  moveDialog: null,
  openMoveDialog: (o = {}) => set({ moveDialog: { ...o, open: true, nonce: (get().moveDialog?.nonce ?? 0) + 1 } }),
  closeMoveDialog: () => set((s) => (s.moveDialog ? { moveDialog: { ...s.moveDialog, open: false } } : s)),
}))
