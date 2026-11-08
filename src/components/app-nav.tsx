import { useState } from "react"
import { CalendarDays, ClipboardList, Home, Images, KeyRound, ListChecks, Menu, Radar, Wrench } from "lucide-react"

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const navItems = [
  { label: "Dashboard", icon: Home, tab: "dashboard" },
  { label: "Teams", icon: ClipboardList, tab: "teams" },
  { label: "Pit scouting", icon: Radar, tab: "pit" },
  { label: "Pit crew", icon: ClipboardList, tab: "pitCrew" },
  { label: "Match scouting", icon: CalendarDays, tab: "matches" },
  { label: "Pick list", icon: ListChecks, tab: "picklist" },
  { label: "Tech", icon: Wrench, tab: "tech" },
  { label: "Gallery", icon: Images, tab: "gallery" },
  { label: "Mentor", icon: KeyRound, tab: "admin" },
]

type AppTab = "dashboard" | "teams" | "pit" | "pitCrew" | "matches" | "picklist" | "tech" | "gallery" | "admin"
type UserRole = "mentor" | "lead_scout" | "pit" | "tech" | "scout"

function canSeeTab(tab: AppTab, role: UserRole) {
  if (role === "mentor") return true
  if (tab === "dashboard" || tab === "gallery") return true
  if (tab === "teams") return role === "lead_scout" || role === "pit" || role === "tech" || role === "scout"
  if (tab === "pit") return role === "pit" || role === "lead_scout" || role === "scout"
  if (tab === "pitCrew") return role === "pit" || role === "lead_scout"
  if (tab === "matches") return role === "scout" || role === "lead_scout"
  if (tab === "picklist") return role === "lead_scout"
  if (tab === "tech") return role === "tech"
  return false
}

export function AppNav({
  activeTab,
  onTabChange,
  role,
}: {
  activeTab: string
  onTabChange: (tab: AppTab) => void
  role: UserRole
}) {
  const visibleNavItems = navItems.filter((item) => canSeeTab(item.tab as AppTab, role))
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 xl:flex">
        {visibleNavItems.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onTabChange(item.tab as AppTab)}
            className={cn(
              "nav-pill inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
              activeTab === item.tab ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="xl:hidden">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted">
            <Menu className="size-4" />
            {visibleNavItems.find((item) => item.tab === activeTab)?.label ?? "Menu"}
          </SheetTrigger>
          <SheetContent side="right">
            <div className="flex h-full flex-col gap-1 overflow-y-auto px-2 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {visibleNavItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={cn(
                    "nav-pill inline-flex h-12 items-center gap-3 rounded-lg px-3 text-base font-medium hover:bg-muted",
                    activeTab === item.tab && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                  onClick={() => {
                    onTabChange(item.tab as AppTab)
                    setMenuOpen(false)
                  }}
                >
                  <item.icon className="size-5" />
                  {item.label}
                </button>
              ))}
              <Separator className="my-2" />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
