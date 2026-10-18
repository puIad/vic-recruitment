"use client"

import * as React from "react"
import { CloudUpload, Eye, KeyRound, Lock, LogIn, RotateCcw, Repeat, Info, type LucideIcon } from "lucide-react"

import { VicLogo } from "@/components/brand/vic-logo"
import { RingStage } from "@/components/brand/ring-stage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/user-avatar"
import { savingAtSignOut, signInUrl, signOut } from "@/lib/vic/api"
import { useVic, type Gate } from "@/lib/vic/store"
import { cn } from "@/lib/utils"

interface Copy {
  icon: LucideIcon
  tone: "key" | "lock" | "eye"
  title: string
  lead: string
}

function copyFor(gate: Gate): Copy {
  switch (gate.mode) {
    case "booting":
      return { icon: KeyRound, tone: "key", title: "Checking your access…", lead: "Hold on while we confirm your account can open the dashboard." }
    case "signin":
      return { icon: KeyRound, tone: "key", title: "Sign in to the control room", lead: "The dashboard is for the recruitment team: the editors of the VIC Recruitment 2026 master sheet, and every binome member for their own binome." }
    case "expired":
      return { icon: KeyRound, tone: "key", title: "Your sign-in has expired", lead: "Sign-ins last 48 hours. Sign in again to keep working." }
    case "error":
      return { icon: Lock, tone: "lock", title: "Couldn't reach the recruitment script", lead: gate.message || "Try again in a moment." }
    case "noaccess": {
      const r = gate.access?.reason
      if (r === "DOMAIN") return { icon: Lock, tone: "lock", title: "Use your ENP account", lead: "Only @g.enp.edu.dz accounts can open the dashboard." }
      if (r === "NO_EMAIL") return { icon: Lock, tone: "lock", title: "We couldn't tell which account you're using", lead: "Google didn't share your email with the script, so it can't check your access." }
      if (r === "NOT_SHARED")
        return {
          icon: Lock,
          tone: "lock",
          title: `Binome ${gate.access?.binome || ""} isn't open yet`.replace("  ", " "),
          lead: "You're in this binome, but the admins haven't opened its sheet and dashboard to you yet. Once they do, press Try again.",
        }
      if (r === "READ_ONLY") return { icon: Eye, tone: "eye", title: "This account can only view the project", lead: "It can open the VIC Recruitment 2026 master sheet but isn't an editor, and it isn't in a binome either." }
      return { icon: Lock, tone: "lock", title: "This account doesn't have access to the project", lead: "It can't open the VIC Recruitment 2026 master sheet, so there's no dashboard to show." }
    }
    default:
      return { icon: KeyRound, tone: "key", title: "", lead: "" }
  }
}

const TONE: Record<Copy["tone"], string> = {
  key: "bg-accent text-primary",
  lock: "bg-danger-soft text-danger",
  eye: "bg-info-soft text-info",
}

/**
 * Sign-in, expired, no-access and error states. On wide screens the form sits in the iris of the charter's
 * section-divider disc; on a phone the disc becomes the gradient band the form rises out of.
 */
export function GateScreen() {
  const gate = useVic((s) => s.gate)
  const c = copyFor(gate)
  const booting = gate.mode === "booting"
  const noaccess = gate.mode === "noaccess"
  const bad = noaccess || gate.mode === "error"
  const access = gate.mode === "noaccess" ? gate.access : undefined
  const readOnly = access?.reason === "READ_ONLY"
  const Icon = c.icon
  // changes still pending when this sign-in ended (expired here) or was signed out (counted before the reload)
  const pending = useVic((s) => Object.values(s.rec).filter((e) => e.state === "pending").length)
  const saving = gate.mode === "signin" || gate.mode === "expired" ? Math.max(pending, savingAtSignOut) : 0

  return (
    <RingStage aria-busy={booting} aria-labelledby="gate-title">
        <VicLogo className="mx-auto mb-6 hidden h-14 w-auto md:block" />

        <span className={cn("mx-auto mb-4 flex size-14 items-center justify-center rounded-full", TONE[c.tone])} aria-hidden="true">
          <Icon className={cn("size-6", booting && "animate-pulse")} />
        </span>
        <h1 id="gate-title" className="text-balance text-[1.7rem] font-extrabold leading-tight tracking-tight text-heading">
          {c.title}
        </h1>
        <p className="mt-2 text-balance text-base font-normal text-muted-foreground">{c.lead}</p>

        {noaccess && access?.email && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border bg-background/80 p-3 text-left">
            <UserAvatar email={access.email} photo={access.photo} className="size-9 text-sm" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-xs text-muted-foreground">Signed in as</span>
              <span className="block truncate text-sm font-bold">{access.email}</span>
            </span>
            <Badge variant={readOnly ? "info" : "danger"}>{readOnly ? "View only" : "No access"}</Badge>
          </div>
        )}

        {noaccess && (
          <ol className="mt-4 space-y-2 text-left text-sm">
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
              <span>
                <b>Switch account</b> if one of your other ENP Google accounts runs the project.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
              <span>
                {access?.reason === "NOT_SHARED" ? (
                  <>Or ask a recruitment admin to <b>open your binome</b> to you, then try again.</>
                ) : (
                  <>Or ask a recruitment admin to add you to a <b>binome</b> or as an <b>editor</b> of the master sheet, then try again.</>
                )}
              </span>
            </li>
          </ol>
        )}

        {saving > 0 && (
          <div role="status" className="mt-5 flex items-start gap-3 rounded-2xl border bg-background/80 p-3 text-left text-sm">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary" aria-hidden="true">
              <CloudUpload className="size-4" />
            </span>
            <span className="leading-snug">
              <b className="block font-semibold">
                {saving === 1 ? "1 of your changes is" : `${saving} of your changes are`} still being saved
              </b>
              <span className="text-muted-foreground">
                {saving === 1 ? "It finishes" : "They finish"} on {saving === 1 ? "its" : "their"} own. If one can't be saved, you'll see it at your next sign-in and by email.
              </span>
            </span>
          </div>
        )}

        {!booting && (
          <div className="mt-6 flex flex-col gap-2">
            <Button
              size="lg"
              autoFocus
              onClick={() => (bad ? signOut(signInUrl) : (window.location.href = signInUrl))}
              className="w-full"
            >
              {noaccess ? <Repeat /> : <LogIn />}
              {noaccess ? "Switch account" : gate.mode === "error" ? "Sign in again" : "Sign in with Google"}
            </Button>
            {bad && (
              <Button size="lg" variant="outline" className="w-full" onClick={() => window.location.reload()}>
                <RotateCcw />
                Try again
              </Button>
            )}
          </div>
        )}

        {!noaccess && (
          <p className="mt-5 flex items-start gap-2 text-left text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Sign in with your <b className="font-semibold text-foreground/80">@g.enp.edu.dz</b> account. Google asks for the permissions once every 48 hours; signing out and back in within that window skips the permission screen.
            </span>
          </p>
        )}
    </RingStage>
  )
}

/** Runs the access check once and shows the gate until the account is cleared. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const mode = useVic((s) => s.gate.mode)
  const boot = useVic((s) => s.boot)
  React.useEffect(() => {
    boot()
  }, [boot])
  if (mode === "ok" || mode === "member") return <>{children}</>
  return <GateScreen />
}
