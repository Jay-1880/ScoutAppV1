import { getAuthUserId } from "@convex-dev/auth/server"
import { action, mutation, query, type MutationCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { v } from "convex/values"

const TBA_BASE = "https://www.thebluealliance.com/api/v3"
declare const process: { env: Record<string, string | undefined> }

type AppRole = "mentor" | "lead_scout" | "pit" | "tech" | "scout"
const appRoleValidator = v.union(
  v.literal("mentor"),
  v.literal("lead_scout"),
  v.literal("pit"),
  v.literal("tech"),
  v.literal("scout"),
)

function normalizeRole(role: string | undefined): AppRole {
  if (role === "admin" || role === "mentor") return "mentor"
  if (role === "lead_scout" || role === "pit" || role === "tech" || role === "scout") {
    return role
  }
  return "scout"
}

function normalizeTeamNumber(teamKey: string) {
  return Number(teamKey.replace("frc", ""))
}

function normalizeTbaApiKey(apiKey: string) {
  return apiKey
    .trim()
    .replace(/^X-TBA-Auth-Key\s*:\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim()
}

async function fetchTba(path: string, apiKey: string) {
  const url = `${TBA_BASE}${path}`
  const response = await fetch(url, { headers: { "X-TBA-Auth-Key": apiKey } })
  if (response.status !== 401 && response.status !== 403) {
    return response
  }
  const fallbackUrl = new URL(url)
  fallbackUrl.searchParams.set("X-TBA-Auth-Key", apiKey)
  return fetch(fallbackUrl.toString())
}

type ImportedTbaEvent = {
  event: {
    name?: string
    city?: string
    state_prov?: string
    country?: string
  }
  teams: Array<{
    key: string
    number: number
    nickname: string
    city?: string
    stateProv?: string
    country?: string
  }>
  matches: Array<{
    key: string
    number: number
    red: number[]
    blue: number[]
    time?: number
  }>
}

type ImportEventResult =
  | { ok: true; data: ImportedTbaEvent }
  | { ok: false; error: string }

async function tbaLookupError(label: string, eventKey: string, response: Response) {
  const detail = await response.text().catch(() => "")
  if (response.status === 401 || response.status === 403) {
    return "The Blue Alliance rejected your API key for APIv3. Paste only the key value from your TBA account and save it again."
  }
  if (response.status === 404) {
    return `TBA could not find event key ${eventKey}. Check the event key and try again.`
  }
  const pathSuffix = label === "event" ? "" : `/${label === "teams" ? "teams" : "matches/simple"}`
  return `TBA APIv3 ${label} lookup failed (${response.status}) at /event/${eventKey}${pathSuffix}. ${detail.slice(0, 160)}`.trim()
}

async function requireUser(ctx: Parameters<typeof getAuthUserId>[0]) {
  const userId = await getAuthUserId(ctx)
  if (!userId) {
    throw new Error("Not authenticated")
  }
  return userId
}

async function getUserProfile(ctx: MutationCtx, userId: Id<"users">) {
  return ctx.db
    .query("profiles")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .unique()
}

async function requireMentor(ctx: MutationCtx) {
  const userId = await requireUser(ctx)
  const profile = await getUserProfile(ctx, userId)
  if (normalizeRole(profile?.role) !== "mentor") {
    throw new Error("Mentor access required")
  }
  return userId
}

async function requireRole(ctx: MutationCtx, allowedRoles: AppRole[]) {
  const userId = await requireUser(ctx)
  const profile = await getUserProfile(ctx, userId)
  const role = normalizeRole(profile?.role)
  if (!allowedRoles.includes(role)) {
    throw new Error("You do not have access to this section.")
  }
  return { userId, role }
}

async function requirePicklistEditor(ctx: MutationCtx) {
  return requireRole(ctx, ["mentor", "lead_scout"])
}

async function logActivity(
  ctx: MutationCtx,
  args: {
    actorUserId: Id<"users">
    action: string
    eventId?: Id<"events">
    targetUserId?: Id<"users">
    details?: string
  },
) {
  const actor = await getUserProfile(ctx, args.actorUserId)
  return ctx.db.insert("activityLogs", {
    eventId: args.eventId,
    actorUserId: args.actorUserId,
    actorName: actor?.displayName,
    action: args.action,
    targetUserId: args.targetUserId,
    details: args.details,
    createdAt: Date.now(),
  })
}

export const currentUser = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const profile = await ctx.db
      .query("profiles")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique()
    return { userId, profile }
  },
})

