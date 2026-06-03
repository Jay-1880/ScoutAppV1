import { CalendarDays, ClipboardList, Home, KeyRound, ListChecks, Radar, Wrench } from "lucide-react"

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const navItems = [
  { label: "Dashboard", icon: Home, tab: "dashboard" },
  { label: "Teams", icon: ClipboardList, tab: "teams" },
  { label: "Pit scouting", icon: Radar, tab: "pit" },
  { label: "Match scouting", icon: CalendarDays, tab: "matches" },
  { label: "Pick list", icon: ListChecks, tab: "picklist" },
  { label: "Tech", icon: Wrench, tab: "tech" },
  { label: "Admin", icon: KeyRound, tab: "admin" },
]

type AppTab = "dashboard" | "teams" | "pit" | "matches" | "picklist" | "tech" | "admin"

export function AppNav({
  activeTab,
  onTabChange,
}: {
  activeTab: string
  onTabChange: (tab: AppTab) => void
}) {
  return (
    <>
      <div className="hidden items-center gap-2 md:flex">
        {navItems.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onTabChange(item.tab as AppTab)}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
              activeTab === item.tab ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
      </div>
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted">
            Menu
          </SheetTrigger>
          <SheetContent side="right">
            <div className="flex h-full flex-col gap-3 pt-8">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-muted",
                    activeTab === item.tab && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                  onClick={() => onTabChange(item.tab as AppTab)}
                >
                  <item.icon className="size-4" />
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
