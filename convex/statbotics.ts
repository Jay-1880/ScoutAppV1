import { getAuthUserId } from "@convex-dev/auth/server"
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server"
import { internal } from "./_generated/api"
import { v, type Infer } from "convex/values"

// Statbotics EPA for every team at the current event, fetched on the
// server in ONE request (instead of ~75 from every phone) and cached here.
// Refreshed every 15 minutes by convex/crons.ts, after an event import,
// and whenever someone opens the Data tab and the data is stale.

const STATBOTICS = "https://api.statbotics.io/v3"
const STALE_MS = 10 * 60 * 1000

const teamStatValidator = v.object({
  team: v.number(),
  epa: v.optional(v.number()),
  epaMax: v.optional(v.number()),
  autoPoints: v.optional(v.number()),
  teleopPoints: v.optional(v.number()),
  endgamePoints: v.optional(v.number()),
  autoFuel: v.optional(v.number()),
  teleopFuel: v.optional(v.number()),
  totalFuel: v.optional(v.number()),
  qualRank: v.optional(v.number()),
  qualTeams: v.optional(v.number()),
  rpsPerMatch: v.optional(v.number()),
  wins: v.optional(v.number()),
  losses: v.optional(v.number()),
  ties: v.optional(v.number()),
  winrate: v.optional(v.number()),
})

type TeamStat = Infer<typeof teamStatValidator>

type StatboticsTeamEvent = {
  team?: number
  epa?: {
    total_points?: number
    stats?: { max?: number }
    breakdown?: Record<string, number | undefined>
  }
  record?: {
    qual?: { rank?: number; num_teams?: number; rps_per_match?: number }
    total?: { wins?: number; losses?: number; ties?: number; winrate?: number }
  }
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

// Convex can't store `undefined`, so only copy fields that have numbers.
function compact(raw: StatboticsTeamEvent): TeamStat | null {
  const team = num(raw.team)
  if (team === undefined) return null
  const fields: Record<string, number | undefined> = {
    epa: num(raw.epa?.total_points ?? raw.epa?.breakdown?.total_points),
    epaMax: num(raw.epa?.stats?.max),
    autoPoints: num(raw.epa?.breakdown?.auto_points),
    teleopPoints: num(raw.epa?.breakdown?.teleop_points),
    endgamePoints: num(raw.epa?.breakdown?.endgame_points),
    autoFuel: num(raw.epa?.breakdown?.auto_fuel),
    teleopFuel: num(raw.epa?.breakdown?.teleop_fuel),
    totalFuel: num(raw.epa?.breakdown?.total_fuel),
    qualRank: num(raw.record?.qual?.rank),
    qualTeams: num(raw.record?.qual?.num_teams),
    rpsPerMatch: num(raw.record?.qual?.rps_per_match),
    wins: num(raw.record?.total?.wins),
    losses: num(raw.record?.total?.losses),
    ties: num(raw.record?.total?.ties),
    winrate: num(raw.record?.total?.winrate),
  }
  const stat: Record<string, number> = { team }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) stat[key] = value
  }
  return stat as unknown as TeamStat
}

export const currentEventKey = internalQuery({
  handler: async (ctx): Promise<{ eventKey: string; fetchedAt: number } | null> => {
    const event = await ctx.db.query("events").order("desc").first()
    if (!event) return null
    const cache = await ctx.db.query("statboticsCache").withIndex("eventKey", (q) => q.eq("eventKey", event.eventKey)).unique()
    return { eventKey: event.eventKey, fetchedAt: cache?.fetchedAt ?? 0 }
  },
})

export const store = internalMutation({
  args: { eventKey: v.string(), teams: v.array(teamStatValidator), error: v.optional(v.string()) },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db.query("statboticsCache").withIndex("eventKey", (q) => q.eq("eventKey", args.eventKey)).unique()
    if (args.error) {
      // Keep the last good data; just note the error.
      if (existing) await ctx.db.patch(existing._id, { lastError: args.error, fetchedAt: Date.now() })
      else await ctx.db.insert("statboticsCache", { eventKey: args.eventKey, teams: [], fetchedAt: Date.now(), lastError: args.error })
      return
    }
    const fetchedAt = Date.now()
    if (existing) await ctx.db.patch(existing._id, { teams: args.teams, fetchedAt, lastError: undefined })
    else await ctx.db.insert("statboticsCache", { eventKey: args.eventKey, teams: args.teams, fetchedAt })
  },
})

export const refreshCurrent = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<void> => {
    const current: { eventKey: string; fetchedAt: number } | null = await ctx.runQuery(internal.statbotics.currentEventKey, {})
    if (!current) return
    if (!args.force && Date.now() - current.fetchedAt < STALE_MS) return
    try {
      const response = await fetch(`${STATBOTICS}/team_events?event=${encodeURIComponent(current.eventKey)}&limit=1000`)
      if (!response.ok) {
        await ctx.runMutation(internal.statbotics.store, { eventKey: current.eventKey, teams: [], error: `Statbotics returned ${response.status}` })
        return
      }
      const raw = (await response.json()) as StatboticsTeamEvent[]
      const teams = (Array.isArray(raw) ? raw : []).map(compact).filter((team): team is TeamStat => team !== null)
      await ctx.runMutation(internal.statbotics.store, { eventKey: current.eventKey, teams })
    } catch {
      await ctx.runMutation(internal.statbotics.store, { eventKey: current.eventKey, teams: [], error: "Couldn't reach Statbotics" })
    }
  },
})

// Any signed-in member can ask for fresh data; it only actually fetches
// when the cache is older than 10 minutes (or a mentor forces it).
export const refresh = action({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<void> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return
    const role: string | null = await ctx.runQuery(internal.settings.getRoleForUser, { userId })
    const canForce = role === "mentor" || role === "admin" || role === "lead_scout"
    await ctx.runAction(internal.statbotics.refreshCurrent, { force: Boolean(args.force && canForce) })
  },
})

export const getCurrent = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const event = await ctx.db.query("events").order("desc").first()
    if (!event) return null
    const cache = await ctx.db.query("statboticsCache").withIndex("eventKey", (q) => q.eq("eventKey", event.eventKey)).unique()
    return cache ? { eventKey: cache.eventKey, fetchedAt: cache.fetchedAt, lastError: cache.lastError, teams: cache.teams } : null
  },
})