// The mentor key lives in a Convex environment variable (MENTOR_KEY), never in code.
// If no mentor exists yet, the first account to sign up becomes the mentor.
async function anyMentorExists(ctx: MutationCtx) {
  const profiles = await ctx.db.query("profiles").collect()
  return profiles.some((profile) => normalizeRole(profile.role) === "mentor")
}

export const bootstrapProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    adminKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) {
      return null
    }
    const mentorKey = process.env.MENTOR_KEY?.trim()
    const providedKey = args.adminKey?.trim()
    if (providedKey && (!mentorKey || providedKey !== mentorKey)) {
      throw new Error("Invalid mentor key.")
    }
    const keyUnlocksMentor = Boolean(providedKey && mentorKey && providedKey === mentorKey)
    const role = keyUnlocksMentor || !(await anyMentorExists(ctx)) ? "mentor" : "scout"
    const displayName = args.displayName?.trim().slice(0, 40) || undefined
    const existing = await ctx.db
      .query("profiles")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique()
    if (existing) {
      if (normalizeRole(existing.role) !== "mentor" && role === "mentor") {
        await ctx.db.patch(existing._id, { role: "mentor", displayName: displayName ?? existing.displayName })
        await logActivity(ctx, { actorUserId: userId, action: "Became mentor", details: "Unlocked mentor access." })
        return await ctx.db.get(existing._id)
      }
      return existing
    }
    const profileId = await ctx.db.insert("profiles", {
      userId,
      displayName,
      role,
    })
    await logActivity(ctx, {
      actorUserId: userId,
      action: role === "mentor" ? "Created mentor profile" : "Signed up",
      details: displayName ? `Display name set to ${displayName}.` : undefined,
    })
    return profileId
  },
})

export const getWorkspace = query({
  handler: async (ctx) => {
    // Nothing is readable without signing in.
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const profile = await ctx.db
      .query("profiles")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique()
    if (!profile) return null
    const role = normalizeRole(profile.role)
    const canSeeStrategy = role === "mentor" || role === "lead_scout"
    const canSeePitCrew = canSeeStrategy || role === "pit"
    const event = await ctx.db.query("events").order("desc").first()
    const teams = event
      ? await ctx.db.query("teams").withIndex("eventId", (q) => q.eq("eventId", event._id)).collect()
      : []
    const matches = event
      ? await ctx.db.query("matches").withIndex("eventId", (q) => q.eq("eventId", event._id)).collect()
      : []
    const reports = event
      ? await ctx.db.query("matchReports").withIndex("eventId", (q) => q.eq("eventId", event._id)).collect()
      : []
    const pitReports = event
      ? await Promise.all(
          (await ctx.db.query("pitReports").withIndex("eventId", (q) => q.eq("eventId", event._id)).collect()).map(async (report) => ({
            ...report,
            photoUrls: await Promise.all((report.photoIds ?? []).map((photoId) => ctx.storage.getUrl(photoId))),
          })),
        )
      : []
    const picklists = event && canSeeStrategy
      ? await ctx.db.query("picklists").withIndex("eventIdOwner", (q) => q.eq("eventId", event._id)).collect()
      : []
    const picklistEntries = await Promise.all(
      picklists.map((picklist) =>
        ctx.db.query("picklistEntries").withIndex("picklistId", (q) => q.eq("picklistId", picklist._id)).collect(),
      ),
    ).then((entryGroups) => entryGroups.flat())
    const techMessages = event
      ? await ctx.db.query("techMessages").withIndex("eventId", (q) => q.eq("eventId", event._id)).collect()
      : []
    const pitCrewItems = event && canSeePitCrew
      ? await ctx.db.query("pitCrewItems").withIndex("eventId", (q) => q.eq("eventId", event._id)).collect()
      : []
    const activityLogs = !canSeeStrategy
      ? []
      : event
        ? await ctx.db.query("activityLogs").withIndex("eventId", (q) => q.eq("eventId", event._id)).order("desc").take(100)
        : await ctx.db.query("activityLogs").order("desc").take(100)
    const profiles = role === "mentor" ? await ctx.db.query("profiles").collect() : []
    const tbaSetting = role === "mentor"
      ? await ctx.db.query("appSettings").withIndex("key", (q) => q.eq("key", "tbaApiKey")).unique()
      : null
    return { userId, profile, event, teams, matches, reports, pitReports, picklists, picklistEntries, techMessages, pitCrewItems, activityLogs, profiles, hasTbaApiKey: Boolean(tbaSetting?.value) }
  },
})

