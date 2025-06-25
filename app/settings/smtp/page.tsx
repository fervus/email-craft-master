"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Eye, EyeOff, TestTube } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { toast } from "sonner"

export default function SMTPSettingsPage() {
  const router = useRouter()
  const smtpSettings = useQuery(api.smtp.getSmtpSettings)
  const saveSettings = useMutation(api.smtp.saveSmtpSettings)
  const testConnection = useAction(api.emails.testSmtpConnection)

  const [host, setHost] = useState("")
  const [port, setPort] = useState("587")
  const [secure, setSecure] = useState(true)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [fromEmail, setFromEmail] = useState("")
  const [fromName, setFromName] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testEmail, setTestEmail] = useState("")

  useEffect(() => {
    if (smtpSettings) {
      setHost(smtpSettings.host || "")
      setPort(smtpSettings.port?.toString() || "587")
      setSecure(smtpSettings.secure ?? true)
      setUsername(smtpSettings.username || "")
      setPassword(smtpSettings.password || "")
      setFromEmail(smtpSettings.fromEmail || "")
      setFromName(smtpSettings.fromName || "")
    }
  }, [smtpSettings])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      console.log("Attempting to save SMTP settings:", {
        host,
        port: parseInt(port),
        secure,
        username,
        fromEmail,
        fromName
      })
      
      const result = await saveSettings({
        host,
        port: parseInt(port),
        secure,
        username,
        password,
        fromEmail,
        fromName,
      })
      console.log("Save result:", result)
      toast.success("SMTP settings saved successfully!", {
        description: "Your email server configuration has been updated."
      })
    } catch (error) {
      console.error("Error saving SMTP settings:", error)
      toast.error("Failed to save SMTP settings", {
        description: error.message || "Please check your configuration and try again."
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async () => {
    const emailToTest = testEmail || fromEmail
    
    if (!emailToTest) {
      toast.warning("Please enter a test email address", {
        description: "A test email address is required to verify your SMTP configuration."
      })
      return
    }

    setIsTesting(true)
    try {
      await testConnection({
        host,
        port: parseInt(port),
        secure,
        username,
        password,
        fromEmail,
        fromName,
        testEmail: emailToTest,
      })
      toast.success("SMTP connection test successful!", {
        description: `Test email sent to ${emailToTest}. Check your inbox to verify.`
      })
    } catch (error) {
      console.error("Error testing SMTP connection:", error)
      toast.error("SMTP connection test failed", {
        description: "Please check your settings and try again."
      })
    } finally {
      setIsTesting(false)
    }
  }

  const isFormValid = host && port && username && password && fromEmail

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            className="mr-4"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Email SMTP Server Settings</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>SMTP Configuration</CardTitle>
            <CardDescription>
              Configure your email server settings to send emails through MailCraft
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="host">SMTP Host</Label>
                <Input
                  id="host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div>
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="587"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="secure"
                checked={secure}
                onCheckedChange={setSecure}
              />
              <Label htmlFor="secure">Use SSL/TLS encryption</Label>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your-email@example.com"
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="from-email">From Email</Label>
                <Input
                  id="from-email"
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="noreply@example.com"
                />
              </div>
              <div>
                <Label htmlFor="from-name">From Name (Optional)</Label>
                <Input
                  id="from-name"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Your Company Name"
                />
              </div>
            </div>

            <div className="pt-4 space-y-4">
              <Button
                onClick={handleSave}
                disabled={isSaving || !isFormValid}
                className="w-full"
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save Settings"}
              </Button>
              
              <div>
                <Label htmlFor="test-email">Test Email Address</Label>
                <div className="flex gap-2">
                  <Input
                    id="test-email"
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="Enter email to test SMTP connection"
                    className="flex-1"
                  />
                  <Button
                    onClick={handleTest}
                    disabled={isTesting || !isFormValid}
                    variant="outline"
                  >
                    <TestTube className="mr-2 h-4 w-4" />
                    {isTesting ? "Testing..." : "Test Connection"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Common SMTP Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="font-semibold">Gmail</p>
              <p className="text-gray-600">Host: smtp.gmail.com, Port: 587 (TLS) or 465 (SSL)</p>
              <p className="text-gray-600 text-xs mt-1">Note: Use App Password, not regular password</p>
            </div>
            <div>
              <p className="font-semibold">Outlook/Office 365</p>
              <p className="text-gray-600">Host: smtp.office365.com, Port: 587 (TLS)</p>
            </div>
            <div>
              <p className="font-semibold">Yahoo</p>
              <p className="text-gray-600">Host: smtp.mail.yahoo.com, Port: 587 (TLS) or 465 (SSL)</p>
            </div>
            <div>
              <p className="font-semibold">SendGrid</p>
              <p className="text-gray-600">Host: smtp.sendgrid.net, Port: 587 (TLS)</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}