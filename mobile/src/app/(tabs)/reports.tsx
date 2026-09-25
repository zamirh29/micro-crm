import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ScreenState } from '@/components/screen-state';
import { useApi } from '@/lib/api';
import { currentMonth, formatMoney, monthLabel, shiftMonth } from '@/lib/format';
import type { SalesReport } from '@/lib/types';

export default function ReportsScreen() {
  const [month, setMonth] = useState(currentMonth());
  const { data, loading, error, offline, refresh } = useApi<SalesReport>(
    `/api/reports/sales?month=${month}`,
    `cache:sales:${month}`
  );

  const totals = data?.totals;

  return (
    <ScreenState loading={loading && !data} error={error} onRetry={refresh}>
      <FlatList
        data={data?.rows ?? []}
        keyExtractor={(item) => item.contactId}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        ListHeaderComponent={
          <View>
            <View style={styles.monthNav}>
              <Pressable
                hitSlop={10}
                onPress={() => setMonth((m) => shiftMonth(m, -1))}
                style={styles.monthButton}>
                <Ionicons name="chevron-back" size={20} color="#4f46e5" />
              </Pressable>
              <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
              <Pressable
                hitSlop={10}
                onPress={() => setMonth((m) => shiftMonth(m, 1))}
                style={styles.monthButton}>
                <Ionicons name="chevron-forward" size={20} color="#4f46e5" />
              </Pressable>
            </View>
            {offline && <Text style={styles.offlineNote}>Offline — saved data</Text>}
            <View style={styles.cards}>
              <Stat label="Quoted" value={totals?.quotedTotal ?? 0} />
              <Stat label="Invoiced" value={totals?.invoicedTotal ?? 0} />
              <Stat label="Paid" value={totals?.paidTotal ?? 0} />
              <Stat label="Unpaid" value={totals?.unpaidTotal ?? 0} />
            </View>
            <Text style={styles.sectionTitle}>By customer</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.main}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {item.company ?? `${item.invoiceCount} invoice${item.invoiceCount === 1 ? '' : 's'}`}
              </Text>
            </View>
            <View style={styles.amounts}>
              <Text style={styles.paid}>{formatMoney(item.paidTotal)}</Text>
              <Text style={styles.unpaid}>
                {formatMoney(item.unpaidTotal)} due
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          loading ? null : <Text style={styles.empty}>No sales for {monthLabel(month)}</Text>
        }
      />
    </ScreenState>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardValue}>{formatMoney(value)}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  monthButton: {
    padding: 6,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  offlineNote: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 6,
    marginTop: 8,
  },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    width: '47.5%',
    gap: 2,
  },
  cardValue: {
    fontSize: 19,
    fontWeight: '800',
    color: '#111827',
  },
  cardLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  main: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  sub: {
    fontSize: 12,
    color: '#6b7280',
  },
  amounts: {
    alignItems: 'flex-end',
    gap: 2,
  },
  paid: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16a34a',
  },
  unpaid: {
    fontSize: 12,
    color: '#6b7280',
  },
  empty: {
    textAlign: 'center',
    color: '#9ca3af',
    paddingVertical: 32,
    fontSize: 13,
  },
});
