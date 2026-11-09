import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MonthPicker } from '@/components/month-picker';
import { ProGate } from '@/components/pro-gate';
import { ScreenState } from '@/components/screen-state';
import { useApi } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Contact, MonthEndReport } from '@/lib/types';

function previousMonth(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

function isProError(message: string | null): boolean {
  return message?.includes('Pro feature') === true;
}

export default function MonthEndScreen() {
  const [month, setMonth] = useState(previousMonth);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');

  const path = useMemo(() => {
    const params = new URLSearchParams({ month });
    if (customerId) params.set('customer', customerId);
    return `/api/reports/month-end?${params.toString()}`;
  }, [month, customerId]);

  const { data, loading, error, offline, refresh } = useApi<MonthEndReport>(
    path,
    `cache:month-end:${month}:${customerId ?? 'all'}`
  );
  const { data: contactsData } = useApi<{ contacts: Contact[] }>(
    '/api/contacts',
    'cache:contacts'
  );

  const contacts = useMemo(() => contactsData?.contacts ?? [], [contactsData]);
  const filteredContacts = useMemo(() => {
    const query = customerQuery.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) =>
      `${contact.first_name} ${contact.last_name} ${contact.company ?? ''} ${contact.email ?? ''}`
        .toLowerCase()
        .includes(query)
    );
  }, [contacts, customerQuery]);

  if (isProError(error)) {
    return (
      <ProGate
        title="Month-End Reports are a Pro feature"
        description="Get a monthly sales snapshot with per-customer totals, costs, gross profit and margin."
        features={[
          'Monthly sales snapshot for any month',
          'Per-customer quoted, invoiced, paid and outstanding totals',
          'Costs, gross profit and margin for the month',
          'Review last month, any past month, or plan the current one',
        ]}
      />
    );
  }

  const selectedCustomer = contacts.find((contact) => contact.id === customerId);

  return (
    <ScreenState loading={loading && !data} error={error} onRetry={refresh}>
      {data ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
          {offline ? <Text style={styles.offlineNote}>Offline — saved data</Text> : null}

          <View style={styles.headerRow}>
            <View style={styles.headerMain}>
              <Text style={styles.title}>Month-End — {data.label}</Text>
              <Text style={styles.intro}>
                {data.includesSingleCustomer
                  ? `Sales snapshot for a single customer in ${data.label}.`
                  : `Sales snapshot for ${data.label}.`}
              </Text>
            </View>
            <MonthPicker value={month} onChange={setMonth} />
          </View>

          <Pressable
            style={styles.customerFilter}
            onPress={() => {
              setCustomerQuery('');
              setCustomerOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Filter by customer">
            <Ionicons name="person-outline" size={18} color="#4f46e5" />
            <Text style={styles.customerFilterText} numberOfLines={1}>
              {selectedCustomer
                ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
                : 'All customers'}
            </Text>
            {customerId ? (
              <Pressable
                onPress={() => setCustomerId(null)}
                hitSlop={8}
                accessibilityLabel="Clear customer filter">
                <Ionicons name="close-circle" size={19} color="#9ca3af" />
              </Pressable>
            ) : (
              <Ionicons name="chevron-down" size={18} color="#4f46e5" />
            )}
          </Pressable>

          <View style={styles.cards}>
            <SummaryCard
              label={`Quoted — ${data.label}`}
              value={formatMoney(data.totals.quotedTotal, data.currency)}
              color="#2563eb"
            />
            <SummaryCard
              label={`Invoiced — ${data.label}`}
              value={formatMoney(data.totals.invoicedTotal, data.currency)}
              color="#d97706"
            />
            <SummaryCard
              label={`Collected — ${data.label}`}
              value={formatMoney(data.totals.paidTotal, data.currency)}
              color="#16a34a"
            />
            <SummaryCard
              label="Outstanding at month end"
              value={formatMoney(data.totals.unpaidTotal, data.currency)}
              color="#dc2626"
            />
            <SummaryCard
              label={`Costs — ${data.label}`}
              value={formatMoney(data.expenses.total, data.currency)}
              color="#ea580c"
            />
            <SummaryCard
              label="Gross profit"
              value={formatMoney(data.grossProfit, data.currency)}
              color={data.grossProfit >= 0 ? '#059669' : '#dc2626'}
            />
          </View>

          <Text style={styles.sectionTitle}>Costs and profit — {data.label}</Text>
          <View style={styles.card}>
            <Text style={styles.sectionHint}>
              {data.marginPct === null
                ? 'No payments collected this month, so no margin can be calculated.'
                : `Collected ${formatMoney(
                    data.totals.paidTotal,
                    data.currency
                  )} less ${formatMoney(
                    data.expenses.total,
                    data.currency
                  )} of costs leaves a gross margin of ${data.marginPct.toFixed(1)}%.`}
            </Text>

            {data.expenses.byCategory.length > 0 ? (
              <>
                {data.expenses.byCategory.map((category) => {
                  const share =
                    data.expenses.total > 0
                      ? (category.amount / data.expenses.total) * 100
                      : 0;
                  return (
                    <View key={category.category} style={styles.costRow}>
                      <Text style={styles.costLabel}>{category.category}</Text>
                      <Text style={styles.costAmount}>
                        {formatMoney(category.amount, data.currency)}
                      </Text>
                      <Text style={styles.costShare}>{share.toFixed(0)}%</Text>
                    </View>
                  );
                })}
                <View style={styles.costTotalRow}>
                  <Text style={styles.costTotalLabel}>Total costs</Text>
                  <Text style={styles.costTotalAmount}>
                    {formatMoney(data.expenses.total, data.currency)}
                  </Text>
                  <Text style={styles.costShare}>100%</Text>
                </View>
              </>
            ) : (
              <Text style={styles.empty}>
                No costs recorded in {data.label}. Add this month&apos;s expenses in
                MicroCRM to see your true profit for the month.
              </Text>
            )}
          </View>

          <Text style={styles.sectionTitle}>Customer breakdown</Text>
          {data.rows.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.empty}>No sales activity in {data.label}.</Text>
            </View>
          ) : (
            data.rows.map((row) => (
              <View key={row.contactId} style={styles.customerCard}>
                <Text style={styles.customerName}>{row.name}</Text>
                {row.company || row.email ? (
                  <Text style={styles.customerSub} numberOfLines={1}>
                    {[row.company, row.email].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                <View style={styles.metricGrid}>
                  <Metric label="Quotes" value={String(row.quoteCount)} />
                  <Metric
                    label="Quoted"
                    value={formatMoney(row.quotedTotal, data.currency)}
                  />
                  <Metric label="Invoices" value={String(row.invoiceCount)} />
                  <Metric
                    label="Invoiced"
                    value={formatMoney(row.invoicedTotal, data.currency)}
                  />
                  <Metric
                    label="Collected"
                    value={formatMoney(row.paidTotal, data.currency)}
                    color="#16a34a"
                  />
                  <Metric
                    label="Outstanding"
                    value={
                      row.unpaidTotal > 0
                        ? formatMoney(row.unpaidTotal, data.currency)
                        : '—'
                    }
                    color={row.unpaidTotal > 0 ? '#dc2626' : undefined}
                  />
                </View>
              </View>
            ))
          )}

          <Text style={styles.footnote}>
            Quoted excludes drafts and rejected quotes. Invoiced excludes drafts.
            Outstanding is the value of sent and overdue invoices created in {data.label}.
            Collected counts payments received during the month. Costs are business
            expenses incurred in the month, so gross profit is what you actually kept.
          </Text>
        </ScrollView>
      ) : null}

      <Modal
        visible={customerOpen}
        animationType="slide"
        onRequestClose={() => setCustomerOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filter by customer</Text>
            <Pressable onPress={() => setCustomerOpen(false)} hitSlop={8}>
              <Text style={styles.modalDone}>Done</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.modalSearch}
            value={customerQuery}
            onChangeText={setCustomerQuery}
            placeholder="Search customers…"
            autoCapitalize="none"
          />
          <Pressable
            style={styles.pickerRow}
            onPress={() => {
              setCustomerId(null);
              setCustomerOpen(false);
            }}>
            <Text style={styles.pickerName}>All customers</Text>
            {!customerId ? <Ionicons name="checkmark" size={18} color="#4f46e5" /> : null}
          </Pressable>
          <FlatList
            data={filteredContacts}
            keyExtractor={(contact) => contact.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: contact }) => (
              <Pressable
                style={styles.pickerRow}
                onPress={() => {
                  setCustomerId(contact.id);
                  setCustomerOpen(false);
                }}>
                <View style={styles.pickerMain}>
                  <Text style={styles.pickerName}>
                    {contact.first_name} {contact.last_name}
                  </Text>
                  <Text style={styles.pickerSub} numberOfLines={1}>
                    {contact.company || contact.email || '—'}
                  </Text>
                </View>
                {contact.id === customerId ? (
                  <Ionicons name="checkmark" size={18} color="#4f46e5" />
                ) : null}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.pickerEmpty}>No customers found</Text>}
          />
        </View>
      </Modal>
    </ScreenState>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryAccent, { backgroundColor: color }]} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#f8fafc',
  },
  offlineNote: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerMain: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  intro: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginTop: 4,
  },
  customerFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 14,
  },
  customerFilterText: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  summaryCard: {
    width: '47.5%',
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    gap: 3,
    overflow: 'hidden',
  },
  summaryAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 22,
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 19,
    marginBottom: 6,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 6,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  costLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  costAmount: {
    fontSize: 14,
    color: '#111827',
  },
  costShare: {
    width: 40,
    textAlign: 'right',
    fontSize: 13,
    color: '#6b7280',
  },
  costTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
  },
  costTotalLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  costTotalAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  customerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 10,
    gap: 2,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  customerSub: {
    fontSize: 13,
    color: '#6b7280',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    rowGap: 10,
  },
  metric: {
    width: '33.33%',
    gap: 1,
  },
  metricLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  empty: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  footnote: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
    marginTop: 16,
  },
  modal: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalDone: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4f46e5',
  },
  modalSearch: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  pickerMain: {
    flex: 1,
    gap: 2,
  },
  pickerName: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  pickerSub: {
    fontSize: 13,
    color: '#6b7280',
  },
  pickerEmpty: {
    textAlign: 'center',
    color: '#9ca3af',
    paddingVertical: 32,
    fontSize: 15,
  },
});
