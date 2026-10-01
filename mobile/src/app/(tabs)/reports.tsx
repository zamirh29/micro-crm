import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { MonthPicker } from '@/components/month-picker';
import { ScreenState } from '@/components/screen-state';
import { YearPicker } from '@/components/year-picker';
import { useApi } from '@/lib/api';
import { currentMonth, formatMoney, monthLabel } from '@/lib/format';
import type { SalesReport } from '@/lib/types';

type Mode = 'month' | 'year';

export default function ReportsScreen() {
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(() => String(new Date().getFullYear()));

  const query = useMemo(
    () =>
      mode === 'month'
        ? { path: `/api/reports/sales?month=${month}`, cacheKey: `cache:sales:${month}` }
        : {
            path: `/api/reports/sales?from=${year}-01-01&to=${year}-12-31`,
            cacheKey: `cache:sales:year:${year}`,
          },
    [mode, month, year]
  );

  const { data, loading, error, offline, refresh } = useApi<SalesReport>(
    query.path,
    query.cacheKey
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
            <View style={styles.modeWrap}>
              <View style={styles.segmentGroup}>
                {MODES.map((option) => {
                  const active = mode === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setMode(option.value)}
                      accessibilityRole="button"
                      accessibilityLabel={`${option.label} view`}
                      accessibilityState={{ selected: active }}
                      style={[styles.segment, active && styles.segmentActive]}>
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.monthNav}>
              {mode === 'month' ? (
                <MonthPicker value={month} onChange={setMonth} />
              ) : (
                <YearPicker value={year} onChange={setYear} />
              )}
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
          loading ? null : (
            <Text style={styles.empty}>
              No sales for {mode === 'month' ? monthLabel(month) : year}
            </Text>
          )
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

const MODES: { value: Mode; label: string }[] = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

const styles = StyleSheet.create({
  modeWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  segmentGroup: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: '#4f46e5',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  segmentTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  offlineNote: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    fontSize: 14,
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
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  cardLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  sectionTitle: {
    fontSize: 18,
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
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  main: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  sub: {
    fontSize: 14,
    color: '#6b7280',
  },
  amounts: {
    alignItems: 'flex-end',
    gap: 2,
  },
  paid: {
    fontSize: 17,
    fontWeight: '700',
    color: '#16a34a',
  },
  unpaid: {
    fontSize: 14,
    color: '#6b7280',
  },
  empty: {
    textAlign: 'center',
    color: '#9ca3af',
    paddingVertical: 32,
    fontSize: 15,
  },
});
