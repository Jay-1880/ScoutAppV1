import { useMemo, useState } from "react"
import type { FunctionReturnType } from "convex/server"
import { ChevronDown, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { endgameLabels, tagLabels } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { api } from "../../convex/_generated/api"

export type TeamSummary = NonNullable<FunctionReturnType<typeof api.guest.getTeamSummaries>>["teams"][number]

const shotRangeLabels: Record<string, string> = {
  close: "At the hub",
  mid: "Set spots",
  long: "Anywhere in zone",
  none: "Doesn't shoot",
}
const climbLabels: Record<string, string> = { none: "Can't climb", l1: "Level 1", l2: "Level 2", l3: "Level 3" }
const traverseLabels: Record<string, string> = { trench: "Trench", bump: "Bump", both: "Trench or bump", other: "Neither" }
const problemTags = new Set(["tipped_over", "disabled", "no_show", "broke_down", "tippy"])

type SortKey = "score" | "epa" | "teleop" | "auto" | "climb" | "driver" | "rank" | "number"
type FilterKey = "hasData" | "climbHigh" | "moving" | "floor" | "reliable"

const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: "score", label: "Est. points (our data)" },
  { value: "epa", label: "Statbotics EPA" },
  { value: "teleop", label: "Teleop fuel" },
  { value: "auto", label: "Auto fuel" },
  { value: "climb", label: "Climb" },
  { value: "driver", label: "Driver" },
  { value: "rank", label: "Event rank" },
  { value: "number", label: "Team #" },
]

const filterOptions: Array<{ value: FilterKey; label: string }> = [
  { value: "hasData", label: "Has match data" },
  { value: "climbHigh", label: "Climbs L2+" },
  { value: "moving", label: "Shoots on the move" },
  { value: "floor", label: "Floor intake" },
  { value: "reliable", label: "No breakdowns" },
]

function fmt(value: number | null | undefined, digits = 1) {
  return value == null ? "—" : value.toFixed(digits)
}

// Rough points a robot adds per match: fuel is 1 pt each, plus climb points,
// plus 15 for an auto L1 climb weighted by how often they do it.
function estPoints(team: TeamSummary) {
  if (!team.matchCount) return null
  return (team.avgAutoFuel ?? 0) + (team.avgTeleopFuel ?? 0) + (team.avgClimbPoints ?? 0) + 15 * (team.autoClimbRate ?? 0)
}

function problemCount(team: TeamSummary) {
  return Object.entries(team.tagCounts).reduce((sum, [tag, count]) => sum + (problemTags.has(tag) ? count : 0), 0)
}

function Bar({ value, max }: { value: number | null; max: number }) {
  const pct = value == null || max <= 0 ? 0 : Math.max(4, Math.round((value / max) * 100))
  return (
    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <span className="block h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
    </span>
  )
}

function Stat({ label, value, raw, max }: { label: string; value: string; raw: number | null; max: number }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <Bar value={raw} max={max} />
    </div>
  )
}

