import { useQuery } from "convex/react"
import { BarChart3 } from "lucide-react"

import { ScoutingBoard } from "@/components/scouting-board"
import { api } from "../../convex/_generated/api"

// The team's own view of all scouting data, ranked and easy to compare.
export function DataTab() {
  const data = useQuery(api.guest.getTeamSummaries)

  if (data === undefined) {
    return (
      <section className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((index) => <div key={index} className="surface-card h-32 animate-pulse" />)}
        </div>
        <div className="surface-card h-64 animate-pulse" />
      </section>
    )
  }

  return (
    <section className="grid gap-3">
      <div className="surface-card flex items-center gap-3 p-4">
        <BarChart3 className="size-5 text-primary" />
        <div>
          <h2 className="text-base font-semibold">Scouting data{data?.event ? ` · ${data.event.name}` : ""}</h2>
          <p className="text-sm text-muted-foreground">Everything our scouts have collected, ranked. Tap a team for pit answers, tags and notes.</p>
        </div>
      </div>
      {data?.teams.length ? (
        <ScoutingBoard teams={data.teams} />
      ) : (
        <div className="surface-card p-6 text-center text-sm text-muted-foreground">No teams yet. A mentor needs to import the event.</div>
      )}
    </section>
  )
}
