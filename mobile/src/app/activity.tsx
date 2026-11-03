import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenState } from '@/components/screen-state';
import { api, useApi } from '@/lib/api';
import type {
  ActivityEntity,
  ActivityLogEntry,
  ActivityResponse,
} from '@/lib/types';

const ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  restored: 'Restored',
};

const ACTION_COLORS: Record<string, string> = {
  created: '#16a34a',
  updated: '#2563eb',
  deleted: '#dc2626',
  restored: '#4f46e5',
};

const ENTITY_LABELS: Record<ActivityEntity, string> = {
  contact: 'Customer',
  quote: 'Quote',
  invoice: 'Invoice',
  reminder: 'Reminder',
};

const ENTITY_ICONS: Record<ActivityEntity, keyof typeof Ionicons.glyphMap> = {
  contact: 'people-outline',
  quote: 'document-text-outline',
  invoice: 'receipt-outline',
  reminder: 'notifications-outline',
};

interface Section {
  title: string;
  data: ActivityLogEntry[];
}

export default function ActivityScreen() {
  const { data, loading, error, offline, refresh } = useApi<ActivityResponse>(
    '/api/activity',
    'cache:activity'
  );
  const [restoring, setRestoring] = useState<string | null>(null);

  const sections = useMemo<Section[]>(() => {
    const groups: Section[] = [];
    for (const log of data?.logs ?? []) {
      const label = dayLabel(log.created_at);
      const last = groups[groups.length - 1];
      if (last && last.title === label) last.data.push(log);
      else groups.push({ title: label, data: [log] });
    }
    return groups;
  }, [data]);

  const proGate = error === 'Activity Log is a Pro feature';

  const restore = (log: ActivityLogEntry) => {
    Alert.alert(
      'Restore this item?',
      `${log.label} will be added back to your workspace.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setRestoring(log.id);
            try {
              const result = await api<{ success: string }>(
                `/api/activity/${log.id}/restore`,
                { method: 'POST' }
              );
              Alert.alert('Restored', result.data.success);
              refresh();
            } catch (err) {
              Alert.alert(
                'Could not restore',
                err instanceof Error ? err.message : 'Please try again.'
              );
            } finally {
              setRestoring(null);
            }
          },
        },
      ]
    );
  };

  if (proGate) {
    return (
      <View style={styles.gate}>
        <Ionicons name="time-outline" size={40} color="#4f46e5" />
        <Text style={styles.gateTitle}>Activity Log is a Pro feature</Text>
        <Text style={styles.gateText}>
          See the last {data?.windowDays ?? 10} days of activity in your workspace and
          restore anything you delete by accident.
        </Text>
        <Pressable style={styles.gateButton} onPress={() => router.push('/settings')}>
          <Text style={styles.gateButtonText}>Upgrade in Settings</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScreenState loading={loading && !data} error={error} onRetry={refresh}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            {offline && <Text style={styles.offlineNote}>Offline — saved data</Text>}
            <Text style={styles.intro}>
              The last {data?.windowDays ?? 10} days of activity in your workspace.
              Deleted items can be restored if within that window.
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const color = ACTION_COLORS[item.action] ?? '#6b7280';
          const canRestore =
            item.action === 'deleted' && !item.restored && Boolean(item.payload);
          const busy = restoring === item.id;

          return (
            <View style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons
                  name={ENTITY_ICONS[item.entity] ?? 'notifications-outline'}
                  size={18}
                  color="#6b7280"
                />
              </View>

              <View style={styles.main}>
                <Text style={styles.label} numberOfLines={2}>
                  {item.label}
                </Text>
                <View style={styles.metaRow}>
                  <View style={[styles.actionChip, { backgroundColor: `${color}1a` }]}>
                    <Text style={[styles.actionText, { color }]}>
                      {ACTION_LABELS[item.action] ?? item.action}
                    </Text>
                  </View>
                  <Text style={styles.meta}>
                    {ENTITY_LABELS[item.entity] ?? item.entity} ·{' '}
                    {timeAgo(item.created_at)}
                  </Text>
                </View>
              </View>

              {canRestore ? (
                <Pressable
                  style={[styles.restore, busy && styles.restoreBusy]}
                  onPress={() => restore(item)}
                  disabled={busy}
                  accessibilityLabel={`Restore ${item.label}`}>
                  {busy ? (
                    <ActivityIndicator size="small" color="#4f46e5" />
                  ) : (
                    <Text style={styles.restoreText}>Restore</Text>
                  )}
                </Pressable>
              ) : item.action === 'deleted' && item.restored ? (
                <Text style={styles.restored}>Restored</Text>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No activity yet</Text>
              <Text style={styles.emptyText}>
                Create, update or delete customers, quotes, invoices or reminders and
                they&apos;ll show up here.
              </Text>
            </View>
          )
        }
      />
    </ScreenState>
  );
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
  },
  intro: {
    fontSize: 14,
    color: '#6b7280',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    lineHeight: 20,
  },
  offlineNote: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
    marginBottom: 4,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#6b7280',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    gap: 5,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  meta: {
    fontSize: 12,
    color: '#6b7280',
  },
  restore: {
    minWidth: 72,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4f46e5',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  restoreBusy: {
    opacity: 0.7,
  },
  restoreText: {
    color: '#4f46e5',
    fontSize: 13,
    fontWeight: '700',
  },
  restored: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4f46e5',
  },
  empty: {
    marginHorizontal: 16,
    marginTop: 24,
    padding: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
  },
  gateTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  gateText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 21,
  },
  gateButton: {
    marginTop: 12,
    backgroundColor: '#4f46e5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 9,
  },
  gateButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
