import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  campaigns: defineTable({
    userId: v.string(),
    name: v.string(),
    subject: v.string(),
    template: v.string(),
    emailFormat: v.union(v.literal("HTML"), v.literal("TXT")),
    sendRateLimit: v.number(),
    priority: v.union(v.literal("Normal"), v.literal("High"), v.literal("Low")),
    status: v.union(v.literal("draft"), v.literal("sending"), v.literal("completed"), v.literal("paused"), v.literal("failed")),
    totalRecipients: v.number(),
    sentCount: v.number(),
    failedCount: v.number(),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  recipients: defineTable({
    campaignId: v.id("campaigns"),
    email: v.string(),
    name: v.optional(v.string()),
    data: v.any(),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_campaign", ["campaignId"]),

  attachments: defineTable({
    campaignId: v.id("campaigns"),
    storageId: v.id("_storage"),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
  }).index("by_campaign", ["campaignId"]),

  smtpSettings: defineTable({
    userId: v.string(),
    host: v.string(),
    port: v.number(),
    secure: v.boolean(),
    username: v.string(),
    password: v.string(),
    fromEmail: v.string(),
    fromName: v.optional(v.string()),
  }).index("by_user", ["userId"]),
})