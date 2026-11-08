import { create } from "zustand"

type UiState = {
  activeTab: "dashboard" | "teams" | "pit" | "pitCrew" | "matches" | "picklist" | "tech" | "gallery" | "admin"
  sidebarOpen: boolean
  setActiveTab: (activeTab: UiState["activeTab"]) => void
  setSidebarOpen: (sidebarOpen: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "dashboard",
  sidebarOpen: false,
  setActiveTab: (activeTab) => set({ activeTab }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}))
