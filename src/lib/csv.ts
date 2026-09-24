export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const escapeCell = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return ""
    const str = String(value)
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines = [headers.map(escapeCell).join(",")]
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","))
  }
  return lines.join("\r\n")
}