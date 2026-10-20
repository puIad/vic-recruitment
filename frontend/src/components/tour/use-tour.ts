import * as React from "react"

/** start(): run the onboarding tour from its first step (Help's Replay button). Provided by TourProvider in the app shell. */
export const TourCtx = React.createContext<{ start: () => void }>({ start: () => {} })
export const useTour = () => React.useContext(TourCtx)
