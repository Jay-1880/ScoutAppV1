type TbaEventTeam = {
  team_key: string
  team_number: number
  nickname?: string
  city?: string
  state_prov?: string
  country?: string
}

type TbaMatch = {
  key: string
  comp_level: string
  match_number: number
  alliances?: {
    red?: { team_keys?: string[] }
    blue?: { team_keys?: string[] }
  }
  time?: number
}

function normalizeNumber(teamKey: string) {
  return Number(teamKey.replace("frc", ""))
}

export async function loadTbaEvent(eventKey: string) {
  const apiKey = import.meta.env.VITE_TBA_API_KEY as string | undefined
  if (!apiKey) throw new Error("Missing VITE_TBA_API_KEY")
  const headers = { X_TBA_Auth_Key: apiKey }
  const [event, teams, matches] = await Promise.all([
    fetch(`https://www.thebluealliance.com/api/v3/event/${eventKey}`, { headers }).then((r) => r.json()),
    fetch(`https://www.thebluealliance.com/api/v3/event/${eventKey}/teams`, { headers }).then((r) => r.json()),
    fetch(`https://www.thebluealliance.com/api/v3/event/${eventKey}/matches/simple`, { headers }).then((r) => r.json()),
  ])
  return {
    event,
    teams: (teams as TbaEventTeam[]).map((team) => ({
      key: team.team_key,
      number: team.team_number,
      nickname: team.nickname ?? `Team ${team.team_number}`,
      city: team.city,
      stateProv: team.state_prov,
      country: team.country,
    })),
    matches: (matches as TbaMatch[])
      .filter((match) => match.comp_level === "qm")
      .map((match) => ({
        key: match.key,
        number: match.match_number,
        red: match.alliances?.red?.team_keys?.map(normalizeNumber) ?? [],
        blue: match.alliances?.blue?.team_keys?.map(normalizeNumber) ?? [],
        time: match.time,
      })),
  }
}
