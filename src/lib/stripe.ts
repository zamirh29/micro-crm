import Stripe from "stripe"

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
})

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    priceId: null,
    description: "Free for your first 90 days — no card required.",
    features: [
      "Up to 50 customers",
      "20 quotes per month",
      "20 invoices per month",
      "Basic reminders",
    ],
  },
  pro: {
    name: "Pro",
    price: 800,
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
    description: "Unlimited everything for growing sole traders.",
    features: [
      "Unlimited leads & invoices",
      "Unlimited quotes",
      "Automated reminders",
      "UK tax reports & MTD tracking",
      "Custom branding",
      "Email templates",
      "Priority support",
    ],
  },
} as const
