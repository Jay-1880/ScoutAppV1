import { useState, type FormEvent } from "react"
import { useMutation, useQuery } from "convex/react"
import { Check, Copy, Handshake } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { api } from "../../convex/_generated/api"

const durations = [
  { hours: 4, label: "4 hours" },
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
]

// Mentors and lead scouts create short-lived codes for alliance partners.
export function GuestPassManager() {
  const passes = useQuery(api.guest.listGuestPasses)
  const createPass = useMutation(api.guest.createGuestPass)
  const revokePass = useMutation(api.guest.revokeGuestPass)
  const [label, setLabel] = useState("")
  const [hours, setHours] = useState(24)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [status, setStatus] = useState("")
  const [copied, setCopied] = useState<string | null>(null)

  const linkFor = (code: string) => `${window.location.origin}/guest/${code}`

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(linkFor(code))
      setCopied(code)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      setStatus(`Copy this link: ${linkFor(code)}`)
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("")
    try {
      const code = await createPass({ label, hours, includeNotes })
      setLabel("")
      setIncludeNotes(false)
      await copy(code)
      setStatus(`Created. Link copied, send it to ${label.trim()}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message.replace(/^.*Uncaught Error:\s*/, "").split("\n")[0] : "Could not create the pass.")
    }
  }

  const now = Date.now()

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Handshake className="size-4" />
        Alliance partner access
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Give an alliance partner a read-only link to our scouting data. They never see pick lists, scout names, tech notes or photos.
      </p>
      <form className="mt-4 grid gap-3" onSubmit={(event) => void handleCreate(event)}>
        <div className="space-y-2">
          <Label htmlFor="guestLabel">Who is it for?</Label>
          <Input id="guestLabel" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Team 694 drive coach" maxLength={60} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Link works for</legend>
          <div className="grid grid-cols-3 gap-2">
            {durations.map((option) => (
              <Button key={option.hours} type="button" variant={hours === option.hours ? "default" : "outline"} className="h-10" onClick={() => setHours(option.hours)}>
                {option.label}
              </Button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} />
          <span>
            <span className="font-medium">Include written scout notes</span>
            <span className="block text-xs text-muted-foreground">Off by default. Notes can be blunt, so only share them with partners you trust.</span>
          </span>
        </label>
        <Button type="submit" className="h-10" disabled={!label.trim()}>Create link</Button>
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      </form>

      <div className="mt-4 grid gap-2">
        {(passes ?? []).map((pass) => {
          const active = !pass.revoked && pass.expiresAt > now
          return (
            <div key={pass._id} className={cn("grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_auto] sm:items-center", !active && "opacity-60")}>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{pass.label}</div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono tracking-wider">{pass.code}</span>
                  {" · "}
                  {pass.revoked ? "Turned off" : active ? `Until ${new Date(pass.expiresAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : "Expired"}
                  {pass.includeNotes ? " · includes notes" : ""}
                </div>
              </div>
              {active ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void copy(pass.code)}>
                    {copied === pass.code ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied === pass.code ? "Copied" : "Copy link"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void revokePass({ passId: pass._id })}>Turn off</Button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
