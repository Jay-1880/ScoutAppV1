import { getAuthUserId } from "@convex-dev/auth/server"
import { action, mutation, query, type MutationCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { v } from "convex/values"

const TBA_BASE = "https://www.thebluealliance.com/api/v3"
const ADMIN_KEY = "1880"
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

async function requireMentor(ctx: MutationCtx) {
  const userId = await requireUser(ctx)
  const profile = await ctx.db
    .query("profiles")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .unique()
  if (normalizeRole(profile?.role) !== "mentor") {
    throw new Error("Mentor access required")
  }
  return userId
}

async function requireRole(ctx: MutationCtx, allowedRoles: AppRole[]) {
  const userId = await requireUser(ctx)
  const profile = await ctx.db
    .query("profiles")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .unique()
  const role = normalizeRole(profile?.role)
  if (!allowedRoles.includes(role)) {
    throw new Error("You do not have access to this section.")
  }
  return { userId, role }
}

async function requirePicklistEditor(ctx: MutationCtx) {
  return requireRole(ctx, ["mentor", "lead_scout"])
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

export const bootstrapProfile = mutation({
  handler: async (ctx, args: { displayName?: string; adminKey?: string }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) {
      return null
    }
    const role = args.adminKey === ADMIN_KEY ? "mentor" : "scout"
    const existing = await ctx.db
      .query("profiles")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique()
    if (existing) {
      if (normalizeRole(existing.role) !== "mentor" && role === "mentor") {
        await ctx.db.patch(existing._id, { role: "mentor", displayName: args.displayName ?? existing.displayName })
        return await ctx.db.get(existing._id)
      }
      return existing
    }
    return ctx.db.insert("profiles", {
      userId,
      displayName: args.displayName,
      role,
    })
  },
})

export const getWorkspace = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    const profile = userId
      ? await ctx.db
          .query("profiles")
          .withIndex("userId", (q) => q.eq("userId", userId))
          .unique()
      : null
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
    const picklists = event
      ? await ctx.db.query("picklists").withIndex("eventIdOwner", (q) => q.eq("eventId", event._id)).collect()
      : []
    const picklistEntries = await Promise.all(
      picklists.map((picklist) =>
        ctx.db.query("picklistEntries").withIndex("picklistId", (q) => q.eq("picklistId", picklist._id)).collect(),
      ),
    ).then((entryGroups) => entryGroups.flat())
    const role = normalizeRole(profile?.role)
    const techMessages = event
      ? await ctx.db.query("techMessages").withIndex("eventId", (q) => q.eq("eventId", event._id)).collect()
      : []
    const pitCrewItems = event
      ? await ctx.db.query("pitCrewItems").withIndex("eventId", (q) => q.eq("eventId", event._id)).collect()
      : []
    const profiles = role === "mentor" ? await ctx.db.query("profiles").collect() : []
    const tbaSetting = role === "mentor"
      ? await ctx.db.query("appSettings").withIndex("key", (q) => q.eq("key", "tbaApiKey")).unique()
      : null
    return { userId, profile, event, teams, matches, reports, pitReports, picklists, picklistEntries, techMessages, pitCrewItems, profiles, hasTbaApiKey: Boolean(tbaSetting?.value) }
  },
})

export const assignUserRole = mutation({
  args: { profileId: v.id("profiles"), role: appRoleValidator },
  handler: async (ctx, args) => {
    await requireMentor(ctx)
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
    await ctx.db.delete(args.profileId)
  },
})

export const generatePitPhotoUploadUrl = mutation({
  handler: async (ctx) => {
    await requireRole(ctx, ["mentor", "lead_scout", "pit"])
    return ctx.storage.generateUploadUrl()
  },
})