export const assignUserRole = mutation({
  args: { profileId: v.id("profiles"), role: appRoleValidator },
  handler: async (ctx, args) => {
    const actorUserId = await requireMentor(ctx)
    const profile = await ctx.db.get(args.profileId)
    await logActivity(ctx, {
      actorUserId,
      action: "Changed user role",
      targetUserId: profile?.userId,
      details: `Set role to ${args.role}.`,
    })
    await ctx.db.patch(args.profileId, { role: args.role })
  },
})

export const deleteUserProfile = mutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const mentorUserId = await requireMentor(ctx)
    const profile = await ctx.db.get(args.profileId)
    if (!profile) return
    if (profile.userId === mentorUserId) {
      throw new Error("You cannot delete your own mentor account.")
    }
    await logActivity(ctx, {
      actorUserId: mentorUserId,
      action: "Deleted user",
      targetUserId: profile.userId,
      details: profile.displayName ? `Removed ${profile.displayName}.` : undefined,
    })
    await ctx.db.delete(args.profileId)
  },
})

export const generatePitPhotoUploadUrl = mutation({
  handler: async (ctx) => {
    await requireRole(ctx, ["mentor", "lead_scout", "pit", "scout"])
    return ctx.storage.generateUploadUrl()
  },
})

export const saveTbaApiKey = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireMentor(ctx)
    const apiKey = normalizeTbaApiKey(args.apiKey)
    if (!apiKey) throw new Error("TBA API key is required")
    const existing = await ctx.db.query("appSettings").withIndex("key", (q) => q.eq("key", "tbaApiKey")).unique()
    const payload = {
      key: "tbaApiKey",
      value: apiKey,
      updatedAt: Date.now(),
      updatedBy: userId,
    }
    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }
    return ctx.db.insert("appSettings", payload)
  },
})

export const saveEvent = mutation({
  args: {
    eventKey: v.string(),
    name: v.string(),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    country: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireMentor(ctx)
    const existing = await ctx.db
      .query("events")
      .withIndex("eventKey", (q) => q.eq("eventKey", args.eventKey))
      .unique()
    if (existing) return existing._id
    return ctx.db.insert("events", {
      eventKey: args.eventKey,
      name: args.name,
      city: args.city,
      state: args.state,
      country: args.country,
      importedAt: Date.now(),
      importedBy: userId,
    })
  },
})

