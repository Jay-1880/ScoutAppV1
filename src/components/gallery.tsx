import { useEffect, useRef, useState, type FormEvent } from "react"
import { useMutation, useQuery } from "convex/react"
import { ImagePlus, Images, Trash2, X } from "lucide-react"

import frc1880Logo from "@/assets/frc1880.png"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"

const MAX_PHOTO_BYTES = 10 * 1024 * 1024

type GalleryPhoto = {
  _id: Id<"galleryPhotos">
  url: string | null
  caption?: string
  createdAt: number
  eventName?: string
  uploaderName: string
  canDelete: boolean
}

export function Gallery() {
  const photos = useQuery(api.gallery.listPhotos) as GalleryPhoto[] | undefined
  const generateUploadUrl = useMutation(api.gallery.generateUploadUrl)
  const addPhoto = useMutation(api.gallery.addPhoto)
  const deletePhoto = useMutation(api.gallery.deletePhoto)

  const [files, setFiles] = useState<File[]>([])
  const [caption, setCaption] = useState("")
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState("")
  const [openPhoto, setOpenPhoto] = useState<GalleryPhoto | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!openPhoto) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPhoto(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openPhoto])

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("")
    const valid = files.filter((file) => file.type.startsWith("image/") && file.size <= MAX_PHOTO_BYTES)
    if (valid.length === 0) {
      setStatus("Pick at least one image under 10 MB.")
      return
    }
    setUploading(true)
    try {
      for (const file of valid) {
        const uploadUrl = await generateUploadUrl()
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        })
        if (!response.ok) throw new Error("Upload failed. Check your connection and try again.")
        const { storageId } = (await response.json()) as { storageId: Id<"_storage"> }
        await addPhoto({ storageId, caption: caption || undefined })
      }
      const skipped = files.length - valid.length
      setStatus(`Posted ${valid.length} photo${valid.length === 1 ? "" : "s"}.${skipped ? ` Skipped ${skipped} (not an image or over 10 MB).` : ""}`)
      setFiles([])
      setCaption("")
      if (fileInput.current) fileInput.current.value = ""
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not post photos.")
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(photo: GalleryPhoto) {
    if (!window.confirm("Delete this photo from the gallery? This can't be undone.")) return
    try {
      await deletePhoto({ photoId: photo._id })
      setOpenPhoto(null)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete photo.")
    }
  }

  return (
    <section className="grid gap-4">
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <img src={frc1880Logo} alt="" className="size-10 rounded-md object-contain" />
          <div>
            <h2 className="text-lg font-semibold">Team gallery</h2>
            <p className="text-sm text-muted-foreground">Event photos from the Warriors of East Harlem. Only signed-in team members can see these.</p>
          </div>
        </div>
      </div>

      <form className="surface-card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(event) => void handleUpload(event)}>
        <div className="space-y-2">
          <Label htmlFor="galleryFiles">Photos</Label>
          <Input
            id="galleryFiles"
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="galleryCaption">Caption (optional)</Label>
          <Input
            id="galleryCaption"
            value={caption}
            maxLength={200}
            placeholder="Quals match 42, pit setup, awards…"
            onChange={(event) => setCaption(event.target.value)}
          />
        </div>
        <Button type="submit" className="h-9" disabled={uploading || files.length === 0}>
          <ImagePlus className="size-4" />
          {uploading ? "Posting…" : "Post"}
        </Button>
        {status ? <p className="text-sm text-muted-foreground sm:col-span-3">{status}</p> : null}
        <p className="text-xs text-muted-foreground sm:col-span-3">
          Only post photos people are okay with sharing with the team, and follow your team's photo rules for students.
        </p>
      </form>

      {photos === undefined ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="aspect-square animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
          <Images className="size-8" />
          <p className="font-medium text-foreground">No photos yet</p>
          <p className="text-sm">Post the first one from your next event.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo, index) => (
            <button
              key={photo._id}
              type="button"
              onClick={() => setOpenPhoto(photo)}
              className="gallery-tile group relative aspect-square overflow-hidden rounded-xl border bg-muted text-left"
              style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
            >
              {photo.url ? (
                <img src={photo.url} alt={photo.caption ?? "Team photo"} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
              ) : null}
              {photo.caption || photo.eventName ? (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-8 text-xs text-white opacity-90">
                  <div className="truncate font-medium">{photo.caption ?? photo.eventName}</div>
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {openPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenPhoto(null)}
        >
          <div className="relative flex max-h-full max-w-4xl flex-col gap-3" onClick={(event) => event.stopPropagation()}>
            {openPhoto.url ? (
              <img src={openPhoto.url} alt={openPhoto.caption ?? "Team photo"} className="max-h-[75svh] w-auto rounded-lg object-contain" />
            ) : null}
            <div className="flex flex-wrap items-start justify-between gap-3 text-white">
              <div>
                {openPhoto.caption ? <div className="font-medium">{openPhoto.caption}</div> : null}
                <div className="text-sm text-white/70">
                  {[openPhoto.eventName, openPhoto.uploaderName, new Date(openPhoto.createdAt).toLocaleDateString()].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="flex gap-2">
                {openPhoto.canDelete ? (
                  <Button variant="destructive" size="sm" onClick={() => void handleDelete(openPhoto)}>
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                ) : null}
                <Button variant="secondary" size="sm" onClick={() => setOpenPhoto(null)}>
                  <X className="size-4" />
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
