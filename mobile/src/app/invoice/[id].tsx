import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenState } from '@/components/screen-state';
import { StatusChip } from '@/components/status-chip';
import { api, useApi } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { sharePdf } from '@/lib/share-pdf';
import type { Invoice } from '@/lib/types';

export default function InvoiceDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, error, refresh } = useApi<{ invoice: Invoice }>(
    id ? `/api/invoices/${id}` : null,
    `cache:invoice:${id}`
  );
  const invoice = data?.invoice;

  async function runAction(name: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    try {
      await action();
    } catch (err) {
      Alert.alert('Something went wrong', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setBusy(null);
    }
  }

  const send = () =>
    runAction('send', async () => {
      await api(`/api/invoices/${id}/send`, { method: 'POST' });
      refresh();
    });

  const markPaid = () =>
    runAction('paid', async () => {
      await api(`/api/invoices/${id}/mark-paid`, { method: 'POST' });
      refresh();
    });

  const downloadPdf = () =>
    runAction('pdf', async () => {
      await sharePdf(`/api/invoices/${id}/pdf`, `${invoice?.number ?? 'invoice'}.pdf`);
    });

  return (
    <ScreenState loading={loading && !invoice} error={error} onRetry={refresh}>
      {invoice && (
        <View style={styles.wrap}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.headerRow}>
              <Text style={styles.number}>{invoice.number}</Text>
              <StatusChip status={invoice.status} />
            </View>
            <Text style={styles.title}>{invoice.title}</Text>

            <View style={styles.card}>
              <Row label="Customer" value={customerName(invoice)} />
              {invoice.contacts?.company ? <Row label="Company" value={invoice.contacts.company} /> : null}
              {invoice.contacts?.email ? <Row label="Email" value={invoice.contacts.email} /> : null}
              <Row label="Created" value={formatDate(invoice.created_at)} />
              {invoice.due_date ? <Row label="Due date" value={formatDate(invoice.due_date)} /> : null}
            </View>

            <Text style={styles.sectionTitle}>Line items</Text>
            <View style={styles.card}>
              {invoice.invoice_items?.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemDescription}>{item.description}</Text>
                    <Text style={styles.itemMeta}>
                      {item.quantity} × {formatMoney(item.unit_price, invoice.currency)}
                    </Text>
                  </View>
                  <Text style={styles.itemTotal}>{formatMoney(item.total, invoice.currency)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.totals}>
              <Row label="Subtotal" value={formatMoney(invoice.subtotal, invoice.currency)} />
              <Row
                label={`Tax (${invoice.tax_rate}%)`}
                value={formatMoney(invoice.tax_amount, invoice.currency)}
              />
              <Row label="Total" value={formatMoney(invoice.total, invoice.currency)} emphasis />
            </View>

            {invoice.notes ? (
              <>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.notes}>{invoice.notes}</Text>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={downloadPdf}
              disabled={busy !== null}>
              <Text style={styles.secondaryText}>{busy === 'pdf' ? 'Preparing…' : 'PDF'}</Text>
            </Pressable>
            {invoice.status === 'draft' && (
              <Pressable
                style={[styles.button, styles.primaryButton]}
                onPress={send}
                disabled={busy !== null}>
                <Text style={styles.primaryText}>{busy === 'send' ? 'Sending…' : 'Send'}</Text>
              </Pressable>
            )}
            {invoice.status === 'sent' && (
              <Pressable
                style={[styles.button, styles.primaryButton]}
                onPress={markPaid}
                disabled={busy !== null}>
                <Text style={styles.primaryText}>
                  {busy === 'paid' ? 'Updating…' : 'Mark as paid'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </ScreenState>
  );
}

function customerName(invoice: Invoice): string {
  if (!invoice.contacts) return '—';
  return `${invoice.contacts.first_name} ${invoice.contacts.last_name}`;
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, emphasis && styles.rowValueEmphasis]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  number: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  title: {
    fontSize: 15,
    color: '#374151',
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  itemMain: {
    flex: 1,
    gap: 2,
  },
  itemDescription: {
    fontSize: 14,
    color: '#111827',
  },
  itemMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  totals: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  notes: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 19,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  rowValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  rowValueEmphasis: {
    fontSize: 16,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  secondaryText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 14,
  },
});
