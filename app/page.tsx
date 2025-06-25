"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AccountMenu } from "@/components/account-menu"
import { RecipientsTab } from "@/components/recipients-tab"
import { AttachmentsTab } from "@/components/attachments-tab"
import { useUser } from "@clerk/nextjs"
import { Mail, Paperclip } from "lucide-react"
import type { Id } from "@/convex/_generated/dataModel"

export default function Home() {
  const { isLoaded, user } = useUser()
  const [currentCampaignId, setCurrentCampaignId] = useState<Id<"campaigns"> | null>(null)

  if (!isLoaded) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">MailCraft</h1>
          <AccountMenu />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="recipients" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="recipients" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Recipients
            </TabsTrigger>
            <TabsTrigger value="attachments" className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Attachments
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recipients" className="mt-6">
            <RecipientsTab onCampaignCreated={setCurrentCampaignId} />
          </TabsContent>

          <TabsContent value="attachments" className="mt-6">
            <AttachmentsTab campaignId={currentCampaignId || undefined} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}