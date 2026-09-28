"use client"

import { Trash2 } from "lucide-react"
import { deleteExpense } from "./actions"

export default function DeleteExpenseButton({ id }: { id: string }) {
  return (
    <form
      action={async () => {
        if (window.confirm("Delete this expense?")) {
          await deleteExpense(id)
        }
      }}
    >
      <button
        type="submit"
        aria-label="Delete expense"
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  )
}
