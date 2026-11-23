import type { Metadata } from "next"
import BankFeedClient from "@/components/bank-feed-client"

export const metadata: Metadata = {
  title: "Bank feed · MicroCRM",
  description: "Connect bank accounts read-only and review transactions.",
}

export default function BankFeedPage() {
  return <BankFeedClient />
}
