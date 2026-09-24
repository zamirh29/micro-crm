export function getSuperAdminEmails(): string[] {
  const list = (
    process.env.SUPER_ADMIN_EMAILS ??
    process.env.SUPER_ADMIN_EMAIL ??
    ""
  )
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return list
}

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const emails = getSuperAdminEmails()
  if (emails.length === 0) return false
  return emails.includes(email.trim().toLowerCase())
}