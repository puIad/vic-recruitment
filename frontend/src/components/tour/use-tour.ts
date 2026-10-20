import * as React from "react"

/** start(): run the onboarding tour from its first step (Help's Replay button); running: the tour is up (the phone
 *  drawer turns non-modal so it does not trap focus away from the card). Provided by TourProvider in the app shell. */
export const TourCtx = React.createContext<{ start: () => void; running: boolean }>({ start: () => {}, running: false })
export const useTour = () => React.useContext(TourCtx)
