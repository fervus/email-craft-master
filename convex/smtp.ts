import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const saveSmtpSettings = mutation({
  args: {
    host: v.string(),
    port: v.number(),
    secure: v.boolean(),
    username: v.string(),
    password: v.string(),
    fromEmail: v.string(),
    fromName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const existing = await ctx.db
      .query("smtpSettings")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, args)
      return existing._id
    } else {
      return await ctx.db.insert("smtpSettings", {
        userId: identity.subject,
        ...args,
      })
    }
  },
})

export const getSmtpSettings = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    return await ctx.db
      .query("smtpSettings")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first()
  },
})