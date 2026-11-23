/**
 * Postgres cannot apply ON CONFLICT DO UPDATE twice to the same conflict key in
 * one INSERT statement. Guard every batch upsert so repeated provider or file
 * rows cannot abort the whole import.
 */
export function uniqueByKey<T>(
  rows: T[],
  getKey: (row: T) => string
): T[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = getKey(row)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
