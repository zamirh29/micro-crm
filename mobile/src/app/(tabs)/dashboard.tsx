import { Ionicons } from '@expo/vector-icons';
import { Link, useNavigation, type Href } from 'expo-router';
import { useLayoutEffect } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenState } from '@/components/screen-state';
import { StatusChip } from '@/components/status-chip';
import { useApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { DashboardData } from '@/lib/types';

const COUNT_CARDS: {
  key: keyof DashboardData['counts'];
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
}[] = [
  { key: 'customers', label: 'Customers', icon: 'people-outline', href: '/customers' },
  { key: 'activeQuotes', label: 'Active quotes', icon: 'document-text-outline', href: '/quotes' },
  {
    key: 'outstandingInvoices',
    label: 'Unpaid invoices',
    icon: 'receipt-outline',
    href: '/invoices',
  },
  {
    key: 'pendingReminders',
    label: 'Reminders',
    icon: 'alarm-outline',
    href: { pathname: '/invoices', params: { status: 'overdue' } },
  },
];

export default function DashboardScreen() {
  const navigation = useNavigation();
  const { data, loading, error, offline, refresh } = useApi<DashboardData>(
    '/api/dashboard',
    'cache:dashboard'
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Link href="/settings" asChild>
          <Pressable hitSlop={10} style={styles.headerButton}>
            <Ionicons name="settings-outline" size={22} color="#4f46e5" />
          </Pressable>
        </Link>
      ),
    });
  }, [navigation]);

  return (
    <ScreenState loading={loading && !data} error={error} onRetry={refresh}>
      <FlatList
        data={data?.activities ?? []}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        ListHeaderComponent={
          <View>
            {offline && <Text style={styles.offlineNote}>Offline — saved data</Text>}
            <View style={styles.cards}>
              {COUNT_CARDS.map((card) => (
                <Link key={card.key} href={card.href} asChild>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${card.label} count. Open ${card.label}`}
                    style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
                    <Ionicons name={card.icon} size={20} color="#4f46e5" />
                    <Text style={styles.cardValue}>{data?.counts[card.key] ?? 0}</Text>
                    <Text style={styles.cardLabel}>{card.label}</Text>
                  </Pressable>
                </Link>
              ))}
            </View>
            <Text style={styles.sectionTitle}>Recent activity</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.activityRow}>
            <View style={styles.activityMain}>
              <Text style={styles.activityTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.activitySub}>
                {item.subtitle} · {formatDate(item.created_at)}
              </Text>
            </View>
            {item.status && <StatusChip status={item.status} />}
          </View>
        )}
        ListEmptyComponent={
          loading ? null : <Text style={styles.empty}>No recent activity yet</Text>
        }
      />
    </ScreenState>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    marginRight: 14,
  },
  offlineNote: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 14,
    width: '47.5%',
    gap: 2,
  },
  cardPressed: {
    opacity: 0.6,
  },
  cardValue: {
    fontSize: 26,
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
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  activityMain: {
    flex: 1,
    gap: 2,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  activitySub: {
    fontSize: 12,
    color: '#6b7280',
  },
  empty: {
    textAlign: 'center',
    color: '#9ca3af',
    paddingVertical: 24,
    fontSize: 13,
  },
});
