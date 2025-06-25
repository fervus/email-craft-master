"use node"

import { v } from "convex/values"
import { action } from "./_generated/server"
import { api } from "./_generated/api"
import nodemailer from "nodemailer"

export const sendCampaignEmails = action({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    // Get campaign details
    const campaign = await ctx.runQuery(api.campaigns.getCampaign, { id: args.campaignId })
    if (!campaign) throw new Error("Campaign not found")

    // Get SMTP settings
    const smtpSettings = await ctx.runQuery(api.smtp.getSmtpSettings)
    if (!smtpSettings) throw new Error("SMTP settings not configured")

    // Get recipients
    const recipients = await ctx.runQuery(api.recipients.getRecipients, { campaignId: args.campaignId })
    
    // Get attachments
    const attachments = await ctx.runQuery(api.attachments.getAttachments, { campaignId: args.campaignId })

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtpSettings.host,
      port: smtpSettings.port,
      secure: smtpSettings.secure,
      auth: {
        user: smtpSettings.username,
        pass: smtpSettings.password,
      },
    })

    // Update campaign status to sending
    await ctx.runMutation(api.campaigns.updateCampaignStatus, {
      id: args.campaignId,
      status: "sending",
      startedAt: Date.now(),
    })

    // Process attachments
    const emailAttachments = await Promise.all(
      attachments.map(async (attachment) => {
        const fileData = await ctx.storage.get(attachment.storageId)
        if (!fileData) return null
        
        const buffer = await fileData.arrayBuffer()
        return {
          filename: attachment.filename,
          content: Buffer.from(buffer),
          contentType: attachment.mimeType,
        }
      })
    )

    const validAttachments = emailAttachments.filter(a => a !== null)

    // Send emails with rate limiting
    let sentCount = 0
    let failedCount = 0
    const rateLimit = campaign.sendRateLimit || 10
    const batchSize = Math.min(rateLimit, 10)

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (recipient) => {
          try {
            // Use individual email data (prioritize individual content)
            let emailSubject = recipient.data.individualSubject || campaign.subject
            let emailBody = recipient.data.individualBody || campaign.template
            
            console.log(`Final email content for ${recipient.email}:`, {
              subject: emailSubject,
              bodyPreview: emailBody?.substring(0, 100) + '...',
              usingIndividualContent: !!(recipient.data.individualSubject && recipient.data.individualBody)
            })
            const individualAttachment = recipient.data.individualAttachment
            
            let htmlContent: string
            let textContent: string
            
            // For individual emails from uploaded files, the content is already processed with variables
            // For campaign templates, we need to process template variables
            // Use the individual email content directly (it's already processed)
            htmlContent = emailBody
            textContent = emailBody

            // Handle individual attachments
            let emailAttachmentsForRecipient = validAttachments
            if (individualAttachment && individualAttachment.trim()) {
              // TODO: Handle individual attachment files
              // For now, we'll use the campaign attachments
              console.log(`Recipient ${recipient.email} has individual attachment: ${individualAttachment}`)
            }

            await transporter.sendMail({
              from: `${smtpSettings.fromName || 'MailCraft'} <${smtpSettings.fromEmail}>`,
              to: recipient.email,
              subject: emailSubject,
              text: campaign.emailFormat === "TXT" ? textContent : undefined,
              html: campaign.emailFormat === "HTML" ? htmlContent : undefined,
              attachments: emailAttachmentsForRecipient,
              priority: campaign.priority.toLowerCase() as "normal" | "high" | "low",
            })

            await ctx.runMutation(api.recipients.updateRecipientStatus, {
              id: recipient._id,
              status: "sent",
              sentAt: Date.now(),
            })
            sentCount++
          } catch (error) {
            await ctx.runMutation(api.recipients.updateRecipientStatus, {
              id: recipient._id,
              status: "failed",
              error: error instanceof Error ? error.message : "Unknown error",
            })
            failedCount++
          }
        })
      )

      // Update campaign progress
      await ctx.runMutation(api.campaigns.updateCampaignProgress, {
        id: args.campaignId,
        sentCount,
        failedCount,
      })

      // Rate limiting delay
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 60000 / rateLimit))
      }
    }

    // Mark campaign as completed
    await ctx.runMutation(api.campaigns.updateCampaignStatus, {
      id: args.campaignId,
      status: "completed",
      completedAt: Date.now(),
    })

    return { sentCount, failedCount }
  },
})