export const saveTbaApiKey = mutation({
  handler: async (ctx, args: { apiKey: string }) => {
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
  handler: async (ctx, args: { eventKey: string; name: string; city?: string; state?: string; country?: string }) => {
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
    const eventKey = args.eventKey.trim()
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
      if (!eventResponse.ok) return { ok: false, error: await tbaLookupError("event", eventKey, eventResponse) }
      if (!teamsResponse.ok) return { ok: false, error: await tbaLookupError("teams", eventKey, teamsResponse) }
      if (!matchesResponse.ok) return { ok: false, error: await tbaLookupError("matches", eventKey, matchesResponse) }
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

export const upsertImportedEvent = mutation({
  handler: async (ctx, args: {
    eventKey: string
    name: string
    city?: string
    state?: string
    country?: string
    teams: Array<{ key: string; number: number; nickname: string; city?: string; stateProv?: string; country?: string }>
    matches: Array<{ key: string; number: number; red: number[]; blue: number[]; time?: number }>
  }) => {
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
    }
    if (!event) throw new Error("Event import failed")
    const existingTeams = await ctx.db.query("teams").withIndex("eventId", (q) => q.eq("eventId", event._id)).collect()
    for (const team of existingTeams) await ctx.db.delete(team._id)
    const existingMatches = await ctx.db.query("matches").withIndex("eventId", (q) => q.eq("eventId", event._id)).collect()
    for (const match of existingMatches) await ctx.db.delete(match._id)
    for (const team of args.teams) {
      if (!team.key) {
        throw new Error(`Imported team ${team.number} is missing a TBA team key.`)
      }
      await ctx.db.insert("teams", {
        eventId: event._id,
        tbaTeamKey: team.key,
        teamNumber: team.number,
        nickname: team.nickname,
        city: team.city,
        state: team.stateProv,
        country: team.country,
        pitStatus: "not_scouted",
        pickTier: "uncategorized",
      })
    }
    for (const match of args.matches) {
      await ctx.db.insert("matches", {
        eventId: event._id,
        tbaMatchKey: match.key,
        matchNumber: match.number,
        redTeamNumbers: match.red,
        blueTeamNumbers: match.blue,
        scheduledTime: match.time,
      })
    }
    return event._id
  },
})

export const savePitReport = mutation({
  handler: async (ctx, args: {
    teamId: string
    scoreAnywhere: boolean
    scoreSpecificSpots: boolean
    shootOnMove: boolean
    climbLow: boolean
    climbMid: boolean
    climbHigh: boolean
    traverse: "trench" | "bump" | "both" | "other"
    drivetrain: string
    notes?: string
    photoIds?: Array<Id<"_storage">>
  }) => {
    const { userId } = await requireRole(ctx, ["mentor", "lead_scout", "pit"])
    const team = await ctx.db.get(args.teamId as Id<"teams">)
    if (!team) throw new Error("Team not found")
    const existing = await ctx.db
      .query("pitReports")
      .withIndex("teamId", (q) => q.eq("teamId", args.teamId as Id<"teams">))
      .first()
    const payload = {
      eventId: team.eventId,
      teamId: args.teamId as Id<"teams">,
      scoutUserId: userId,
      scoreAnywhere: args.scoreAnywhere,
      scoreSpecificSpots: args.scoreSpecificSpots,
      shootOnMove: args.shootOnMove,
      climbLow: args.climbLow,
      climbMid: args.climbMid,
      climbHigh: args.climbHigh,
      traverse: args.traverse,
      drivetrain: args.drivetrain,
      notes: args.notes,
      photoIds: args.photoIds ?? [],
    }
    if (existing) {
      throw new Error("This team already has a pit report.")
    }
    const id = await ctx.db.insert("pitReports", payload)
    await ctx.db.patch(team._id, { pitStatus: "scouted" })
    return id
  },
})

export const saveMatchReport = mutation({
  handler: async (ctx, args: {
    matchId: string
    teamId: string
    autoBallsScored: number
    teleopBallsScored: number
    autoNotes?: string
    teleopNotes?: string
    endgameResult: "none" | "low" | "mid" | "high"
    endgameNotes?: string
    driverRating: number
    defenseRating: number
    tags: Array<"fast" | "accurate" | "good_driver" | "plays_defense" | "tippy" | "broke_down" | "inconsistent">
  }) => {
    const userId = await requireUser(ctx)
    const match = await ctx.db.get(args.matchId as Id<"matches">) as Doc<"matches"> | null
    const team = await ctx.db.get(args.teamId as Id<"teams">) as Doc<"teams"> | null
    if (!match || !team) throw new Error("Match or team not found")
    const allowedTeams = [...match.redTeamNumbers, ...match.blueTeamNumbers]
    if (!allowedTeams.includes(team.teamNumber)) {
      throw new Error("Team is not in this match")
    }
    const existingForScout = await ctx.db
      .query("matchReports")
      .withIndex("matchIdScoutUser", (q) => q.eq("matchId", args.matchId as Id<"matches">).eq("scoutUserId", userId))
      .first()
    if (existingForScout && existingForScout.teamId !== args.teamId as Id<"teams">) {
      throw new Error("This scout already has a robot for this match")
    }
    const payload = {
      eventId: match.eventId,
      matchId: args.matchId as Id<"matches">,
      teamId: args.teamId as Id<"teams">,
      scoutUserId: userId,
      autoBallsScored: args.autoBallsScored,
      teleopBallsScored: args.teleopBallsScored,
      autoNotes: args.autoNotes,
      teleopNotes: args.teleopNotes,
      endgameResult: args.endgameResult,
      endgameNotes: args.endgameNotes,
      driverRating: args.driverRating,
      defenseRating: args.defenseRating,
      tags: args.tags,
    }
    const existingForTeam = await ctx.db
      .query("matchReports")
      .withIndex("matchId", (q) => q.eq("matchId", args.matchId as Id<"matches">))
      .filter((q) => q.eq(q.field("teamId"), args.teamId as Id<"teams">))
      .first()
    if (existingForTeam?.scoutUserId === userId) {
      await ctx.db.patch(existingForTeam._id, payload)
      return existingForTeam._id
    }
    return ctx.db.insert("matchReports", payload)
  },
})

export const updateTeamPickTier = mutation({
  handler: async (ctx, args: {
    teamId: string
    pickTier: "tier1" | "tier2" | "tier3" | "do_not_pick" | "uncategorized"
  }) => {
    await requirePicklistEditor(ctx)
    await ctx.db.patch(args.teamId as Id<"teams">, { pickTier: args.pickTier })
  },
})

export const ensurePicklist = mutation({
  handler: async (ctx, args: { eventId: string; name: string; isPrimary?: boolean }) => {
    const { userId } = await requirePicklistEditor(ctx)
    const existing = await ctx.db
      .query("picklists")
      .withIndex("eventIdOwner", (q) => q.eq("eventId", args.eventId as Id<"events">).eq("ownerUserId", userId))
      .filter((q) => q.eq(q.field("name"), args.name))
      .first()
    if (existing) return existing._id
    return ctx.db.insert("picklists", {
      eventId: args.eventId as Id<"events">,
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
    const message = args.message.trim()
    if (!message) throw new Error("Tech note is required.")
    return ctx.db.insert("techMessages", {
      eventId: args.eventId,
      createdBy: userId,
      message,
      status: "open",
      createdAt: Date.now(),
    })
  },
})

export const resolveTechMessage = mutation({
  args: { messageId: v.id("techMessages") },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, ["mentor", "lead_scout", "pit"])
    await ctx.db.patch(args.messageId, {
      status: "resolved",
      resolvedAt: Date.now(),
      resolvedBy: userId,
    })
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
    return ctx.db.insert("pitCrewItems", {
      eventId: args.eventId,
      createdBy: userId,
      borrowerName,
      borrowerTeam,
      itemName,
      notes: notes || undefined,
      status: "borrowed",
      createdAt: Date.now(),
    })
  },
})

export const markPitCrewItemReturned = mutation({
  args: { itemId: v.id("pitCrewItems") },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, ["mentor", "lead_scout", "pit"])
    await ctx.db.patch(args.itemId, {
      status: "returned",
      returnedAt: Date.now(),
      returnedBy: userId,
    })
  },
})
