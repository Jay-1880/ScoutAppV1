import { Suspense, lazy, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useAuthActions } from "@convex-dev/auth/react"
import { ConvexError } from "convex/values"
import { useAction, useConvexAuth, useConvexConnectionState, useMutation, useQuery } from "convex/react"
import { AlertCircle, Eye, EyeOff, CalendarDays, CheckCircle2, ChevronRight, Clock3, Download, ImagePlus, KeyRound, LogIn, MapPin, Send, ShieldAlert, Sparkles, Trash2, Trophy, Users, Wrench } from "lucide-react"

import { AppNav } from "@/components/app-nav"
import { GuestPassManager } from "@/components/guest-pass-manager"
import { ThemeModeMenu } from "@/components/theme-mode-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { endgameLabels, tagLabels, type Accuracy, type ClimbLevel, type MatchEndgameResult, type MatchTag, type PickTier, type ShotRange } from "@/lib/types"
import { useUiStore } from "@/stores/ui-store"
import frc1880Logo from "@/assets/frc1880.png"
import { api } from "../../convex/_generated/api"

// Loaded only when opened, so the first page load on phones is smaller.
const Gallery = lazy(() => import("@/components/gallery").then((module) => ({ default: module.Gallery })))
const TeamDetailDialog = lazy(() => import("@/components/team-detail-dialog").then((module) => ({ default: module.TeamDetailDialog })))

const STATBOTICS_CACHE_MS = 30 * 60 * 1000
const MATCH_DRAFT_KEY = "1880-scout:match-draft"

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(storage: Storage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be full or blocked (private mode); the app still works without it.
  }
}

// Run async jobs a few at a time instead of firing 75 requests at once.
async function mapWithLimit<T, R>(items: T[], limit: number, job: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await job(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
import type { Id } from "../../convex/_generated/dataModel"

// Grouped so scouts can scan them quickly during a match.
const tagGroups: Array<{ label: string; tags: MatchTag[] }> = [
  { label: "Scoring", tags: ["fast_cycles", "shoots_while_moving", "fed_partners", "wasted_inactive_hub"] },
  { label: "Driving & defense", tags: ["played_defense", "defended_well_against", "used_trench"] },
  { label: "Problems", tags: ["tipped_over", "disabled", "no_show"] },
]

// A row of big, tappable choice buttons (easier than dropdowns on a phone).
function ChoiceGroup<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  columns = 2,
}: {
  label: string
  hint?: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  columns?: 2 | 3 | 4
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <div className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={value === option.value ? "default" : "outline"}
            aria-pressed={value === option.value}
            className="h-11 whitespace-normal px-2 text-sm leading-tight"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </fieldset>
  )
}

// Big −/+ counter for counting during a match without looking down for long.
function Counter({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 99,
  suffix = "",
  compact = false,
}: {
  label: string
  hint?: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  suffix?: string
  compact?: boolean
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)))
  return (
    <div className={cn("space-y-2", compact && "rounded-lg border p-3")}>
      <div>
        <div className={cn("font-medium", compact ? "text-xs" : "text-sm")}>{label}</div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className={cn("grid items-center gap-2", compact ? "grid-cols-[2.75rem_1fr_2.75rem]" : "grid-cols-[3.5rem_1fr_3.5rem]")}>
        <Button type="button" variant="outline" className={compact ? "h-11 text-xl" : "h-14 text-2xl"} aria-label={`${label}: minus one`} disabled={value <= min} onClick={() => set(value - 1)}>−</Button>
        <div className={cn("text-center font-semibold tabular-nums", compact ? "text-lg" : "text-3xl")} aria-live="polite">{value}{suffix}</div>
        <Button type="button" variant={compact ? "outline" : "default"} className={compact ? "h-11 text-xl" : "h-14 text-2xl"} aria-label={`${label}: plus one`} disabled={value >= max} onClick={() => set(value + 1)}>+</Button>
      </div>
    </div>
  )
}

function YesNo({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <ChoiceGroup
      label={label}
      hint={hint}
      value={value ? "yes" : "no"}
      options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
      onChange={(next) => onChange(next === "yes")}
    />
  )
}
const columns: PickTier[] = ["tier1", "tier2", "tier3", "do_not_pick", "uncategorized"]
const columnLabels: Record<PickTier, string> = {
  tier1: "Tier 1",
  tier2: "Tier 2",
  tier3: "Tier 3",
  do_not_pick: "Do Not Pick",
  uncategorized: "Uncategorized",
}

type UserRole = "mentor" | "lead_scout" | "pit" | "tech" | "scout"
type StatboticsTeam = {
  team?: number
  norm_epa?: {
    current?: number
    recent?: number
    mean?: number
    max?: number
  }
  epa?: number
  total_epa?: number
  epa_end?: number
  epa_pre_playoffs?: number
  auto_epa?: number
  teleop_epa?: number
  endgame_epa?: number
}

function getStatboticsTotalEpa(data: StatboticsTeam) {
  if (typeof data.total_epa === "number") return data.total_epa
  if (typeof data.epa === "number") return data.epa
  if (typeof data.epa_end === "number") return data.epa_end
  if (typeof data.epa_pre_playoffs === "number") return data.epa_pre_playoffs
  if (typeof data.auto_epa === "number" || typeof data.teleop_epa === "number" || typeof data.endgame_epa === "number") {
    return (data.auto_epa ?? 0) + (data.teleop_epa ?? 0) + (data.endgame_epa ?? 0)
  }
  return null
}

const assignableRoles: UserRole[] = ["pit", "tech", "scout", "lead_scout"]
const roleLabels: Record<UserRole | "admin" | "scouter", string> = {
  admin: "Mentor",
  mentor: "Mentor",
  lead_scout: "Lead Scout",
  pit: "Pit",
  tech: "Tech",
  scout: "Scout",
  scouter: "Scout",
}

function normalizeRole(role: string | undefined): UserRole {
  if (role === "admin" || role === "mentor") return "mentor"
  if (role === "lead_scout" || role === "pit" || role === "tech" || role === "scout") {
    return role
  }
  return "scout"
}

function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

