import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    return await ctx.storage.generateUploadUrl()
  },
})

export const saveAttachment = mutation({
  args: {
    campaignId: v.id("campaigns"),
    storageId: v.id("_storage"),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign || campaign.userId !== identity.subject) {
      throw new Error("Campaign not found or unauthorized")
    }

    return await ctx.db.insert("attachments", args)
  },
})

export const getAttachments = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign || campaign.userId !== identity.subject) return []

    return await ctx.db
      .query("attachments")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect()
  },
})

export const deleteAttachment = mutation({
  args: { id: v.id("attachments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const attachment = await ctx.db.get(args.id)
    if (!attachment) throw new Error("Attachment not found")

    const campaign = await ctx.db.get(attachment.campaignId)
    if (!campaign || campaign.userId !== identity.subject) {
      throw new Error("Unauthorized")
    }

    await ctx.storage.delete(attachment.storageId)
    await ctx.db.delete(args.id)
  },
})