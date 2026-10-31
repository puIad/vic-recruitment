import * as React from "react"
import { useConfirm } from "./confirm"
import { useUi } from "./ui"
import { useProfile } from "./analytics"
import type { MoveOffer } from "./types"

/**
 * An edit saved a 1st choice their binome does not take: say so and offer Move interviewee (nothing moves without that click).
 * inline: the edit came from a table cell, so the answer opens their details instead of the move form (docs/admin-features.md).
 */
export function useOfferMove() {
  const confirm = useConfirm()
  return React.useCallback(
    async (move: MoveOffer, name: string, inline = false) => {
      const who = name || move.code
      const ok = await confirm({
        title: inline ? `${who} needs a different binome` : `Move ${who} to a binome that takes ${move.dep}?`,
        body: (
          <p>
            The change is saved. <b>{move.binome}</b> does not take {move.dep}, so {who} stays there until you move them.
            {inline ? " Open their details to move them." : " Contacted, the date and the notes go along."}
          </p>
        ),
        okLabel: inline ? "Open their details" : "Choose a binome",
      })
      if (!ok) return
      if (inline) useProfile.getState().show(move.code)
      else useUi.getState().openMoveDialog({ code: move.code })
    },
    [confirm]
  )
}
