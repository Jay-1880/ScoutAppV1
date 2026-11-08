export type MatchEndgameResult = "none" | "low" | "mid" | "high"
export type PickTier = "tier1" | "tier2" | "tier3" | "do_not_pick" | "uncategorized"
export type MatchTag =
  | "fast_cycles"
  | "shoots_while_moving"
  | "fed_partners"
  | "played_defense"
  | "defended_well_against"
  | "wasted_inactive_hub"
  | "used_trench"
  | "tipped_over"
  | "disabled"
  | "no_show"
export type ShotRange = "none" | "close" | "mid" | "long"
export type ClimbLevel = "none" | "l1" | "l2" | "l3"
export type Accuracy = "high" | "mid" | "low"

// Plain-English labels shown to scouts. Older reports may contain the
// original tag names, so those are labelled too.
export const tagLabels: Record<string, string> = {
  fast_cycles: "Fast cycles",
  shoots_while_moving: "Shoots while moving",
  fed_partners: "Passed fuel to partners",
  played_defense: "Played defense",
  defended_well_against: "Hard to defend",
  wasted_inactive_hub: "Shot into inactive hub",
  used_trench: "Went under the trench",
  tipped_over: "Tipped over",
  disabled: "Stopped moving / disabled",
  no_show: "No show",
  fast: "Fast",
  accurate: "Accurate",
  good_driver: "Good driver",
  plays_defense: "Plays defense",
  tippy: "Tippy",
  broke_down: "Broke down",
  inconsistent: "Inconsistent",
}

export const endgameLabels: Record<string, string> = {
  none: "No climb",
  low: "Level 1",
  mid: "Level 2",
  high: "Level 3",
}
