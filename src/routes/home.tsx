import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useAuthActions } from "@convex-dev/auth/react"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import { AlertCircle, CalendarDays, CheckCircle2, ChevronRight, Clock3, Download, ImagePlus, KeyRound, LogIn, MapPin, Send, ShieldAlert, Sparkles, Trash2, Trophy, Users, Wrench } from "lucide-react"

import { AppNav } from "@/components/app-nav"
import { TeamDetailDialog } from "@/components/team-detail-dialog"
import { ThemeModeMenu } from "@/components/theme-mode-menu"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { MatchEndgameResult, MatchTag, PickTier } from "@/lib/types"
import { useUiStore } from "@/stores/ui-store"
import frc1880Logo from "@/assets/frc1880.png"
import { api } from "../../convex/_generated/api"

const tags: MatchTag[] = ["fast", "accurate", "good_driver", "plays_defense", "tippy", "broke_down", "inconsistent"]
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
}

const assignableRoles: UserRole[] = ["pit", "tech", "scout", "lead_scout", "mentor"]
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

function getCleanAuthError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  if (message.includes("already exists")) {
    return "That nickname already exists. Switch to Sign in and use the same password."
  }
  if (message.includes("invalid password") || message.includes("invalid credentials")) {
    return "Invalid nickname or password."
  }
  if (message.includes("email")) {
    return "Invalid nickname."
  }
  return "Could not sign in. Please try again."
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
  const [pitAnywhere, setPitAnywhere] = useState(false)
  const [pitSpecific, setPitSpecific] = useState(false)
  const [pitMove, setPitMove] = useState(false)
  const [pitLow, setPitLow] = useState(false)
  const [pitMid, setPitMid] = useState(false)
  const [pitHigh, setPitHigh] = useState(false)
  const [pitTraverse, setPitTraverse] = useState<"trench" | "bump" | "both" | "other">("trench")
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
  const [roleOverrides, setRoleOverrides] = useState<Record<string, UserRole>>({})
  const [deletedProfileIds, setDeletedProfileIds] = useState<string[]>([])
  const [teamDetailOpen, setTeamDetailOpen] = useState(false)
  const [statboticsEpaByTeamId, setStatboticsEpaByTeamId] = useState<Record<string, number | null>>({})
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

  useEffect(() => {
    let cancelled = false
    async function loadStatbotics() {
      if (!teams.length) {
        setStatboticsEpaByTeamId({})
        return
      }
      const entries = await Promise.all(
        teams.map(async (team) => {
          try {
            const response = await fetch(`https://api.statbotics.io/v3/team/${team.teamNumber}`)
            if (!response.ok) {
              return [team._id, null] as const
            }
            const data = (await response.json()) as StatboticsTeam
            return [team._id, data.norm_epa?.current ?? null] as const
          } catch {
            return [team._id, null] as const
          }
        }),
      )
      if (!cancelled) {
        setStatboticsEpaByTeamId(Object.fromEntries(entries))
      }
    }
    void loadStatbotics()
    return () => {
      cancelled = true
    }
  }, [teams])

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
    if (adminKeyEntry.trim() !== "1880") {
      setAdminError("Invalid mentor key.")
      return
    }
    await bootstrapProfile({ displayName: authNickname.trim(), adminKey: adminKeyEntry.trim() })
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
    setAuthError("")
    const nickname = authNickname.trim()
    const normalizedNickname = normalizeNickname(nickname)
    if (normalizedNickname.length < 2) {
      setAuthError("Nickname must be at least 2 letters or numbers.")
      return
    }
    if (authPassword.length < 8) {
      setAuthError("Invalid password.")
      return
    }
    try {
      await signIn("password", {
        flow: authMode,
        email: nicknameToAuthEmail(nickname),
        name: nickname,
        password: authPassword,
      })
    } catch (error) {
      setAuthError(getCleanAuthError(error))
    }
  }

  async function handlePitSubmit() {
    if (!selectedPitTeam) return
    setPitMessage("")
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
        scoreAnywhere: pitAnywhere,
        scoreSpecificSpots: pitSpecific,
        shootOnMove: pitMove,
        climbLow: pitLow,
        climbMid: pitMid,
        climbHigh: pitHigh,
        traverse: pitTraverse,
        drivetrain: pitDrivetrain,
        notes: pitNotes || undefined,
        photoIds: photoIds as never,
      })
      setPitTeamId("")
      setPitAnywhere(false)
      setPitSpecific(false)
      setPitMove(false)
      setPitLow(false)
      setPitMid(false)
      setPitHigh(false)
      setPitTraverse("trench")
      setPitDrivetrain("swerve")
      setPitNotes("")
      setPitPhotos([])
      setPitMessage("Pit report submitted. That team is off the unscouted list.")
    } catch (error) {
      setPitMessage(error instanceof Error ? error.message : "Could not save pit report.")
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

  async function handleMatchSubmit() {
    if (!selectedMatch || !selectedMatchTeam) return
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
      tags: matchTags,
    })
    setAutoBalls(0)
    setTeleopBalls(0)
    setAutoNotes("")
    setTeleopNotes("")
    setEndgameNotes("")
    setMatchTags([])
  }

  function step(setter: (value: number) => void, value: number, delta: number, min = 0, max = 99) {
    setter(Math.min(max, Math.max(min, value + delta)))
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-svh bg-background px-4 py-6 text-foreground">
        <div className="mx-auto flex min-h-[calc(100svh-3rem)] w-full max-w-md flex-col justify-center">
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4" />
              2026 FRC Scouting
            </div>
            <h1 className="mt-4 text-2xl font-semibold">Sign in to scout</h1>
            <p className="mt-1 text-sm text-muted-foreground">Create an account or sign in before viewing event data, teams, matches, or pick lists.</p>
            <form className="mt-5 space-y-4" onSubmit={(event) => void handleAuthSubmit(event)}>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={authMode === "signIn" ? "default" : "outline"} onClick={() => setAuthMode("signIn")}>
                  Sign in
                </Button>
                <Button type="button" variant={authMode === "signUp" ? "default" : "outline"} onClick={() => setAuthMode("signUp")}>
                  Sign up
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="authNickname">Nickname</Label>
                <Input id="authNickname" value={authNickname} onChange={(event) => setAuthNickname(event.target.value)} autoComplete="username" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="authPassword">Password</Label>
                <Input id="authPassword" type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required minLength={8} />
              </div>
              {authError ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{authError}</div> : null}
              <Button className="h-11 w-full" type="submit">
                <LogIn className="size-4" />
                {authMode === "signIn" ? "Sign in" : "Create account"}
              </Button>
            </form>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4" />
              2026 FRC Scouting
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AppNav activeTab={activeTab} onTabChange={setActiveTab} role={currentRole} />
            <div className="hidden items-center gap-2 rounded-md border bg-background px-2 py-1 sm:flex">
              <img src={frc1880Logo} alt="Team 1880 logo" className="size-7 rounded-sm object-contain" />
              <span className="text-sm font-semibold">Team 1880</span>
            </div>
            <ThemeModeMenu />
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </header>

        {activeTab === "dashboard" ? (
          <section className="grid gap-4">
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
                            className="h-10 rounded-md border bg-card px-3 text-sm"
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
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">Signed-up users will appear here.</div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Clock3 className="size-4" />
                    Activity log
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">Recent actions from scouts, pit, tech, and mentor work.</p>
                  <div className="mt-4 grid gap-2">
                    {activityLogs.length ? activityLogs.map((entry) => (
                      <div key={entry._id} className="rounded-lg border bg-background p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold">{entry.actorName || "Unnamed user"}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="mt-1 text-sm">{entry.action}</div>
                        {entry.details ? <div className="mt-1 text-xs text-muted-foreground">{entry.details}</div> : null}
                      </div>
                    )) : (
                      <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">No activity has been logged yet.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "teams" ? <section className="grid gap-4">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Team list</div>
                <div className="text-xs text-muted-foreground">Tap a team for the detail modal.</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setTeamDetailOpen(true)} disabled={!selectedTeam}>Open team</Button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {teams.map((team) => (
                <button
                  key={team._id}
                  type="button"
                  className={cn("rounded-xl border p-4 text-left transition", teamId === team._id ? "border-primary bg-primary/5" : "bg-background")}
                  onClick={() => {
                    setTeamId(team._id)
                    setTeamDetailOpen(true)
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold">{team.teamNumber}</div>
                    {team.pitStatus === "scouted" ? <CheckCircle2 className="size-4 text-emerald-500" /> : <AlertCircle className="size-4 text-muted-foreground" />}
                  </div>
                  <div className="text-sm">{team.nickname}</div>
                  <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                    <span>{team.pitStatus === "scouted" ? "Scouted" : "Not Scouted"}</span>
                    <span>{teamStats[team._id]?.matchCount ?? 0} match reports</span>
                    <span>{columnLabels[team.pickTier as PickTier]}</span>
                    <ChevronRight className="size-4 justify-self-end" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section> : null}

        {activeTab === "pit" ? (
          <section className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4" />
              Pit scouting
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Pick an unscouted team. Submitted teams leave this list automatically.</p>
            <div className="mt-4 space-y-4">
              {canUsePit && openTechMessages.length ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <div className="text-sm font-semibold">Tech notes for pit</div>
                  <div className="mt-2 grid gap-2">
                    {openTechMessages.map((message) => {
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
                    })}
                  </div>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="pitTeamSelect">Unscouted team</Label>
                <select
                  id="pitTeamSelect"
                  className="h-12 w-full rounded-md border bg-background px-3 text-sm"
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
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["Can score from anywhere", pitAnywhere, setPitAnywhere],
                  ["Can score from specific spots", pitSpecific, setPitSpecific],
                  ["Can shoot on the move", pitMove, setPitMove],
                  ["Can climb low", pitLow, setPitLow],
                  ["Can climb mid", pitMid, setPitMid],
                  ["Can climb high", pitHigh, setPitHigh],
                ].map(([label, checked, setter]) => (
                  <label key={label as string} className="flex items-center gap-3 rounded-lg border p-3">
                    <Checkbox checked={checked as boolean} onCheckedChange={(value) => (setter as (checked: boolean) => void)(Boolean(value))} />
                    <span className="text-sm">{label as string}</span>
                  </label>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant={pitTraverse === "trench" ? "default" : "outline"} onClick={() => setPitTraverse("trench")}>Trench</Button>
                <Button variant={pitTraverse === "bump" ? "default" : "outline"} onClick={() => setPitTraverse("bump")}>Bump</Button>
                <Button variant={pitTraverse === "both" ? "default" : "outline"} onClick={() => setPitTraverse("both")}>Both</Button>
                <Button variant={pitTraverse === "other" ? "default" : "outline"} onClick={() => setPitTraverse("other")}>Other</Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="drivetrain">Drivetrain</Label>
                <Input id="drivetrain" value={pitDrivetrain} onChange={(event) => setPitDrivetrain(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pitNotes">Robot notes</Label>
                <Textarea id="pitNotes" value={pitNotes} onChange={(event) => setPitNotes(event.target.value)} placeholder="Quick notes only" />
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
              <Button className="w-full" onClick={() => void handlePitSubmit()} disabled={!canUsePit || !selectedPitTeam}>Submit pit scouting</Button>
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
                  className="h-12 w-full rounded-md border bg-background px-3 text-sm"
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
                  className="h-12 w-full rounded-md border bg-background px-3 text-sm"
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
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Auto balls", autoBalls, setAutoBalls],
                ["Teleop balls", teleopBalls, setTeleopBalls],
              ].map(([label, value, setter]) => (
                <div key={label as string} className="rounded-lg border p-4">
                  <div className="text-sm font-medium">{label as string}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => step(setter as (value: number) => void, value as number, -1)}>-</Button>
                    <div className="min-w-10 text-center text-lg font-semibold">{value as number}</div>
                    <Button variant="outline" size="sm" onClick={() => step(setter as (value: number) => void, value as number, 1)}>+</Button>
                  </div>
                </div>
              ))}
              <div className="rounded-lg border p-4 sm:col-span-2">
                <div className="text-sm font-medium">Driver and defense ratings</div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Driver</div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => step(setDriverRating, driverRating, -1, 1, 10)}>-</Button>
                      <div className="min-w-10 text-center font-semibold">{driverRating}/10</div>
                      <Button variant="outline" size="sm" onClick={() => step(setDriverRating, driverRating, 1, 1, 10)}>+</Button>
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Defense</div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => step(setDefenseRating, defenseRating, -1, 1, 10)}>-</Button>
                      <div className="min-w-10 text-center font-semibold">{defenseRating}/10</div>
                      <Button variant="outline" size="sm" onClick={() => step(setDefenseRating, defenseRating, 1, 1, 10)}>+</Button>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(["none", "low", "mid", "high"] as MatchEndgameResult[]).map((result) => (
                    <Button key={result} variant={matchEndgame === result ? "default" : "outline"} onClick={() => setMatchEndgame(result)} className="capitalize">
                      {result} climb
                    </Button>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {tags.map((tag) => (
                    <label key={tag} className="flex items-center gap-3 rounded-lg border p-3">
                      <Checkbox checked={matchTags.includes(tag)} onCheckedChange={(checked) => setMatchTags((current) => checked ? [...current, tag] : current.filter((item) => item !== tag))} />
                      <span className="text-sm">{tag.replaceAll("_", " ")}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 grid gap-3">
                  <Textarea value={autoNotes} onChange={(event) => setAutoNotes(event.target.value)} placeholder="Auto notes" />
                  <Textarea value={teleopNotes} onChange={(event) => setTeleopNotes(event.target.value)} placeholder="Teleop notes" />
                  <Textarea value={endgameNotes} onChange={(event) => setEndgameNotes(event.target.value)} placeholder="Endgame notes" />
                </div>
                <Button className="mt-3 w-full" onClick={() => void handleMatchSubmit()} disabled={!selectedMatch || !selectedMatchTeam}>
                  Submit match report
                </Button>
              </div>
            </div>
          </div>
        </section> : null}

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
          <div className="mt-4 grid min-h-0 flex-1 gap-3 lg:grid-cols-5">
            {columns.map((column) => (
              <div
                key={column}
                className="flex max-h-[calc(100svh-18rem)] min-h-64 flex-col rounded-xl border bg-background p-3"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  if (!canManagePicklist) return
                  const droppedTeamId = event.dataTransfer.getData("teamId")
                  if (droppedTeamId) void updateTeamPickTier({ teamId: droppedTeamId, pickTier: column })
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
                        <span>EPA {statboticsEpaByTeamId[team._id] != null ? statboticsEpaByTeamId[team._id]?.toFixed(1) : "n/a"}</span>
                        <span>Drv {teamStats[team._id]?.avgDriver.toFixed(1) ?? "0.0"}</span>
                        <span>Tele {teamStats[team._id]?.avgTeleop.toFixed(1) ?? "0.0"}</span>
                        <span>Climb {teamStats[team._id]?.avgClimb ?? "none"}</span>
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

        <TeamDetailDialog
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
            stats: teamStats[selectedTeam._id],
          }}
        />
      </div>
    </main>
  )
}
