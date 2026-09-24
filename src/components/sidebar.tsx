"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  Bell,
  Settings,
  LogOut,
  Landmark,
  ShieldCheck,
  Cog,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { signOut } from "@/app/dashboard/actions"

interface SidebarProps {
  isSuperAdmin?: boolean
  companyName?: string
  companyLogo?: string | null
}

export default function Sidebar({
  isSuperAdmin = false,
  companyName = "MicroCRM",
  companyLogo,
}: SidebarProps) {
  const pathname = usePathname()

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Customers", href: "/dashboard/contacts", icon: Users },
    { label: "Quotes", href: "/dashboard/quotes", icon: FileText },
    { label: "Invoices", href: "/dashboard/invoices", icon: Receipt },
    { label: "Reminders", href: "/dashboard/reminders", icon: Bell },
    { label: "Billing", href: "/dashboard/billing", icon: Settings },
    { label: "Tax Report", href: "/dashboard/tax", icon: Landmark },
    { label: "Settings", href: "/dashboard/settings", icon: Cog },
    ...(isSuperAdmin
      ? [
          {
            label: "Admin",
            href: "/dashboard/admin",
            icon: ShieldCheck,
          },
        ]
      : []),
  ]

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        {companyLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={companyLogo}
            alt={companyName}
            className="h-8 w-8 rounded-md object-contain"
          />
        ) : null}
        <span className="truncate text-lg font-bold tracking-tight">
          {companyName}
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-4 space-y-2">
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  )
}
