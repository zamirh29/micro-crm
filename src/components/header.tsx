import { Menu } from "lucide-react"

interface HeaderProps {
  userEmail: string
  onMenuClick?: () => void
}

export default function Header({ userEmail, onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background px-4 sm:px-6">
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="-ml-1 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <span className="max-w-[45vw] truncate text-sm text-muted-foreground sm:max-w-none">
          {userEmail}
        </span>
      </div>
    </header>
  )
}
