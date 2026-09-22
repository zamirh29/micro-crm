import Stripe from "stripe"

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  typescript: true,
})

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    priceId: null,
    description: "Perfect for getting started with a few clients.",
    features: [
      "Up to 50 contacts",
      "5 quotes per month",
      "3 invoices per month",
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
      "Custom branding",
      "Email templates",
      "Priority support",
    ],
  },
} as const
