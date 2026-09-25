import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer"
import type { Quote, QuoteItem, Contact } from "@/types/database"

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  companySection: {
    flex: 1,
  },
  logoImage: {
    width: 64,
    height: 64,
    objectFit: "contain",
    marginBottom: 8,
  },
  companyName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  quoteSection: {
    alignItems: "flex-end",
  },
  quoteLabel: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2563eb",
    marginBottom: 8,
  },
  quoteNumber: {
    fontSize: 12,
    color: "#666666",
    marginBottom: 2,
  },
  metaSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
    paddingTop: 20,
    borderTop: 1,
    borderTopColor: "#e5e7eb",
  },
  metaBlock: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#999999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 10,
    color: "#1a1a1a",
    lineHeight: 1.4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 1,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#6b7280",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  colDescription: {
    flex: 3,
  },
  colQty: {
    flex: 1,
    textAlign: "center",
  },
  colUnitPrice: {
    flex: 1.5,
    textAlign: "right",
  },
  colTotal: {
    flex: 1.5,
    textAlign: "right",
  },
  totalsSection: {
    marginTop: 20,
    alignItems: "flex-end",
  },
  totalsTable: {
    width: 250,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 10,
    color: "#6b7280",
  },
  totalValue: {
    fontSize: 10,
    color: "#1a1a1a",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 2,
    borderTopColor: "#1a1a1a",
    marginTop: 4,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontWeight: "bold",
  },
  grandTotalValue: {
    fontSize: 12,
    fontWeight: "bold",
  },
  notesSection: {
    marginTop: 40,
    paddingTop: 20,
    borderTop: 1,
    borderTopColor: "#e5e7eb",
  },
  notesLabel: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#999999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  notesText: {
    fontSize: 10,
    color: "#6b7280",
    lineHeight: 1.4,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
  },
  footerLine: {
    textAlign: "center",
    fontSize: 8,
    color: "#999999",
    lineHeight: 1.5,
  },
})

interface QuoteDocumentProps {
  quote: Quote
  items: QuoteItem[]
  contact: Contact | null
  companyName?: string
  companyLogo?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyWebsite?: string
}

function formatPence(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(amount / 100)
}

export default function QuoteDocument({
  quote,
  items,
  contact,
  companyName = "MicroCRM",
  companyLogo,
  companyAddress = "",
  companyPhone = "",
  companyEmail = "",
  companyWebsite = "",
}: QuoteDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.companySection}>
            {companyLogo && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={companyLogo} style={styles.logoImage} />
            )}
            <Text style={styles.companyName}>{companyName}</Text>
          </View>
          <View style={styles.quoteSection}>
            <Text style={styles.quoteLabel}>QUOTE</Text>
            <Text style={styles.quoteNumber}>{quote.number}</Text>
          </View>
        </View>

        <View style={styles.metaSection}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Bill To</Text>
            {contact && (
              <>
                <Text style={styles.metaValue}>
                  {contact.first_name} {contact.last_name}
                </Text>
                {contact.company && (
                  <Text style={styles.metaValue}>{contact.company}</Text>
                )}
                {contact.email && (
                  <Text style={styles.metaValue}>{contact.email}</Text>
                )}
                {contact.phone && (
                  <Text style={styles.metaValue}>{contact.phone}</Text>
                )}
              </>
            )}
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>
              {new Date(quote.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Valid Until</Text>
            <Text style={styles.metaValue}>
              {new Date(quote.valid_until).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </Text>
          </View>
        </View>

        <View>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colDescription]}>
              Description
            </Text>
            <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderText, styles.colUnitPrice]}>
              Unit Price
            </Text>
            <Text style={[styles.tableHeaderText, styles.colTotal]}>
              Total
            </Text>
          </View>
          {items.map((item, index) => (
            <View key={item.id ?? index} style={styles.tableRow}>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colUnitPrice}>
                {formatPence(item.unit_price, quote.currency)}
              </Text>
              <Text style={styles.colTotal}>
                {formatPence(item.total, quote.currency)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsSection}>
          <View style={styles.totalsTable}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>
                {formatPence(quote.subtotal, quote.currency)}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Tax ({quote.tax_rate}%)
              </Text>
              <Text style={styles.totalValue}>
                {formatPence(quote.tax_amount, quote.currency)}
              </Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>
                {formatPence(quote.total, quote.currency)}
              </Text>
            </View>
          </View>
        </View>

        {quote.notes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{quote.notes}</Text>
          </View>
        )}

        {quote.description && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Description</Text>
            <Text style={styles.notesText}>{quote.description}</Text>
          </View>
        )}

        <View style={styles.footer}>
          {companyAddress && (
            <Text style={styles.footerLine}>{companyAddress}</Text>
          )}
          {companyPhone && (
            <Text style={styles.footerLine}>Tel: {companyPhone}</Text>
          )}
          {companyEmail && (
            <Text style={styles.footerLine}>Email: {companyEmail}</Text>
          )}
          {companyWebsite && (
            <Text style={styles.footerLine}>Web: {companyWebsite}</Text>
          )}
          <Text style={styles.footerLine}>
            Thank you for your business
          </Text>
        </View>
      </Page>
    </Document>
  )
}
