import { getAuthUserId } from "@convex-dev/auth/server"
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { v } from "convex/values"

// Guest passes let alliance partners view our scouting data read-only,
// without an account. A mentor or lead scout creates a pass with a short
// code that expires automatically and can be revoked at any time.
//
// Guests NEVER see: pick lists / pick tiers, scout names, tech notes,
// borrowed items, activity logs, users, or the photo gallery.
// Free-text scouting notes are only included if the pass allows it.

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no 0/O/1/I
const MAX_HOURS = 24 * 7

async function requireStrategyRole(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("Not authenticated")
  const profile = await ctx.db
    .query("profiles")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .unique()
  const role = profile?.role
  if (role !== "mentor" && role !== "admin" && role !== "lead_scout") {
    throw new Error("Only mentors and lead scouts can manage guest passes.")
  }
  return userId
}

function makeCode() {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("")
}

export const createGuestPass = mutation({
  args: {
    label: v.string(),
    hours: v.number(),
    includeNotes: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireStrategyRole(ctx)
    const label = args.label.trim().slice(0, 60)
    if (!label) throw new Error("Give the pass a name, like the partner's team number.")
    if (!Number.isFinite(args.hours) || args.hours < 1 || args.hours > MAX_HOURS) {
      throw new Error("Passes can last from 1 hour to 7 days.")
    }
    let code = makeCode()
    while (await ctx.db.query("guestPasses").withIndex("code", (q) => q.eq("code", code)).unique()) {
      code = makeCode()
    }
    const now = Date.now()
    await ctx.db.insert("guestPasses", {
      code,
      label,
      includeNotes: args.includeNotes,
      createdBy: userId,
      createdAt: now,
      expiresAt: now + args.hours * 60 * 60 * 1000,
      revoked: false,
    })
    return code
  },
})

export const revokeGuestPass = mutation({
  args: { passId: v.id("guestPasses") },
  handler: async (ctx, args) => {
    await requireStrategyRole(ctx)
    await ctx.db.patch(args.passId, { revoked: true })
  },
})

export const listGuestPasses = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    try {
      await requireStrategyRole(ctx)
    } catch {
      return []
    }
    return ctx.db.query("guestPasses").withIndex("createdAt").order("desc").take(50)
  },
})

function mostCommon(values: string[]) {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

const CLIMB_POINTS: Record<string, number> = { none: 0, low: 10, mid: 20, high: 30 }

// Shared by the guest view and the team's own Data tab.
export async function buildTeamRows(ctx: QueryCtx, eventId: Id<"events">, includeNotes: boolean) {
    const teams = await ctx.db.query("teams").withIndex("eventId", (q) => q.eq("eventId", eventId)).collect()
    const reports = await ctx.db.query("matchReports").withIndex("eventId", (q) => q.eq("eventId", eventId)).collect()
    const pitReports = await ctx.db.query("pitReports").withIndex("eventId", (q) => q.eq("eventId", eventId)).collect()

    const reportsByTeam = new Map<string, Doc<"matchReports">[]>()
    for (const report of reports) {
      const list = reportsByTeam.get(report.teamId) ?? []
      list.push(report)
      reportsByTeam.set(report.teamId, list)
    }

    const teamRows = teams
      .map((team) => {
        const teamReports = reportsByTeam.get(team._id) ?? []
        const pit = pitReports.find((report) => report.teamId === team._id)
        const tagCounts: Record<string, number> = {}
        for (const report of teamReports) for (const tag of report.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
        return {
          teamNumber: team.teamNumber,
          nickname: team.nickname,
          eventRank: team.eventRank ?? null,
          matchCount: teamReports.length,
          avgAutoFuel: avg(teamReports.map((report) => report.autoBallsScored)),
          avgTeleopFuel: avg(teamReports.map((report) => report.teleopBallsScored)),
          avgClimbPoints: avg(teamReports.map((report) => CLIMB_POINTS[report.endgameResult] ?? 0)),
          usualClimb: mostCommon(teamReports.map((report) => report.endgameResult)) ?? null,
          autoClimbRate: teamReports.length ? teamReports.filter((report) => report.autoClimb).length / teamReports.length : null,
          avgDriver: avg(teamReports.map((report) => report.driverRating)),
          avgDefense: avg(teamReports.map((report) => report.defenseRating)),
          avgFouls: avg(teamReports.filter((report) => report.fouls !== undefined).map((report) => report.fouls ?? 0)),
          tagCounts,
          pit: pit
            ? {
                shotRange: pit.shotRange ?? null,
                shootOnMove: pit.shootOnMove,
                groundIntake: pit.groundIntake ?? null,
                humanPlayerIntake: pit.humanPlayerIntake ?? null,
                fuelCapacity: pit.fuelCapacity ?? null,
                maxClimb: pit.maxClimb ?? (pit.climbHigh ? "l3" : pit.climbMid ? "l2" : pit.climbLow ? "l1" : "none"),
                autoClimb: pit.autoClimb ?? null,
                traverse: pit.traverse,
                drivetrain: pit.drivetrain,
                notes: includeNotes ? pit.notes ?? null : null,
              }
            : null,
          notes: includeNotes
            ? teamReports
                .flatMap((report) => [report.autoNotes, report.teleopNotes, report.endgameNotes])
                .filter((note): note is string => Boolean(note))
                .slice(-12)
            : [],
        }
      })
      .sort((a, b) => a.teamNumber - b.teamNumber)

    return teamRows
}

// Public on purpose (guests have no account); everything is gated by the code.
export const getGuestData = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    if (code.length !== 10) return { ok: false as const, reason: "invalid" as const }
    const pass = await ctx.db.query("guestPasses").withIndex("code", (q) => q.eq("code", code)).unique()
    if (!pass) return { ok: false as const, reason: "invalid" as const }
    if (pass.revoked) return { ok: false as const, reason: "revoked" as const }
    if (pass.expiresAt < Date.now()) return { ok: false as const, reason: "expired" as const }

    const event = await ctx.db.query("events").order("desc").first()
    if (!event) return { ok: true as const, label: pass.label, expiresAt: pass.expiresAt, event: null, teams: [] }

    const teamRows = await buildTeamRows(ctx, event._id, pass.includeNotes)

    return {
      ok: true as const,
      label: pass.label,
      expiresAt: pass.expiresAt,
      includeNotes: pass.includeNotes,
      event: { name: event.name, eventKey: event.eventKey },
      teams: teamRows,
    }
  },
})

// Same summaries for signed-in team members (Data tab). Includes notes.
export const getTeamSummaries = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const profile = await ctx.db
      .query("profiles")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique()
    if (!profile) return null
    const event = await ctx.db.query("events").order("desc").first()
    if (!event) return { event: null, teams: [] }
    return {
      event: { name: event.name, eventKey: event.eventKey },
      teams: await buildTeamRows(ctx, event._id, true),
    }
  },
})
