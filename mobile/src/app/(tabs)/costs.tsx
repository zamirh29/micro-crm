import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MonthPicker } from '@/components/month-picker';
import { ScreenState } from '@/components/screen-state';
import { api, useApi } from '@/lib/api';
import { currentMonth, formatDate, formatMoney, monthLabel } from '@/lib/format';
import type { Expense } from '@/lib/types';

const CATEGORIES = [
  'Parts & materials',
  'Travel',
  'Rent & utilities',
  'Phone & internet',
  'Insurance',
  'Tools & equipment',
  'Professional fees',
  'Marketing',
  'Other',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function CostsScreen() {
  const [month, setMonth] = useState(() => currentMonth());
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, loading, error, offline, refresh } = useApi<{
    expenses: Expense[];
    total: number;
  }>(`/api/expenses?month=${month}`, `cache:expenses:${month}`);

  const expenses = data?.expenses ?? [];
  const total = data?.total ?? 0;

  function resetForm() {
    setAmount('');
    setCategory('');
    setDescription('');
    setDate(new Date().toISOString().slice(0, 10));
  }

  async function submit() {
    const pounds = Number.parseFloat(amount);
    if (!Number.isFinite(pounds) || pounds <= 0) {
      setFormError('Enter an amount greater than zero');
      return;
    }
    const chosen = category.trim();
    if (!chosen) {
      setFormError('Pick a category or type your own');
      return;
    }
    if (date && !DATE_RE.test(date)) {
      setFormError('Date must be YYYY-MM-DD');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await api('/api/expenses', {
        method: 'POST',
        body: {
          amount: Math.round(pounds * 100),
          category: chosen,
          description: description.trim() || null,
          incurred_on: date || null,
        },
      });
      resetForm();
      setAdding(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  function remove(id: string) {
    Alert.alert('Delete expense', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          api(`/api/expenses/${id}`, { method: 'DELETE' })
            .then(() => refresh())
            .catch((err: unknown) =>
              Alert.alert('Could not delete', err instanceof Error ? err.message : 'Try again')
            );
        },
      },
    ]);
  }

  return (
    <ScreenState loading={loading && !data} error={error} onRetry={refresh}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={expenses}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
          ListHeaderComponent={
            <View>
              <View style={styles.header}>
                <MonthPicker value={month} onChange={setMonth} />
                <View style={styles.headerSpacer} />
                <Pressable
                  onPress={() => setAdding((value) => !value)}
                  accessibilityLabel={adding ? 'Cancel' : 'Add expense'}
                  style={[styles.addButton, adding && styles.addButtonActive]}>
                  <Ionicons name={adding ? 'close' : 'add'} size={16} color="#ffffff" />
                  <Text style={styles.addButtonText}>{adding ? 'Cancel' : 'Add'}</Text>
                </Pressable>
              </View>

              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>Spent in {monthLabel(month)}</Text>
                <Text style={styles.totalValue}>{formatMoney(total)}</Text>
                <Text style={styles.totalSub}>
                  {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'} recorded
                </Text>
              </View>

              {adding && (
                <View style={styles.form}>
                  {formError ? <Text style={styles.formError}>{formError}</Text> : null}

                  <TextInput
                    style={styles.input}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="Amount (£)"
                    keyboardType="decimal-pad"
                    autoFocus
                  />

                  <View style={styles.chips}>
                    {CATEGORIES.map((value) => {
                      const active = category === value;
                      return (
                        <Pressable
                          key={value}
                          onPress={() => setCategory(value)}
                          style={[styles.chip, active && styles.chipActive]}>
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {value}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <TextInput
                    style={styles.input}
                    value={category}
                    onChangeText={setCategory}
                    placeholder="Category — tap a chip or type your own"
                  />

                  <TextInput
                    style={styles.input}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Description (optional)"
                  />

                  <TextInput
                    style={styles.input}
                    value={date}
                    onChangeText={setDate}
                    placeholder="Date — YYYY-MM-DD"
                    keyboardType="numbers-and-punctuation"
                  />

                  <Pressable
                    onPress={submit}
                    disabled={saving}
                    style={[styles.saveButton, saving && styles.saveButtonDisabled]}>
                    <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save expense'}</Text>
                  </Pressable>
                </View>
              )}

              {offline ? <Text style={styles.offlineNote}>Offline — saved data</Text> : null}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.main}>
                <View style={styles.rowTop}>
                  <Text style={styles.category}>{item.category}</Text>
                  <Text style={styles.amount}>{formatMoney(item.amount)}</Text>
                </View>
                <Text style={styles.sub} numberOfLines={1}>
                  {formatDate(item.incurred_on)}
                  {item.description ? ` · ${item.description}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => remove(item.id)}
                hitSlop={8}
                accessibilityLabel="Delete expense">
                <Ionicons name="trash-outline" size={18} color="#9ca3af" />
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            loading ? null : (
              <Text style={styles.empty}>No expenses for {monthLabel(month)} yet</Text>
            )
          }
        />
      </KeyboardAvoidingView>
    </ScreenState>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  headerSpacer: {
    flex: 1,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#4f46e5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonActive: {
    backgroundColor: '#6b7280',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  totalCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  totalLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
  },
  totalSub: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  form: {
    margin: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    gap: 8,
  },
  formError: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 17,
    backgroundColor: '#ffffff',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  chipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  chipText: {
    fontSize: 14,
    color: '#374151',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  offlineNote: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 6,
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
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  category: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    flexShrink: 1,
  },
  amount: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  sub: {
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
