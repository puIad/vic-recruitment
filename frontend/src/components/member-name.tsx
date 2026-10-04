import { Fragment, useMemo } from "react"
import { useVic } from "@/lib/vic/store"
import { cn } from "@/lib/utils"

const TONE: Record<string, string> = {
  IT: "text-dep-it",
  COMM: "text-dep-comm",
  HR: "text-dep-hr",
  FLER: "text-dep-fler",
}

const key = (s: string) => s.trim().toLowerCase()

/** Name or email of an OT member to the department they pair as. Interviewees are never in it, so they stay uncoloured. */
function useDeptOf() {
  const state = useVic((s) => s.state)
  return useMemo(() => {
    const byName = new Map<string, string>()
    const byEmail = new Map<string, string>()
    const add = (m: { name?: string; email?: string; pairAs?: string }) => {
      const dep = (m.pairAs || "").toUpperCase()
      if (!TONE[dep]) return
      if (m.name) byName.set(key(m.name), dep)
      if (m.email) byEmail.set(key(m.email), dep)
    }
    state?.teamList.forEach(add)
    state?.unpaired.forEach(add)
    return (s: string) => byEmail.get(key(s)) ?? byName.get(key(s))
  }, [state])
}

/** An OT member's name, in the colour of their department (IT red, COMM blue, HR green, FLER yellow). */
export function MemberName({ name, className }: { name: string; className?: string }) {
  const dep = useDeptOf()(name)
  return <span className={cn(dep && TONE[dep], className)}>{name}</span>
}

/** Several members joined with " & ". */
export function MemberNames({ names, empty = "—" }: { names: string[]; empty?: string }) {
  if (!names.length) return <>{empty}</>
  return (
    <>
      {names.map((n, i) => (
        <Fragment key={i}>
          {i > 0 && " & "}
          <MemberName name={n} />
        </Fragment>
      ))}
    </>
  )
}
