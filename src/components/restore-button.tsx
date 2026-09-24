"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { History, Loader2 } from "lucide-react"
import { restoreEntry, type RestoreState } from "@/app/dashboard/activity/actions"

export default function RestoreButton({ logId }: { logId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<RestoreState | null>(null)

  function handleClick() {
    setFeedback(null)
    startTransition(async () => {
      const result = await restoreEntry(null, logId)
      setFeedback(result)
      if ("success" in result) {
        router.refresh()
      }
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <History className="h-3.5 w-3.5" />
        )}
        Restore
      </button>
      {feedback && "error" in feedback && (
        <span className="text-xs text-red-600">{feedback.error}</span>
      )}
    </span>
  )
}