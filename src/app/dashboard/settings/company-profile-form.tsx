"use client"

import { useState } from "react"
import { Loader2, Upload, X, Building2 } from "lucide-react"
import { updateCompanyProfile } from "./actions"
import type { CompanyProfile } from "@/lib/company"

interface CompanyProfileFormProps {
  company: CompanyProfile
}

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        const maxDim = 400
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext("2d")
        if (!ctx) return reject(new Error("Could not process image"))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL("image/png"))
      }
      img.onerror = () => reject(new Error("Invalid image"))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error("Could not read file"))
    reader.readAsDataURL(file)
  })
}

export default function CompanyProfileForm({
  company,
}: CompanyProfileFormProps) {
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logoData, setLogoData] = useState<string | null>(company.logoData)
  const [uploading, setUploading] = useState(false)

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const data = await resizeImage(file)
      setLogoData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload logo")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSaved(false)

    const form = e.currentTarget
    const formData = new FormData(form)
    formData.set("logo_data", logoData ?? "")

    try {
      await updateCompanyProfile(formData)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    "mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-lg border border-border bg-card p-6"
    >
      {saved && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          Settings saved.
        </div>
      )}
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground">
          Company Logo
        </label>
        <div className="mt-2 flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
            {logoData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoData}
                alt="Company logo"
                className="h-full w-full object-contain"
              />
            ) : (
              <Building2 className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
            </label>
            {logoData && (
              <button
                type="button"
                onClick={() => setLogoData(null)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                <X className="h-4 w-4" />
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          PNG, JPG or GIF. Recommended square, up to 400px.
        </p>
      </div>

      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-foreground"
        >
          Company Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={company.name}
          className={inputClass}
          placeholder="Acme Ltd"
        />
      </div>

      <div>
        <label
          htmlFor="address"
          className="block text-sm font-medium text-foreground"
        >
          Address
        </label>
        <textarea
          id="address"
          name="address"
          rows={3}
          defaultValue={company.address ?? ""}
          className={inputClass}
          placeholder="123 High Street, London, UK"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-foreground"
          >
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={company.phone ?? ""}
            className={inputClass}
            placeholder="+44 7700 900000"
          />
        </div>
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-foreground"
          >
            Contact Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={company.email ?? ""}
            className={inputClass}
            placeholder="hello@acme.co.uk"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="website"
          className="block text-sm font-medium text-foreground"
        >
          Website
        </label>
        <input
          id="website"
          name="website"
          type="text"
          defaultValue={company.website ?? ""}
          className={inputClass}
          placeholder="https://acme.co.uk"
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={loading || uploading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </form>
  )
}