// Usernames map to the same internal login as the original nickname system,
// so everyone's existing account keeps working.
function normalizeNickname(nickname: string) {
  return nickname
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function nicknameToAuthEmail(nickname: string) {
  return `${normalizeNickname(nickname)}@scout.local`
}

function getCleanAuthError(error: unknown, mode: "signIn" | "signUp") {
  const code = error instanceof ConvexError ? String(error.data) : ""
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  if (code === "BAD_TEAM_CODE" || message.includes("bad_team_code")) {
    return "That team code isn't right. Ask a mentor or lead scout for the current code."
  }
  if (code === "WEAK_PASSWORD" || message.includes("weak_password")) {
    return "Pick a stronger password: at least 8 characters, and not something common like \"password1\"."
  }
  if (code === "BAD_USERNAME" || message.includes("bad_username")) {
    return "Usernames are 3–24 letters or numbers."
  }
  if (message.includes("already exists")) {
    return "That username is taken. If it's yours, switch to Sign in."
  }
  if (message.includes("too many") || message.includes("rate")) {
    return "Too many tries. Wait a few minutes and try again."
  }
  if (message.includes("invalid password") || message.includes("invalid credentials") || message.includes("invalidaccountid") || message.includes("invalid account")) {
    return "Wrong username or password."
  }
  return mode === "signUp" ? "Couldn't create the account. Check your connection and try again." : "Couldn't sign in. Check your connection and try again."
}

export function HomeRoute() {
  const workspace = useQuery(api.scouting.getWorkspace)
  const currentUser = useQuery(api.scouting.currentUser)
  const { isAuthenticated: convexIsAuthenticated } = useConvexAuth()
  const bootstrapProfile = useMutation(api.scouting.bootstrapProfile)
  const importEvent = useAction(api.scouting.importEvent)
  const upsertImportedEvent = useMutation(api.scouting.upsertImportedEvent)
  const saveTbaApiKey = useMutation(api.scouting.saveTbaApiKey)
  const savePitReport = useMutation(api.scouting.savePitReport)
  const saveMatchReport = useMutation(api.scouting.saveMatchReport)
  const updateTeamPickTier = useMutation(api.scouting.updateTeamPickTier)
  const ensurePicklist = useMutation(api.scouting.ensurePicklist)
  const assignUserRole = useMutation(api.scouting.assignUserRole)
  const deleteUserProfile = useMutation(api.scouting.deleteUserProfile)
  const generatePitPhotoUploadUrl = useMutation(api.scouting.generatePitPhotoUploadUrl)
  const createTechMessage = useMutation(api.scouting.createTechMessage)
  const resolveTechMessage = useMutation(api.scouting.resolveTechMessage)
  const createPitCrewItem = useMutation(api.scouting.createPitCrewItem)
  const markPitCrewItemReturned = useMutation(api.scouting.markPitCrewItemReturned)
  const { signIn, signOut } = useAuthActions()
  const connection = useConvexConnectionState()
  // Only warn after a short grace period so quick blips don't flash a banner.
  const [showOffline, setShowOffline] = useState(false)
  useEffect(() => {
    if (connection.isWebSocketConnected) {
      setShowOffline(false)
      return
    }
    const timer = window.setTimeout(() => setShowOffline(true), 4000)
    return () => window.clearTimeout(timer)
  }, [connection.isWebSocketConnected])
  const activeTab = useUiStore((state) => state.activeTab)
  const setActiveTab = useUiStore((state) => state.setActiveTab)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [eventKey, setEventKey] = useState("2026test")
  const [loadingImport, setLoadingImport] = useState(false)
  const [adminKeyEntry, setAdminKeyEntry] = useState("")
  const [adminError, setAdminError] = useState("")
  const [tbaApiKey, setTbaApiKey] = useState("")
  const [tbaKeyMessage, setTbaKeyMessage] = useState("")
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn")
  const [authNickname, setAuthNickname] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authError, setAuthError] = useState("")
  const [authConfirm, setAuthConfirm] = useState("")
  const [authTeamCode, setAuthTeamCode] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [importError, setImportError] = useState("")
  const [importSuccess, setImportSuccess] = useState("")
  const [pitNotes, setPitNotes] = useState("")
  const [pitDrivetrain, setPitDrivetrain] = useState("swerve")
  const [pitTeamId, setPitTeamId] = useState("")
  const [pitMessage, setPitMessage] = useState("")
  const [pitPhotos, setPitPhotos] = useState<File[]>([])
  const [borrowerName, setBorrowerName] = useState("")
  const [borrowerTeam, setBorrowerTeam] = useState("")
  const [borrowedItem, setBorrowedItem] = useState("")
  const [borrowNotes, setBorrowNotes] = useState("")
  const [borrowStatus, setBorrowStatus] = useState("")
  const [pitShotRange, setPitShotRange] = useState<ShotRange>("close")
  const [pitMove, setPitMove] = useState(false)
  const [pitGroundIntake, setPitGroundIntake] = useState(true)
  const [pitHumanIntake, setPitHumanIntake] = useState(false)
  const [pitCapacity, setPitCapacity] = useState("")
  const [pitAutoFuel, setPitAutoFuel] = useState("")
  const [pitAutoClimb, setPitAutoClimb] = useState(false)
  const [pitMaxClimb, setPitMaxClimb] = useState<ClimbLevel>("none")
  const [pitTraverse, setPitTraverse] = useState<"trench" | "bump" | "both" | "other">("both")
  const [teamSearch, setTeamSearch] = useState("")
  const [teamFilter, setTeamFilter] = useState<"all" | "unscouted" | "scouted">("all")
  const [teamSort, setTeamSort] = useState<"number" | "rank" | "teleop" | "epa">("number")
  const [matchAutoClimb, setMatchAutoClimb] = useState(false)
  const [matchAccuracy, setMatchAccuracy] = useState<Accuracy>("mid")
  const [matchFouls, setMatchFouls] = useState(0)
  const [matchEndgame, setMatchEndgame] = useState<MatchEndgameResult>("none")
  const [matchTags, setMatchTags] = useState<MatchTag[]>([])
  const [matchId, setMatchId] = useState("")
  const [matchTeamId, setMatchTeamId] = useState("")
  const [autoBalls, setAutoBalls] = useState(0)
  const [teleopBalls, setTeleopBalls] = useState(0)
  const [autoNotes, setAutoNotes] = useState("")
  const [teleopNotes, setTeleopNotes] = useState("")
  const [endgameNotes, setEndgameNotes] = useState("")
  const [driverRating, setDriverRating] = useState(5)
  const [defenseRating, setDefenseRating] = useState(5)
  const [picklistView, setPicklistView] = useState<"primary" | "personal">("personal")
  const [picklistSearch, setPicklistSearch] = useState("")
  const [techMessage, setTechMessage] = useState("")
  const [techStatus, setTechStatus] = useState("")
  const [matchSubmitting, setMatchSubmitting] = useState(false)
  const [matchStatus, setMatchStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [pitSubmitting, setPitSubmitting] = useState(false)
  const matchDraftLoaded = useRef(false)
  const [roleOverrides, setRoleOverrides] = useState<Record<string, UserRole>>({})
  const [deletedProfileIds, setDeletedProfileIds] = useState<string[]>([])
  const [teamDetailOpen, setTeamDetailOpen] = useState(false)
  const [statboticsEpaByTeamId, setStatboticsEpaByTeamId] = useState<Record<string, number | null>>({})
  const [selectedActivityUserId, setSelectedActivityUserId] = useState<string | null>(null)
  const bootstrappedProfileForUser = useRef<string | null>(null)
  const routedAfterLoginForUser = useRef<string | null>(null)

  useEffect(() => {
    if (!convexIsAuthenticated || !currentUser?.userId || currentUser.profile) {
      return
    }
    if (bootstrappedProfileForUser.current === currentUser.userId) {
      return
    }
    let cancelled = false
    void bootstrapProfile({ displayName: authNickname.trim() })
      .then(() => {
        if (!cancelled) {
          bootstrappedProfileForUser.current = currentUser.userId
        }
      })
      .catch(() => {
        // The auth state can still be settling immediately after sign-in.
        // Ignore the transient miss and let the next authenticated render retry.
      })
    return () => {
      cancelled = true
    }
  }, [authNickname, bootstrapProfile, convexIsAuthenticated, currentUser?.profile, currentUser?.userId])

  useEffect(() => {
    if (currentUser?.userId && routedAfterLoginForUser.current !== currentUser.userId) {
      routedAfterLoginForUser.current = currentUser.userId
      setActiveTab("dashboard")
    }
  }, [currentUser?.userId, setActiveTab])

  const activeEvent = workspace?.event
  const isSignedIn = Boolean(currentUser?.userId)
  const currentRole = normalizeRole(currentUser?.profile?.role)
  const isMentor = currentRole === "mentor"
  const canManagePicklist = currentRole === "mentor" || currentRole === "lead_scout"
  const canUsePit = currentRole === "mentor" || currentRole === "lead_scout" || currentRole === "pit" || currentRole === "scout"
  const canUseTech = currentRole === "mentor" || currentRole === "lead_scout" || currentRole === "tech"
  const mentorUnlocked = isMentor
  const teams = workspace?.teams ?? []
  const matches = workspace?.matches ?? []
  const reports = workspace?.reports ?? []
  const pitReports = workspace?.pitReports ?? []
  const techMessages = workspace?.techMessages ?? []
  const pitCrewItems = workspace?.pitCrewItems ?? []
  const activityLogs = workspace?.activityLogs ?? []
  const profiles = (workspace?.profiles ?? []).filter((profile) => !deletedProfileIds.includes(profile._id))
  const openTechMessages = techMessages.filter((message) => message.status === "open")
  const openPitCrewItems = pitCrewItems.filter((item) => item.status === "borrowed")
  const selectedActivityProfile = profiles.find((profile) => profile._id === selectedActivityUserId) ?? null
  const selectedActivityLogs = selectedActivityProfile
    ? activityLogs.filter((entry) => entry.targetUserId === selectedActivityProfile.userId || entry.actorUserId === selectedActivityProfile.userId)
    : []
  const unscoutedTeams = teams.filter((team) => team.pitStatus !== "scouted" && !pitReports.some((report) => report.teamId === team._id))
  const selectedTeam = teams.find((team) => team._id === teamId) ?? teams[0]
  const selectedPitTeam = unscoutedTeams.find((team) => team._id === pitTeamId) ?? unscoutedTeams[0]
  const selectedMatch = matches.find((match) => match._id === matchId) ?? matches[0]
  const matchTeams = selectedMatch
    ? teams.filter((team) => [...selectedMatch.redTeamNumbers, ...selectedMatch.blueTeamNumbers].includes(team.teamNumber))
    : teams
  const selectedMatchTeam = matchTeams.find((team) => team._id === matchTeamId) ?? matchTeams[0]
  const groupedTeams = useMemo(() => {
    const query = picklistSearch.trim().toLowerCase()
    const visibleTeams = query
      ? teams.filter((team) => `${team.teamNumber} ${team.nickname}`.toLowerCase().includes(query))
      : teams
    return columns.reduce<Record<PickTier, typeof teams>>((accumulator, column) => {
      accumulator[column] = visibleTeams.filter((team) => team.pickTier === column)
      return accumulator
    }, {
      tier1: [],
      tier2: [],
      tier3: [],
      do_not_pick: [],
      uncategorized: [],
    })
  }, [picklistSearch, teams])
  const visibleTeamList = useMemo(() => {
    const query = teamSearch.trim().toLowerCase()
    const filtered = teams.filter((team) => {
      if (teamFilter === "scouted" && team.pitStatus !== "scouted") return false
      if (teamFilter === "unscouted" && team.pitStatus === "scouted") return false
      return !query || `${team.teamNumber} ${team.nickname}`.toLowerCase().includes(query)
    })
    const avgTeleop = (id: string) => {
      const teamReports = reports.filter((report) => report.teamId === id)
      return teamReports.length ? teamReports.reduce((sum, report) => sum + report.teleopBallsScored, 0) / teamReports.length : -1
    }
    return [...filtered].sort((a, b) => {
      if (teamSort === "rank") return (a.eventRank ?? 9999) - (b.eventRank ?? 9999)
      if (teamSort === "teleop") return avgTeleop(b._id) - avgTeleop(a._id)
      if (teamSort === "epa") return (statboticsEpaByTeamId[b._id] ?? -1) - (statboticsEpaByTeamId[a._id] ?? -1)
      return a.teamNumber - b.teamNumber
    })
  }, [teams, reports, teamSearch, teamFilter, teamSort, statboticsEpaByTeamId])

  const teamStats = useMemo(() => {
    return teams.reduce<Record<string, {
      matchCount: number
      avgAuto: number
      avgTeleop: number
      avgDriver: number
      avgClimb: string
      pitReport?: (typeof pitReports)[number]
      reports: typeof reports
    }>>((accumulator, team) => {
      const teamReports = reports.filter((report) => report.teamId === team._id)
      const climbCounts = teamReports.reduce<Record<string, number>>((counts, report) => {
        counts[report.endgameResult] = (counts[report.endgameResult] ?? 0) + 1
        return counts
      }, {})
      const topClimb = Object.entries(climbCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none"
      accumulator[team._id] = {
        matchCount: teamReports.length,
        avgAuto: average(teamReports.map((report) => report.autoBallsScored)),
        avgTeleop: average(teamReports.map((report) => report.teleopBallsScored)),
        avgDriver: average(teamReports.map((report) => report.driverRating)),
        avgClimb: topClimb,
        pitReport: pitReports.find((report) => report.teamId === team._id),
        reports: teamReports,
      }
      return accumulator
    }, {})
  }, [pitReports, reports, teams])

  // Only refetch Statbotics when the event or its team list actually changes,
  // not every time someone submits a report. Results are cached for 30 minutes.
  const statboticsKey = `${activeEvent?.eventKey ?? ""}:${teams.map((team) => `${team._id}=${team.teamNumber}`).join(",")}`
  useEffect(() => {
    let cancelled = false
    async function loadStatbotics() {
      if (!teams.length) {
        setStatboticsEpaByTeamId({})
        return
      }
      const cacheKey = `1880-scout:epa:${statboticsKey}`
      const cached = readJson<{ at: number; data: Record<string, number | null> }>(sessionStorage, cacheKey)
      if (cached && Date.now() - cached.at < STATBOTICS_CACHE_MS) {
        setStatboticsEpaByTeamId(cached.data)
        return
      }
      const eventKey = activeEvent?.eventKey
      const entries = await mapWithLimit(teams, 6, async (team) => {
        try {
          const endpoint = eventKey
            ? `https://api.statbotics.io/v3/team/${team.teamNumber}/event/${eventKey}`
            : `https://api.statbotics.io/v3/team/${team.teamNumber}`
          const response = await fetch(endpoint)
          if (!response.ok) {
            return [team._id, null] as const
          }
          const data = (await response.json()) as StatboticsTeam
          return [team._id, getStatboticsTotalEpa(data)] as const
        } catch {
          return [team._id, null] as const
        }
      })
      if (!cancelled) {
        const data = Object.fromEntries(entries)
        setStatboticsEpaByTeamId(data)
        writeJson(sessionStorage, cacheKey, { at: Date.now(), data })
      }
    }
    void loadStatbotics()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statboticsKey])

  useEffect(() => {
    if (activeEvent?._id && currentUser?.userId && canManagePicklist) {
      void ensurePicklist({ eventId: activeEvent._id, name: "My Pick List" })
      if (isMentor) {
        void ensurePicklist({ eventId: activeEvent._id, name: "Primary Pick List", isPrimary: true })
      }
    }
  }, [activeEvent?._id, canManagePicklist, currentUser?.userId, ensurePicklist, isMentor])

  useEffect(() => {
    const roleCanSeeActiveTab =
      isMentor ||
      activeTab === "dashboard" ||
      activeTab === "gallery" ||
      (activeTab === "teams" && ["lead_scout", "pit", "tech", "scout"].includes(currentRole)) ||
      (activeTab === "pit" && ["lead_scout", "pit", "scout"].includes(currentRole)) ||
      (activeTab === "pitCrew" && ["lead_scout", "pit"].includes(currentRole)) ||
      (activeTab === "matches" && ["lead_scout", "scout"].includes(currentRole)) ||
      (activeTab === "picklist" && currentRole === "lead_scout") ||
      (activeTab === "tech" && currentRole === "tech")
    if (!roleCanSeeActiveTab) {
      setActiveTab("dashboard")
    }
  }, [activeTab, currentRole, isMentor, setActiveTab])

  async function handleImport() {
    if (!isMentor) return
    setLoadingImport(true)
    setImportError("")
    setImportSuccess("")
    try {
      const imported = await importEvent({ eventKey: eventKey.trim() })
      if (!imported.ok) {
        setImportError(imported.error)
        return
      }
      await upsertImportedEvent({
        eventKey: eventKey.trim(),
        name: imported.data.event.name ?? "FRC Event",
        city: imported.data.event.city,
        state: imported.data.event.state_prov,
        country: imported.data.event.country,
        teams: imported.data.teams,
        matches: imported.data.matches,
      })
      setTeamId(null)
      setImportSuccess(`Imported ${imported.data.teams.length} teams and ${imported.data.matches.length} qualification matches.`)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Event import failed")
    } finally {
      setLoadingImport(false)
    }
  }

  async function handleAdminUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAdminError("")
    if (!adminKeyEntry.trim()) {
      setAdminError("Enter the mentor key.")
      return
    }
    try {
      await bootstrapProfile({ displayName: authNickname.trim(), adminKey: adminKeyEntry.trim() })
      setAdminKeyEntry("")
    } catch {
      setAdminError("Invalid mentor key.")
    }
  }

  async function handleAssignRole(profileId: string, role: UserRole) {
    setRoleOverrides((current) => ({ ...current, [profileId]: role }))
    try {
      await assignUserRole({ profileId: profileId as never, role })
    } catch (error) {
      setRoleOverrides((current) => {
        const next = { ...current }
        delete next[profileId]
        return next
      })
      throw error
    }
  }

  function openUserActivity(profileId: string) {
    setSelectedActivityUserId(profileId)
  }

  async function handleDeleteUser(profileId: string) {
    setDeletedProfileIds((current) => [...current, profileId])
    try {
      await deleteUserProfile({ profileId: profileId as never })
    } catch (error) {
      setDeletedProfileIds((current) => current.filter((id) => id !== profileId))
      setAdminError(error instanceof Error ? error.message : "Could not delete user.")
    }
  }

  async function handleSaveTbaApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTbaKeyMessage("")
    try {
      await saveTbaApiKey({ apiKey: tbaApiKey })
      setTbaApiKey("")
      setTbaKeyMessage("TBA API key saved.")
    } catch (error) {
      setTbaKeyMessage(error instanceof Error ? error.message : "Could not save TBA API key.")
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (authBusy) return
    setAuthError("")
    const username = authNickname.trim()
    const normalized = normalizeNickname(username)
    if (normalized.length < 3 || normalized.length > 24) {
      setAuthError("Usernames are 3–24 letters or numbers.")
      return
    }
    if (authPassword.length < 8) {
      setAuthError(authMode === "signUp" ? "Passwords need at least 8 characters." : "Wrong username or password.")
      return
    }
    if (authMode === "signUp") {
      if (authPassword !== authConfirm) {
        setAuthError("The two passwords don't match.")
        return
      }
      if (authPassword.toLowerCase().includes(normalized)) {
        setAuthError("Don't put your username in your password.")
        return
      }
      if (!authTeamCode.trim()) {
        setAuthError("Enter the team code from a mentor or lead scout.")
        return
      }
    }
    setAuthBusy(true)
    try {
      await signIn("password", {
        flow: authMode,
        email: nicknameToAuthEmail(username),
        name: username,
        password: authPassword,
        ...(authMode === "signUp" ? { teamCode: authTeamCode.trim() } : {}),
      })
      setAuthPassword("")
      setAuthConfirm("")
      setAuthTeamCode("")
    } catch (error) {
      setAuthError(getCleanAuthError(error, authMode))
    } finally {
      setAuthBusy(false)
    }
  }

  async function handlePitSubmit() {
    if (!selectedPitTeam || pitSubmitting) return
    setPitMessage("")
    setPitSubmitting(true)
    try {
      const photoIds = await Promise.all(
        pitPhotos.map(async (photo) => {
          const uploadUrl = await generatePitPhotoUploadUrl()
          const response = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": photo.type },
            body: photo,
          })
          if (!response.ok) {
            throw new Error("Could not upload robot photo.")
          }
          const { storageId } = await response.json() as { storageId: string }
          return storageId
        }),
      )
      await savePitReport({
        teamId: selectedPitTeam._id,
        shotRange: pitShotRange,
        shootOnMove: pitMove,
        groundIntake: pitGroundIntake,
        humanPlayerIntake: pitHumanIntake,
        fuelCapacity: pitCapacity.trim() ? Math.round(Number(pitCapacity)) : undefined,
        autoFuelClaim: pitAutoFuel.trim() ? Math.round(Number(pitAutoFuel)) : undefined,
        autoClimb: pitAutoClimb,
        maxClimb: pitMaxClimb,
        traverse: pitTraverse,
        drivetrain: pitDrivetrain,
        notes: pitNotes || undefined,
        photoIds: photoIds as never,
      })
      setPitTeamId("")
      setPitShotRange("close")
      setPitMove(false)
      setPitGroundIntake(true)
      setPitHumanIntake(false)
      setPitCapacity("")
      setPitAutoFuel("")
      setPitAutoClimb(false)
      setPitMaxClimb("none")
      setPitTraverse("both")
      setPitDrivetrain("swerve")
      setPitNotes("")
      setPitPhotos([])
      setPitMessage("Pit report submitted. That team is off the unscouted list.")
    } catch (error) {
      setPitMessage(error instanceof Error ? error.message : "Could not save pit report.")
    } finally {
      setPitSubmitting(false)
    }
  }

  async function handleTechSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTechStatus("")
    if (!activeEvent?._id) {
      setTechStatus("Import an event before sending tech notes.")
      return
    }
    try {
      await createTechMessage({
        eventId: activeEvent._id,
        message: techMessage,
      })
      setTechMessage("")
      setTechStatus("Tech note sent to pit.")
    } catch (error) {
      setTechStatus(error instanceof Error ? error.message : "Could not send tech note.")
    }
  }

  async function handlePitCrewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBorrowStatus("")
    if (!activeEvent?._id) {
      setBorrowStatus("Import an event before tracking borrowed items.")
      return
    }
    try {
      await createPitCrewItem({
        eventId: activeEvent._id,
        borrowerName,
        borrowerTeam,
        itemName: borrowedItem,
        notes: borrowNotes || undefined,
      })
      setBorrowerName("")
      setBorrowerTeam("")
      setBorrowedItem("")
      setBorrowNotes("")
      setBorrowStatus("Borrowed item added.")
    } catch (error) {
      setBorrowStatus(error instanceof Error ? error.message : "Could not add borrowed item.")
    }
  }

  // Keep the in-progress match form on the phone so a refresh, a dead battery
  // or a dropped connection never loses a report mid-match.
  useEffect(() => {
    if (matchDraftLoaded.current) return
    matchDraftLoaded.current = true
    const draft = readJson<{
      matchId?: string; matchTeamId?: string; autoBalls?: number; teleopBalls?: number
      autoNotes?: string; teleopNotes?: string; endgameNotes?: string; driverRating?: number
      defenseRating?: number; matchEndgame?: MatchEndgameResult; matchTags?: MatchTag[]
      matchAutoClimb?: boolean; matchAccuracy?: Accuracy; matchFouls?: number
    }>(localStorage, MATCH_DRAFT_KEY)
    if (!draft) return
    if (draft.matchId) setMatchId(draft.matchId)
    if (draft.matchTeamId) setMatchTeamId(draft.matchTeamId)
    setAutoBalls(draft.autoBalls ?? 0)
    setTeleopBalls(draft.teleopBalls ?? 0)
    setAutoNotes(draft.autoNotes ?? "")
    setTeleopNotes(draft.teleopNotes ?? "")
    setEndgameNotes(draft.endgameNotes ?? "")
    setDriverRating(draft.driverRating ?? 5)
    setDefenseRating(draft.defenseRating ?? 5)
    setMatchEndgame(draft.matchEndgame ?? "none")
    // Drop tags from older versions of the form that no longer exist.
    setMatchTags((draft.matchTags ?? []).filter((tag) => tag in tagLabels && tagGroups.some((group) => group.tags.includes(tag))))
    setMatchAutoClimb(draft.matchAutoClimb ?? false)
    setMatchAccuracy(draft.matchAccuracy ?? "mid")
    setMatchFouls(draft.matchFouls ?? 0)
  }, [])

  useEffect(() => {
    if (!matchDraftLoaded.current) return
    writeJson(localStorage, MATCH_DRAFT_KEY, {
      matchId, matchTeamId, autoBalls, teleopBalls, autoNotes, teleopNotes,
      endgameNotes, driverRating, defenseRating, matchEndgame, matchTags,
      matchAutoClimb, matchAccuracy, matchFouls,
    })
  }, [matchId, matchTeamId, autoBalls, teleopBalls, autoNotes, teleopNotes, endgameNotes, driverRating, defenseRating, matchEndgame, matchTags, matchAutoClimb, matchAccuracy, matchFouls])

  async function handleMatchSubmit() {
    if (!selectedMatch || !selectedMatchTeam || matchSubmitting) return
    setMatchSubmitting(true)
    setMatchStatus(null)
    try {
      await saveMatchReport({
        matchId: selectedMatch._id,
        teamId: selectedMatchTeam._id,
        autoBallsScored: autoBalls,
        teleopBallsScored: teleopBalls,
        autoNotes: autoNotes || undefined,
        teleopNotes: teleopNotes || undefined,
        endgameResult: matchEndgame,
        endgameNotes: endgameNotes || undefined,
        driverRating,
        defenseRating,
        autoClimb: matchAutoClimb,
        accuracy: matchAccuracy,
        fouls: matchFouls,
        tags: matchTags,
      })
      setMatchStatus({ kind: "ok", text: `Saved team ${selectedMatchTeam.teamNumber} in Qual ${selectedMatch.matchNumber}.` })
      setAutoBalls(0)
      setTeleopBalls(0)
      setAutoNotes("")
      setTeleopNotes("")
      setEndgameNotes("")
      setMatchEndgame("none")
      setDriverRating(5)
      setDefenseRating(5)
      setMatchAutoClimb(false)
      setMatchAccuracy("mid")
      setMatchFouls(0)
      setMatchTags([])
      // Jump to the next match so the scout is ready for it.
      const nextMatch = matches
        .filter((match) => match.matchNumber > selectedMatch.matchNumber)
        .sort((a, b) => a.matchNumber - b.matchNumber)[0]
      if (nextMatch) {
        // Stay on the same driver station (e.g. Red 2) for the next match.
        const station = [...selectedMatch.redTeamNumbers, ...selectedMatch.blueTeamNumbers].indexOf(selectedMatchTeam.teamNumber)
        const nextNumber = [...nextMatch.redTeamNumbers, ...nextMatch.blueTeamNumbers][station]
        const nextTeam = teams.find((team) => team.teamNumber === nextNumber)
        setMatchId(nextMatch._id)
        setMatchTeamId(nextTeam?._id ?? "")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.replace(/^.*Uncaught Error:\s*/, "").split("\n")[0] : ""
      setMatchStatus({
        kind: "error",
        text: `Not saved yet: ${message || "connection problem"}. Your answers are kept on this phone, so try again in a moment.`,
      })
    } finally {
      setMatchSubmitting(false)
    }
  }

  if (!isSignedIn) {
    return (
      <main className="safe-area min-h-svh px-4 py-6 text-foreground">
        <div className="mx-auto flex min-h-[calc(100svh-3rem)] w-full max-w-md flex-col justify-center">
          <div className="surface-card fade-up p-5">
            <div className="flex flex-col items-center gap-3 text-center">
              <img src={frc1880Logo} alt="Team 1880 logo" className="logo-float size-16 rounded-xl object-contain shadow-sm" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">FRC Team 1880</div>
                <div className="text-sm font-semibold">Warriors of East Harlem</div>
              </div>
            </div>
            <h1 className="mt-5 text-center text-2xl font-semibold">{authMode === "signIn" ? "Welcome back" : "Join the scouting team"}</h1>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              {authMode === "signIn" ? "Sign in with your username and password." : "You'll need the team code from a mentor or lead scout."}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg border bg-background p-1" role="tablist" aria-label="Sign in or create account">
              {([
                ["signIn", "Sign in"],
                ["signUp", "Create account"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={authMode === mode}
                  onClick={() => {
                    setAuthMode(mode)
                    setAuthError("")
                  }}
                  className={cn("nav-pill h-9 rounded-md text-sm font-medium", authMode === mode ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {label}
                </button>
              ))}
            </div>
            <form className="mt-5 space-y-4" onSubmit={(event) => void handleAuthSubmit(event)} noValidate>
              <div className="space-y-2">
                <Label htmlFor="authNickname">Username</Label>
                <Input
                  id="authNickname"
                  className="h-11"
                  value={authNickname}
                  onChange={(event) => setAuthNickname(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="e.g. jayden"
                  required
                />
                {authMode === "signUp" ? <p className="text-xs text-muted-foreground">3–24 letters or numbers. This is also the name your team sees.</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="authPassword">Password</Label>
                <div className="relative">
                  <Input
                    id="authPassword"
                    className="h-11 pr-11"
                    type={showPassword ? "text" : "password"}
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    autoComplete={authMode === "signIn" ? "current-password" : "new-password"}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {authMode === "signUp" ? <p className="text-xs text-muted-foreground">At least 8 characters. A short phrase like "blue robot jumps" is easy to remember and hard to guess.</p> : null}
              </div>
              {authMode === "signUp" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="authConfirm">Confirm password</Label>
                    <Input
                      id="authConfirm"
                      className="h-11"
                      type={showPassword ? "text" : "password"}
                      value={authConfirm}
                      onChange={(event) => setAuthConfirm(event.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="authTeamCode">Team code</Label>
                    <Input
                      id="authTeamCode"
                      className="h-11"
                      value={authTeamCode}
                      onChange={(event) => setAuthTeamCode(event.target.value)}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                    />
                  </div>
                </>
              ) : null}
              {authError ? <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{authError}</div> : null}
              <Button className="h-11 w-full text-base" type="submit" disabled={authBusy}>
                <LogIn className="size-4" />
                {authBusy ? "One sec…" : authMode === "signIn" ? "Sign in" : "Create account"}
              </Button>
              <a href="/guest" className="block rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50">
                Alliance partner? <span className="font-medium text-foreground">View our scouting with a guest code</span>
              </a>
              {authMode === "signIn" ? (
                <p className="text-center text-xs text-muted-foreground">Forgot your password? Ask a mentor to remove your account in the Mentor tab, then create it again.</p>
              ) : null}
            </form>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-svh text-foreground">
      <div className="safe-area mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-4 px-3 py-3 sm:px-6 sm:py-4">
        <header className="app-header sticky top-2 z-40 rounded-xl border px-3 py-2.5 shadow-sm sm:px-4">
          <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <img src={frc1880Logo} alt="Team 1880 logo" className="size-8 rounded-md object-contain" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">1880 Scout</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="size-3" />
                2026 FRC Scouting
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AppNav variant="mobile" activeTab={activeTab} onTabChange={setActiveTab} role={currentRole} />
            <ThemeModeMenu />
            <Button variant="outline" size="sm" className="h-9" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
          </div>
          <div className="mt-2 hidden border-t pt-2 xl:block">
            <AppNav variant="desktop" activeTab={activeTab} onTabChange={setActiveTab} role={currentRole} />
          </div>
        </header>

        {showOffline ? (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <AlertCircle className="size-4 shrink-0" />
            No connection right now. Keep scouting: your match form is saved on this phone, and anything you submit will send once you're back online.
          </div>
        ) : null}

        {activeTab === "dashboard" ? (
          <section className="grid gap-4">
            <div className="hero-banner fade-up relative overflow-hidden rounded-xl border p-5 shadow-sm">
              <img src={frc1880Logo} alt="" aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 size-40 rotate-12 object-contain opacity-10" />
              <div className="relative flex items-center gap-4">
                <img src={frc1880Logo} alt="Team 1880 logo" className="logo-float size-14 rounded-xl object-contain shadow-sm" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">FRC Team 1880</div>
                  <div className="text-xl font-semibold sm:text-2xl">Warriors of East Harlem</div>
                  <div className="text-sm text-muted-foreground">Welcome back{currentUser?.profile?.displayName ? `, ${currentUser.profile.displayName}` : ""}. Let's scout.</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="text-sm font-semibold">Current event</div>
              <div className="mt-2 text-2xl font-semibold">{activeEvent?.name ?? "No event imported yet"}</div>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="size-4" />
                {[activeEvent?.city, activeEvent?.state, activeEvent?.country].filter(Boolean).join(", ") || "Waiting for mentor import"}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Teams", value: teams.length },
              { label: "Matches", value: matches.length },
              { label: "Role", value: roleLabels[currentRole] },
            ].map((metric) => (
              <div key={metric.label} className="rounded-xl border bg-card p-4 text-center shadow-sm">
                <div className="text-2xl font-semibold">{metric.value}</div>
                <div className="text-xs text-muted-foreground">{metric.label}</div>
              </div>
            ))}
            </div>
          </section>
        ) : null}

        {activeTab === "admin" ? (
          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="size-4" />
                Mentor
              </div>
              {!mentorUnlocked ? (
                <form className="mt-4 space-y-3" onSubmit={(event) => void handleAdminUnlock(event)}>
                  <div className="space-y-2">
                    <Label htmlFor="adminKeyEntry">Mentor key</Label>
                    <Input id="adminKeyEntry" type="password" value={adminKeyEntry} onChange={(event) => setAdminKeyEntry(event.target.value)} />
                  </div>
                  {adminError ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{adminError}</div> : null}
                  <Button type="submit">Unlock mentor</Button>
                </form>
              ) : (
                <div className="mt-4 rounded-lg border bg-background p-4 text-sm text-muted-foreground">Mentor key accepted. Event setup is available.</div>
              )}
            </div>
            {mentorUnlocked ? (
              <div className="grid gap-4">
                <form className="rounded-xl border bg-card p-4 shadow-sm" onSubmit={(event) => void handleSaveTbaApiKey(event)}>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <KeyRound className="size-4" />
                    The Blue Alliance key
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {workspace?.hasTbaApiKey ? "A TBA API key is saved. Paste a new one here to replace it." : "Add your TBA API key before importing an event."}
                  </p>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="tbaApiKey">TBA API key</Label>
                    <Input id="tbaApiKey" type="password" value={tbaApiKey} onChange={(event) => setTbaApiKey(event.target.value)} placeholder="Paste API key" />
                  </div>
                  <Button className="mt-4" type="submit">Save TBA key</Button>
                  {tbaKeyMessage ? <div className="mt-3 rounded-lg border bg-background p-3 text-sm text-muted-foreground">{tbaKeyMessage}</div> : null}
                </form>
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Download className="size-4" />
                    Event setup
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">Import teams and qualification matches from The Blue Alliance.</p>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="eventKey">Event key</Label>
                    <Input id="eventKey" value={eventKey} onChange={(event) => setEventKey(event.target.value)} placeholder="2026nvlv" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => void handleImport()} disabled={loadingImport || !workspace?.hasTbaApiKey}>
                      {loadingImport ? "Importing..." : "Import event"}
                    </Button>
                    {activeEvent ? <Button variant="outline" onClick={() => window.location.reload()}>Refresh workspace</Button> : null}
                  </div>
                  {!workspace?.hasTbaApiKey ? <div className="mt-3 rounded-lg border bg-background p-3 text-sm text-muted-foreground">Save a TBA API key first.</div> : null}
                  {importSuccess ? <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{importSuccess}</div> : null}
                  {importError ? <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{importError}</div> : null}
                </div>
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="size-4" />
                    Users
                  </div>
                  <div className="mt-4 grid gap-2">
                    {profiles.length ? profiles.map((profile) => (
                      <div key={profile._id} className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div>
                          <div className="text-sm font-semibold">{profile.displayName || "Unnamed scout"}</div>
                          <div className="text-xs text-muted-foreground">{roleLabels[roleOverrides[profile._id] ?? normalizeRole(profile.role)]}</div>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <select
                            className="h-10 rounded-md border bg-card px-3 text-base sm:text-sm"
                            value={roleOverrides[profile._id] ?? normalizeRole(profile.role)}
                            onChange={(event) => void handleAssignRole(profile._id, event.target.value as UserRole)}
                          >
                            <option value="mentor">Mentor</option>
                            {assignableRoles.map((role) => (
                              <option key={role} value={role}>{roleLabels[role]}</option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={normalizeRole(profile.role) === "mentor"}
                            onClick={() => void handleDeleteUser(profile._id)}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => openUserActivity(profile._id)}>
                            Activity
                          </Button>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">Signed-up users will appear here.</div>
                    )}
                  </div>
                </div>
                <GuestPassManager />
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Clock3 className="size-4" />
                    Activity log
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">Pick a person to see what they personally contributed.</p>
                  <div className="mt-4 grid gap-2">
                    {selectedActivityProfile ? (
                      selectedActivityLogs.length ? selectedActivityLogs.map((entry) => (
                        <div key={entry._id} className="rounded-lg border bg-background p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-semibold">{entry.action}</div>
                            <div className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</div>
                          </div>
                          {entry.details ? <div className="mt-1 text-sm text-muted-foreground">{entry.details}</div> : null}
                        </div>
                      )) : (
                        <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">No activity logged for {selectedActivityProfile.displayName || "this user"} yet.</div>
                      )
                    ) : (
                      <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">Choose a user above to view their activity.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "teams" ? <section className="grid gap-3">
          <div className="surface-card grid gap-3 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Teams</div>
                <div className="text-xs text-muted-foreground">{visibleTeamList.length} of {teams.length} shown · tap a team for details</div>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-lg border bg-background p-1 text-xs">
                {([
                  ["all", "All"],
                  ["unscouted", "No pit"],
                  ["scouted", "Pit done"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTeamFilter(value)}
                    className={cn("nav-pill h-8 rounded-md px-3 font-medium", teamFilter === value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                value={teamSearch}
                onChange={(event) => setTeamSearch(event.target.value)}
                placeholder="Search number or name"
                inputMode="search"
                aria-label="Search teams"
              />
              <select
                className="h-8 rounded-lg border bg-background px-2 text-base sm:text-sm"
                value={teamSort}
                onChange={(event) => setTeamSort(event.target.value as typeof teamSort)}
                aria-label="Sort teams"
              >
                <option value="number">Sort: team number</option>
                <option value="rank">Sort: event rank</option>
                <option value="teleop">Sort: avg teleop fuel</option>
                <option value="epa">Sort: EPA</option>
              </select>
            </div>
          </div>

          {visibleTeamList.length ? (
            <div className="surface-card divide-y overflow-hidden sm:grid sm:grid-cols-2 sm:gap-2 sm:divide-y-0 sm:border-0 sm:bg-transparent sm:shadow-none xl:grid-cols-3">
              {visibleTeamList.map((team) => {
                const stats = teamStats[team._id]
                const epa = statboticsEpaByTeamId[team._id]
                return (
                  <button
                    key={team._id}
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted sm:rounded-xl sm:border sm:bg-card sm:p-4 sm:shadow-sm"
                    onClick={() => {
                      setTeamId(team._id)
                      setTeamDetailOpen(true)
                    }}
                  >
                    <div className="w-14 shrink-0 text-lg font-semibold tabular-nums">{team.teamNumber}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{team.nickname}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className={cn("inline-flex items-center gap-1", team.pitStatus === "scouted" && "text-emerald-600 dark:text-emerald-400")}>
                          {team.pitStatus === "scouted" ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
                          {team.pitStatus === "scouted" ? "Pit done" : "No pit"}
                        </span>
                        <span>{stats?.matchCount ?? 0} reports</span>
                        {team.eventRank ? <span>Rank {team.eventRank}</span> : null}
                        {epa != null ? <span>EPA {epa.toFixed(1)}</span> : null}
                      </div>
                    </div>
                    {team.pickTier !== "uncategorized" ? (
                      <span className="hidden shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground min-[380px]:inline">{columnLabels[team.pickTier as PickTier]}</span>
                    ) : null}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="surface-card p-6 text-center text-sm text-muted-foreground">
              {teams.length ? "No teams match that search." : "No teams yet. A mentor needs to import the event."}
            </div>
          )}
        </section> : null}

        {activeTab === "pit" ? (
          <section className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4" />
              Pit scouting
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Pick an unscouted team. Submitted teams leave this list automatically.</p>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pitTeamSelect">Unscouted team</Label>
                <select
                  id="pitTeamSelect"
                  className="h-12 w-full rounded-md border bg-background px-3 text-base sm:text-sm"
                  value={selectedPitTeam?._id ?? ""}
                  onChange={(event) => setPitTeamId(event.target.value)}
                  disabled={!canUsePit || !unscoutedTeams.length}
                >
                  {unscoutedTeams.length ? unscoutedTeams.map((team) => (
                    <option key={team._id} value={team._id}>{team.teamNumber} - {team.nickname}</option>
                  )) : (
                    <option value="">No unscouted teams left</option>
                  )}
                </select>
              </div>
              <div className="grid gap-5 rounded-lg border p-4">
                <div className="text-sm font-semibold">Shooting</div>
                <ChoiceGroup
                  label="Where can it score fuel from?"
                  hint="Ask them, then pick the farthest spot they're consistent from."
                  value={pitShotRange}
                  columns={4}
                  options={[
                    { value: "close", label: "Right at the hub" },
                    { value: "mid", label: "A few set spots" },
                    { value: "long", label: "Anywhere in our zone" },
                    { value: "none", label: "Doesn't shoot" },
                  ]}
                  onChange={setPitShotRange}
                />
                <YesNo label="Can it shoot while driving?" value={pitMove} onChange={setPitMove} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pitCapacity">How much fuel can it hold?</Label>
                    <Input id="pitCapacity" inputMode="numeric" pattern="[0-9]*" value={pitCapacity} onChange={(event) => setPitCapacity(event.target.value.replace(/\D/g, ""))} placeholder="e.g. 8" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pitAutoFuel">Fuel they say they score in auto</Label>
                    <Input id="pitAutoFuel" inputMode="numeric" pattern="[0-9]*" value={pitAutoFuel} onChange={(event) => setPitAutoFuel(event.target.value.replace(/\D/g, ""))} placeholder="e.g. 6" />
                  </div>
                </div>
              </div>

              <div className="grid gap-5 rounded-lg border p-4">
                <div className="text-sm font-semibold">Intake</div>
                <YesNo label="Picks fuel up off the floor?" value={pitGroundIntake} onChange={setPitGroundIntake} />
                <YesNo label="Takes fuel from the human player?" value={pitHumanIntake} onChange={setPitHumanIntake} />
              </div>

              <div className="grid gap-5 rounded-lg border p-4">
                <div className="text-sm font-semibold">Climbing & driving</div>
                <ChoiceGroup
                  label="Highest tower level it can reach"
                  value={pitMaxClimb}
                  columns={4}
                  options={[
                    { value: "none", label: "Can't climb" },
                    { value: "l1", label: "Level 1" },
                    { value: "l2", label: "Level 2" },
                    { value: "l3", label: "Level 3" },
                  ]}
                  onChange={setPitMaxClimb}
                />
                <YesNo label="Can it climb Level 1 during auto?" hint="Worth 15 points in auto." value={pitAutoClimb} onChange={setPitAutoClimb} />
                <ChoiceGroup
                  label="How does it cross the field?"
                  value={pitTraverse}
                  columns={4}
                  options={[
                    { value: "trench", label: "Under the trench" },
                    { value: "bump", label: "Over the bump" },
                    { value: "both", label: "Either way" },
                    { value: "other", label: "Neither" },
                  ]}
                  onChange={setPitTraverse}
                />
                <ChoiceGroup
                  label="Drivetrain"
                  value={["swerve", "tank", "mecanum"].includes(pitDrivetrain) ? pitDrivetrain : "other"}
                  columns={4}
                  options={[
                    { value: "swerve", label: "Swerve" },
                    { value: "tank", label: "Tank" },
                    { value: "mecanum", label: "Mecanum" },
                    { value: "other", label: "Other" },
                  ]}
                  onChange={setPitDrivetrain}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pitNotes">Robot notes</Label>
                <Textarea id="pitNotes" value={pitNotes} onChange={(event) => setPitNotes(event.target.value)} placeholder="Anything that stood out: strong auto, fragile intake, still being fixed, great people to partner with…" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="robotPhotos">Robot photos</Label>
                <Input
                  id="robotPhotos"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => setPitPhotos(Array.from(event.target.files ?? []))}
                />
                {pitPhotos.length ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ImagePlus className="size-4" />
                    {pitPhotos.length} photo{pitPhotos.length === 1 ? "" : "s"} selected
                  </div>
                ) : null}
              </div>
              {pitMessage ? <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">{pitMessage}</div> : null}
              <Button className="h-12 w-full text-base" onClick={() => void handlePitSubmit()} disabled={!canUsePit || !selectedPitTeam || pitSubmitting}>{pitSubmitting ? "Saving…" : "Submit pit scouting"}</Button>
            </div>
          </section>
        ) : null}

        {activeTab === "pitCrew" ? (
          <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <form className="rounded-xl border bg-card p-4 shadow-sm" onSubmit={(event) => void handlePitCrewSubmit(event)}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4" />
                Pit crew
              </div>
              <div className="mt-4 grid gap-3">
                <div className="space-y-2">
                  <Label htmlFor="borrowerName">Who borrowed it</Label>
                  <Input id="borrowerName" value={borrowerName} onChange={(event) => setBorrowerName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="borrowerTeam">Team</Label>
                  <Input id="borrowerTeam" value={borrowerTeam} onChange={(event) => setBorrowerTeam(event.target.value)} placeholder="Team number or name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="borrowedItem">Item</Label>
                  <Input id="borrowedItem" value={borrowedItem} onChange={(event) => setBorrowedItem(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="borrowNotes">Notes</Label>
                  <Textarea id="borrowNotes" value={borrowNotes} onChange={(event) => setBorrowNotes(event.target.value)} placeholder="Anything pit should remember" />
                </div>
                {borrowStatus ? <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">{borrowStatus}</div> : null}
                <Button type="submit" disabled={!activeEvent || !borrowerName.trim() || !borrowerTeam.trim() || !borrowedItem.trim()}>
                  Add borrowed item
                </Button>
              </div>
            </form>
            <div className="grid gap-4">
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="text-sm font-semibold">Tech notes for pit crew</div>
                <p className="mt-1 text-sm text-muted-foreground">Messages from Tech show up here for pit crew to prepare before the robot comes back.</p>
                <div className="mt-4 grid gap-2">
                  {openTechMessages.length ? openTechMessages.map((message) => {
                    const team = teams.find((item) => item._id === message.teamId)
                    return (
                      <div key={message._id} className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div>
                          <div className="text-sm font-medium">{team ? `${team.teamNumber} - ${team.nickname}` : "General pit note"}</div>
                          <div className="text-sm text-muted-foreground">{message.message}</div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => void resolveTechMessage({ messageId: message._id })}>Done</Button>
                      </div>
                    )
                  }) : (
                    <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">No tech notes waiting right now.</div>
                  )}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="text-sm font-semibold">Borrowed items</div>
                <div className="mt-4 grid gap-2">
                  {openPitCrewItems.length ? openPitCrewItems.map((item) => (
                    <div key={item._id} className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <div className="text-sm font-semibold">{item.itemName}</div>
                        <div className="text-sm text-muted-foreground">{item.borrowerName} from {item.borrowerTeam}</div>
                        {item.notes ? <div className="mt-1 text-xs text-muted-foreground">{item.notes}</div> : null}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void markPitCrewItemReturned({ itemId: item._id })}>
                        Returned
                      </Button>
                    </div>
                  )) : (
                    <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">No borrowed items open.</div>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "matches" ? <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4" /> Match scouting</div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="matchSelect">Match number</Label>
                <select
                  id="matchSelect"
                  className="h-12 w-full rounded-md border bg-background px-3 text-base sm:text-sm"
                  value={selectedMatch?._id ?? ""}
                  onChange={(event) => setMatchId(event.target.value)}
                >
                  {matches.map((match) => (
                    <option key={match._id} value={match._id}>Qual {match.matchNumber}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="robotSelect">Team in this match</Label>
                <select
                  id="robotSelect"
                  className="h-12 w-full rounded-md border bg-background px-3 text-base sm:text-sm"
                  value={selectedMatchTeam?._id ?? ""}
                  onChange={(event) => setMatchTeamId(event.target.value)}
                >
                  {matchTeams.map((team) => (
                    <option key={team._id} value={team._id}>{team.teamNumber} - {team.nickname}</option>
                  ))}
                </select>
              </div>
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">Each scout can claim one robot per match. The team picker narrows to the six imported teams.</div>
            </div>
            <div className="grid gap-3">
              <div className="grid gap-4 rounded-lg border p-4">
                <div className="text-sm font-semibold">Auto <span className="font-normal text-muted-foreground">(first 20 seconds)</span></div>
                <Counter label="Fuel scored in the hub" value={autoBalls} onChange={setAutoBalls} max={200} />
                <YesNo label="Climbed Level 1 in auto?" value={matchAutoClimb} onChange={setMatchAutoClimb} />
              </div>

              <div className="grid gap-4 rounded-lg border p-4">
                <div className="text-sm font-semibold">Teleop</div>
                <Counter label="Fuel scored while their hub was active" hint="Shots into an inactive hub score 0, so don't count them." value={teleopBalls} onChange={setTeleopBalls} max={500} />
                <ChoiceGroup
                  label="How many of their shots went in?"
                  value={matchAccuracy}
                  columns={3}
                  options={[
                    { value: "high", label: "Most" },
                    { value: "mid", label: "About half" },
                    { value: "low", label: "Few" },
                  ]}
                  onChange={setMatchAccuracy}
                />
              </div>

              <div className="grid gap-4 rounded-lg border p-4">
                <div className="text-sm font-semibold">Endgame <span className="font-normal text-muted-foreground">(last 30 seconds)</span></div>
                <ChoiceGroup
                  label="Tower level they finished on"
                  value={matchEndgame}
                  columns={4}
                  options={(["none", "low", "mid", "high"] as MatchEndgameResult[]).map((result) => ({ value: result, label: endgameLabels[result] }))}
                  onChange={setMatchEndgame}
                />
              </div>

              <div className="grid gap-4 rounded-lg border p-4">
                <div className="text-sm font-semibold">Driving</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Counter label="Driver skill" hint="1 = struggled, 10 = elite" value={driverRating} onChange={setDriverRating} min={1} max={10} suffix="/10" compact />
                  <Counter label="Defense played" hint="1 = none, 10 = shut someone down" value={defenseRating} onChange={setDefenseRating} min={1} max={10} suffix="/10" compact />
                  <Counter label="Fouls they caused" value={matchFouls} onChange={setMatchFouls} max={30} compact />
                </div>
              </div>

              <div className="grid gap-4 rounded-lg border p-4">
                <div className="text-sm font-semibold">Tap anything that happened</div>
                {tagGroups.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</div>
                    <div className="flex flex-wrap gap-2">
                      {group.tags.map((tag) => {
                        const selected = matchTags.includes(tag)
                        return (
                          <Button
                            key={tag}
                            type="button"
                            variant={selected ? "default" : "outline"}
                            aria-pressed={selected}
                            className="h-10 rounded-full px-4"
                            onClick={() => setMatchTags((current) => selected ? current.filter((item) => item !== tag) : [...current, tag])}
                          >
                            {tagLabels[tag]}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 rounded-lg border p-4">
                <div className="text-sm font-semibold">Notes <span className="font-normal text-muted-foreground">(optional)</span></div>
                <Textarea value={autoNotes} onChange={(event) => setAutoNotes(event.target.value)} placeholder="Auto: where did they start, what path did they run?" />
                <Textarea value={teleopNotes} onChange={(event) => setTeleopNotes(event.target.value)} placeholder="Teleop: where did they shoot from, anything slow or broken?" />
                <Textarea value={endgameNotes} onChange={(event) => setEndgameNotes(event.target.value)} placeholder="Endgame: how fast was the climb, did it fail?" />
              </div>
              <div>
                {matchStatus ? (
                  <div
                    role="status"
                    className={cn(
                      "mt-3 rounded-lg border p-3 text-sm",
                      matchStatus.kind === "ok"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-destructive/40 bg-destructive/10 text-destructive",
                    )}
                  >
                    {matchStatus.text}
                  </div>
                ) : null}
                <Button className="mt-3 h-12 w-full text-base" onClick={() => void handleMatchSubmit()} disabled={!selectedMatch || !selectedMatchTeam || matchSubmitting}>
                  {matchSubmitting ? "Saving…" : "Submit match report"}
                </Button>
              </div>
            </div>
          </div>
        </section> : null}

        {activeTab === "gallery" ? (
          <Suspense fallback={<div className="surface-card h-40 animate-pulse" />}>
            <Gallery />
          </Suspense>
        ) : null}

        {activeTab === "tech" ? (
          <section className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Wrench className="size-4" />
              Tech
            </div>
            <form className="mt-4 grid gap-4" onSubmit={(event) => void handleTechSubmit(event)}>
              <div className="space-y-2">
                <Label htmlFor="techMessage">Message for pit</Label>
                <Textarea
                  id="techMessage"
                  value={techMessage}
                  onChange={(event) => setTechMessage(event.target.value)}
                  placeholder="What should pit prepare for?"
                  disabled={!canUseTech}
                />
              </div>
              {techStatus ? <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">{techStatus}</div> : null}
              <Button className="w-full sm:w-fit" type="submit" disabled={!canUseTech || !techMessage.trim() || !activeEvent}>
                <Send className="size-4" />
                Send to pit
              </Button>
            </form>
          </section>
        ) : null}

        {activeTab === "picklist" ? <section className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="size-4" />
                Pick list
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {canManagePicklist
                  ? picklistView === "primary" ? "Mentor primary board and consensus merge target." : "Lead scout and mentor board controls."
                  : "View-only for your role."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant={picklistView === "primary" ? "default" : "outline"} onClick={() => setPicklistView("primary")}>Primary</Button>
              <Button size="sm" variant={picklistView === "personal" ? "default" : "outline"} onClick={() => setPicklistView("personal")}>My lists</Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            <div className="space-y-2">
              <Label htmlFor="picklistSearch">Search teams</Label>
              <Input
                id="picklistSearch"
                value={picklistSearch}
                onChange={(event) => setPicklistSearch(event.target.value)}
                placeholder="Search by team number or name"
              />
            </div>
          </div>
          <div className="mt-4 grid min-h-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {columns.map((column) => (
              <div
                key={column}
                className="flex max-h-[calc(100svh-18rem)] min-h-64 flex-col rounded-xl border bg-background p-3"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  if (!canManagePicklist) return
                  const droppedTeamId = event.dataTransfer.getData("teamId")
                  if (droppedTeamId) void updateTeamPickTier({ teamId: droppedTeamId as Id<"teams">, pickTier: column })
                }}
              >
                <div className="mb-3 flex items-center justify-between text-sm font-semibold">
                  <span>{columnLabels[column]}</span>
                  <span className="text-xs text-muted-foreground">{groupedTeams[column]?.length ?? 0}</span>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {(groupedTeams[column] ?? []).map((team) => (
                    <div
                      key={team._id}
                      draggable={canManagePicklist}
                      onDragStart={(event) => event.dataTransfer.setData("teamId", team._id)}
                      className="rounded-lg border bg-card p-3 text-sm shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{team.teamNumber}</div>
                        <Trophy className="size-4 text-muted-foreground" />
                      </div>
                      <div className="text-muted-foreground">{team.nickname}</div>
                      <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                        <span>{team.pitStatus === "scouted" ? "Pit done" : "Pit open"}</span>
                        <span>Rank {team.eventRank ?? "n/a"}</span>
                        <span>Current EPA {statboticsEpaByTeamId[team._id] != null ? statboticsEpaByTeamId[team._id]?.toFixed(1) : "n/a"}</span>
                        <span>Drv {teamStats[team._id]?.avgDriver.toFixed(1) ?? "0.0"}</span>
                        <span>Tele {teamStats[team._id]?.avgTeleop.toFixed(1) ?? "0.0"}</span>
                        <span>Climb {endgameLabels[teamStats[team._id]?.avgClimb ?? "none"] ?? "No climb"}</span>
                      </div>
                      {canManagePicklist ? <div className="mt-2 grid grid-cols-2 gap-1">
                        {columns.filter((target) => target !== column).slice(0, 4).map((target) => (
                          <Button key={target} size="sm" variant="outline" onClick={() => void updateTeamPickTier({ teamId: team._id, pickTier: target })}>
                            {columnLabels[target]}
                          </Button>
                        ))}
                      </div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section> : null}

        {activeTab === "picklist" && currentRole === "lead_scout" ? <GuestPassManager /> : null}

        {teamDetailOpen ? <Suspense fallback={null}><TeamDetailDialog
          open={teamDetailOpen}
          onOpenChange={setTeamDetailOpen}
          team={selectedTeam && {
            teamNumber: selectedTeam.teamNumber,
            nickname: selectedTeam.nickname,
            city: selectedTeam.city,
            state: selectedTeam.state,
            country: selectedTeam.country,
            pitStatus: selectedTeam.pitStatus,
            pickTier: selectedTeam.pickTier,
            eventRank: selectedTeam.eventRank,
            statboticsEpa: statboticsEpaByTeamId[selectedTeam._id],
            stats: teamStats[selectedTeam._id],
          }}
        /></Suspense> : null}
      </div>
    </main>
  )
}