export function ScoutingBoard({ teams, showNotes = true }: { teams: TeamSummary[]; showNotes?: boolean }) {
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("score")
  const [filters, setFilters] = useState<FilterKey[]>([])
  const [openTeam, setOpenTeam] = useState<number | null>(null)

  const maxes = useMemo(() => {
    const max = (pick: (team: TeamSummary) => number | null) => Math.max(0, ...teams.map((team) => pick(team) ?? 0))
    return {
      score: max(estPoints),
      epa: max((team) => team.statbotics?.epa ?? null),
      teleop: max((team) => team.avgTeleopFuel),
      auto: max((team) => team.avgAutoFuel),
      climb: max((team) => team.avgClimbPoints),
      driver: 10,
    }
  }, [teams])

  const leaders = useMemo(() => {
    const withData = teams.filter((team) => team.matchCount > 0)
    const top = (pick: (team: TeamSummary) => number | null, pool = withData) =>
      [...pool].filter((team) => pick(team) != null).sort((a, b) => (pick(b) ?? -1) - (pick(a) ?? -1)).slice(0, 3).map((team) => ({ team, value: pick(team) }))
    return [
      { label: "Statbotics EPA", items: top((team) => team.statbotics?.epa ?? null, teams), digits: 1 },
      { label: "Most points (our data)", items: top(estPoints), digits: 0 },
      { label: "Teleop fuel", items: top((team) => team.avgTeleopFuel), digits: 1 },
      { label: "Climb points", items: top((team) => team.avgClimbPoints), digits: 0 },
    ]
  }, [teams])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = teams.filter((team) => {
      if (query && !`${team.teamNumber} ${team.nickname}`.toLowerCase().includes(query)) return false
      if (filters.includes("hasData") && team.matchCount === 0) return false
      if (filters.includes("climbHigh") && !(team.pit?.maxClimb === "l2" || team.pit?.maxClimb === "l3" || team.usualClimb === "mid" || team.usualClimb === "high")) return false
      if (filters.includes("moving") && !(team.pit?.shootOnMove || team.tagCounts.shoots_while_moving)) return false
      if (filters.includes("floor") && !team.pit?.groundIntake) return false
      if (filters.includes("reliable") && problemCount(team) > 0) return false
      return true
    })
    const num = (value: number | null) => value ?? -1
    return [...filtered].sort((a, b) => {
      if (sort === "score") return num(estPoints(b)) - num(estPoints(a))
      if (sort === "epa") return num(b.statbotics?.epa ?? null) - num(a.statbotics?.epa ?? null)
      if (sort === "teleop") return num(b.avgTeleopFuel) - num(a.avgTeleopFuel)
      if (sort === "auto") return num(b.avgAutoFuel) - num(a.avgAutoFuel)
      if (sort === "climb") return num(b.avgClimbPoints) - num(a.avgClimbPoints)
      if (sort === "driver") return num(b.avgDriver) - num(a.avgDriver)
      if (sort === "rank") return (a.eventRank ?? 9999) - (b.eventRank ?? 9999)
      return a.teamNumber - b.teamNumber
    })
  }, [teams, search, sort, filters])

  const toggleFilter = (value: FilterKey) =>
    setFilters((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))

  const openAndScroll = (teamNumber: number) => {
    setOpenTeam(teamNumber)
    window.setTimeout(() => document.getElementById(`team-row-${teamNumber}`)?.scrollIntoView({ block: "center" }), 50)
  }

  return (
    <div className="grid gap-3">
      {/* Leaders: the quick answer to "who's best at what?" */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {leaders.map((group) => (
          <div key={group.label} className="surface-card p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</div>
            {group.items.length ? (
              <ol className="mt-2 grid gap-1">
                {group.items.map(({ team, value }, index) => (
                  <li key={team.teamNumber}>
                    <button
                      type="button"
                      onClick={() => openAndScroll(team.teamNumber)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-4 text-xs text-muted-foreground">{index + 1}</span>
                        <span className="font-semibold tabular-nums">{team.teamNumber}</span>
                        <span className="truncate text-muted-foreground">{team.nickname}</span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">{fmt(value, group.digits)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No data yet.</p>
            )}
          </div>
        ))}
      </div>

      {/* Search, sort and quick filters */}
      <div className="surface-card grid gap-3 p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
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
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>Sort: {option.label}</option>
            ))}
          </select>
        </div>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {filterOptions.map((option) => {
            const on = filters.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggleFilter(option.value)}
                className={cn(
                  "nav-pill h-8 shrink-0 rounded-full border px-3 text-xs font-medium",
                  on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        <div className="text-xs text-muted-foreground">
          {rows.length} of {teams.length} teams · EPA from Statbotics · "Est. points" = our scouts' avg fuel + climb points + auto L1 bonus
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="surface-card p-6 text-center text-sm text-muted-foreground">No teams match those filters.</div>
      ) : (
        <div className="grid gap-2">
          {rows.map((team) => {
            const open = openTeam === team.teamNumber
            const score = estPoints(team)
            const problems = problemCount(team)
            const topTags = Object.entries(team.tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
            return (
              <div key={team.teamNumber} id={`team-row-${team.teamNumber}`} className="surface-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenTeam(open ? null : team.teamNumber)}
                  aria-expanded={open}
                  className="grid w-full gap-3 p-3 text-left transition-colors hover:bg-muted/40 sm:p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-semibold tabular-nums">{team.teamNumber}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{team.nickname}</span>
                      <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span>{team.matchCount} {team.matchCount === 1 ? "match" : "matches"}</span>
                        {team.eventRank ? <span>Rank {team.eventRank}</span> : null}
                        {team.statbotics?.wins != null ? <span>{team.statbotics.wins}-{team.statbotics.losses ?? 0}-{team.statbotics.ties ?? 0}</span> : null}
                        {problems ? <span className="text-destructive">⚠ {problems} problem{problems === 1 ? "" : "s"}</span> : null}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-lg font-semibold tabular-nums">{fmt(score, 0)}</span>
                      <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">est. pts</span>
                    </span>
                    <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                  </div>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-5">
                    <Stat label="EPA" value={fmt(team.statbotics?.epa ?? null)} raw={team.statbotics?.epa ?? null} max={maxes.epa} />
                    <Stat label="Auto" value={fmt(team.avgAutoFuel)} raw={team.avgAutoFuel} max={maxes.auto} />
                    <Stat label="Teleop" value={fmt(team.avgTeleopFuel)} raw={team.avgTeleopFuel} max={maxes.teleop} />
                    <Stat label="Climb" value={fmt(team.avgClimbPoints, 0)} raw={team.avgClimbPoints} max={maxes.climb} />
                    <Stat label="Driver" value={fmt(team.avgDriver)} raw={team.avgDriver} max={maxes.driver} />
                  </div>
                </button>
                {open ? (
                  <div className="grid gap-3 border-t bg-muted/30 p-3 text-sm animate-in fade-in duration-200 sm:p-4 md:grid-cols-2">
                    <div className="grid content-start gap-1.5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From matches</div>
                      <Row label="Usual endgame" value={team.usualClimb ? endgameLabels[team.usualClimb] ?? team.usualClimb : "—"} />
                      <Row label="Climbed L1 in auto" value={team.autoClimbRate == null ? "—" : `${Math.round(team.autoClimbRate * 100)}% of matches`} />
                      <Row label="Defense rating" value={fmt(team.avgDefense)} />
                      <Row label="Fouls per match" value={fmt(team.avgFouls)} />
                      {topTags.length ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {topTags.map(([tag, count]) => (
                            <span
                              key={tag}
                              className={cn("rounded-full border bg-background px-2 py-0.5 text-xs", problemTags.has(tag) && "border-destructive/40 text-destructive")}
                            >
                              {tagLabels[tag] ?? tag} ×{count}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="grid content-start gap-1.5">
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
                    <div className="grid content-start gap-1.5 md:col-span-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Statbotics</div>
                      {team.statbotics ? (
                        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                          <Row label="EPA (expected points)" value={`${fmt(team.statbotics.epa ?? null)}${team.statbotics.epaMax != null ? ` · best ${fmt(team.statbotics.epaMax)}` : ""}`} />
                          <Row label="Auto / Teleop / Endgame" value={`${fmt(team.statbotics.autoPoints ?? null)} / ${fmt(team.statbotics.teleopPoints ?? null)} / ${fmt(team.statbotics.endgamePoints ?? null)}`} />
                          <Row label="Expected fuel (auto / teleop)" value={`${fmt(team.statbotics.autoFuel ?? null)} / ${fmt(team.statbotics.teleopFuel ?? null)}`} />
                          <Row label="Record (W-L-T)" value={team.statbotics.wins != null ? `${team.statbotics.wins}-${team.statbotics.losses ?? 0}-${team.statbotics.ties ?? 0}` : "—"} />
                          <Row label="Qual rank" value={team.statbotics.qualRank != null ? `${team.statbotics.qualRank}${team.statbotics.qualTeams ? ` of ${team.statbotics.qualTeams}` : ""}` : "—"} />
                          <Row label="RP per match" value={fmt(team.statbotics.rpsPerMatch ?? null, 2)} />
                        </div>
                      ) : (
                        <div className="text-muted-foreground">No Statbotics data for this team yet.</div>
                      )}
                    </div>
                    {showNotes && (team.pit?.notes || team.notes.length) ? (
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
        </div>
      )}
    </div>
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
