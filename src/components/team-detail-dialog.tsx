import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { endgameLabels, tagLabels } from "@/lib/types"

type TeamDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  team?: {
    teamNumber: number
    nickname: string
    city?: string
    state?: string
    country?: string
    pitStatus: string
    pickTier: string
    eventRank?: number | null
    statboticsEpa?: number | null
    stats?: {
      matchCount: number
      avgAuto: number
      avgTeleop: number
      avgDriver: number
      avgClimb: string
      pitReport?: {
        scoreAnywhere?: boolean
        scoreSpecificSpots?: boolean
        shootOnMove: boolean
        climbLow?: boolean
        climbMid?: boolean
        climbHigh?: boolean
        shotRange?: string
        groundIntake?: boolean
        humanPlayerIntake?: boolean
        fuelCapacity?: number
        autoFuelClaim?: number
        autoClimb?: boolean
        maxClimb?: string
        traverse: string
        drivetrain: string
        notes?: string
        photoUrls?: Array<string | null>
      }
      reports: Array<{
        autoBallsScored: number
        teleopBallsScored: number
        driverRating: number
        defenseRating: number
        endgameResult: string
        autoClimb?: boolean
        accuracy?: string
        fouls?: number
        tags: string[]
      }>
    }
  }
}

const shotRangeLabels: Record<string, string> = {
  close: "Right at the hub",
  mid: "A few set spots",
  long: "Anywhere in their zone",
  none: "Doesn't shoot",
}
const climbLabels: Record<string, string> = { none: "Can't climb", l1: "Level 1", l2: "Level 2", l3: "Level 3" }
const traverseLabels: Record<string, string> = { trench: "Under the trench", bump: "Over the bump", both: "Either way", other: "Neither" }
const accuracyLabels: Record<string, string> = { high: "Most shots in", mid: "About half in", low: "Few shots in" }

function pitClimb(report: { maxClimb?: string; climbLow?: boolean; climbMid?: boolean; climbHigh?: boolean }) {
  if (report.maxClimb) return climbLabels[report.maxClimb] ?? report.maxClimb
  if (report.climbHigh) return "Level 3"
  if (report.climbMid) return "Level 2"
  if (report.climbLow) return "Level 1"
  return "Can't climb"
}

function yesNo(value: boolean | undefined) {
  return value === undefined ? "—" : value ? "Yes" : "No"
}

export function TeamDetailDialog({ open, onOpenChange, team }: TeamDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            Team {team?.teamNumber ?? "-"} {team?.nickname ?? ""}
          </DialogTitle>
        </DialogHeader>
        {team ? (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 rounded-lg border p-4">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Location</span>
                <span>{[team.city, team.state, team.country].filter(Boolean).join(", ") || "Unknown"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Pit status</span>
                <span>{team.pitStatus === "scouted" ? "Scouted" : "Not Scouted"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Pick tier</span>
                <span>{team.pickTier}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Event rank</span>
                <span>{team.eventRank ?? "n/a"}</span>
              </div>
            </div>
            <Separator />
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Avg auto fuel" value={team.stats?.avgAuto.toFixed(1) ?? "0.0"} />
              <Metric label="Avg teleop fuel" value={team.stats?.avgTeleop.toFixed(1) ?? "0.0"} />
              <Metric label="Avg driver" value={team.stats?.avgDriver.toFixed(1) ?? "0.0"} />
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-xs text-muted-foreground">Total Statbotics EPA</div>
              <div className="text-2xl font-semibold">{team.statboticsEpa != null ? team.statboticsEpa.toFixed(1) : "n/a"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="font-medium">Pit scouting answers</div>
              {team.stats?.pitReport ? (
                <div className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
                  {[
                    ["Scores from", team.stats.pitReport.shotRange ? shotRangeLabels[team.stats.pitReport.shotRange] : "—"],
                    ["Shoots while driving", yesNo(team.stats.pitReport.shootOnMove)],
                    ["Holds", team.stats.pitReport.fuelCapacity != null ? `${team.stats.pitReport.fuelCapacity} fuel` : "—"],
                    ["Auto fuel (their claim)", team.stats.pitReport.autoFuelClaim != null ? String(team.stats.pitReport.autoFuelClaim) : "—"],
                    ["Floor intake", yesNo(team.stats.pitReport.groundIntake)],
                    ["Human player intake", yesNo(team.stats.pitReport.humanPlayerIntake)],
                    ["Highest climb", pitClimb(team.stats.pitReport)],
                    ["Level 1 in auto", yesNo(team.stats.pitReport.autoClimb)],
                    ["Crosses field", traverseLabels[team.stats.pitReport.traverse] ?? team.stats.pitReport.traverse],
                    ["Drivetrain", team.stats.pitReport.drivetrain],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                      <span>{label}</span>
                      <span className="text-right font-medium text-foreground">{value}</span>
                    </div>
                  ))}
                  {team.stats.pitReport.notes ? <div className="sm:col-span-2">Notes: {team.stats.pitReport.notes}</div> : null}
                  {team.stats.pitReport.photoUrls?.filter(Boolean).length ? (
                    <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
                      {team.stats.pitReport.photoUrls.filter(Boolean).map((url) => (
                        <img key={url} src={url ?? ""} alt="Robot pit scouting" className="aspect-video w-full rounded-md border object-cover" />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2 text-muted-foreground">No pit report yet.</div>
              )}
            </div>
            <div className="rounded-lg border p-4">
              <div className="font-medium">Match scouting reports</div>
              <div className="mt-3 space-y-2">
                {team.stats?.reports.length ? (
                  team.stats.reports.map((report, index) => (
                    <div key={index} className="rounded-md bg-muted/40 p-3">
                      <div className="grid gap-1 text-muted-foreground sm:grid-cols-2">
                        <span>Auto fuel: {report.autoBallsScored}{report.autoClimb ? " · L1 climb" : ""}</span>
                        <span>Teleop fuel: {report.teleopBallsScored}{report.accuracy ? ` · ${accuracyLabels[report.accuracy]}` : ""}</span>
                        <span>Driver: {report.driverRating}/10</span>
                        <span>Defense: {report.defenseRating}/10</span>
                        <span>Endgame: {endgameLabels[report.endgameResult] ?? report.endgameResult}</span>
                        <span>Fouls: {report.fouls ?? "—"}</span>
                        <span className="sm:col-span-2">{report.tags.map((tag) => tagLabels[tag] ?? tag.replaceAll("_", " ")).join(" · ") || "No tags"}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground">No match reports yet.</div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  )
}
