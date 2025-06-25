"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import * as XLSX from "xlsx"
import Papa from "papaparse"
import { Upload, FileSpreadsheet, Mail, Send, Clock, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMutation, useQuery, useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { toast } from "sonner"

interface Recipient {
  email: string
  name?: string
  subject?: string
  body?: string
  attachmentFile?: string
  [key: string]: any
}

interface RecipientsTabProps {
  onCampaignCreated?: (campaignId: Id<"campaigns">) => void
}

export function RecipientsTab({ onCampaignCreated }: RecipientsTabProps) {
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [editingCell, setEditingCell] = useState<{ row: number; field: string } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(10)
  const [hasUploadedFile, setHasUploadedFile] = useState(false)
  const [emailFormat, setEmailFormat] = useState<"HTML" | "TXT">("HTML")
  const [sendRateLimit, setSendRateLimit] = useState("10")
  const [priority, setPriority] = useState<"Normal" | "High" | "Low">("Normal")
  const [subject, setSubject] = useState("")
  const [template, setTemplate] = useState("")
  const [testEmail, setTestEmail] = useState("")
  const [currentCampaignId, setCurrentCampaignId] = useState<Id<"campaigns"> | null>(null)
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState(false)

  const campaigns = useQuery(api.campaigns.getCampaigns)
  const createCampaign = useMutation(api.campaigns.createCampaign)
  const addRecipients = useMutation(api.recipients.addRecipients)
  const sendTestEmail = useAction(api.emails.sendTestEmail)
  const sendCampaign = useAction(api.emails.sendCampaignEmails)

  const processFile = useCallback((file: File) => {
    console.log("Processing file:", file.name, file.type)
    const reader = new FileReader()
    
    if (file.name.endsWith(".csv")) {
      reader.onload = (e) => {
        const text = e.target?.result as string
        console.log("CSV content:", text.substring(0, 200) + "...")
        
        // Auto-detect delimiter (comma or semicolon)
        const semicolonCount = (text.match(/;/g) || []).length
        const commaCount = (text.match(/,/g) || []).length
        const delimiter = semicolonCount > commaCount ? ';' : ','
        console.log("Detected CSV delimiter:", delimiter)
        
        Papa.parse(text, {
          header: true,
          delimiter: delimiter,
          complete: (results) => {
            console.log("CSV parse results:", results)
            const data = results.data as any[]
            console.log("Parsed data:", data)
            console.log("Column names:", data.length > 0 ? Object.keys(data[0]) : [])
            
            // Process each row to compose complete email data (same as Excel logic)
            const processedRecipients = data.map((row, index) => {
              const recipient: Recipient = { email: '' }
              
              // Extract email address
              const emailField = row['recipient email address'] || row['email'] || row['Email']
              if (!emailField || !emailField.trim()) {
                console.warn(`Row ${index + 1}: No email address found`)
                return null
              }
              recipient.email = emailField.trim()
              
              // Extract subject template
              let subjectTemplate = row['email title'] || ''
              
              // Extract email body template
              let bodyTemplate = row['email text body'] || ''
              
              // Extract attachment file
              recipient.attachmentFile = row['email attachment file'] || ''
              
              // Find all variable columns (var1, var2, etc.)
              const variableColumns = Object.keys(row).filter(key => 
                key.toLowerCase().startsWith('var') || 
                key.match(/^var\d+$/i)
              )
              
              console.log(`Row ${index + 1} variables:`, variableColumns)
              
              // Replace variables in both subject and body templates
              variableColumns.forEach(varKey => {
                const varValue = row[varKey] || ''
                const varName = varKey.toLowerCase()
                
                // Replace patterns like |*var1*|, |*var2*|, etc.
                const pattern = new RegExp(`\\|\\*${varName}\\*\\|`, 'gi')
                subjectTemplate = subjectTemplate.replace(pattern, varValue)
                bodyTemplate = bodyTemplate.replace(pattern, varValue)
                
                // Also store the variable in recipient data for potential use
                recipient[varKey] = varValue
              })
              
              recipient.subject = subjectTemplate
              recipient.body = bodyTemplate
              
              // Store all original data including templates
              Object.keys(row).forEach(key => {
                if (!recipient.hasOwnProperty(key)) {
                  recipient[key] = row[key]
                }
              })
              
              // Ensure we keep the original templates for editing
              recipient['email title'] = row['email title'] || ''
              recipient['email text body'] = row['email text body'] || ''
              
              console.log(`Processed recipient ${index + 1}:`, {
                email: recipient.email,
                subject: recipient.subject,
                body: recipient.body.substring(0, 100) + '...',
                attachmentFile: recipient.attachmentFile,
                variables: variableColumns.map(v => `${v}: ${row[v]}`)
              })
              
              return recipient
            }).filter(r => r !== null) as Recipient[]
            
            console.log("Valid recipients with composed emails:", processedRecipients)
            setRecipients(processedRecipients)
            setHasUploadedFile(true)
            setCurrentPage(1)
          },
          error: (error) => {
            console.error("CSV parse error:", error)
          }
        })
      }
      reader.readAsText(file)
    } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: "array" })
          console.log("Excel workbook:", workbook)
          const sheetName = workbook.SheetNames[0]
          console.log("Sheet name:", sheetName)
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[]
          console.log("Excel data:", jsonData)
          console.log("Column names:", jsonData.length > 0 ? Object.keys(jsonData[0]) : [])
          
          // Process each row to compose complete email data
          const processedRecipients = jsonData.map((row, index) => {
            const recipient: Recipient = { email: '' }
            
            // Extract email address
            const emailField = row['recipient email address'] || row['email'] || row['Email']
            if (!emailField || !emailField.trim()) {
              console.warn(`Row ${index + 1}: No email address found`)
              return null
            }
            recipient.email = emailField.trim()
            
            // Extract subject template
            let subjectTemplate = row['email title'] || ''
            
            // Extract email body template
            let bodyTemplate = row['email text body'] || ''
            
            // Extract attachment file
            recipient.attachmentFile = row['email attachment file'] || ''
            
            // Find all variable columns (var1, var2, etc.)
            const variableColumns = Object.keys(row).filter(key => 
              key.toLowerCase().startsWith('var') || 
              key.match(/^var\d+$/i)
            )
            
            console.log(`Row ${index + 1} variables:`, variableColumns)
            
            // Replace variables in both subject and body templates
            variableColumns.forEach(varKey => {
              const varValue = row[varKey] || ''
              const varName = varKey.toLowerCase()
              
              // Replace patterns like |*var1*|, |*var2*|, etc.
              const pattern = new RegExp(`\\|\\*${varName}\\*\\|`, 'gi')
              subjectTemplate = subjectTemplate.replace(pattern, varValue)
              bodyTemplate = bodyTemplate.replace(pattern, varValue)
              
              // Also store the variable in recipient data for potential use
              recipient[varKey] = varValue
            })
            
            recipient.subject = subjectTemplate
            recipient.body = bodyTemplate
            
            // Store all original data including templates
            Object.keys(row).forEach(key => {
              if (!recipient.hasOwnProperty(key)) {
                recipient[key] = row[key]
              }
            })
            
            // Ensure we keep the original templates for editing
            recipient['email title'] = row['email title'] || ''
            recipient['email text body'] = row['email text body'] || ''
            
            console.log(`Processed recipient ${index + 1}:`, {
              email: recipient.email,
              subject: recipient.subject,
              body: recipient.body.substring(0, 100) + '...',
              attachmentFile: recipient.attachmentFile,
              variables: variableColumns.map(v => `${v}: ${row[v]}`)
            })
            
            return recipient
          }).filter(r => r !== null) as Recipient[]
          
          console.log("Valid recipients with composed emails:", processedRecipients)
          setRecipients(processedRecipients)
          setHasUploadedFile(true)
          setCurrentPage(1)
        } catch (error) {
          console.error("Excel processing error:", error)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      console.log("Unsupported file type:", file.name)
    }
  }, [])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    console.log("Files dropped:", acceptedFiles)
    const file = acceptedFiles[0]
    if (file) {
      console.log("Processing file:", file.name, file.size, file.type)
      processFile(file)
    } else {
      console.log("No file to process")
    }
  }, [processFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    maxFiles: 1,
  })

  const updateRecipient = (rowIndex: number, field: string, value: string) => {
    setRecipients(prev => prev.map((recipient, index) => {
      if (index === rowIndex) {
        const updatedRecipient = { ...recipient, [field]: value }
        
        // If updating variables, re-process both subject and body templates
        if (field.toLowerCase().startsWith('var')) {
          let updatedSubject = recipient['email title'] || recipient.subject || ''
          let updatedBody = recipient['email text body'] || recipient.body || ''
          
          // Re-apply all variable replacements
          Object.keys(updatedRecipient).forEach(key => {
            if (key.toLowerCase().startsWith('var')) {
              const varName = key.toLowerCase()
              const pattern = new RegExp(`\\|\\*${varName}\\*\\|`, 'gi')
              updatedSubject = updatedSubject.replace(pattern, updatedRecipient[key] || '')
              updatedBody = updatedBody.replace(pattern, updatedRecipient[key] || '')
            }
          })
          
          updatedRecipient.subject = updatedSubject
          updatedRecipient.body = updatedBody
        }
        
        // If updating email title template, re-process variables in subject
        if (field === 'email title') {
          let updatedSubject = value
          
          Object.keys(updatedRecipient).forEach(key => {
            if (key.toLowerCase().startsWith('var')) {
              const varName = key.toLowerCase()
              const pattern = new RegExp(`\\|\\*${varName}\\*\\|`, 'gi')
              updatedSubject = updatedSubject.replace(pattern, updatedRecipient[key] || '')
            }
          })
          
          updatedRecipient.subject = updatedSubject
        }
        
        // If updating email text body template, re-process variables in body
        if (field === 'email text body') {
          let updatedBody = value
          
          Object.keys(updatedRecipient).forEach(key => {
            if (key.toLowerCase().startsWith('var')) {
              const varName = key.toLowerCase()
              const pattern = new RegExp(`\\|\\*${varName}\\*\\|`, 'gi')
              updatedBody = updatedBody.replace(pattern, updatedRecipient[key] || '')
            }
          })
          
          updatedRecipient.body = updatedBody
        }
        
        return updatedRecipient
      }
      return recipient
    }))
  }

  const handleCellClick = (rowIndex: number, field: string) => {
    setEditingCell({ row: rowIndex, field })
  }

  const handleCellBlur = () => {
    setEditingCell(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, field: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      setEditingCell(null)
    }
    if (e.key === 'Escape') {
      setEditingCell(null)
    }
  }

  const renderEditableCell = (recipient: Recipient, rowIndex: number, field: string, value: string, isTextArea = false) => {
    const isEditing = editingCell?.row === rowIndex && editingCell?.field === field
    
    if (isEditing) {
      if (isTextArea) {
        return (
          <Textarea
            value={value}
            onChange={(e) => updateRecipient(rowIndex, field, e.target.value)}
            onBlur={handleCellBlur}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, field)}
            className="min-h-[60px] resize-none"
            autoFocus
          />
        )
      } else {
        return (
          <Input
            value={value}
            onChange={(e) => updateRecipient(rowIndex, field, e.target.value)}
            onBlur={handleCellBlur}
            onKeyDown={(e) => handleKeyDown(e, rowIndex, field)}
            className="border-none p-0 h-auto focus:ring-0"
            autoFocus
          />
        )
      }
    }
    
    return (
      <div
        onClick={() => handleCellClick(rowIndex, field)}
        className={`cursor-pointer hover:bg-gray-50 p-1 rounded min-h-[20px] ${
          isTextArea ? 'max-w-xs' : ''
        }`}
        title="Click to edit"
      >
        {isTextArea ? (
          <div className="truncate">{value ? value.substring(0, 50) + "..." : "-"}</div>
        ) : (
          <span>{value || "-"}</span>
        )}
      </div>
    )
  }

  // Pagination calculations
  const totalPages = Math.ceil(recipients.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentRecipients = recipients.slice(startIndex, endIndex)

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const addNewRecipient = () => {
    const newRecipient: Recipient = {
      email: '',
      subject: '',
      body: '',
      attachmentFile: '',
      'email text body': '',
      var1: '',
      var2: ''
    }
    setRecipients(prev => [...prev, newRecipient])
    setHasUploadedFile(true)
    // Go to the last page to show the new recipient
    const newTotalPages = Math.ceil((recipients.length + 1) / itemsPerPage)
    setCurrentPage(newTotalPages)
  }

  const removeRecipient = (indexToRemove: number) => {
    const actualIndex = startIndex + indexToRemove
    setRecipients(prev => prev.filter((_, index) => index !== actualIndex))
    
    // Adjust current page if necessary
    const newTotal = recipients.length - 1
    const newTotalPages = Math.ceil(newTotal / itemsPerPage)
    if (currentPage > newTotalPages && newTotalPages > 0) {
      setCurrentPage(newTotalPages)
    }
    
    // If no recipients left, reset upload state
    if (newTotal === 0) {
      setHasUploadedFile(false)
    }
  }

  const handleSendTestEmail = async () => {
    if (!testEmail || recipients.length === 0) return
    
    setIsSendingTest(true)
    try {
      const firstRecipient = recipients[0]
      await sendTestEmail({
        to: testEmail,
        subject: firstRecipient.subject || "Test Email",
        template: firstRecipient.body || "No content",
        emailFormat,
      })
      toast.success("Test email sent successfully!", {
        description: `Test email sent to ${testEmail}. Check your inbox to verify.`
      })
    } catch (error) {
      console.error("Error sending test email:", error)
      toast.error("Failed to send test email", {
        description: "Please check your SMTP settings and try again."
      })
    } finally {
      setIsSendingTest(false)
    }
  }

  const handleStartCampaign = async () => {
    if (recipients.length === 0) return

    setIsCreatingCampaign(true)
    try {
      // Create campaign with generic info (will be overridden per recipient)
      const campaignId = await createCampaign({
        name: `Campaign ${new Date().toLocaleDateString()}`,
        subject: subject || "Individual Email Campaign",
        template: template || "Individual emails with custom content",
        emailFormat,
        sendRateLimit: parseInt(sendRateLimit),
        priority,
      })

      // Add recipients with their individual email data
      await addRecipients({
        campaignId,
        recipients: recipients.map(r => ({
          email: r.email,
          name: r.name,
          data: {
            ...r,
            individualSubject: r.subject,
            individualBody: r.body,
            individualAttachment: r.attachmentFile
          },
        })),
      })

      setCurrentCampaignId(campaignId)
      onCampaignCreated?.(campaignId)

      // Start sending
      await sendCampaign({ campaignId })
      
      toast.success("Campaign started successfully!", {
        description: `Sending emails to ${recipients.length} recipients.`
      })
    } catch (error) {
      console.error("Error starting campaign:", error)
      toast.error("Failed to start campaign", {
        description: "Please check your settings and try again."
      })
    } finally {
      setIsCreatingCampaign(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Campaign Configuration</CardTitle>
          <CardDescription>Upload a CSV or Excel file with recipient information</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? "border-primary bg-primary/5" : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <input {...getInputProps()} />
            <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            {isDragActive ? (
              <p>Drop the file here...</p>
            ) : (
              <div>
                <p className="text-sm text-gray-600">Drag & drop a CSV or Excel file here, or click to select</p>
                <Button variant="outline" className="mt-2">
                  <Upload className="mr-2 h-4 w-4" />
                  Choose File
                </Button>
              </div>
            )}
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">
                Campaign Emails {recipients.length > 0 && `(${recipients.length})`}
              </h3>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={addNewRecipient} 
                  size="sm" 
                  variant="outline"
                  className="text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
                {recipients.length > 0 && (
                  <p className="text-sm text-gray-500">Click any cell to edit</p>
                )}
              </div>
            </div>

            {!hasUploadedFile && recipients.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No recipients yet</p>
            ) : (
              <>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Body Preview</TableHead>
                        <TableHead>Attachment</TableHead>
                        <TableHead>Variables</TableHead>
                        <TableHead className="w-16">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentRecipients.map((recipient, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {renderEditableCell(recipient, index, 'email', recipient.email)}
                        </TableCell>
                        <TableCell>
                          {renderEditableCell(recipient, index, 'subject', recipient.subject || '')}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          {renderEditableCell(recipient, index, 'body', recipient.body || '', true)}
                        </TableCell>
                        <TableCell>
                          {renderEditableCell(recipient, index, 'attachmentFile', recipient.attachmentFile || '')}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="space-y-1">
                            {Object.keys(recipient)
                              .filter(key => key.toLowerCase().startsWith('var'))
                              .map(key => (
                                <div key={key} className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 min-w-[40px]">{key}:</span>
                                  {renderEditableCell(recipient, index, key, recipient[key] || '')}
                                </div>
                              ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            onClick={() => removeRecipient(index)}
                            size="sm"
                            variant="outline"
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-500">
                      Showing {startIndex + 1} to {Math.min(endIndex, recipients.length)} of {recipients.length} recipients
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        size="sm"
                        variant="outline"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(page => {
                            // Show first page, last page, current page, and pages around current
                            return page === 1 || 
                                   page === totalPages || 
                                   (page >= currentPage - 1 && page <= currentPage + 1)
                          })
                          .map((page, index, array) => (
                            <div key={page} className="flex items-center">
                              {/* Add ellipsis if there's a gap */}
                              {index > 0 && array[index - 1] < page - 1 && (
                                <span className="px-2 text-gray-400">...</span>
                              )}
                              <Button
                                onClick={() => goToPage(page)}
                                size="sm"
                                variant={currentPage === page ? "default" : "outline"}
                                className="w-8 h-8 p-0"
                              >
                                {page}
                              </Button>
                            </div>
                          ))}
                      </div>
                      
                      <Button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        size="sm"
                        variant="outline"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Configuration</CardTitle>
          <CardDescription>Configure email settings and template</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="email-format">Email Format</Label>
              <Select value={emailFormat} onValueChange={(value: "HTML" | "TXT") => setEmailFormat(value)}>
                <SelectTrigger id="email-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HTML">HTML</SelectItem>
                  <SelectItem value="TXT">Plain Text</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="rate-limit">Send Rate Limit (emails/min)</Label>
              <Input
                id="rate-limit"
                type="number"
                value={sendRateLimit}
                onChange={(e) => setSendRateLimit(e.target.value)}
                min="1"
                max="100"
              />
            </div>

            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={(value: "Normal" | "High" | "Low") => setPriority(value)}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Email Template Preview</CardTitle>
            <CardDescription>Preview based on first campaign email</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recipients.length > 0 ? (
              <div className="border rounded-lg p-4 bg-gray-50 space-y-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">SUBJECT</div>
                    <div className="text-sm">{recipients[0].subject || "No subject"}</div>
                  </div>
                  
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">FROM</div>
                    <div className="text-sm">SMTP Settings</div>
                  </div>
                  
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">TO</div>
                    <div className="text-sm">{recipients[0].email}</div>
                  </div>
                  
                  {recipients[0].attachmentFile && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">ATTACHMENT</div>
                      <div className="text-sm flex items-center gap-2">
                        <span className="text-gray-400">📎</span>
                        {recipients[0].attachmentFile}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">BODY PREVIEW</div>
                    <div className="text-sm bg-white p-3 rounded border mt-1">
                      {emailFormat === "HTML" ? (
                        <div dangerouslySetInnerHTML={{ __html: recipients[0].body || "No content" }} />
                      ) : (
                        <pre className="whitespace-pre-wrap font-sans">{recipients[0].body || "No content"}</pre>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-4 bg-gray-50 min-h-[200px] flex items-center justify-center">
                <p className="text-gray-500">Email preview will appear here after uploading campaign emails...</p>
              </div>
            )}
            
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Test email address"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
              <Button onClick={handleSendTestEmail} disabled={!testEmail || recipients.length === 0 || isSendingTest}>
                <Mail className="mr-2 h-4 w-4" />
                {isSendingTest ? "Sending..." : "Send Test"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Send Campaign</CardTitle>
            <CardDescription>Review and send your email campaign</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Recipients:</span>
                <span className="font-semibold">{recipients.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Email Format:</span>
                <span className="font-semibold">{emailFormat}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Send Rate:</span>
                <span className="font-semibold">{sendRateLimit} emails/min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Estimated Time:</span>
                <span className="font-semibold">
                  {Math.ceil(recipients.length / parseInt(sendRateLimit))} minutes
                </span>
              </div>
            </div>

            <Button 
              onClick={handleStartCampaign} 
              disabled={recipients.length === 0 || isCreatingCampaign}
              className="w-full"
              size="lg"
            >
              <Send className="mr-2 h-4 w-4" />
              {isCreatingCampaign ? "Starting..." : "Start Campaign"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Campaigns</CardTitle>
          <CardDescription>View your recent email campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns && campaigns.length > 0 ? (
            <div className="space-y-4">
              {campaigns.slice(0, 5).map((campaign) => (
                <div key={campaign._id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold">{campaign.name}</h4>
                    <span className={`px-2 py-1 rounded text-xs ${
                      campaign.status === "completed" ? "bg-green-100 text-green-800" :
                      campaign.status === "sending" ? "bg-blue-100 text-blue-800" :
                      campaign.status === "failed" ? "bg-red-100 text-red-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {campaign.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{campaign.subject}</p>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Recipients: {campaign.totalRecipients}</span>
                    <span>Sent: {campaign.sentCount} | Failed: {campaign.failedCount}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Clock className="mx-auto h-12 w-12 mb-2" />
              <p>No campaigns sent yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}