import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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

import { ScreenState } from '@/components/screen-state';
import { api, useApi } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Contact, Invoice } from '@/lib/types';

const CURRENCIES = [
  { code: 'GBP', label: 'British Pound' },
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'NZD', label: 'New Zealand Dollar' },
  { code: 'CHF', label: 'Swiss Franc' },
  { code: 'JPY', label: 'Japanese Yen' },
  { code: 'CNY', label: 'Chinese Yuan' },
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'AED', label: 'UAE Dirham' },
  { code: 'SAR', label: 'Saudi Riyal' },
  { code: 'ZAR', label: 'South African Rand' },
  { code: 'BRL', label: 'Brazilian Real' },
  { code: 'MXN', label: 'Mexican Peso' },
  { code: 'SGD', label: 'Singapore Dollar' },
  { code: 'HKD', label: 'Hong Kong Dollar' },
  { code: 'SEK', label: 'Swedish Krona' },
  { code: 'NOK', label: 'Norwegian Krone' },
  { code: 'DKK', label: 'Danish Krone' },
  { code: 'PLN', label: 'Polish Złoty' },
  { code: 'TRY', label: 'Turkish Lira' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PAGE_OPTIONS = { title: 'Edit invoice' };

type Form = {
  contact_id: string;
  title: string;
  description: string;
  tax_rate: string;
  notes: string;
  due_date: string;
  currency: string;
};

type Item = { key: string; description: string; quantity: string; unit_price: string };

export default function InvoiceEditScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { data, loading, error, refresh } = useApi<{ invoice: Invoice; can_edit: boolean }>(
    id ? `/api/invoices/${id}` : null,
    `cache:invoice:${id}`
  );
  const invoice = data?.invoice;
  const canEdit = data?.can_edit === true;

  return (
    <>
      <Stack.Screen options={PAGE_OPTIONS} />
      <ScreenState loading={loading && !invoice} error={error} onRetry={refresh}>
        {!invoice ? (
          <Notice
            title="Invoice unavailable"
            body="This invoice could not be found. It may have been deleted."
          />
        ) : !canEdit ? (
          <Notice
            title="This invoice cannot be edited"
            body="Editing invoices and quotes is a Pro feature. Upgrade at crm.dtmstechsolutions.co.uk to make changes after an invoice has been created."
          />
        ) : (
          <InvoiceEditForm key={id} id={id} invoice={invoice} />
        )}
      </ScreenState>
    </>
  );
}

