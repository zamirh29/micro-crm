"use client"

import { Download } from "lucide-react"
import { toCsv } from "@/lib/csv"

interface ExportCsvButtonProps {
  filename: string
  headers: string[]
  rows: (string | number | null | undefined)[][]
  disabled?: boolean
}

export default function ExportCsvButton({
  filename,
  headers,
  rows,
  disabled = false,
}: ExportCsvButtonProps) {
  function handleExport() {
    const csv = toCsv(headers, rows)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download className="h-4 w-4" />
      Export CSV
    </button>
  )
}