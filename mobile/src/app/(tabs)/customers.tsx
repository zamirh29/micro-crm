import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenState } from '@/components/screen-state';
import { StatusChip } from '@/components/status-chip';
import { useApi } from '@/lib/api';
import type { Contact } from '@/lib/types';

export default function CustomersScreen() {
  const { data, loading, error, offline, refresh } = useApi<{ contacts: Contact[] }>(
    '/api/contacts',
    'cache:contacts'
  );
  const [query, setQuery] = useState('');

  const contacts = useMemo(() => {
    const list = data?.contacts ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      `${c.first_name} ${c.last_name} ${c.company ?? ''} ${c.email ?? ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [data, query]);

  return (
    <ScreenState loading={loading && !data} error={error} onRetry={refresh}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search customers..."
          autoCapitalize="none"
        />
      </View>
      {offline && <Text style={styles.offlineNote}>Offline — saved data</Text>}
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(item.first_name?.[0] ?? '?').toUpperCase()}
                {(item.last_name?.[0] ?? '').toUpperCase()}
              </Text>
            </View>
            <View style={styles.main}>
              <Text style={styles.name}>
                {item.first_name} {item.last_name}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {item.company || item.email || '—'}
              </Text>
            </View>
            <StatusChip status={item.status} />
          </View>
        )}
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.empty}>
              {query ? 'No customers match your search' : 'No customers yet'}
            </Text>
          )
        }
      />
    </ScreenState>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  search: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    backgroundColor: '#ffffff',
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
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#4f46e5',
    fontWeight: '700',
    fontSize: 13,
  },
  main: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  sub: {
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