function InvoiceEditForm({ id, invoice }: { id: string; invoice: Invoice }) {
  const [form, setForm] = useState<Form>(() => seedForm(invoice));
  const [items, setItems] = useState<Item[]>(() => seedItems(invoice));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [currencyOpen, setCurrencyOpen] = useState(false);

  const {
    data: contactsData,
    loading: contactsLoading,
    error: contactsError,
  } = useApi<{ contacts: Contact[] }>('/api/contacts', 'cache:contacts');

  const contacts = contactsData?.contacts ?? [];

  const taxRate = parseTaxRate(form.tax_rate);
  const subtotal = items.reduce(
    (sum, item) => sum + parseQuantity(item.quantity) * parsePrice(item.unit_price),
    0
  );
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + taxAmount;

  const customerQueryTrimmed = customerQuery.trim().toLowerCase();
  const filteredContacts = customerQueryTrimmed
    ? contacts.filter((contact) =>
        `${contact.first_name} ${contact.last_name} ${contact.company ?? ''} ${contact.email ?? ''}`
          .toLowerCase()
          .includes(customerQueryTrimmed)
      )
    : contacts;

  const selected = contacts.find((contact) => contact.id === form.contact_id);
  const brief = invoice.contacts;
  const contactLabel = selected
    ? `${selected.first_name} ${selected.last_name}`
    : form.contact_id === invoice.contact_id && brief
      ? `${brief.first_name} ${brief.last_name}`
      : form.contact_id
        ? 'Customer unavailable'
        : 'Choose a customer';

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateItem(index: number, patch: Partial<Omit<Item, 'key'>>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { key: `new-${prev.length}-${Date.now()}`, description: '', quantity: '1', unit_price: '' },
    ]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    if (saving) return;
    const validationError = validate(form, items);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        contact_id: form.contact_id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        tax_rate: parseTaxRate(form.tax_rate),
        notes: form.notes.trim() || null,
        currency: form.currency,
        items: items.map((item) => ({
          description: item.description.trim(),
          quantity: Number.parseFloat(item.quantity),
          unit_price: Math.round(parsePrice(item.unit_price) * 100),
        })),
      };
      body.due_date = form.due_date.trim() || null;

      await api(`/api/invoices/${id}`, { method: 'PATCH', body });
      await AsyncStorage.removeItem(`cache:invoice:${id}`).catch(() => {});
      router.back();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong');
      setSaving(false);
    }
  }

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  // The options object identity must stay stable across renders — React Navigation
  // re-applies the header every time it changes.
  const headerOptions = useMemo(
    () => ({
      headerRight: () => (
        <Pressable
          onPress={() => {
            void saveRef.current();
          }}
          disabled={saving}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Save invoice"
          style={styles.headerButton}>
          <Text style={[styles.headerButtonText, saving && styles.headerButtonTextBusy]}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      ),
    }),
    [saving]
  );

  return (
    <>
      <Stack.Screen options={headerOptions} />
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          {formError ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={18} color="#b91c1c" />
              <Text style={styles.errorText}>{formError}</Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.card}>
            <Field label="Customer">
              <Pressable
                style={styles.select}
                onPress={() => {
                  setCustomerQuery('');
                  setCustomerOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Choose customer">
                <Text
                  style={[styles.selectValue, !selected && !brief && styles.selectPlaceholder]}>
                  {contactLabel}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#4f46e5" />
              </Pressable>
            </Field>

            <Field label="Title">
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={(value) => update('title', value)}
                placeholder="Invoice for services"
              />
            </Field>

            <Field label="Due date" hint="YYYY-MM-DD">
              <TextInput
                style={styles.input}
                value={form.due_date}
                onChangeText={(value) => update('due_date', value)}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
              />
            </Field>

            <Field label="Currency">
              <Pressable
                style={styles.select}
                onPress={() => setCurrencyOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose currency">
                <Text style={styles.selectValue}>
                  {form.currency} — {currencyLabel(form.currency)}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#4f46e5" />
              </Pressable>
            </Field>

            <Field label="Tax rate %" hint="Between 0 and 100, e.g. 20">
              <TextInput
                style={styles.input}
                value={form.tax_rate}
                onChangeText={(value) => update('tax_rate', value)}
                placeholder="0"
                keyboardType="decimal-pad"
              />
            </Field>

            <Field label="Description">
              <TextInput
                style={[styles.input, styles.textarea]}
                value={form.description}
                onChangeText={(value) => update('description', value)}
                placeholder="Optional description or scope of work"
                multiline
                textAlignVertical="top"
              />
            </Field>
          </View>

          <Text style={styles.sectionTitle}>Line items</Text>
          <View style={styles.card}>
            {items.map((item, index) => (
              <View key={item.key} style={styles.itemCard}>
                <View style={styles.itemTop}>
                  <TextInput
                    style={[styles.input, styles.itemDescription]}
                    value={item.description}
                    onChangeText={(value) => updateItem(index, { description: value })}
                    placeholder="Item description"
                  />
                  <Pressable
                    onPress={() => removeItem(index)}
                    disabled={items.length === 1}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove line item ${index + 1}`}
                    style={[styles.itemRemove, items.length === 1 && styles.itemRemoveDisabled]}>
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={items.length === 1 ? '#d1d5db' : '#9ca3af'}
                    />
                  </Pressable>
                </View>
                <View style={styles.itemFields}>
                  <View style={styles.itemQtyWrap}>
                    <Text style={styles.itemFieldLabel}>Qty</Text>
                    <TextInput
                      style={[styles.input, styles.itemQty]}
                      value={item.quantity}
                      onChangeText={(value) => updateItem(index, { quantity: value })}
                      placeholder="1"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.itemPriceWrap}>
                    <Text style={styles.itemFieldLabel}>Unit price</Text>
                    <TextInput
                      style={[styles.input, styles.itemPrice]}
                      value={item.unit_price}
                      onChangeText={(value) => updateItem(index, { unit_price: value })}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.itemTotalWrap}>
                    <Text style={styles.itemFieldLabel}>Amount</Text>
                    <Text style={styles.itemTotal}>
                      {formatMoney(
                        parseQuantity(item.quantity) * parsePrice(item.unit_price),
                        form.currency
                      )}
                    </Text>
                  </View>
                </View>
              </View>
            ))}

            <Pressable
              onPress={addItem}
              style={styles.addItem}
              accessibilityRole="button"
              accessibilityLabel="Add line item">
              <Ionicons name="add" size={16} color="#4f46e5" />
              <Text style={styles.addItemText}>Add line item</Text>
            </Pressable>
          </View>

          <View style={styles.totalsCard}>
            <TotalRow label="Subtotal" value={formatMoney(subtotal, form.currency)} />
            <TotalRow
              label={`Tax (${taxRate}%)`}
              value={formatMoney(taxAmount, form.currency)}
            />
            <TotalRow label="Total" value={formatMoney(total, form.currency)} emphasis />
          </View>

          <Text style={styles.sectionTitle}>Notes</Text>
          <View style={styles.card}>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.notes}
              onChangeText={(value) => update('notes', value)}
              placeholder="Payment terms, bank details, etc."
              multiline
              textAlignVertical="top"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={customerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCustomerOpen(false)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>Choose a customer</Text>
            <TextInput
              style={styles.input}
              value={customerQuery}
              onChangeText={setCustomerQuery}
              placeholder="Search customers..."
              autoCapitalize="none"
            />
            <View style={styles.pickerList}>
              <FlatList
                data={filteredContacts}
                keyExtractor={(contact) => contact.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: contact }) => (
                  <Pressable
                    style={styles.pickerRow}
                    onPress={() => {
                      update('contact_id', contact.id);
                      setCustomerOpen(false);
                      setCustomerQuery('');
                    }}>
                    <View style={styles.main}>
                      <Text style={styles.pickerName}>
                        {contact.first_name} {contact.last_name}
                      </Text>
                      <Text style={styles.pickerSub} numberOfLines={1}>
                        {contact.company || contact.email || '—'}
                      </Text>
                    </View>
                    {contact.id === form.contact_id ? (
                      <Ionicons name="checkmark" size={18} color="#4f46e5" />
                    ) : null}
                  </Pressable>
                )}
                ListEmptyComponent={
                  <Text style={styles.pickerEmpty}>
                    {contactsLoading
                      ? 'Loading customers…'
                      : contactsError
                        ? contactsError
                        : 'No customers match your search'}
                  </Text>
                }
              />
            </View>
            <Pressable style={styles.pickerDone} onPress={() => setCustomerOpen(false)}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={currencyOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCurrencyOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCurrencyOpen(false)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>Choose a currency</Text>
            <View style={styles.pickerList}>
              <FlatList
                data={CURRENCIES}
                keyExtractor={(currency) => currency.code}
                renderItem={({ item: currency }) => (
                  <Pressable
                    style={styles.pickerRow}
                    onPress={() => {
                      update('currency', currency.code);
                      setCurrencyOpen(false);
                    }}>
                    <View style={styles.main}>
                      <Text style={styles.pickerName}>
                        {currency.code} — {currency.label}
                      </Text>
                    </View>
                    {currency.code === form.currency ? (
                      <Ionicons name="checkmark" size={18} color="#4f46e5" />
                    ) : null}
                  </Pressable>
                )}
              />
            </View>
            <Pressable style={styles.pickerDone} onPress={() => setCurrencyOpen(false)}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.notice}>
      <Ionicons name="lock-closed-outline" size={28} color="#6b7280" />
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeBody}>{body}</Text>
      <Pressable style={styles.noticeButton} onPress={() => router.back()}>
        <Text style={styles.noticeButtonText}>Back</Text>
      </Pressable>
    </View>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

function TotalRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={[styles.totalValue, emphasis && styles.totalValueEmphasis]}>{value}</Text>
    </View>
  );
}

function seedForm(invoice: Invoice): Form {
  return {
    contact_id: invoice.contact_id ?? '',
    title: invoice.title ?? '',
    description: invoice.description ?? '',
    tax_rate: invoice.tax_rate === null || invoice.tax_rate === undefined
      ? '0'
      : String(invoice.tax_rate),
    notes: invoice.notes ?? '',
    due_date: invoice.due_date ?? '',
    currency: invoice.currency || 'GBP',
  };
}

function seedItems(invoice: Invoice): Item[] {
  const existing = invoice.invoice_items ?? [];
  if (existing.length === 0) {
    return [{ key: 'new-0', description: '', quantity: '1', unit_price: '' }];
  }
  return existing.map((item, index) => ({
    key: `item-${index}`,
    description: item.description ?? '',
    quantity: String(item.quantity ?? 1),
    unit_price: item.unit_price ? String(item.unit_price / 100) : '',
  }));
}

function validate(form: Form, items: Item[]): string | null {
  if (!form.contact_id) return 'Choose a customer';
  if (!form.title.trim()) return 'Title is required';
  const dueDate = form.due_date.trim();
  if (dueDate && !DATE_RE.test(dueDate)) return 'Due date must be YYYY-MM-DD';
  const tax = Number.parseFloat(form.tax_rate || '0');
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) return 'Tax rate must be between 0 and 100';
  if (items.length === 0) return 'Add at least one line item';
  for (const [index, item] of items.entries()) {
    if (!item.description.trim()) return `Line item ${index + 1} needs a description`;
    const quantity = Number.parseFloat(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return `Line item ${index + 1} needs a quantity greater than zero`;
    }
    const price = Number.parseFloat(item.unit_price || '0');
    if (!Number.isFinite(price) || price < 0) {
      return `Line item ${index + 1} needs a valid price`;
    }
  }
  return null;
}

function parseQuantity(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseTaxRate(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 0;
}

function parsePrice(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function currencyLabel(code: string): string {
  return CURRENCIES.find((currency) => currency.code === code)?.label ?? code;
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
  headerButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  headerButtonText: {
    color: '#4f46e5',
    fontSize: 17,
    fontWeight: '700',
  },
  headerButtonTextBusy: {
    color: '#a5b4fc',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    flex: 1,
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 12,
  },
  field: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  fieldHint: {
    fontSize: 13,
    color: '#9ca3af',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 17,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  textarea: {
    minHeight: 90,
    paddingTop: 8,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#ffffff',
  },
  selectValue: {
    flex: 1,
    fontSize: 17,
    color: '#111827',
  },
  selectPlaceholder: {
    color: '#9ca3af',
  },
  itemCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    gap: 10,
    backgroundColor: '#f9fafb',
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemDescription: {
    flex: 1,
    paddingVertical: 9,
  },
  itemRemove: {
    padding: 6,
  },
  itemRemoveDisabled: {
    opacity: 0.6,
  },
  itemFields: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  itemQtyWrap: {
    width: 70,
    gap: 4,
  },
  itemPriceWrap: {
    flex: 1,
    gap: 4,
  },
  itemTotalWrap: {
    alignItems: 'flex-end',
    gap: 4,
  },
  itemFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  itemQty: {
    paddingVertical: 9,
  },
  itemPrice: {
    paddingVertical: 9,
  },
  itemTotal: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    paddingVertical: 10,
  },
  addItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 11,
  },
  addItemText: {
    color: '#4f46e5',
    fontSize: 15,
    fontWeight: '600',
  },
  totalsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 10,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  totalLabel: {
    fontSize: 15,
    color: '#6b7280',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  totalValueEmphasis: {
    fontSize: 17,
    fontWeight: '800',
  },
  notice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
    backgroundColor: '#ffffff',
  },
  noticeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  noticeBody: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 21,
  },
  noticeButton: {
    marginTop: 8,
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  noticeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  pickerCard: {
    width: 380,
    maxWidth: '100%',
    maxHeight: '85%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  pickerList: {
    maxHeight: 340,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  main: {
    flex: 1,
    gap: 2,
  },
  pickerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  pickerSub: {
    fontSize: 14,
    color: '#6b7280',
  },
  pickerEmpty: {
    textAlign: 'center',
    color: '#9ca3af',
    paddingVertical: 24,
    fontSize: 15,
  },
  pickerDone: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pickerDoneText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