export const importEvent = action({
  args: { eventKey: v.string() },
  handler: async (ctx, args): Promise<ImportEventResult> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: false, error: "Sign in first." }
    const callerRole: string | null = await ctx.runQuery(internal.settings.getRoleForUser, { userId })
    if (normalizeRole(callerRole ?? undefined) !== "mentor") {
      return { ok: false, error: "Mentor access required to import events." }
    }
    const eventKey = args.eventKey.trim()
    if (!/^\d{4}[a-z0-9]+$/i.test(eventKey)) {
      return { ok: false, error: "That doesn't look like a TBA event key (example: 2026nytr)." }
    }
    const storedApiKey: string | null = await ctx.runQuery(internal.settings.getTbaApiKey)
    const apiKey: string | undefined = storedApiKey ? normalizeTbaApiKey(storedApiKey) : process.env.TBA_API_KEY ? normalizeTbaApiKey(process.env.TBA_API_KEY) : undefined
    if (!apiKey) {
      return { ok: false, error: "Add your TBA API key in the Mentor tab before importing an event." }
    }
    if (!eventKey) {
      return { ok: false, error: "Enter a TBA event key before importing." }
    }
    try {
      const [eventResponse, teamsResponse, matchesResponse]: [Response, Response, Response] = await Promise.all([
        fetchTba(`/event/${eventKey}`, apiKey),
        fetchTba(`/event/${eventKey}/teams`, apiKey),
        fetchTba(`/event/${eventKey}/matches/simple`, apiKey),
      ])
      const rankingsResponse = await fetchTba(`/event/${eventKey}/rankings`, apiKey)
      if (!eventResponse.ok) return { ok: false, error: await tbaLookupError("event", eventKey, eventResponse) }
      if (!teamsResponse.ok) return { ok: false, error: await tbaLookupError("teams", eventKey, teamsResponse) }
      if (!matchesResponse.ok) return { ok: false, error: await tbaLookupError("matches", eventKey, matchesResponse) }
      if (!rankingsResponse.ok) return { ok: false, error: await tbaLookupError("event", eventKey, rankingsResponse) }
      const [event, teams, matches]: [
        ImportedTbaEvent["event"],
        Array<{
          key?: string
          team_key?: string
          team_number: number
          nickname?: string
          city?: string
          state_prov?: string
          country?: string
        }>,
        Array<{
          key: string
          comp_level: string
          match_number: number
          alliances?: {
            red?: { team_keys?: string[] }
            blue?: { team_keys?: string[] }
          }
          time?: number
        }>,
      ] = await Promise.all([
        eventResponse.json(),
        teamsResponse.json(),
        matchesResponse.json(),
      ])
      const rankings = await rankingsResponse.json() as {
        rankings?: Array<{
          team_key?: string
          rank?: number
        }>
      }
      const rankingByTeamKey = new Map((rankings.rankings ?? []).map((entry) => [entry.team_key, entry.rank]))
      return {
        ok: true,
        data: {
          event,
          teams: teams.map((team) => {
            const teamNumber = team.team_number
            return {
              key: team.key ?? team.team_key ?? `frc${teamNumber}`,
              number: teamNumber,
              nickname: team.nickname ?? `Team ${teamNumber}`,
              rank: rankingByTeamKey.get(team.key ?? team.team_key ?? `frc${teamNumber}`),
              city: team.city,
              stateProv: team.state_prov,
              country: team.country,
            }
          }),
          matches: matches
            .filter((match) => match.comp_level === "qm")
            .map((match) => ({
              key: match.key,
              number: match.match_number,
              red: match.alliances?.red?.team_keys?.map(normalizeTeamNumber) ?? [],
              blue: match.alliances?.blue?.team_keys?.map(normalizeTeamNumber) ?? [],
              time: match.time,
            })),
        },
      }
    } catch {
      return { ok: false, error: "Could not reach The Blue Alliance. Check your connection and try again." }
    }
  },
})

const importedTeamValidator = v.object({
  key: v.string(),
  number: v.number(),
  nickname: v.string(),
  rank: v.optional(v.number()),
  city: v.optional(v.string()),
  stateProv: v.optional(v.string()),
  country: v.optional(v.string()),
})

const importedMatchValidator = v.object({
  key: v.string(),
  number: v.number(),
  red: v.array(v.number()),
  blue: v.array(v.number()),
  time: v.optional(v.number()),
})

