import { internalQuery } from "./_generated/server"
import { v } from "convex/values"

export const getTbaApiKey = internalQuery({
  handler: async (ctx) => {
    const setting = await ctx.db.query("appSettings").withIndex("key", (q) => q.eq("key", "tbaApiKey")).unique()
    return setting?.value ?? null
  },
})

export const getRoleForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .unique()
    return profile?.role ?? null
  },
})
