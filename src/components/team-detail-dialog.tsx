import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"

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
    stats?: {
      matchCount: number
      avgAuto: number
      avgTeleop: number
      avgDriver: number
      avgClimb: string
      pitReport?: {
        scoreAnywhere: boolean
        scoreSpecificSpots: boolean
        shootOnMove: boolean
        climbLow: boolean
        climbMid: boolean
        climbHigh: boolean
        traverse: string
        drivetrain: string
        notes?: string
      }
      reports: Array<{
        autoBallsScored: number
        teleopBallsScored: number
        driverRating: number
        defenseRating: number
        endgameResult: string
        tags: string[]
      }>
    }
  }
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
            </div>
            <Separator />
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Avg auto balls" value={team.stats?.avgAuto.toFixed(1) ?? "0.0"} />
              <Metric label="Avg teleop balls" value={team.stats?.avgTeleop.toFixed(1) ?? "0.0"} />
              <Metric label="Avg driver" value={team.stats?.avgDriver.toFixed(1) ?? "0.0"} />
            </div>
            <div className="rounded-lg border p-4">
              <div className="font-medium">Pit scouting answers</div>
              {team.stats?.pitReport ? (
                <div className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
                  {[
                    ["Score anywhere", team.stats.pitReport.scoreAnywhere],
                    ["Specific spots", team.stats.pitReport.scoreSpecificSpots],
                    ["Shoot on move", team.stats.pitReport.shootOnMove],
                    ["Low climb", team.stats.pitReport.climbLow],
                    ["Mid climb", team.stats.pitReport.climbMid],
                    ["High climb", team.stats.pitReport.climbHigh],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex justify-between rounded-md bg-muted/40 px-3 py-2">
                      <span>{label as string}</span>
                      <span>{value ? "Yes" : "No"}</span>
                    </div>
                  ))}
                  <div>Traverse: {team.stats.pitReport.traverse}</div>
                  <div>Drivetrain: {team.stats.pitReport.drivetrain}</div>
                  {team.stats.pitReport.notes ? <div className="sm:col-span-2">Notes: {team.stats.pitReport.notes}</div> : null}
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
                        <span>Auto balls: {report.autoBallsScored}</span>
                        <span>Teleop balls: {report.teleopBallsScored}</span>
                        <span>Driver: {report.driverRating}/10</span>
                        <span>Defense: {report.defenseRating}/10</span>
                        <span>Endgame: {report.endgameResult}</span>
                        <span>Tags: {report.tags.map((tag) => tag.replaceAll("_", " ")).join(", ") || "None"}</span>
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
