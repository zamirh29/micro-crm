/**
 * Web Pro trial. Stripe Checkout accepts a day count, so 90 days is how the web
 * implements the same 3-month trial offered in the mobile app and Google Play.
 */
export const PRO_TRIAL_MONTHS = 3
export const PRO_TRIAL_DAYS = 90
export const PRO_TRIAL_LABEL = `${PRO_TRIAL_MONTHS}-month free trial`

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
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
    description: `First ${PRO_TRIAL_MONTHS} months free, then unlimited everything for growing businesses.`,
    features: [
      "Unlimited leads & invoices",
      "Unlimited quotes",
      "Edit invoices and quotes after creation",
      "Automated reminders",
      "UK tax reports & MTD tracking",
      "Custom branding",
      "Email templates",
      "Automated report emails",
      "10-day activity log & restore",
      "Priority support",
    ],
  },
} as const
