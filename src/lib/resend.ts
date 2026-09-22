import { Resend } from "resend"

export const resend = new Resend(process.env.RESEND_API_KEY)

export const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL ?? "MicroCRM <noreply@dtmstechsolutions.co.uk>"

export async function sendEmail(params: {
  to: string[]
  subject: string
  html: string
  from?: string
}) {
  return resend.emails.send({
    from: params.from ?? EMAIL_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
  })
}
