"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { History, Loader2, Undo2, X } from "lucide-react"
import { restoreEntry, type RestoreState } from "@/app/dashboard/activity/actions"
import { RESTORE_WINDOW_DAYS, type DeletedEntry } from "@/lib/activity"

export default function DeletedDocumentsTray({
  entries,
  entityLabel,
}: {
  entries: DeletedEntry[]
  entityLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<RestoreState | null>(null)
  const router = useRouter()

  if (entries.length === 0) return null

  function handleRestore(logId: string) {
    setFeedback(null)
    startTransition(async () => {
      const result = await restoreEntry(null, logId)
      setFeedback(result)
      if ("success" in result) {
        router.refresh()
        setOpen(false)
      }
    })
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/60 p-4 dark:border-red-950 dark:bg-red-950/30">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Undo2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <p className="text-sm font-medium">
            {entries.length} recently deleted{" "}
            {entityLabel.toLowerCase()}
            {entries.length === 1 ? "" : "s"} can be restored (last{" "}
            {RESTORE_WINDOW_DAYS} days)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm hover:bg-muted"
        >
          {open ? (
            <>
              <X className="h-3.5 w-3.5" />
              Hide
            </>
          ) : (
            <>
              <History className="h-3.5 w-3.5" />
              Show deleted
            </>
          )}
        </button>
      </div>

      {feedback && "error" in feedback && feedback.error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          {feedback.error}
        </p>
      )}

      {open && (
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.logId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{entry.label}</p>
                <p className="text-xs text-muted-foreground">
                  Deleted {new Date(entry.deletedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRestore(entry.logId)}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Undo2 className="h-3.5 w-3.5" />
                )}
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}