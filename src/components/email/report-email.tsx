interface ReportEmailProps {
  companyName: string
  reportTitle: string
  periodLabel: string
  currency: string
  cards: { label: string; value: string }[]
  headers: string[]
  rows: string[][]
  viewUrl: string
  companyPhone?: string
  companyEmail?: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function reportEmail({
  companyName,
  reportTitle,
  periodLabel,
  currency,
  cards,
  headers,
  rows,
  viewUrl,
  companyPhone,
  companyEmail,
}: ReportEmailProps): string {
  const headerCells = headers
    .map(
      (h) =>
        `<th style="padding: 8px 10px; text-align: right; font-size: 11px; color: #71717a; font-weight: 600; border-bottom: 1px solid #e4e4e7; white-space: nowrap;">${escapeHtml(h)}</th>`
    )
    .join("")

  const bodyRows = rows
    .map((row, i) => {
      const cells = row
        .map(
          (cell, j) =>
            `<td style="padding: 8px 10px; font-size: 12px; color: ${
              i === rows.length - 1 ? "#18181b" : "#3f3f46"
            }; ${j === 0 ? "text-align: left;" : "text-align: right;"} ${
              i === rows.length - 1 ? "font-weight: 700; border-top: 1px solid #e4e4e7;" : ""
            } white-space: nowrap;">${escapeHtml(cell)}</td>`
        )
        .join("")
      return `<tr style="${
        i === rows.length - 1 ? "background-color: #f4f4f5;" : ""
      }">${cells}</tr>`
    })
    .join("")

  const cardsHtml = cards
    .map(
      (card) => `<td style="padding: 12px; text-align: center; vertical-align: top;">
        <div style="font-size: 11px; color: #71717a; margin-bottom: 4px;">${escapeHtml(card.label)}</div>
        <div style="font-size: 15px; color: #18181b; font-weight: 700; white-space: nowrap;">${escapeHtml(card.value)}</div>
      </td>`
    )
    .join("")

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
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">${escapeHtml(companyName)}</h1>
              <p style="margin: 4px 0 0; color: #c7d2fe; font-size: 13px;">${escapeHtml(reportTitle)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 8px;">
              <p style="margin: 0 0 16px; color: #71717a; font-size: 13px;">
                Here is your automated report for <strong style="color: #18181b;">${escapeHtml(periodLabel)}</strong>. All amounts in ${escapeHtml(currency)}.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                <tr>
                  ${cardsHtml}
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                <thead>
                  <tr>${headerCells}</tr>
                </thead>
                <tbody>
                  ${bodyRows}
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #4f46e5; border-radius: 6px;">
                    <a href="${escapeHtml(viewUrl)}" style="display: inline-block; padding: 12px 24px; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none;">Open ${escapeHtml(reportTitle)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px; background-color: #f4f4f5; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px; line-height: 1.6;">
                ${escapeHtml(companyName)}
                ${companyEmail ? ` &middot; <a href="mailto:${escapeHtml(companyEmail)}" style="color: #a1a1aa;">${escapeHtml(companyEmail)}</a>` : ""}
                ${companyPhone ? ` &middot; ${escapeHtml(companyPhone)}` : ""}
              </p>
              <p style="margin: 4px 0 0; color: #a1a1aa; font-size: 12px;">
                Sent via MicroCRM. Configure or pause this report in your dashboard.
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