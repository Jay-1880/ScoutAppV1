import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

// Keep Statbotics EPA fresh for the current event.
crons.interval("refresh statbotics", { minutes: 15 }, internal.statbotics.refreshCurrent, {})

export default crons
