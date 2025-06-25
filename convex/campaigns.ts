import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const createCampaign = mutation({
  args: {
    name: v.string(),
    subject: v.string(),
    template: v.string(),
    emailFormat: v.union(v.literal("HTML"), v.literal("TXT")),
    sendRateLimit: v.number(),
    priority: v.union(v.literal("Normal"), v.literal("High"), v.literal("Low")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    return await ctx.db.insert("campaigns", {
      userId: identity.subject,
      ...args,
      status: "draft",
      totalRecipients: 0,
      sentCount: 0,
      failedCount: 0,
      createdAt: Date.now(),
    })
  },
})

export const getCampaigns = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    return await ctx.db
      .query("campaigns")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect()
  },
})

export const getCampaign = query({
  args: { id: v.id("campaigns") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const campaign = await ctx.db.get(args.id)
    if (!campaign || campaign.userId !== identity.subject) return null

    return campaign
  },
})

export const updateCampaignStatus = mutation({
  args: {
    id: v.id("campaigns"),
    status: v.union(v.literal("draft"), v.literal("sending"), v.literal("completed"), v.literal("paused"), v.literal("failed")),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const campaign = await ctx.db.get(args.id)
    if (!campaign || campaign.userId !== identity.subject) {
      throw new Error("Campaign not found or unauthorized")
    }

    const updateData: any = { status: args.status }
    if (args.startedAt) updateData.startedAt = args.startedAt
    if (args.completedAt) updateData.completedAt = args.completedAt

    await ctx.db.patch(args.id, updateData)
  },
})

export const updateCampaignProgress = mutation({
  args: {
    id: v.id("campaigns"),
    sentCount: v.number(),
    failedCount: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const campaign = await ctx.db.get(args.id)
    if (!campaign || campaign.userId !== identity.subject) {
      throw new Error("Campaign not found or unauthorized")
    }

    await ctx.db.patch(args.id, {
      sentCount: args.sentCount,
      failedCount: args.failedCount,
    })
  },
})