import { formatCurrency } from "@/lib/utils"

interface QuoteEmailProps {
  recipientName: string
  number: string
  title: string
  total: number
  currency?: string
  validUntil: string
  viewUrl: string
}

export function quoteEmail({
  recipientName,
  number,
  title,
  total,
  currency = "GBP",
  validUntil,
  viewUrl,
}: QuoteEmailProps): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #4f46e5; padding: 24px 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">MicroCRM</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #3f3f46; font-size: 16px;">Hi ${recipientName},</p>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 14px; line-height: 1.6;">
                A new quote has been prepared for you.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px; background-color: #f4f4f5; border-radius: 6px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color: #71717a; font-size: 13px; padding-bottom: 4px;">Quote Number</td>
                        <td align="right" style="color: #3f3f46; font-size: 13px; font-weight: 600; padding-bottom: 4px;">${number}</td>
                      </tr>
                      <tr>
                        <td style="color: #71717a; font-size: 13px; padding-bottom: 4px;">Title</td>
                        <td align="right" style="color: #3f3f46; font-size: 13px; font-weight: 600; padding-bottom: 4px;">${title}</td>
                      </tr>
                      <tr>
                        <td style="color: #71717a; font-size: 13px; padding-bottom: 4px;">Valid Until</td>
                        <td align="right" style="color: #3f3f46; font-size: 13px; font-weight: 600; padding-bottom: 4px;">${validUntil}</td>
                      </tr>
                      <tr>
                        <td style="color: #71717a; font-size: 13px;">Total</td>
                        <td align="right" style="color: #3f3f46; font-size: 16px; font-weight: 700;">${formatCurrency(total, currency)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="background-color: #4f46e5; border-radius: 6px;">
                    <a href="${viewUrl}" style="display: inline-block; padding: 12px 24px; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none;">View Quote</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; color: #a1a1aa; font-size: 12px; line-height: 1.6;">
                If you have any questions, please don't hesitate to reach out.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px; background-color: #f4f4f5; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px; text-align: center;">
                Sent via MicroCRM
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
