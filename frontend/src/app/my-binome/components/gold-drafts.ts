// Where My binome keeps a candidate's unsaved fields in this browser (gold-fields.tsx), shared with the panel that closes it.
import { GOLD_KEYS, type GoldKey } from "@/lib/vic/types"

export const draftKey = (binome: string, code: string, k: GoldKey) => `vic:gold:${binome}:${code}:${k}`

/** The candidate's drafts, gone: closing with "Discard changes" must not bring them back on the next open. */
export function dropDrafts(binome: string, code: string) {
  for (const k of GOLD_KEYS) {
    try {
      localStorage.removeItem(draftKey(binome, code, k))
    } catch {
      /* no storage: no draft */
    }
  }
}
