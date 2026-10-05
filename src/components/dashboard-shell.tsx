"use client"

import { useState } from "react"
import Sidebar from "@/components/sidebar"
import Header from "@/components/header"

interface DashboardShellProps {
  userEmail: string
  isSuperAdmin?: boolean
  companyName?: string
  companyLogo?: string | null
  banner?: React.ReactNode
  children: React.ReactNode
}

export default function DashboardShell({
  userEmail,
  isSuperAdmin = false,
  companyName,
  companyLogo,
  banner,
  children,
}: DashboardShellProps) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        isSuperAdmin={isSuperAdmin}
        companyName={companyName}
        companyLogo={companyLogo}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)] lg:pl-64">
        {banner}
        <Header userEmail={userEmail} onMenuClick={() => setNavOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {children}
        </main>
      </div>
    </div>
  )
}