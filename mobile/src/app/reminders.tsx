import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenState } from '@/components/screen-state';
import { api, useApi } from '@/lib/api';
import type { Reminder } from '@/lib/types';

const FILTERS = ['all', 'pending', 'completed'] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_COLORS: Record<string, string> = {
  pending: '#b45309',
  sent: '#1d4ed8',
  completed: '#15803d',
};

// Compared against render-time "now" without calling an impure function during
// render; reminders are re-evaluated whenever the screen is refreshed.
const LOADED_AT = Date.now();

export default function RemindersScreen() {
  const { data, loading, error, offline, refresh } = useApi<{
    reminders: Reminder[];
  }>('/api/reminders', 'cache:reminders');
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const reminders = useMemo(() => {
    const list = data?.reminders ?? [];
    if (filter === 'all') return list;
    return list.filter((reminder) => reminder.status === filter);
  }, [data, filter]);

  const complete = (reminder: Reminder) => {
    Alert.alert('Mark reminder complete?', reminder.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: async () => {
          setBusy(reminder.id);
          try {
            await api(`/api/reminders/${reminder.id}`, {
              method: 'PATCH',
              body: { status: 'completed' },
            });
            refresh();
          } catch (err) {
            Alert.alert(
              'Could not update reminder',
              err instanceof Error ? err.message : 'Please try again.'
            );
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const remove = (reminder: Reminder) => {
    Alert.alert('Delete reminder?', reminder.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(reminder.id);
          try {
            await api(`/api/reminders/${reminder.id}`, { method: 'DELETE' });
            refresh();
          } catch (err) {
            Alert.alert(
              'Could not delete reminder',
              err instanceof Error ? err.message : 'Please try again.'
            );
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <ScreenState loading={loading && !data} error={error} onRetry={refresh}>
      <View style={styles.top}>
        <Pressable
          style={styles.newButton}
          onPress={() => router.push('/reminder/new')}
          accessibilityRole="button"
          accessibilityLabel="New reminder">
          <Ionicons name="add" size={19} color="#ffffff" />
          <Text style={styles.newButtonText}>New reminder</Text>
        </Pressable>
        <View style={styles.filters}>
          {FILTERS.map((value) => {
            const active = filter === value;
            return (
              <Pressable
                key={value}
                onPress={() => setFilter(value)}
                style={[styles.filter, active && styles.filterActive]}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {value === 'all' ? 'All' : value}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {offline && <Text style={styles.offlineNote}>Offline — saved data</Text>}

      <FlatList
        data={reminders}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        renderItem={({ item }) => {
          const overdue =
            item.status === 'pending' &&
            new Date(item.scheduled_at).getTime() < LOADED_AT;
          return (
            <View style={styles.row}>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] ?? '#6b7280' }]} />
              <View style={styles.main}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {formatScheduled(item.scheduled_at)}
                  {item.contacts
                    ? ` · ${item.contacts.first_name} ${item.contacts.last_name}`
                    : ''}
                </Text>
                {overdue ? <Text style={styles.overdue}>Due</Text> : null}
                {item.description ? (
                  <Text style={styles.description} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              <View style={styles.actions}>
                {item.status !== 'completed' ? (
                  <Pressable
                    onPress={() => complete(item)}
                    disabled={busy === item.id}
                    style={styles.actionButton}
                    accessibilityLabel={`Complete ${item.title}`}>
                    <Ionicons name="checkmark-circle-outline" size={22} color="#16a34a" />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => remove(item)}
                  disabled={busy === item.id}
                  style={styles.actionButton}
                  accessibilityLabel={`Delete ${item.title}`}>
                  <Ionicons name="trash-outline" size={20} color="#9ca3af" />
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.empty}>
              {filter === 'all'
                ? 'No reminders yet. Create your first reminder.'
                : `No ${filter} reminders`}
            </Text>
          )
        }
      />
    </ScreenState>
  );
}

function formatScheduled(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  top: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4f46e5',
    borderRadius: 9,
    paddingVertical: 12,
  },
  newButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  filter: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#ffffff',
  },
  filterActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  filterText: {
    fontSize: 14,
    color: '#374151',
    textTransform: 'capitalize',
  },
  filterTextActive: {
    color: '#ffffff',
    fontWeight: '700',
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 10,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 6,
  },
  main: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  meta: {
    fontSize: 13,
    color: '#6b7280',
  },
  overdue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  description: {
    fontSize: 14,
    color: '#4b5563',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionButton: {
    padding: 6,
  },
  empty: {
    textAlign: 'center',
    color: '#9ca3af',
    paddingVertical: 40,
    fontSize: 15,
    paddingHorizontal: 24,
  },
});
