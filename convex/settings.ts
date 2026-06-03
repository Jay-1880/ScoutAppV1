import { internalQuery } from "./_generated/server"

export const getTbaApiKey = internalQuery({
  handler: async (ctx) => {
    const setting = await ctx.db.query("appSettings").withIndex("key", (q) => q.eq("key", "tbaApiKey")).unique()
    return setting?.value ?? null
  },
})
