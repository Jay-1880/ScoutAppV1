import { getAuthUserId } from "@convex-dev/auth/server"
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import { v } from "convex/values"

// Team photo gallery. Only signed-in team members can see or post photos.

const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const MAX_CAPTION = 200

async function requireMember(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("Not authenticated")
  const profile = await ctx.db
    .query("profiles")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .unique()
  if (!profile) throw new Error("Profile not found")
  const isMentor = profile.role === "mentor" || profile.role === "admin"
  return { userId, profile, isMentor }
}

export const listPhotos = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    const { isMentor } = await requireMember(ctx)
    const photos = await ctx.db.query("galleryPhotos").withIndex("createdAt").order("desc").take(200)
    return Promise.all(
      photos.map(async (photo) => {
        const uploader = await ctx.db
          .query("profiles")
          .withIndex("userId", (q) => q.eq("userId", photo.uploadedBy))
          .unique()
        const event = photo.eventId ? await ctx.db.get(photo.eventId) : null
        return {
          _id: photo._id,
          url: await ctx.storage.getUrl(photo.storageId),
          caption: photo.caption,
          createdAt: photo.createdAt,
          eventName: event?.name,
          uploaderName: uploader?.displayName ?? "Team member",
          canDelete: isMentor || photo.uploadedBy === userId,
        }
      }),
    )
  },
})

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    await requireMember(ctx)
    return ctx.storage.generateUploadUrl()
  },
})

export const addPhoto = mutation({
  args: {
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireMember(ctx)
    const file = await ctx.db.system.get(args.storageId)
    if (!file) throw new Error("Upload not found. Try again.")
    if (!file.contentType?.startsWith("image/") || file.size > MAX_PHOTO_BYTES) {
      await ctx.storage.delete(args.storageId)
      throw new Error("Photos must be images under 10 MB.")
    }
    const latestEvent = await ctx.db.query("events").order("desc").first()
    return ctx.db.insert("galleryPhotos", {
      eventId: latestEvent?._id,
      storageId: args.storageId,
      caption: args.caption?.trim().slice(0, MAX_CAPTION) || undefined,
      uploadedBy: userId,
      createdAt: Date.now(),
    })
  },
})

export const deletePhoto = mutation({
  args: { photoId: v.id("galleryPhotos") },
  handler: async (ctx, args) => {
    const { userId, isMentor } = await requireMember(ctx)
    const photo = await ctx.db.get(args.photoId)
    if (!photo) return
    if (!isMentor && photo.uploadedBy !== userId) {
      throw new Error("You can only delete photos you posted.")
    }
    await ctx.storage.delete(photo.storageId)
    await ctx.db.delete(photo._id)
  },
})
