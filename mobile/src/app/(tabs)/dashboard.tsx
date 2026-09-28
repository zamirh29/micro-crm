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

type Card = {
  key: keyof DashboardData['counts'];
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
  tint: string;
  color: string;
};

const COUNT_CARDS: Card[] = [
  {
    key: 'customers',
    label: 'Customers',
    icon: 'people-outline',
    href: '/customers',
    tint: '#eef2ff',
    color: '#4f46e5',
  },
  {
    key: 'activeQuotes',
    label: 'Active quotes',
    icon: 'document-text-outline',
    href: '/quotes',
    tint: '#fffbeb',
    color: '#d97706',
  },
  {
    key: 'outstandingInvoices',
    label: 'Unpaid invoices',
    icon: 'receipt-outline',
    href: '/invoices',
    tint: '#fef2f2',
    color: '#dc2626',
  },
  {
    key: 'pendingReminders',
    label: 'Reminders',
    icon: 'alarm-outline',
    href: { pathname: '/invoices', params: { status: 'overdue' } },
    tint: '#f5f3ff',
    color: '#7c3aed',
  },
];

const COSTS_CARD = {
  icon: 'wallet-outline' as keyof typeof Ionicons.glyphMap,
  href: '/costs' as Href,
  tint: '#ecfdf5',
  color: '#059669',
};

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
            <Ionicons name="settings-outline" size={24} color="#4f46e5" />
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
                    style={({ pressed }) => [
                      styles.card,
                      { backgroundColor: card.tint },
                      pressed && styles.cardPressed,
                    ]}>
                    <View style={styles.cardTop}>
                      <View style={[styles.iconChip, { backgroundColor: '#ffffff' }]}>
                        <Ionicons name={card.icon} size={24} color={card.color} />
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                    </View>
                    <Text style={styles.cardValue}>{data?.counts[card.key] ?? 0}</Text>
                    <Text style={styles.cardLabel}>{card.label}</Text>
                  </Pressable>
                </Link>
              ))}
            </View>

            <View style={styles.cards}>
              <Link href={COSTS_CARD.href} asChild>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Costs. Track what your business spends"
                  style={({ pressed }) => [
                    styles.wideCard,
                    { backgroundColor: COSTS_CARD.tint },
                    pressed && styles.cardPressed,
                  ]}>
                  <View style={[styles.iconChip, { backgroundColor: '#ffffff' }]}>
                    <Ionicons name={COSTS_CARD.icon} size={24} color={COSTS_CARD.color} />
                  </View>
                  <View style={styles.wideCardBody}>
                    <Text style={styles.wideCardTitle}>Costs</Text>
                    <Text style={styles.wideCardSub}>Track what your business spends</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </Pressable>
              </Link>
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
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    width: '47.5%',
    minHeight: 132,
    justifyContent: 'space-between',
  },
  cardPressed: {
    opacity: 0.65,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconChip: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardValue: {
    fontSize: 34,
    fontWeight: '800',
    color: '#111827',
    marginTop: 10,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginTop: 2,
  },
  wideCard: {
    borderRadius: 16,
    padding: 16,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  wideCardBody: {
    flex: 1,
    gap: 2,
  },
  wideCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  wideCardSub: {
    fontSize: 14,
    color: '#6b7280',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 6,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  activityMain: {
    flex: 1,
    gap: 3,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  activitySub: {
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
