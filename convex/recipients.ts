import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const addRecipients = mutation({
  args: {
    campaignId: v.id("campaigns"),
    recipients: v.array(
      v.object({
        email: v.string(),
        name: v.optional(v.string()),
        data: v.any(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign || campaign.userId !== identity.subject) {
      throw new Error("Campaign not found or unauthorized")
    }

    console.log("Adding recipients to database:", args.recipients.map(r => ({
      email: r.email,
      hasIndividualSubject: !!r.data.individualSubject,
      hasIndividualBody: !!r.data.individualBody,
      individualSubject: r.data.individualSubject,
      individualBodyPreview: r.data.individualBody?.substring(0, 100) + '...'
    })))

    const recipientIds = await Promise.all(
      args.recipients.map((recipient) =>
        ctx.db.insert("recipients", {
          campaignId: args.campaignId,
          ...recipient,
          status: "pending",
        })
      )
    )

    await ctx.db.patch(args.campaignId, {
      totalRecipients: campaign.totalRecipients + args.recipients.length,
    })

    return recipientIds
  },
})

export const getRecipients = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign || campaign.userId !== identity.subject) return []

    return await ctx.db
      .query("recipients")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect()
  },
})

export const updateRecipientStatus = mutation({
  args: {
    id: v.id("recipients"),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updateData: any = { status: args.status }
    if (args.sentAt) updateData.sentAt = args.sentAt
    if (args.error) updateData.error = args.error

    await ctx.db.patch(args.id, updateData)
  },
})