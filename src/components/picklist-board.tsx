import { useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { ArrowDown, ArrowUp, Check, ListOrdered, Pencil, RotateCcw, Search, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { endgameLabels, type PickTier } from "@/lib/types"
import { cn } from "@/lib/utils"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"

const OUR_TEAM = 1880
const tiers: PickTier[] = ["tier1", "tier2", "tier3", "do_not_pick"]
const tierLabels: Record<PickTier, string> = {
  tier1: "Tier 1",
  tier2: "Tier 2",
  tier3: "Tier 3",
  do_not_pick: "Do not pick",
  uncategorized: "Unsorted",
}
const tierShort: Record<PickTier, string> = { tier1: "T1", tier2: "T2", tier3: "T3", do_not_pick: "DNP", uncategorized: "—" }
const tierAccent: Record<PickTier, string> = {
  tier1: "border-l-emerald-500",
  tier2: "border-l-sky-500",
  tier3: "border-l-amber-500",
  do_not_pick: "border-l-destructive",
  uncategorized: "border-l-border",
}
const problemTags = new Set(["tipped_over", "disabled", "no_show", "broke_down", "tippy"])

export type PicklistTeam = {
  _id: Id<"teams">
  teamNumber: number
  nickname: string
  eventRank?: number
  pickTier: PickTier
  pickOrder?: number
  pickedByOther?: boolean
  pickNote?: string
}

type Summary = NonNullable<ReturnType<typeof useSummaries>>[number]

function useSummaries() {
  const data = useQuery(api.guest.getTeamSummaries)
  return data?.teams
}

function estPoints(summary: Summary | undefined) {
  if (!summary?.matchCount) return null
  return (summary.avgAutoFuel ?? 0) + (summary.avgTeleopFuel ?? 0) + (summary.avgClimbPoints ?? 0) + 15 * (summary.autoClimbRate ?? 0)
}

function fmt(value: number | null | undefined, digits = 1) {
  return value == null ? "—" : value.toFixed(digits)
}

export function PicklistBoard({ teams, eventId, canEdit }: { teams: PicklistTeam[]; eventId?: Id<"events">; canEdit: boolean }) {
  const summaries = useSummaries()
  const setTier = useMutation(api.scouting.updateTeamPickTier)
  const reorder = useMutation(api.scouting.reorderPickTier)
  const setPicked = useMutation(api.scouting.setTeamPicked)
  const setNote = useMutation(api.scouting.setPickNote)
  const clearPicked = useMutation(api.scouting.clearPickedTeams)

  const [search, setSearch] = useState("")
  const [selectionMode, setSelectionMode] = useState(false)
  const [mobileTier, setMobileTier] = useState<PickTier>("uncategorized")
  const [editingNote, setEditingNote] = useState<Id<"teams"> | null>(null)
  const [noteDraft, setNoteDraft] = useState("")
  const [error, setError] = useState("")

  const byNumber = useMemo(() => new Map((summaries ?? []).map((summary) => [summary.teamNumber, summary])), [summaries])

  const run = (promise: Promise<unknown>) => {
    setError("")
    promise.catch((cause: unknown) => setError(cause instanceof Error ? cause.message.replace(/^.*Uncaught Error:\s*/, "").split("\n")[0] : "Couldn't save that change."))
  }

  const grouped = useMemo(() => {
    const query = search.trim().toLowerCase()
    const result: Record<PickTier, PicklistTeam[]> = { tier1: [], tier2: [], tier3: [], do_not_pick: [], uncategorized: [] }
    for (const team of teams) {
      if (query && !`${team.teamNumber} ${team.nickname}`.toLowerCase().includes(query)) continue
      result[team.pickTier]?.push(team)
    }
    for (const tier of tiers) {
      result[tier].sort((a, b) => (a.pickOrder ?? 9999) - (b.pickOrder ?? 9999) || a.teamNumber - b.teamNumber)
    }
    // Unsorted pool: strongest first so the obvious picks are easy to place.
    result.uncategorized.sort((a, b) => {
      const epa = (team: PicklistTeam) => byNumber.get(team.teamNumber)?.statbotics?.epa ?? estPoints(byNumber.get(team.teamNumber)) ?? -1
      return epa(b) - epa(a)
    })
    return result
  }, [teams, search, byNumber])

  // During alliance selection: the best team still on the board.
  const bestAvailable = useMemo(() => {
    for (const tier of ["tier1", "tier2", "tier3"] as PickTier[]) {
      const ordered = teams
        .filter((team) => team.pickTier === tier && !team.pickedByOther && team.teamNumber !== OUR_TEAM)
        .sort((a, b) => (a.pickOrder ?? 9999) - (b.pickOrder ?? 9999))
      if (ordered.length) return ordered.slice(0, 3)
    }
    return []
  }, [teams])

  function move(tier: PickTier, index: number, delta: number) {
    const list = teams
      .filter((team) => team.pickTier === tier)
      .sort((a, b) => (a.pickOrder ?? 9999) - (b.pickOrder ?? 9999) || a.teamNumber - b.teamNumber)
    const target = index + delta
    if (target < 0 || target >= list.length) return
    const next = [...list]
    ;[next[index], next[target]] = [next[target], next[index]]
    run(reorder({ teamIds: next.map((team) => team._id) }))
  }

  function autoSort(tier: PickTier, by: "epa" | "ours") {
    const list = teams.filter((team) => team.pickTier === tier)
    const value = (team: PicklistTeam) => {
      const summary = byNumber.get(team.teamNumber)
      return (by === "epa" ? summary?.statbotics?.epa : estPoints(summary)) ?? -1
    }
    run(reorder({ teamIds: [...list].sort((a, b) => value(b) - value(a)).map((team) => team._id) }))
  }

  function saveNote(teamId: Id<"teams">) {
    run(setNote({ teamId, note: noteDraft }))
    setEditingNote(null)
  }

  function renderCard(team: PicklistTeam, index: number, tier: PickTier) {
    const summary = byNumber.get(team.teamNumber)
    const problems = summary ? Object.entries(summary.tagCounts).reduce((sum, [tag, count]) => sum + (problemTags.has(tag) ? count : 0), 0) : 0
    const isUs = team.teamNumber === OUR_TEAM
    const ranked = tier !== "uncategorized" && tier !== "do_not_pick"
    return (
      <div
        key={team._id}
        draggable={canEdit && !isUs}
        onDragStart={(event) => event.dataTransfer.setData("teamId", team._id)}
        className={cn(
          "rounded-lg border border-l-4 bg-card p-2.5 text-sm shadow-sm transition-opacity",
          tierAccent[tier],
          team.pickedByOther && "opacity-45",
        )}
      >
        <div className="flex items-start gap-2">
          {ranked ? <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">{index + 1}</span> : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className={cn("font-semibold tabular-nums", team.pickedByOther && "line-through")}>{team.teamNumber}</span>
              <span className="truncate text-muted-foreground">{team.nickname}</span>
              {isUs ? <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">US</span> : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>EPA <b className="font-semibold text-foreground">{fmt(summary?.statbotics?.epa)}</b></span>
              <span>Ours <b className="font-semibold text-foreground">{fmt(estPoints(summary), 0)}</b></span>
              {summary?.usualClimb ? <span>{endgameLabels[summary.usualClimb] ?? summary.usualClimb}</span> : null}
              {team.eventRank ? <span>#{team.eventRank}</span> : null}
              {problems ? <span className="text-destructive">⚠ {problems}</span> : null}
            </div>
            {editingNote === team._id ? (
              <form
                className="mt-2 flex gap-1"
                onSubmit={(event) => {
                  event.preventDefault()
                  saveNote(team._id)
                }}
              >
                <Input autoFocus className="h-8 text-sm" value={noteDraft} maxLength={300} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Why here? e.g. great defense, fast climb" />
                <Button type="submit" size="icon-sm" aria-label="Save note"><Check className="size-4" /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setEditingNote(null)}><X className="size-4" /></Button>
              </form>
            ) : team.pickNote ? (
              <p className="mt-1.5 rounded bg-muted/60 px-2 py-1 text-xs">{team.pickNote}</p>
            ) : null}
          </div>
          {selectionMode && canEdit && !isUs ? (
            <Button
              type="button"
              size="sm"
              variant={team.pickedByOther ? "secondary" : "outline"}
              className="shrink-0"
              onClick={() => run(setPicked({ teamId: team._id, picked: !team.pickedByOther }))}
            >
              {team.pickedByOther ? "Undo" : "Picked"}
            </Button>
          ) : null}
        </div>
        {canEdit && !selectionMode ? (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {ranked ? (
              <>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => move(tier, index, -1)}><ArrowUp className="size-4" /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Move down" onClick={() => move(tier, index, 1)}><ArrowDown className="size-4" /></Button>
              </>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-1">
              {([...tiers, "uncategorized"] as PickTier[]).filter((target) => target !== tier).map((target) => (
                <Button key={target} type="button" size="xs" variant="outline" className="min-w-9" onClick={() => run(setTier({ teamId: team._id, pickTier: target }))}>
                  {target === "uncategorized" ? "Unsort" : tierShort[target]}
                </Button>
              ))}
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Edit note"
                onClick={() => {
                  setEditingNote(team._id)
                  setNoteDraft(team.pickNote ?? "")
                }}
              >
                <Pencil className="size-3" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  function renderColumn(tier: PickTier, className?: string) {
    const list = grouped[tier]
    const ranked = tier !== "uncategorized" && tier !== "do_not_pick"
    return (
      <div
        key={tier}
        className={cn("flex min-h-40 flex-col rounded-xl border bg-background/60 p-2.5", className)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const teamId = event.dataTransfer.getData("teamId")
          if (canEdit && teamId) run(setTier({ teamId: teamId as Id<"teams">, pickTier: tier }))
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <div className="text-sm font-semibold">
            {tierLabels[tier]} <span className="font-normal text-muted-foreground">{list.length}</span>
          </div>
          {canEdit && ranked && list.length > 1 && !selectionMode ? (
            <select
              className="h-7 rounded-md border bg-background px-1.5 text-xs"
              value=""
              onChange={(event) => {
                if (event.target.value) autoSort(tier, event.target.value as "epa" | "ours")
              }}
              aria-label={`Auto-sort ${tierLabels[tier]}`}
            >
              <option value="">Auto-sort…</option>
              <option value="epa">By EPA</option>
              <option value="ours">By our data</option>
            </select>
          ) : null}
        </div>
        <div className="grid content-start gap-2">
          {list.length ? (
            list.map((team, index) => renderCard(team, index, tier))
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              {canEdit ? (tier === "uncategorized" ? "Everyone's sorted 🎉" : "Move teams here") : "Empty"}
            </div>
          )}
        </div>
      </div>
    )
  }

  const sortedCount = teams.length - teams.filter((team) => team.pickTier === "uncategorized").length

  return (
    <section className="grid gap-3">
      <div className="surface-card grid gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListOrdered className="size-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold">Pick list</h2>
              <p className="text-xs text-muted-foreground">
                {sortedCount} of {teams.length} sorted{canEdit ? " · rank within each tier with the arrows" : " · view only"}
              </p>
            </div>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={selectionMode ? "default" : "outline"} onClick={() => setSelectionMode((value) => !value)}>
                <Sparkles className="size-4" />
                {selectionMode ? "Selection mode on" : "Alliance selection"}
              </Button>
              {selectionMode && eventId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm("Un-mark every team as picked?")) run(clearPicked({ eventId }))
                  }}
                >
                  <RotateCcw className="size-4" />
                  Reset picks
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a team" inputMode="search" aria-label="Find a team" />
        </div>
        {error ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{error}</div> : null}
      </div>

      {selectionMode ? (
        <div className="surface-card border-primary/40 p-3 sm:p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Best available right now</div>
          {bestAvailable.length ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {bestAvailable.map((team, index) => {
                const summary = byNumber.get(team.teamNumber)
                return (
                  <div key={team._id} className={cn("rounded-lg border p-3", index === 0 && "border-primary bg-primary/10")}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xl font-semibold tabular-nums">{team.teamNumber}</span>
                      <span className="text-xs text-muted-foreground">{tierLabels[team.pickTier]}</span>
                    </div>
                    <div className="truncate text-sm">{team.nickname}</div>
                    <div className="mt-1 text-xs text-muted-foreground">EPA {fmt(summary?.statbotics?.epa)} · Ours {fmt(estPoints(summary), 0)}</div>
                    {team.pickNote ? <div className="mt-1 text-xs">{team.pickNote}</div> : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No unpicked teams left in Tiers 1–3.</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Tap "Picked" on any team another alliance takes. It greys out and the next best moves up.</p>
        </div>
      ) : null}

      {/* Phones: one list at a time */}
      <div className="lg:hidden">
        <div className="no-scrollbar -mx-1 mb-3 flex gap-1 overflow-x-auto px-1">
          {(["uncategorized", ...tiers] as PickTier[]).map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => setMobileTier(tier)}
              className={cn(
                "nav-pill h-9 shrink-0 rounded-full border px-3 text-sm font-medium",
                mobileTier === tier ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {tierLabels[tier]} <span className="opacity-70">{grouped[tier].length}</span>
            </button>
          ))}
        </div>
        {renderColumn(mobileTier)}
      </div>

      {/* Laptops: unsorted pool on the left, tiers side by side */}
      <div className="hidden gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        {renderColumn("uncategorized", "max-h-[calc(100svh-14rem)] overflow-y-auto")}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {tiers.map((tier) => renderColumn(tier, "max-h-[calc(100svh-14rem)] overflow-y-auto"))}
        </div>
      </div>
    </section>
  )
}
