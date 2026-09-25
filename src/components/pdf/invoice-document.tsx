import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer"
import type { Invoice, InvoiceItem, Contact } from "@/types/database"

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
  invoiceSection: {
    alignItems: "flex-end",
  },
  invoiceLabel: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2563eb",
    marginBottom: 8,
  },
  invoiceNumber: {
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
  statusValue: {
    fontSize: 10,
    fontWeight: "bold",
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

interface InvoiceDocumentProps {
  invoice: Invoice
  items: InvoiceItem[]
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

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export default function InvoiceDocument({
  invoice,
  items,
  contact,
  companyName = "MicroCRM",
  companyLogo,
  companyAddress = "",
  companyPhone = "",
  companyEmail = "",
  companyWebsite = "",
}: InvoiceDocumentProps) {
  const statusColor =
    invoice.status === "paid"
      ? "#16a34a"
      : invoice.status === "overdue"
        ? "#dc2626"
        : invoice.status === "sent"
          ? "#2563eb"
          : "#6b7280"

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
          <View style={styles.invoiceSection}>
            <Text style={styles.invoiceLabel}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{invoice.number}</Text>
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
            <Text style={styles.metaLabel}>Date Issued</Text>
            <Text style={styles.metaValue}>
              {formatDate(invoice.created_at)}
            </Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Due Date</Text>
            <Text style={styles.metaValue}>
              {formatDate(invoice.due_date)}
            </Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={[styles.statusValue, { color: statusColor }]}>
              {invoice.status.toUpperCase()}
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
                {formatPence(item.unit_price, invoice.currency)}
              </Text>
              <Text style={styles.colTotal}>
                {formatPence(item.total, invoice.currency)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsSection}>
          <View style={styles.totalsTable}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>
                {formatPence(invoice.subtotal, invoice.currency)}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Tax ({invoice.tax_rate}%)
              </Text>
              <Text style={styles.totalValue}>
                {formatPence(invoice.tax_amount, invoice.currency)}
              </Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>
                {formatPence(invoice.total, invoice.currency)}
              </Text>
            </View>
          </View>
        </View>

        {invoice.description && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Description</Text>
            <Text style={styles.notesText}>{invoice.description}</Text>
          </View>
        )}

        {invoice.notes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
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
