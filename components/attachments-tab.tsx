"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, File, X, FileText, FileImage, FileVideo, FileAudio } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

interface Attachment {
  _id: Id<"attachments">
  campaignId: Id<"campaigns">
  storageId: Id<"_storage">
  filename: string
  mimeType: string
  size: number
}

interface AttachmentsTabProps {
  campaignId?: Id<"campaigns">
}

export function AttachmentsTab({ campaignId }: AttachmentsTabProps) {
  const [isUploading, setIsUploading] = useState(false)
  
  const attachments = useQuery(
    api.attachments.getAttachments,
    campaignId ? { campaignId } : "skip"
  )
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl)
  const saveAttachment = useMutation(api.attachments.saveAttachment)
  const deleteAttachment = useMutation(api.attachments.deleteAttachment)

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) return <FileImage className="h-8 w-8" />
    if (type.startsWith("video/")) return <FileVideo className="h-8 w-8" />
    if (type.startsWith("audio/")) return <FileAudio className="h-8 w-8" />
    if (type.includes("pdf")) return <FileText className="h-8 w-8 text-red-500" />
    return <File className="h-8 w-8" />
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!campaignId) {
      alert("Please create a campaign first before uploading attachments")
      return
    }

    setIsUploading(true)
    try {
      for (const file of acceptedFiles) {
        // Generate upload URL
        const uploadUrl = await generateUploadUrl()
        
        // Upload file
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        })
        
        const { storageId } = await result.json()

        // Save attachment metadata
        await saveAttachment({
          campaignId,
          storageId,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
        })
      }
    } catch (error) {
      console.error("Error uploading files:", error)
      alert("Failed to upload files")
    } finally {
      setIsUploading(false)
    }
  }, [campaignId, generateUploadUrl, saveAttachment])

  const removeAttachment = async (id: Id<"attachments">) => {
    try {
      await deleteAttachment({ id })
    } catch (error) {
      console.error("Error deleting attachment:", error)
      alert("Failed to delete attachment")
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Attachments</CardTitle>
          <CardDescription>
            Drag and drop files here or click to select files to attach to your emails
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? "border-primary bg-primary/5" : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            {isDragActive ? (
              <p>Drop the files here...</p>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  Drag & drop files here, or click to select files
                </p>
                <Button variant="outline" disabled={isUploading}>
                  <Upload className="mr-2 h-4 w-4" />
                  {isUploading ? "Uploading..." : "Choose Files"}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {attachments && attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Attached Files ({attachments.length})</CardTitle>
            <CardDescription>
              These files will be included with your email campaign
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {attachments.map((attachment) => (
                <div
                  key={attachment._id}
                  className="border rounded-lg p-4 flex items-start space-x-3 relative group hover:shadow-md transition-shadow"
                >
                  <div className="flex-shrink-0">{getFileIcon(attachment.mimeType)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{attachment.filename}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(attachment.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeAttachment(attachment._id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Attachment Guidelines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <p>• Maximum file size: 25 MB per attachment</p>
          <p>• Total attachment size per email: 25 MB</p>
          <p>• Supported file types: Documents, Images, Videos, Audio files</p>
          <p>• Avoid executable files (.exe, .bat, .cmd) as they may be blocked</p>
          <p>• Consider compressing large files to reduce size</p>
        </CardContent>
      </Card>
    </div>
  )
}