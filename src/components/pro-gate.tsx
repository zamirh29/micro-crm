import Link from "next/link"
import { Crown, Check } from "lucide-react"

interface ProGateProps {
  title: string
  description: string
  features: string[]
}

export default function ProGate({
  title,
  description,
  features,
}: ProGateProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Crown className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
        <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-green-500" />
              {feature}
            </li>
          ))}
        </ul>
        <Link
          href="/dashboard/billing"
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Upgrade to Pro
        </Link>
        <p className="mt-4 text-xs text-muted-foreground">
          First 3 months free on Pro. Cancel anytime.
        </p>
      </div>
    </div>
  )
}