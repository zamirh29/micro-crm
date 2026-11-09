import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '@/lib/api';

const STATUSES = ['lead', 'prospect', 'client', 'inactive'] as const;
type Status = (typeof STATUSES)[number];

type Form = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  status: Status;
  tax_rate: string;
  vat_registered: boolean;
  notes: string;
};

const EMPTY: Form = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  company: '',
  status: 'lead',
  tax_rate: '',
  vat_registered: false,
  notes: '',
};

export default function NewCustomerScreen() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (saving) return;
    if (!form.first_name.trim()) {
      setError('First name is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await api<{ contact: { id: string } }>('/api/contacts', {
        method: 'POST',
        body: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          company: form.company.trim() || null,
          status: form.status,
          tax_rate: form.tax_rate.trim() === '' ? null : Number(form.tax_rate),
          vat_registered: form.vat_registered,
          notes: form.notes.trim() || null,
        },
      });
      router.replace(`/customer/${result.data.contact.id}`);
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

        <Text style={styles.sectionTitle}>Customer details</Text>
        <View style={styles.card}>
          <Field
            label="First name *"
            value={form.first_name}
            onChangeText={(value) => update('first_name', value)}
            placeholder="John"
          />
          <Field
            label="Last name"
            value={form.last_name}
            onChangeText={(value) => update('last_name', value)}
            placeholder="Smith"
          />
          <Field
            label="Email"
            value={form.email}
            onChangeText={(value) => update('email', value)}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="john@example.com"
          />
          <Field
            label="Phone"
            value={form.phone}
            onChangeText={(value) => update('phone', value)}
            keyboardType="phone-pad"
            placeholder="07700 900000"
          />
          <Field
            label="Company"
            value={form.company}
            onChangeText={(value) => update('company', value)}
            placeholder="Company name"
          />
        </View>

        <Text style={styles.sectionTitle}>VAT and status</Text>
        <View style={styles.card}>
          <Field
            label="VAT Rate (%)"
            value={form.tax_rate}
            onChangeText={(value) => update('tax_rate', value)}
            keyboardType="decimal-pad"
            placeholder="20"
          />
          <Text style={styles.fieldLabel}>VAT Registered</Text>
          <View style={styles.chipRow}>
            {([true, false] as const).map((value) => {
              const active = form.vat_registered === value;
              return (
                <Pressable
                  key={String(value)}
                  onPress={() => update('vat_registered', value)}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {value ? 'Yes' : 'No'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.chipRow}>
            {STATUSES.map((status) => {
              const active = form.status === status;
              return (
                <Pressable
                  key={status}
                  onPress={() => update('status', status)}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {status}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Notes</Text>
        <View style={styles.card}>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={form.notes}
            onChangeText={(value) => update('notes', value)}
            multiline
            placeholder="Anything worth remembering"
            textAlignVertical="top"
          />
        </View>

        <Pressable
          style={[styles.primaryButton, saving && styles.buttonBusy]}
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save customer">
          <Text style={styles.primaryText}>
            {saving ? 'Saving…' : 'Create customer'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'decimal-pad';
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
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
    gap: 12,
  },
  field: {
    gap: 6,
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
    minHeight: 96,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 999,
    paddingHorizontal: 14,
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
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
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
});
