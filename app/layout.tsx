import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ClerkProvider } from "@clerk/nextjs"
import { ConvexClientProvider } from "./ConvexClientProvider"
import { Toaster } from "sonner"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "MailCraft - Email Campaign Platform",
  description: "Send personalized emails with attachments to your audience",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider>
      <ConvexClientProvider>
        <html lang="en">
          <body className={inter.className}>
            {children}
            <Toaster richColors position="top-right" />
          </body>
        </html>
      </ConvexClientProvider>
    </ClerkProvider>
  )
}