export const upsertImportedEvent = mutation({
  args: {
    eventKey: v.string(),
    name: v.string(),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    country: v.optional(v.string()),
    teams: v.array(importedTeamValidator),
    matches: v.array(importedMatchValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireMentor(ctx)
    let event = await ctx.db
      .query("events")
      .withIndex("eventKey", (q) => q.eq("eventKey", args.eventKey))
      .unique()
    if (!event) {
      const eventId = await ctx.db.insert("events", {
        eventKey: args.eventKey,
        name: args.name,
        city: args.city,
        state: args.state,
        country: args.country,
        importedAt: Date.now(),
        importedBy: userId,
      })
      event = await ctx.db.get(eventId)
    } else {
      await ctx.db.patch(event._id, { name: args.name, importedAt: Date.now(), importedBy: userId })
    }
    if (!event) throw new Error("Event import failed")
    const eventId = event._id

    // Update teams and matches IN PLACE (matched by TBA key) so existing
    // match reports, pit reports and picklists keep pointing at valid IDs.
    const existingTeams = await ctx.db.query("teams").withIndex("eventId", (q) => q.eq("eventId", eventId)).collect()
    const teamsByKey = new Map(existingTeams.map((team) => [team.tbaTeamKey, team]))
    for (const team of args.teams) {
      const fields = {
        teamNumber: team.number,
        nickname: team.nickname,
        eventRank: team.rank,
        city: team.city,
        state: team.stateProv,
        country: team.country,
      }
      const existing = teamsByKey.get(team.key)
      if (existing) {
        await ctx.db.patch(existing._id, fields)
      } else {
        await ctx.db.insert("teams", {
          eventId,
          tbaTeamKey: team.key,
          ...fields,
          pitStatus: "not_scouted",
          pickTier: "uncategorized",
        })
      }
    }

    const existingMatches = await ctx.db.query("matches").withIndex("eventId", (q) => q.eq("eventId", eventId)).collect()
    const matchesByKey = new Map(existingMatches.map((match) => [match.tbaMatchKey, match]))
    for (const match of args.matches) {
      const fields = {
        matchNumber: match.number,
        redTeamNumbers: match.red,
        blueTeamNumbers: match.blue,
        scheduledTime: match.time,
      }
      const existing = matchesByKey.get(match.key)
      if (existing) {
        await ctx.db.patch(existing._id, fields)
      } else {
        await ctx.db.insert("matches", { eventId, tbaMatchKey: match.key, ...fields })
      }
    }

    await logActivity(ctx, {
      actorUserId: userId,
      eventId,
      action: "Imported event",
      details: `${args.eventKey}: ${args.teams.length} teams, ${args.matches.length} matches.`,
    })
    return eventId
  },
})

export const savePitReport = mutation({
  args: {
    teamId: v.id("teams"),
    scoreAnywhere: v.boolean(),
    scoreSpecificSpots: v.boolean(),
    shootOnMove: v.boolean(),
    climbLow: v.boolean(),
    climbMid: v.boolean(),
    climbHigh: v.boolean(),
    traverse: v.union(v.literal("trench"), v.literal("bump"), v.literal("both"), v.literal("other")),
    drivetrain: v.string(),
    notes: v.optional(v.string()),
    photoIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const { userId, role } = await requireRole(ctx, ["mentor", "lead_scout", "pit", "scout"])
    const team = await ctx.db.get(args.teamId)
    if (!team) throw new Error("Team not found")
    if ((args.photoIds ?? []).length > 6) throw new Error("Up to 6 photos per pit report.")
    const existing = await ctx.db
      .query("pitReports")
      .withIndex("teamId", (q) => q.eq("teamId", args.teamId))
      .first()
    const payload = {
      eventId: team.eventId,
      teamId: args.teamId,
      scoutUserId: existing?.scoutUserId ?? userId,
      scoreAnywhere: args.scoreAnywhere,
      scoreSpecificSpots: args.scoreSpecificSpots,
      shootOnMove: args.shootOnMove,
      climbLow: args.climbLow,
      climbMid: args.climbMid,
      climbHigh: args.climbHigh,
      traverse: args.traverse,
      drivetrain: args.drivetrain.trim().slice(0, 40),
      notes: args.notes?.trim().slice(0, 2000) || undefined,
      photoIds: args.photoIds ?? existing?.photoIds ?? [],
    }
    if (existing) {
      // The original scout, a lead scout or a mentor can correct a pit report.
      const canEdit = existing.scoutUserId === userId || role === "mentor" || role === "lead_scout"
      if (!canEdit) {
        throw new Error("This team already has a pit report. Ask a lead scout to update it.")
      }
      await ctx.db.patch(existing._id, payload)
      await logActivity(ctx, {
        actorUserId: userId,
        eventId: team.eventId,
        action: "Updated pit report",
        details: `Updated team ${team.teamNumber}.`,
      })
      return existing._id
    }
    const id = await ctx.db.insert("pitReports", payload)
    await ctx.db.patch(team._id, { pitStatus: "scouted" })
    await logActivity(ctx, {
      actorUserId: userId,
      eventId: team.eventId,
      action: "Submitted pit report",
      details: `Scouted team ${team.teamNumber}.`,
    })
    return id
  },
})

const matchTagValidator = v.union(
  v.literal("fast"),
  v.literal("accurate"),
  v.literal("good_driver"),
  v.literal("plays_defense"),
  v.literal("tippy"),
  v.literal("broke_down"),
  v.literal("inconsistent"),
)

function checkCount(label: string, value: number, max: number) {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${label} must be a whole number from 0 to ${max}.`)
  }
}

function cleanNote(note: string | undefined) {
  return note?.trim().slice(0, 1000) || undefined
}

export const saveMatchReport = mutation({
  args: {
    matchId: v.id("matches"),
    teamId: v.id("teams"),
    autoBallsScored: v.number(),
    teleopBallsScored: v.number(),
    autoNotes: v.optional(v.string()),
    teleopNotes: v.optional(v.string()),
    endgameResult: v.union(v.literal("none"), v.literal("low"), v.literal("mid"), v.literal("high")),
    endgameNotes: v.optional(v.string()),
    driverRating: v.number(),
    defenseRating: v.number(),
    tags: v.array(matchTagValidator),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, ["mentor", "lead_scout", "pit", "tech", "scout"])
    checkCount("Auto balls scored", args.autoBallsScored, 200)
    checkCount("Teleop balls scored", args.teleopBallsScored, 500)
    checkCount("Driver rating", args.driverRating, 10)
    checkCount("Defense rating", args.defenseRating, 10)
    const match = await ctx.db.get(args.matchId)
    const team = await ctx.db.get(args.teamId)
    if (!match || !team) throw new Error("Match or team not found")
    const allowedTeams = [...match.redTeamNumbers, ...match.blueTeamNumbers]
    if (!allowedTeams.includes(team.teamNumber)) {
      throw new Error("Team is not in this match")
    }
    const existingForScout = await ctx.db
      .query("matchReports")
      .withIndex("matchIdScoutUser", (q) => q.eq("matchId", args.matchId).eq("scoutUserId", userId))
      .first()
    if (existingForScout && existingForScout.teamId !== args.teamId) {
      throw new Error("This scout already has a robot for this match")
    }
    const payload = {
      eventId: match.eventId,
      matchId: args.matchId,
      teamId: args.teamId,
      scoutUserId: userId,
      autoBallsScored: args.autoBallsScored,
      teleopBallsScored: args.teleopBallsScored,
      autoNotes: cleanNote(args.autoNotes),
      teleopNotes: cleanNote(args.teleopNotes),
      endgameResult: args.endgameResult,
      endgameNotes: cleanNote(args.endgameNotes),
      driverRating: args.driverRating,
      defenseRating: args.defenseRating,
      tags: [...new Set(args.tags)],
    }
    const existingForTeam = await ctx.db
      .query("matchReports")
      .withIndex("matchId", (q) => q.eq("matchId", args.matchId))
      .filter((q) => q.eq(q.field("teamId"), args.teamId))
      .first()
    if (existingForTeam?.scoutUserId === userId) {
      await ctx.db.patch(existingForTeam._id, payload)
      await logActivity(ctx, {
        actorUserId: userId,
        eventId: match.eventId,
        action: "Updated match report",
        details: `Updated team ${team.teamNumber} in match ${match.matchNumber}.`,
      })
      return existingForTeam._id
    }
    const reportId = await ctx.db.insert("matchReports", payload)
    await logActivity(ctx, {
      actorUserId: userId,
      eventId: match.eventId,
      action: "Submitted match report",
      details: `Scouted team ${team.teamNumber} in match ${match.matchNumber}.`,
    })
    return reportId
  },
})

const pickTierValidator = v.union(
  v.literal("tier1"),
  v.literal("tier2"),
  v.literal("tier3"),
  v.literal("do_not_pick"),
  v.literal("uncategorized"),
)

export const updateTeamPickTier = mutation({
  args: { teamId: v.id("teams"), pickTier: pickTierValidator },
  handler: async (ctx, args) => {
    await requirePicklistEditor(ctx)
    await ctx.db.patch(args.teamId, { pickTier: args.pickTier })
  },
})

export const ensurePicklist = mutation({
  args: { eventId: v.id("events"), name: v.string(), isPrimary: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { userId } = await requirePicklistEditor(ctx)
    const existing = await ctx.db
      .query("picklists")
      .withIndex("eventIdOwner", (q) => q.eq("eventId", args.eventId).eq("ownerUserId", userId))
      .filter((q) => q.eq(q.field("name"), args.name))
      .first()
    if (existing) return existing._id
    return ctx.db.insert("picklists", {
      eventId: args.eventId,
      ownerUserId: userId,
      name: args.name,
      isPrimary: Boolean(args.isPrimary),
      source: args.isPrimary ? "primary" : "personal",
    })
  },
})

export const createTechMessage = mutation({
  args: {
    eventId: v.id("events"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, ["mentor", "lead_scout", "tech"])
    const message = args.message.trim().slice(0, 1000)
    if (!message) throw new Error("Tech note is required.")
    const id = await ctx.db.insert("techMessages", {
      eventId: args.eventId,
      createdBy: userId,
      message,
      status: "open",
      createdAt: Date.now(),
    })
    await logActivity(ctx, {
      actorUserId: userId,
      eventId: args.eventId,
      action: "Sent tech note",
      details: message,
    })
    return id
  },
})

export const resolveTechMessage = mutation({
  args: { messageId: v.id("techMessages") },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, ["mentor", "lead_scout", "pit"])
    const message = await ctx.db.get(args.messageId)
    await ctx.db.patch(args.messageId, {
      status: "resolved",
      resolvedAt: Date.now(),
      resolvedBy: userId,
    })
    if (message) {
      await logActivity(ctx, {
        actorUserId: userId,
        eventId: message.eventId,
        action: "Resolved tech note",
        details: message.message,
      })
    }
  },
})

export const createPitCrewItem = mutation({
  args: {
    eventId: v.id("events"),
    borrowerName: v.string(),
    borrowerTeam: v.string(),
    itemName: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, ["mentor", "lead_scout", "pit"])
    const borrowerName = args.borrowerName.trim()
    const borrowerTeam = args.borrowerTeam.trim()
    const itemName = args.itemName.trim()
    const notes = args.notes?.trim()
    if (!borrowerName || !borrowerTeam || !itemName) {
      throw new Error("Borrower, team, and item are required.")
    }
    const id = await ctx.db.insert("pitCrewItems", {
      eventId: args.eventId,
      createdBy: userId,
      borrowerName,
      borrowerTeam,
      itemName,
      notes: notes || undefined,
      status: "borrowed",
      createdAt: Date.now(),
    })
    await logActivity(ctx, {
      actorUserId: userId,
      eventId: args.eventId,
      action: "Logged borrowed item",
      details: `${borrowerName} from ${borrowerTeam} borrowed ${itemName}.`,
    })
    return id
  },
})

export const markPitCrewItemReturned = mutation({
  args: { itemId: v.id("pitCrewItems") },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, ["mentor", "lead_scout", "pit"])
    const item = await ctx.db.get(args.itemId)
    await ctx.db.patch(args.itemId, {
      status: "returned",
      returnedAt: Date.now(),
      returnedBy: userId,
    })
    if (item) {
      await logActivity(ctx, {
        actorUserId: userId,
        eventId: item.eventId,
        action: "Marked borrowed item returned",
        details: `${item.borrowerName} returned ${item.itemName}.`,
      })
    }
  },
})
