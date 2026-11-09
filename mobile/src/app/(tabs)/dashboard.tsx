import { Ionicons } from '@expo/vector-icons';
import { Link, useNavigation, type Href } from 'expo-router';
import { useLayoutEffect } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenState } from '@/components/screen-state';
import { StatusChip } from '@/components/status-chip';
import { API_URL, useApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { DashboardData } from '@/lib/types';

type Card = {
  key: keyof DashboardData['counts'];
  label: string;
  href: Href;
};

const COUNT_CARDS: Card[] = [
  {
    key: 'customers',
    label: 'Customers',
    href: '/customers',
  },
  {
    key: 'activeQuotes',
    label: 'Active quotes',
    href: '/quotes',
  },
  {
    key: 'outstandingInvoices',
    label: 'Unpaid invoices',
    href: '/invoices',
  },
  {
    key: 'pendingReminders',
    label: 'Reminders',
    href: '/reminders',
  },
];

const COSTS_CARD = {
  href: '/costs' as Href,
};

type Tool = {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  href?: Href;
  external?: string;
};

const QUICK_ACTIONS: Tool[] = [
  {
    label: 'New customer',
    description: 'Add a lead or client',
    icon: 'person-add-outline',
    href: '/customer/new' as Href,
  },
  {
    label: 'New quote',
    description: 'Send a price',
    icon: 'document-text-outline',
    href: '/quote/edit/new' as Href,
  },
  {
    label: 'New invoice',
    description: 'Bill a customer',
    icon: 'receipt-outline',
    href: '/invoice/edit/new' as Href,
  },
  {
    label: 'New reminder',
    description: 'Schedule a follow-up',
    icon: 'notifications-outline',
    href: '/reminder/new' as Href,
  },
];

const TOOLS: Tool[] = [
  {
    label: 'Reminders',
    description: 'Follow-ups and to-dos',
    icon: 'notifications-outline',
    href: '/reminders' as Href,
  },
  {
    label: 'Tax report',
    description: 'UK income tax and MTD',
    icon: 'calculator-outline',
    href: '/tax' as Href,
  },
  {
    label: 'Month-End report',
    description: 'Monthly sales and profit',
    icon: 'calendar-outline',
    href: '/month-end' as Href,
  },
  {
    label: 'Report emails',
    description: 'Scheduled reports to your inbox',
    icon: 'mail-outline',
    href: '/report-emails' as Href,
  },
  {
    label: 'Activity',
    description: 'See changes and restore deletes',
    icon: 'time-outline',
    href: '/activity' as Href,
  },
  {
    label: 'Import',
    description: 'Spreadsheets, PDFs and photos',
    icon: 'cloud-upload-outline',
    href: '/import' as Href,
  },
  {
    label: 'Exports',
    description: 'CSV for Xero, QuickBooks, Sage',
    icon: 'download-outline',
    href: '/exports' as Href,
  },
  {
    label: 'Making Tax Digital',
    description: 'Connect HMRC and submit VAT',
    icon: 'shield-checkmark-outline',
    href: '/hmrc' as Href,
  },
  {
    label: 'Billing',
    description: 'Manage your plan and invoices',
    icon: 'card-outline',
    href: '/billing' as Href,
  },
  {
    label: 'Guide',
    description: 'Product tour of MicroCRM',
    icon: 'book-outline',
    external: `${API_URL}/guide`,
  },
  {
    label: 'Manual',
    description: 'How every feature works',
    icon: 'bookmarks-outline',
    external: `${API_URL}/guide/manual`,
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
                <View key={card.key} style={styles.card}>
                  <Link href={card.href} asChild>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${card.label} count. Open ${card.label}`}
                      android_ripple={{ color: '#e5e7eb' }}>
                      <Text style={styles.cardValue}>{data?.counts[card.key] ?? 0}</Text>
                      <Text style={styles.cardLabel}>{card.label}</Text>
                    </Pressable>
                  </Link>
                </View>
              ))}
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Quick create</Text>
            <View style={styles.cards}>
              {QUICK_ACTIONS.map((action) => (
                <View key={action.label} style={styles.toolCard}>
                  <Link href={action.href as Href} asChild>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${action.label}. ${action.description}`}
                      android_ripple={{ color: '#e5e7eb' }}
                      style={styles.toolPress}>
                      <ToolBody tool={action} />
                    </Pressable>
                  </Link>
                </View>
              ))}
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Costs</Text>
            <View style={styles.cardsFlush}>
              <View style={styles.wideCard}>
                <Link href={COSTS_CARD.href} asChild>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Costs. Track what your business spends"
                    android_ripple={{ color: '#e5e7eb' }}>
                    <Text style={styles.cardValue}>Costs</Text>
                    <Text style={styles.cardLabel}>Track what your business spends</Text>
                  </Pressable>
                </Link>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="#6b7280"
                  style={styles.wideCardChevron}
                />
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Tools</Text>
            <View style={styles.cards}>
              {TOOLS.map((tool) => (
                <View key={tool.label} style={styles.toolCard}>
                  {tool.href ? (
                    <Link href={tool.href} asChild>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${tool.label}. ${tool.description}`}
                        android_ripple={{ color: '#e5e7eb' }}
                        style={styles.toolPress}>
                        <ToolBody tool={tool} />
                      </Pressable>
                    </Link>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${tool.label}. ${tool.description}`}
                      android_ripple={{ color: '#e5e7eb' }}
                      onPress={() => {
                        Linking.openURL(tool.external as string).catch(() => {});
                      }}
                      style={styles.toolPress}>
                      <ToolBody tool={tool} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.divider} />

            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
                Recent activity
              </Text>
              <Link href={'/activity' as Href} asChild>
                <Pressable hitSlop={8} accessibilityRole="button">
                  <Text style={styles.viewAll}>View all</Text>
                </Pressable>
              </Link>
            </View>
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

function ToolBody({ tool }: { tool: Tool }) {
  return (
    <>
      <View style={styles.toolIcon}>
        <Ionicons name={tool.icon} size={20} color="#4f46e5" />
      </View>
      <Text style={styles.toolLabel}>{tool.label}</Text>
      <Text style={styles.toolDescription}>{tool.description}</Text>
    </>
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
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    width: '47.5%',
    flexGrow: 0,
    flexShrink: 0,
    gap: 2,
    borderWidth: 1,
    borderColor: '#d1d5db',
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
  toolCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    width: '47.5%',
    flexGrow: 0,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#d1d5db',
    overflow: 'hidden',
  },
  toolPress: {
    padding: 12,
    gap: 4,
  },
  toolIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  toolLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  toolDescription: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingRight: 16,
  },
  sectionTitleInline: {
    flex: 1,
  },
  viewAll: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4f46e5',
    paddingBottom: 8,
  },
  wideCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    paddingRight: 36,
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
    gap: 2,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  cardsFlush: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 16,
    marginTop: 18,
  },
  wideCardChevron: {
    position: 'absolute',
    right: 14,
    top: '50%',
    marginTop: -10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
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
