import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useAuthActions } from "@convex-dev/auth/react"
import { useAction, useMutation, useQuery } from "convex/react"
import { AlertCircle, CalendarDays, CheckCircle2, ChevronRight, Download, KeyRound, LogIn, MapPin, ShieldAlert, Sparkles, Trophy, Users } from "lucide-react"

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

function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function getCleanAuthError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  if (message.includes("invalid password") || message.includes("invalid credentials")) {
    return "Invalid email or password."
  }
  if (message.includes("email")) {
    return "Invalid email."
  }
  return "Could not sign in. Please try again."
}

export function HomeRoute() {
  const workspace = useQuery(api.scouting.getWorkspace)
  const currentUser = useQuery(api.scouting.currentUser)
  const bootstrapProfile = useMutation(api.scouting.bootstrapProfile)
  const importEvent = useAction(api.scouting.importEvent)
  const upsertImportedEvent = useMutation(api.scouting.upsertImportedEvent)
  const saveTbaApiKey = useMutation(api.scouting.saveTbaApiKey)
  const savePitReport = useMutation(api.scouting.savePitReport)
  const saveMatchReport = useMutation(api.scouting.saveMatchReport)
  const updateTeamPickTier = useMutation(api.scouting.updateTeamPickTier)
  const ensurePicklist = useMutation(api.scouting.ensurePicklist)
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
  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [authError, setAuthError] = useState("")
  const [importError, setImportError] = useState("")
  const [importSuccess, setImportSuccess] = useState("")
  const [pitNotes, setPitNotes] = useState("")
  const [pitDrivetrain, setPitDrivetrain] = useState("swerve")
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
  const [teamDetailOpen, setTeamDetailOpen] = useState(false)

  useEffect(() => {
    if (currentUser?.userId && !currentUser.profile) {
      void bootstrapProfile({ displayName })
    }
  }, [bootstrapProfile, currentUser, displayName])

  const activeEvent = workspace?.event
  const isSignedIn = Boolean(currentUser?.userId)
  const isAdmin = currentUser?.profile?.role === "admin"
  const adminUnlocked = isAdmin
  const teams = workspace?.teams ?? []
  const matches = workspace?.matches ?? []
  const reports = workspace?.reports ?? []
  const pitReports = workspace?.pitReports ?? []
  const selectedTeam = teams.find((team) => team._id === teamId) ?? teams[0]
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
    if (!matchId && matches[0]) setMatchId(matches[0]._id)
  }, [matchId, matches])

  useEffect(() => {
    if (selectedMatch && (!selectedMatchTeam || !matchTeams.some((team) => team._id === matchTeamId))) {
      setMatchTeamId(matchTeams[0]?._id ?? "")
    }
  }, [matchTeamId, matchTeams, selectedMatch, selectedMatchTeam])

  useEffect(() => {
    if (activeEvent?._id && currentUser?.userId) {
      void ensurePicklist({ eventId: activeEvent._id, name: "My Pick List" })
      if (currentUser.profile?.role === "admin") {
        void ensurePicklist({ eventId: activeEvent._id, name: "Primary Pick List", isPrimary: true })
      }
    }
  }, [activeEvent?._id, currentUser, ensurePicklist])

  async function handleImport() {
    if (!isAdmin) return
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
      setAdminError("Invalid admin key.")
      return
    }
    await bootstrapProfile({ displayName, adminKey: adminKeyEntry.trim() })
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
    const email = authEmail.trim()
    if (!isValidEmail(email)) {
      setAuthError("Invalid email.")
      return
    }
    if (authPassword.length < 8) {
      setAuthError("Invalid password.")
      return
    }
    try {
      await signIn("password", {
        flow: authMode,
        email,
        password: authPassword,
      })
    } catch (error) {
      setAuthError(getCleanAuthError(error))
    }
  }

  async function handlePitSubmit() {
    if (!selectedTeam) return
    await savePitReport({
      teamId: selectedTeam._id,
      scoreAnywhere: pitAnywhere,
      scoreSpecificSpots: pitSpecific,
      shootOnMove: pitMove,
      climbLow: pitLow,
      climbMid: pitMid,
      climbHigh: pitHigh,
      traverse: pitTraverse,
      drivetrain: pitDrivetrain,
      notes: pitNotes || undefined,
    })
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
                <Label htmlFor="authEmail">Email</Label>
                <Input id="authEmail" type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="authPassword">Password</Label>
                <Input id="authPassword" type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required minLength={8} />
              </div>
              {authMode === "signUp" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display name</Label>
                    <Input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Scouter name" />
                  </div>
                </>
              ) : null}
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
            <p className="text-xs text-muted-foreground">Mobile-first pit, match, and picklist workflow powered by Convex.</p>
          </div>
          <div className="flex items-center gap-2">
            <AppNav activeTab={activeTab} onTabChange={setActiveTab} />
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
                {[activeEvent?.city, activeEvent?.state, activeEvent?.country].filter(Boolean).join(", ") || "Waiting for admin import"}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Teams", value: teams.length },
              { label: "Matches", value: matches.length },
              { label: "Role", value: isAdmin ? "Admin" : "Scouter" },
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
                Admin
              </div>
              {!adminUnlocked ? (
                <form className="mt-4 space-y-3" onSubmit={(event) => void handleAdminUnlock(event)}>
                  <div className="space-y-2">
                    <Label htmlFor="adminKeyEntry">Admin key</Label>
                    <Input id="adminKeyEntry" value={adminKeyEntry} onChange={(event) => setAdminKeyEntry(event.target.value)} placeholder="1880" />
                  </div>
                  {adminError ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{adminError}</div> : null}
                  <Button type="submit">Unlock admin</Button>
                </form>
              ) : (
                <div className="mt-4 rounded-lg border bg-background p-4 text-sm text-muted-foreground">Admin key accepted. Event setup is available.</div>
              )}
            </div>
            {adminUnlocked ? (
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
            <p className="mt-1 text-sm text-muted-foreground">Mobile-first cards, checkboxes, and short inputs only.</p>
            <div className="mt-4 space-y-4">
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
              <Button className="w-full" onClick={() => void handlePitSubmit()} disabled={!selectedTeam}>Submit pit scouting</Button>
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

        {activeTab === "picklist" ? <section className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="size-4" />
                Pick list
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {picklistView === "primary" ? "Admin primary board and consensus merge target." : "Personal boards for scouts. Drag teams between tiers or use the quick tier buttons."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant={picklistView === "primary" ? "default" : "outline"} onClick={() => setPicklistView("primary")}>Primary</Button>
              <Button size="sm" variant={picklistView === "personal" ? "default" : "outline"} onClick={() => setPicklistView("personal")}>My lists</Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="picklistSearch">Search teams</Label>
              <Input
                id="picklistSearch"
                value={picklistSearch}
                onChange={(event) => setPicklistSearch(event.target.value)}
                placeholder="Search by team number or name"
              />
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-background p-3">
              <img src={frc1880Logo} alt="Team 1880 logo" className="size-12 rounded-md border bg-card object-contain p-1" />
              <div>
                <div className="text-sm font-semibold">Team 1880</div>
                <div className="text-xs text-muted-foreground">PantherBots scouting powered by clean data.</div>
              </div>
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
                      draggable
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
                        <span>Drv {teamStats[team._id]?.avgDriver.toFixed(1) ?? "0.0"}</span>
                        <span>Tele {teamStats[team._id]?.avgTeleop.toFixed(1) ?? "0.0"}</span>
                        <span>Climb {teamStats[team._id]?.avgClimb ?? "none"}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1">
                        {columns.filter((target) => target !== column).slice(0, 4).map((target) => (
                          <Button key={target} size="sm" variant="outline" onClick={() => void updateTeamPickTier({ teamId: team._id, pickTier: target })}>
                            {columnLabels[target]}
                          </Button>
                        ))}
                      </div>
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
