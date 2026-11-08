import { useMemo, useState, type FormEvent, type ReactNode } from "react"
import { useNavigate, useParams } from "react-router"
import { useQuery } from "convex/react"
import { ChevronDown, Clock3, Search, ShieldCheck } from "lucide-react"

import frc1880Logo from "@/assets/frc1880.png"
import { ThemeModeMenu } from "@/components/theme-mode-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { endgameLabels, tagLabels } from "@/lib/types"
import { cn } from "@/lib/utils"
import { api } from "../../convex/_generated/api"

const shotRangeLabels: Record<string, string> = {
  close: "At the hub",
  mid: "Set spots",
  long: "Anywhere in zone",
  none: "Doesn't shoot",
}
const climbLabels: Record<string, string> = { none: "Can't climb", l1: "Level 1", l2: "Level 2", l3: "Level 3" }
const traverseLabels: Record<string, string> = { trench: "Trench", bump: "Bump", both: "Trench or bump", other: "Neither" }

type SortKey = "number" | "rank" | "teleop" | "auto" | "climb"

function fmt(value: number | null | undefined, digits = 1) {
  return value == null ? "—" : value.toFixed(digits)
}

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
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("teleop")
  const [openTeam, setOpenTeam] = useState<number | null>(null)

  const rows = useMemo(() => {
    if (!data?.ok) return []
    const query = search.trim().toLowerCase()
    const filtered = data.teams.filter((team) => !query || `${team.teamNumber} ${team.nickname}`.toLowerCase().includes(query))
    const num = (value: number | null) => value ?? -1
    return [...filtered].sort((a, b) => {
      if (sort === "rank") return (a.eventRank ?? 9999) - (b.eventRank ?? 9999)
      if (sort === "teleop") return num(b.avgTeleopFuel) - num(a.avgTeleopFuel)
      if (sort === "auto") return num(b.avgAutoFuel) - num(a.avgAutoFuel)
      if (sort === "climb") return num(b.avgClimbPoints) - num(a.avgClimbPoints)
      return a.teamNumber - b.teamNumber
    })
  }, [data, search, sort])

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

      <section className="surface-card grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search number or name" inputMode="search" aria-label="Search teams" />
        </div>
        <select
          className="h-10 rounded-lg border bg-background px-2 text-base sm:text-sm"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          aria-label="Sort teams"
        >
          <option value="teleop">Sort: teleop fuel</option>
          <option value="auto">Sort: auto fuel</option>
          <option value="climb">Sort: climb points</option>
          <option value="rank">Sort: event rank</option>
          <option value="number">Sort: team number</option>
        </select>
      </section>

      {rows.length === 0 ? (
        <div className="surface-card p-6 text-center text-sm text-muted-foreground">No teams to show yet.</div>
      ) : (
        <section className="surface-card divide-y overflow-hidden">
          <div className="hidden grid-cols-[4.5rem_1fr_repeat(5,5.5rem)_1.5rem] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>Team</span>
            <span />
            <span className="text-right">Auto fuel</span>
            <span className="text-right">Teleop fuel</span>
            <span className="text-right">Climb pts</span>
            <span className="text-right">Driver</span>
            <span className="text-right">Reports</span>
            <span />
          </div>
          {rows.map((team) => {
            const open = openTeam === team.teamNumber
            const topTags = Object.entries(team.tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 4)
            return (
              <div key={team.teamNumber}>
                <button
                  type="button"
                  onClick={() => setOpenTeam(open ? null : team.teamNumber)}
                  aria-expanded={open}
                  className="grid w-full grid-cols-[4rem_1fr_1.5rem] items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/50 md:grid-cols-[4.5rem_1fr_repeat(5,5.5rem)_1.5rem] md:px-4"
                >
                  <span className="text-lg font-semibold tabular-nums">{team.teamNumber}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{team.nickname}</span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground md:hidden">
                      <span>Auto {fmt(team.avgAutoFuel)}</span>
                      <span>Tele {fmt(team.avgTeleopFuel)}</span>
                      <span>Climb {fmt(team.avgClimbPoints, 0)}</span>
                      {team.eventRank ? <span>Rank {team.eventRank}</span> : null}
                    </span>
                    {team.eventRank ? <span className="hidden text-xs text-muted-foreground md:block">Rank {team.eventRank}</span> : null}
                  </span>
                  <span className="hidden text-right tabular-nums md:block">{fmt(team.avgAutoFuel)}</span>
                  <span className="hidden text-right tabular-nums md:block">{fmt(team.avgTeleopFuel)}</span>
                  <span className="hidden text-right tabular-nums md:block">{fmt(team.avgClimbPoints, 0)}</span>
                  <span className="hidden text-right tabular-nums md:block">{fmt(team.avgDriver)}</span>
                  <span className="hidden text-right tabular-nums md:block">{team.matchCount}</span>
                  <ChevronDown className={cn("size-4 justify-self-end text-muted-foreground transition-transform", open && "rotate-180")} />
                </button>
                {open ? (
                  <div className="grid gap-3 bg-muted/30 px-3 py-3 text-sm animate-in fade-in duration-200 md:grid-cols-2 md:px-4">
                    <div className="grid gap-1.5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From matches ({team.matchCount})</div>
                      <Row label="Usual endgame" value={team.usualClimb ? endgameLabels[team.usualClimb] ?? team.usualClimb : "—"} />
                      <Row label="Climbed L1 in auto" value={team.autoClimbRate == null ? "—" : `${Math.round(team.autoClimbRate * 100)}% of matches`} />
                      <Row label="Driver / defense" value={`${fmt(team.avgDriver)} / ${fmt(team.avgDefense)}`} />
                      <Row label="Fouls per match" value={fmt(team.avgFouls)} />
                      {topTags.length ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {topTags.map(([tag, count]) => (
                            <span key={tag} className="rounded-full border bg-background px-2 py-0.5 text-xs">{tagLabels[tag] ?? tag} ×{count}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="grid gap-1.5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From the pits</div>
                      {team.pit ? (
                        <>
                          <Row label="Scores from" value={team.pit.shotRange ? shotRangeLabels[team.pit.shotRange] : "—"} />
                          <Row label="Shoots while driving" value={team.pit.shootOnMove ? "Yes" : "No"} />
                          <Row label="Holds" value={team.pit.fuelCapacity != null ? `${team.pit.fuelCapacity} fuel` : "—"} />
                          <Row label="Intake" value={[team.pit.groundIntake ? "Floor" : null, team.pit.humanPlayerIntake ? "Human player" : null].filter(Boolean).join(" + ") || "—"} />
                          <Row label="Highest climb" value={climbLabels[team.pit.maxClimb] ?? "—"} />
                          <Row label="Crosses via" value={traverseLabels[team.pit.traverse] ?? team.pit.traverse} />
                          <Row label="Drivetrain" value={team.pit.drivetrain} />
                        </>
                      ) : (
                        <div className="text-muted-foreground">Not pit scouted yet.</div>
                      )}
                    </div>
                    {team.pit?.notes || team.notes.length ? (
                      <div className="grid gap-1.5 md:col-span-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scout notes</div>
                        {team.pit?.notes ? <p className="rounded-md bg-background px-3 py-2">{team.pit.notes}</p> : null}
                        {team.notes.map((note, index) => (
                          <p key={index} className="rounded-md bg-background px-3 py-2 text-muted-foreground">{note}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </section>
      )}

      <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        Read-only view shared by Team 1880. Please don't redistribute.
      </p>
    </GuestShell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
