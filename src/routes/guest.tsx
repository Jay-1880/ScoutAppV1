import { useState, type FormEvent, type ReactNode } from "react"
import { useNavigate, useParams } from "react-router"
import { useQuery } from "convex/react"
import { Clock3, ShieldCheck } from "lucide-react"

import frc1880Logo from "@/assets/frc1880.png"
import { ScoutingBoard } from "@/components/scouting-board"
import { ThemeModeMenu } from "@/components/theme-mode-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "../../convex/_generated/api"

function GuestShell({ children }: { children: ReactNode }) {
  return (
    <main className="safe-area min-h-svh text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-3 sm:px-6 sm:py-4">
        <header className="app-header flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 shadow-sm sm:px-4">
          <div className="flex items-center gap-2">
            <img src={frc1880Logo} alt="Team 1880 logo" className="size-8 rounded-md object-contain" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">1880 Scout</div>
              <div className="text-xs text-muted-foreground">Alliance partner view</div>
            </div>
          </div>
          <ThemeModeMenu />
        </header>
        {children}
      </div>
    </main>
  )
}

export function GuestCodeEntry() {
  const navigate = useNavigate()
  const [code, setCode] = useState("")
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "")
    if (clean) navigate(`/guest/${clean}`)
  }
  return (
    <GuestShell>
      <form className="surface-card fade-up mx-auto mt-8 grid w-full max-w-md gap-4 p-5" onSubmit={submit}>
        <div>
          <h1 className="text-xl font-semibold">Alliance partner access</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter the guest code Team 1880 gave you to see our scouting data. No account needed.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="guestCode">Guest code</Label>
          <Input
            id="guestCode"
            className="h-11 font-mono uppercase tracking-widest"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="ABCD234XYZ"
          />
        </div>
        <Button type="submit" className="h-11 text-base" disabled={!code.trim()}>View scouting data</Button>
        <a href="/" className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline">Team 1880 member? Sign in here</a>
      </form>
    </GuestShell>
  )
}

export function GuestRoute() {
  const { code = "" } = useParams()
  const data = useQuery(api.guest.getGuestData, { code })

  if (data === undefined) {
    return (
      <GuestShell>
        <div className="surface-card h-48 animate-pulse" />
      </GuestShell>
    )
  }

  if (!data.ok) {
    const message =
      data.reason === "expired" ? "This guest code has expired." :
      data.reason === "revoked" ? "This guest code has been turned off." :
      "That guest code doesn't exist."
    return (
      <GuestShell>
        <div className="surface-card fade-up mx-auto mt-8 grid w-full max-w-md gap-3 p-5 text-center">
          <h1 className="text-lg font-semibold">{message}</h1>
          <p className="text-sm text-muted-foreground">Ask Team 1880's scouting lead for a new code.</p>
          <a href="/guest" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Enter a different code</a>
        </div>
      </GuestShell>
    )
  }

  return (
    <GuestShell>
      <section className="hero-banner fade-up rounded-xl border p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Shared by FRC Team 1880</div>
            <h1 className="text-xl font-semibold sm:text-2xl">{data.event?.name ?? "No event yet"}</h1>
            <p className="text-sm text-muted-foreground">Read-only scouting data for {data.label}.</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border bg-background/60 px-3 py-1 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" />
            Access until {new Date(data.expiresAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}
          </div>
        </div>
      </section>

      {data.teams.length ? (
        <ScoutingBoard teams={data.teams} />
      ) : (
        <div className="surface-card p-6 text-center text-sm text-muted-foreground">No teams to show yet.</div>
      )}

      <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Read-only view shared by Team 1880. Please don't redistribute.
      </p>
    </GuestShell>
  )
}
