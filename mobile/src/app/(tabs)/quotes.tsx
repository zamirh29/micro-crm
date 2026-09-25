import { router } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenState } from '@/components/screen-state';
import { StatusChip } from '@/components/status-chip';
import { useApi } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Quote } from '@/lib/types';

const FILTERS = ['all', 'draft', 'sent', 'accepted', 'rejected', 'expired'] as const;
type Filter = (typeof FILTERS)[number];

export default function QuotesScreen() {
  const [status, setStatus] = useState<Filter>('all');
  const path = status === 'all' ? '/api/quotes' : `/api/quotes?status=${status}`;
  const { data, loading, error, offline, refresh } = useApi<{ quotes: Quote[] }>(
    path,
    `cache:quotes:${status}`
  );

  const quotes = data?.quotes ?? [];

  return (
    <ScreenState loading={loading && !data} error={error} onRetry={refresh}>
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((filter) => {
            const active = filter === status;
            return (
              <Pressable
                key={filter}
                onPress={() => setStatus(filter)}
                style={[styles.filter, active && styles.filterActive]}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {filter === 'all' ? 'All' : filter}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {offline && <Text style={styles.offlineNote}>Offline — saved data</Text>}
      <FlatList
        data={quotes}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/quote/${item.id}`)}>
            <View style={styles.main}>
              <Text style={styles.number}>{item.number}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {item.contacts
                  ? `${item.contacts.first_name} ${item.contacts.last_name}${
                      item.contacts.company ? ` · ${item.contacts.company}` : ''
                    }`
                  : item.title}
              </Text>
            </View>
            <Text style={styles.total}>{formatMoney(item.total, item.currency)}</Text>
            <StatusChip status={item.status} />
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.empty}>
              {status === 'all' ? 'No quotes yet' : `No ${status} quotes`}
            </Text>
          )
        }
      />
    </ScreenState>
  );
}

const styles = StyleSheet.create({
  filters: {
    paddingTop: 10,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filter: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  filterActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  filterText: {
    fontSize: 13,
    color: '#374151',
    textTransform: 'capitalize',
  },
  filterTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  offlineNote: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 6,
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
  number: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  sub: {
    fontSize: 12,
    color: '#6b7280',
  },
  total: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  empty: {
    textAlign: 'center',
    color: '#9ca3af',
    paddingVertical: 32,
    fontSize: 13,
  },
});