export const sendTestEmail = action({
  args: {
    to: v.string(),
    subject: v.string(),
    template: v.string(),
    emailFormat: v.union(v.literal("HTML"), v.literal("TXT")),
  },
  handler: async (ctx, args) => {
    const smtpSettings = await ctx.runQuery(api.smtp.getSmtpSettings)
    if (!smtpSettings) throw new Error("SMTP settings not configured")

    const transporter = nodemailer.createTransport({
      host: smtpSettings.host,
      port: smtpSettings.port,
      secure: smtpSettings.secure,
      auth: {
        user: smtpSettings.username,
        pass: smtpSettings.password,
      },
    })

    // Replace sample variables
    let content = args.template
      .replace(/{{email}}/g, args.to)
      .replace(/{{name}}/g, "Test User")

    await transporter.sendMail({
      from: `${smtpSettings.fromName || 'MailCraft'} <${smtpSettings.fromEmail}>`,
      to: args.to,
      subject: args.subject,
      text: args.emailFormat === "TXT" ? content : undefined,
      html: args.emailFormat === "HTML" ? content : undefined,
    })

    return { success: true }
  },
})

export const testSmtpConnection = action({
  args: {
    host: v.string(),
    port: v.number(),
    secure: v.boolean(),
    username: v.string(),
    password: v.string(),
    fromEmail: v.string(),
    fromName: v.optional(v.string()),
    testEmail: v.string(),
  },
  handler: async (ctx, args) => {
    console.log("Testing SMTP connection with:", {
      host: args.host,
      port: args.port,
      secure: args.secure,
      username: args.username,
      fromEmail: args.fromEmail
    })

    const transporter = nodemailer.createTransport({
      host: args.host,
      port: args.port,
      secure: args.port === 465, // Use secure only for port 465
      requireTLS: args.port === 587, // Use STARTTLS for port 587
      auth: {
        user: args.username,
        pass: args.password,
      },
      tls: {
        rejectUnauthorized: false // Allow self-signed certificates
      }
    })

    try {
      // Test the connection
      console.log("Verifying SMTP connection...")
      await transporter.verify()
      console.log("SMTP connection verified successfully")
    } catch (error) {
      console.error("SMTP verification failed:", error)
      throw new Error(`SMTP connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Send a test email
    await transporter.sendMail({
      from: `${args.fromName || 'MailCraft'} <${args.fromEmail}>`,
      to: args.testEmail,
      subject: "Test email from MailCraft",
      text: "This is a test email from MailCraft to verify your SMTP configuration is working correctly.",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Test email from MailCraft</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #3b82f6; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
            .settings { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
            .setting-item { margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
            .setting-label { font-weight: bold; color: #555; }
            .setting-value { color: #333; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            .success { color: #16a34a; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>✅ MailCraft SMTP Test</h1>
          </div>
          <div class="content">
            <p class="success">🎉 Congratulations! Your SMTP configuration is working correctly.</p>
            
            <p>This test email was sent using your configured SMTP settings to verify that MailCraft can successfully send emails through your email server.</p>
            
            <div class="settings">
              <h3>📧 Your SMTP Configuration:</h3>
              <div class="setting-item">
                <span class="setting-label">SMTP Host:</span>
                <span class="setting-value">${args.host}</span>
              </div>
              <div class="setting-item">
                <span class="setting-label">Port:</span>
                <span class="setting-value">${args.port}</span>
              </div>
              <div class="setting-item">
                <span class="setting-label">Security:</span>
                <span class="setting-value">${args.secure ? 'SSL/TLS Enabled' : 'No Encryption'}</span>
              </div>
              <div class="setting-item">
                <span class="setting-label">Username:</span>
                <span class="setting-value">${args.username}</span>
              </div>
              <div class="setting-item">
                <span class="setting-label">From Email:</span>
                <span class="setting-value">${args.fromEmail}</span>
              </div>
              <div class="setting-item">
                <span class="setting-label">From Name:</span>
                <span class="setting-value">${args.fromName || 'Not specified'}</span>
              </div>
            </div>
            
            <p><strong>✨ What this means:</strong></p>
            <ul>
              <li>Your email server credentials are correct</li>
              <li>MailCraft can connect to your SMTP server</li>
              <li>You're ready to send email campaigns!</li>
            </ul>
            
            <p>You can now use MailCraft to send personalized email campaigns to your recipients with confidence.</p>
          </div>
          <div class="footer">
            <p>Sent by MailCraft Email Campaign Platform</p>
            <p><em>This is an automated test email</em></p>
          </div>
        </body>
        </html>
      `,
    })

    return { success: true }
  },
})