"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { deleteContact } from "../actions"

export default function ContactActions({ contactId }: { contactId: string }) {
  const router = useRouter()
  const [showDelete, setShowDelete] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    await deleteContact(contactId)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => router.push(`/dashboard/contacts/${contactId}/edit`)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>

      {!showDelete ? (
        <button
          onClick={() => setShowDelete(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Are you sure?</span>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {loading ? "Deleting..." : "Yes, delete"}
          </button>
          <button
            onClick={() => setShowDelete(false)}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
