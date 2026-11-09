import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api, useApi } from '@/lib/api';
import type { Contact } from '@/lib/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

export default function NewReminderScreen() {
  const { data } = useApi<{ contacts: Contact[] }>('/api/contacts', 'cache:contacts');
  const contacts = useMemo(() => data?.contacts ?? [], [data]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('09:00');
  const [contactId, setContactId] = useState<string | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = contacts.find((contact) => contact.id === contactId);

  const filteredContacts = useMemo(() => {
    const query = customerQuery.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) =>
      `${contact.first_name} ${contact.last_name} ${contact.company ?? ''} ${contact.email ?? ''}`
        .toLowerCase()
        .includes(query)
    );
  }, [contacts, customerQuery]);

  async function save() {
    if (saving) return;
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!DATE_RE.test(date.trim())) {
      setError('Date must be YYYY-MM-DD');
      return;
    }
    if (!TIME_RE.test(time.trim())) {
      setError('Time must be HH:MM (24-hour)');
      return;
    }

    const scheduled = new Date(`${date.trim()}T${time.trim()}:00`);
    if (Number.isNaN(scheduled.getTime())) {
      setError('That date and time is not valid');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api('/api/reminders', {
        method: 'POST',
        body: {
          title: title.trim(),
          description: description.trim() || null,
          contact_id: contactId,
          scheduled_at: scheduled.toISOString(),
        },
      });
      router.replace('/reminders');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color="#b91c1c" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Reminder</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Follow up with client"
          />

          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Optional details…"
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.fieldLabel}>Customer</Text>
          <Pressable
            style={styles.select}
            onPress={() => {
              setCustomerQuery('');
              setCustomerOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Choose customer">
            <Text style={[styles.selectValue, !selected && styles.selectPlaceholder]}>
              {selected
                ? `${selected.first_name} ${selected.last_name}`
                : 'No customer'}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#4f46e5" />
          </Pressable>

          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.fieldLabel}>Date *</Text>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.timeField}>
              <Text style={styles.fieldLabel}>Time *</Text>
              <TextInput
                style={styles.input}
                value={time}
                onChangeText={setTime}
                placeholder="09:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
        </View>

        <Pressable
          style={[styles.primaryButton, saving && styles.buttonBusy]}
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Create reminder">
          <Text style={styles.primaryText}>
            {saving ? 'Creating…' : 'Create reminder'}
          </Text>
        </Pressable>
      </ScrollView>

      <Modal visible={customerOpen} animationType="slide" onRequestClose={() => setCustomerOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose customer</Text>
            <Pressable onPress={() => setCustomerOpen(false)} hitSlop={8}>
              <Text style={styles.modalDone}>Done</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.modalSearch}
            value={customerQuery}
            onChangeText={setCustomerQuery}
            placeholder="Search customers…"
            autoCapitalize="none"
          />
          <Pressable
            style={styles.pickerRow}
            onPress={() => {
              setContactId(null);
              setCustomerOpen(false);
            }}>
            <Text style={styles.pickerName}>No customer</Text>
            {!contactId ? <Ionicons name="checkmark" size={18} color="#4f46e5" /> : null}
          </Pressable>
          <FlatList
            data={filteredContacts}
            keyExtractor={(contact) => contact.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: contact }) => (
              <Pressable
                style={styles.pickerRow}
                onPress={() => {
                  setContactId(contact.id);
                  setCustomerOpen(false);
                }}>
                <View style={styles.pickerMain}>
                  <Text style={styles.pickerName}>
                    {contact.first_name} {contact.last_name}
                  </Text>
                  <Text style={styles.pickerSub} numberOfLines={1}>
                    {contact.company || contact.email || '—'}
                  </Text>
                </View>
                {contact.id === contactId ? (
                  <Ionicons name="checkmark" size={18} color="#4f46e5" />
                ) : null}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.pickerEmpty}>No customers match your search</Text>}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 9,
    padding: 12,
  },
  errorText: {
    flex: 1,
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 10,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  textarea: {
    minHeight: 90,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectValue: {
    fontSize: 16,
    color: '#111827',
  },
  selectPlaceholder: {
    color: '#9ca3af',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateField: {
    flex: 2,
    gap: 6,
  },
  timeField: {
    flex: 1,
    gap: 6,
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: '#4f46e5',
    borderRadius: 9,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonBusy: {
    opacity: 0.7,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  modal: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalDone: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4f46e5',
  },
  modalSearch: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  pickerMain: {
    flex: 1,
    gap: 2,
  },
  pickerName: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  pickerSub: {
    fontSize: 13,
    color: '#6b7280',
  },
  pickerEmpty: {
    textAlign: 'center',
    color: '#9ca3af',
    paddingVertical: 32,
    fontSize: 15,
  },
});
