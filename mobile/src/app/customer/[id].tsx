import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenState } from '@/components/screen-state';
import { StatusChip } from '@/components/status-chip';
import { api, useApi } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { Contact } from '@/lib/types';

const STATUSES = ['lead', 'prospect', 'client', 'inactive'] as const;
type Status = (typeof STATUSES)[number];

type DocSummary = {
  id: string;
  number: string;
  title: string;
  status: string;
  total: number;
  currency: string;
  created_at: string;
};

type CustomerDetail = Contact & {
  notes?: string | null;
  quotes?: DocSummary[];
  invoices?: (DocSummary & { due_date?: string | null })[];
};

type Form = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  status: Status;
  notes: string;
};

export default function CustomerDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { data, loading, error, refresh } = useApi<{ contact: CustomerDetail }>(
    id ? `/api/contacts/${id}` : null,
    `cache:contact:${id}`
  );
  const customer = data?.contact;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    if (!customer) return;
    setForm({
      first_name: customer.first_name ?? '',
      last_name: customer.last_name ?? '',
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      company: customer.company ?? '',
      status: customer.status,
      notes: customer.notes ?? '',
    });
    setEditing(true);
  }

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!form || saving) return;
    if (!form.first_name.trim()) {
      Alert.alert('First name is required', 'Please enter the customer’s first name.');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/contacts/${id}`, {
        method: 'PATCH',
        body: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          company: form.company.trim() || null,
          status: form.status,
          notes: form.notes.trim() || null,
        },
      });
      setEditing(false);
      setForm(null);
      refresh();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenState loading={loading && !customer} error={error} onRetry={refresh}>
      {customer && (
        <ScrollView contentContainerStyle={styles.content}>
          {editing && form ? (
            <>
              <Text style={styles.sectionTitle}>Edit customer</Text>
              <View style={styles.card}>
                <Field label="First name" value={form.first_name} onChangeText={(v) => update('first_name', v)} />
                <Field label="Last name" value={form.last_name} onChangeText={(v) => update('last_name', v)} />
                <Field
                  label="Email"
                  value={form.email}
                  onChangeText={(v) => update('email', v)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Field label="Phone" value={form.phone} onChangeText={(v) => update('phone', v)} keyboardType="phone-pad" />
                <Field label="Company" value={form.company} onChangeText={(v) => update('company', v)} />
                <Text style={styles.fieldLabel}>Status</Text>
                <View style={styles.statusRow}>
                  {STATUSES.map((status) => {
                    const active = form.status === status;
                    return (
                      <Pressable
                        key={status}
                        onPress={() => update('status', status)}
                        style={[styles.statusChip, active && styles.statusChipActive]}>
                        <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>{status}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.fieldLabel}>Notes</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  value={form.notes}
                  onChangeText={(v) => update('notes', v)}
                  multiline
                  placeholder="Anything worth remembering"
                  textAlignVertical="top"
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.headerRow}>
                <Text style={styles.name}>
                  {customer.first_name} {customer.last_name}
                </Text>
                <StatusChip status={customer.status} />
              </View>

              <View style={styles.card}>
                {customer.company ? <Row label="Company" value={customer.company} /> : null}
                {customer.email ? <Row label="Email" value={customer.email} /> : null}
                {customer.phone ? <Row label="Phone" value={customer.phone} /> : null}
                <Row label="Added" value={formatDate(customer.created_at)} />
              </View>

              {customer.notes ? (
                <>
                  <Text style={styles.sectionTitle}>Notes</Text>
                  <Text style={styles.notes}>{customer.notes}</Text>
                </>
              ) : null}

              <DocList title="Quotes" docs={customer.quotes ?? []} route="/quote" />
              <DocList title="Invoices" docs={customer.invoices ?? []} route="/invoice" />
            </>
          )}
        </ScrollView>
      )}

      <View style={styles.actions}>
        {editing ? (
          <>
            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={() => {
                setEditing(false);
                setForm(null);
              }}
              disabled={saving}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.primaryButton]} onPress={save} disabled={saving}>
              <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={[styles.button, styles.primaryButton]} onPress={startEditing}>
            <Text style={styles.primaryText}>Edit customer</Text>
          </Pressable>
        )}
      </View>
    </ScreenState>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} placeholder={label} {...props} />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function DocList({
  title,
  docs,
  route,
}: {
  title: string;
  docs: DocSummary[];
  route: '/quote' | '/invoice';
}) {
  if (docs.length === 0) return null;
  return (
    <>
      <Text style={styles.sectionTitle}>
        {title} ({docs.length})
      </Text>
      <View style={styles.card}>
        {docs.map((doc) => (
          <Pressable
            key={doc.id}
            onPress={() => router.push(`${route}/${doc.id}`)}
            style={({ pressed }) => [styles.docRow, pressed && styles.docRowPressed]}>
            <View style={styles.docMain}>
              <Text style={styles.docNumber}>{doc.number}</Text>
              <Text style={styles.docTitle} numberOfLines={1}>
                {doc.title}
              </Text>
            </View>
            <Text style={styles.docTotal}>{formatMoney(doc.total, doc.currency)}</Text>
            <StatusChip status={doc.status} />
          </Pressable>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 24,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    flexShrink: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  notes: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 19,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  rowValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  docRowPressed: {
    opacity: 0.6,
  },
  docMain: {
    flex: 1,
    gap: 2,
  },
  docNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  docTitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  docTotal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    backgroundColor: '#ffffff',
  },
  textarea: {
    minHeight: 90,
    paddingTop: 8,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  statusChipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  statusChipText: {
    fontSize: 13,
    color: '#374151',
    textTransform: 'capitalize',
  },
  statusChipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  secondaryText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 14,
  },
});
