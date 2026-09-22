interface HeaderProps {
  userEmail: string
}

export default function Header({ userEmail }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border bg-background px-6">
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{userEmail}</span>
      </div>
    </header>
  )
}
