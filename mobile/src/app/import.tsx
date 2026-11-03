import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api, upload } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type {
  ImportDraft,
  ImportKind,
  ImportLineItem,
  ImportOutcome,
  ImportParseResponse,
  ImportSheet,
} from '@/lib/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;

const PICKER_TYPES = [
  'application/pdf',
  'text/csv',
  'text/comma-separated-values',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel',
];

interface DraftRow {
  key: string;
  draft: ImportDraft;
}

function lineTotal(draft: ImportDraft): number {
  return draft.items.reduce(
    (sum, item) => sum + Math.round(item.unitPrice) * Math.max(1, Math.round(item.quantity)),
    0
  );
}

function parseMoney(value: string): number {
  const cleaned = value.replace(/[£$€,\s]/g, '');
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : NaN;
}

function moneyInput(pence: number): string {
  return (pence / 100).toFixed(2);
}

function rowsFromSheets(sheets: ImportSheet[]): DraftRow[] {
  const rows: DraftRow[] = [];
  for (const sheet of sheets) {
    sheet.drafts.forEach((draft, index) => {
      rows.push({
        key: `${sheet.id}-${draft.rowNumber}-${index}`,
        draft: { ...draft, sourceFile: draft.sourceFile ?? sheet.fileName },
      });
    });
  }
  return rows;
}

function validateDraft(draft: ImportDraft): string | null {
  if (!draft.documentDate) return 'Missing invoice/quote date';
  if (draft.items.length === 0) return 'No line items';
  if (!draft.customerName && !draft.customerCompany) return 'No customer name supplied';
  return null;
}

async function recogniseText(uri: string): Promise<string> {
  let ocr: typeof import('expo-mlkit-ocr');
  try {
    ocr = await import('expo-mlkit-ocr');
  } catch {
    throw new Error(
      'Photo reading needs the MicroCRM development build. Update the app, or import a PDF or CSV instead.'
    );
  }

  if (!ocr.isSupported()) {
    throw new Error('This device does not support on-device text recognition.');
  }

  const result = await ocr.recognizeText(uri);
  if (!result.text.trim()) {
    throw new Error(
      'No text was found in that photo. Try again with more light and the page flat.'
    );
  }
  return result.text;
}

export default function ImportScreen() {
  const [kind, setKind] = useState<ImportKind>('invoice');
  const [taxRate, setTaxRate] = useState('20');
  const [inPence, setInPence] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [rejected, setRejected] = useState<{ fileName: string; reason: string }[]>([]);
  const [truncatedFiles, setTruncatedFiles] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<DraftRow | null>(null);

  const review = rows.length > 0 || rejected.length > 0;
  const ready = rows.filter((row) => !row.draft.error).length;
  const failed = rows.length - ready;

  const applyParsed = (parsed: ImportParseResponse) => {
    setRows(rowsFromSheets(parsed.sheets));
    setRejected(parsed.rejected ?? []);
    setTruncatedFiles(
      (parsed.sheets ?? []).filter((sheet) => sheet.truncated).map((sheet) => sheet.fileName)
    );
    setOutcome(null);
    setError(null);
  };

  const pickFiles = async () => {
    setBusy('files');
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: PICKER_TYPES,
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const tooBig = result.assets.find(
        (asset) => typeof asset.size === 'number' && asset.size > MAX_UPLOAD_BYTES
      );
      if (tooBig) {
        throw new Error(
          `${tooBig.name} is larger than 3.5MB. Split it into smaller files before importing.`
        );
      }

      const form = new FormData();
      form.append('kind', kind);
      form.append('inPence', String(inPence));
      for (const asset of result.assets) {
        form.append(
          'files',
          {
            uri: asset.uri,
            name: asset.name || `import-${Date.now()}`,
            type: asset.mimeType || 'application/octet-stream',
          } as unknown as Blob
        );
      }

      applyParsed(await upload<ImportParseResponse>('/api/import/parse', form));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read those files.');
    } finally {
      setBusy(null);
    }
  };

  const readPhoto = async (uri: string, fileName: string) => {
    setBusy('scan');
    setError(null);
    try {
      const text = await recogniseText(uri);
      const parsed = await api<ImportParseResponse>('/api/import/text', {
        method: 'POST',
        body: { kind, text, fileName },
      });
      applyParsed(parsed.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that photo.');
    } finally {
      setBusy(null);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Allow camera access to photograph a document.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    await readPhoto(result.assets[0].uri, 'Camera photo');
  };

  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos access needed', 'Allow photo access to choose a document image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    await readPhoto(result.assets[0].uri, result.assets[0].fileName ?? 'Document photo');
  };

  const commit = async () => {
    const usable = rows.filter((row) => !row.draft.error);
    if (usable.length === 0) {
      Alert.alert('Nothing to import', 'Fix or remove the rows with errors first.');
      return;
    }

    const rate = Number(taxRate.replace(',', '.'));
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      Alert.alert('Check the VAT rate', 'Enter a VAT rate between 0 and 100.');
      return;
    }

    if (usable.length > 2000) {
      Alert.alert('Too many rows', 'Import 2,000 documents or fewer at a time.');
      return;
    }

    setBusy('commit');
    try {
      const result = await api<ImportOutcome>('/api/import/commit', {
        method: 'POST',
        body: {
          kind,
          taxRate: rate,
          rows: usable.map(({ draft }) => ({
            rowNumber: draft.rowNumber,
            sourceFile: draft.sourceFile,
            originalNumber: draft.originalNumber,
            customerName: draft.customerName,
            customerEmail: draft.customerEmail,
            customerCompany: draft.customerCompany,
            title: draft.title,
            documentDate: draft.documentDate,
            sentDate: draft.sentDate,
            dueDate: draft.dueDate,
            paidDate: draft.paidDate,
            acceptedDate: draft.acceptedDate,
            validUntil: draft.validUntil,
            status: draft.status,
            notes: draft.notes,
            currency: draft.currency,
            items: draft.items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          })),
        },
      });

      setOutcome(result.data);
      setRows([]);
      setRejected([]);
      setTruncatedFiles([]);
    } catch (err) {
      Alert.alert(
        'Import failed',
        err instanceof Error ? err.message : 'Could not import those documents.'
      );
    } finally {
      setBusy(null);
    }
  };

  const startOver = () => {
    setRows([]);
    setRejected([]);
    setTruncatedFiles([]);
    setOutcome(null);
    setError(null);
  };

  const saveDraft = (row: DraftRow, draft: ImportDraft) => {
    setRows((prev) =>
      prev.map((item) => (item.key === row.key ? { ...item, draft } : item))
    );
    setEditing(null);
  };

  const removeRow = (row: DraftRow) => {
    setRows((prev) => prev.filter((item) => item.key !== row.key));
    setEditing(null);
  };

  if (outcome) {
    return (
      <Outcome
        outcome={outcome}
        kind={kind}
        onAgain={startOver}
        onView={() => router.push(kind === 'invoice' ? '/invoices' : '/quotes')}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {review ? (
          <>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewTop}>
                <Text style={styles.title}>Review import</Text>
                <Pressable onPress={startOver} hitSlop={8}>
                  <Text style={styles.link}>Start over</Text>
                </Pressable>
              </View>
              <Text style={styles.subtitle}>
                {rows.length} document{rows.length === 1 ? '' : 's'} found · {ready}{' '}
                ready
                {failed > 0 ? ` · ${failed} need attention` : ''}
              </Text>
              {truncatedFiles.length > 0 && (
                <Text style={styles.notice}>
                  Some files had more than 5,000 rows. Only the first 5,000 were read
                  from {truncatedFiles.join(', ')}.
                </Text>
              )}
              {failed > 0 && (
                <Text style={styles.notice}>
                  Rows with errors are skipped. Edit a row to fix it.
                </Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>VAT rate on imported documents</Text>
              <TextInput
                value={taxRate}
                onChangeText={setTaxRate}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="20"
              />
              <Text style={styles.hint}>
                Applied to every imported line. Review the totals with your accountant.
              </Text>
            </View>

            {rejected.length > 0 && (
              <View style={styles.rejected}>
                <Text style={styles.rejectedTitle}>
                  {rejected.length} file{rejected.length === 1 ? '' : 's'} could not be read
                </Text>
                {rejected.map((file) => (
                  <Text key={file.fileName} style={styles.rejectedText}>
                    <Text style={styles.bold}>{file.fileName}</Text> — {file.reason}
                  </Text>
                ))}
              </View>
            )}

            {rows.map((row) => {
              const draft = row.draft;
              return (
                <Pressable
                  key={row.key}
                  onPress={() => setEditing(row)}
                  style={[styles.draftCard, draft.error ? styles.draftError : null]}>
                  <View style={styles.draftTop}>
                    <Text style={styles.draftNumber} numberOfLines={1}>
                      {draft.originalNumber || `Row ${draft.rowNumber}`}
                    </Text>
                    <Text style={styles.draftTotal}>
                      {formatMoney(lineTotal(draft), draft.currency || 'GBP')}
                    </Text>
                  </View>
                  <Text style={styles.draftCustomer} numberOfLines={1}>
                    {draft.customerName || draft.customerCompany || 'No customer'}
                  </Text>
                  <Text style={styles.draftMeta}>
                    {draft.documentDate ?? 'No date'} · {draft.items.length} line
                    {draft.items.length === 1 ? '' : 's'}
                    {draft.sourceFile ? ` · ${draft.sourceFile}` : ''}
                  </Text>
                  {draft.error ? (
                    <Text style={styles.draftProblem}>{draft.error}</Text>
                  ) : draft.warnings.length > 0 ? (
                    <Text style={styles.draftWarning}>{draft.warnings.join(' · ')}</Text>
                  ) : null}
                  <View style={styles.draftEdit}>
                    <Ionicons name="create-outline" size={14} color="#4f46e5" />
                    <Text style={styles.draftEditText}>Edit</Text>
                  </View>
                </Pressable>
              );
            })}

            <Pressable
              style={[styles.commit, busy === 'commit' && styles.disabled]}
              onPress={commit}
              disabled={busy === 'commit'}>
              {busy === 'commit' ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={19} color="#ffffff" />
                  <Text style={styles.commitText}>
                    Import {ready} {kind === 'invoice' ? 'invoice' : 'quote'}
                    {ready === 1 ? '' : 's'}
                  </Text>
                </>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>Import history</Text>
            <Text style={styles.subtitle}>
              Bring in historical invoices or quotes from accounting software, a
              spreadsheet, a text PDF or a photo.
            </Text>

            <Text style={styles.sectionTitle}>Document type</Text>
            <View style={styles.segment}>
              {(['invoice', 'quote'] as const).map((option) => {
                const active = kind === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setKind(option)}
                    style={[styles.segmentItem, active && styles.segmentActive]}>
                    <Text
                      style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {option === 'invoice' ? 'Invoices' : 'Quotes'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Import from</Text>
            <SourceButton
              icon="folder-open-outline"
              title="Choose files"
              subtitle="XLSX, XLSM, CSV or text-based PDF — choose several at once"
              busy={busy === 'files'}
              disabled={busy !== null}
              onPress={pickFiles}
            />
            <SourceButton
              icon="camera-outline"
              title="Take a photo"
              subtitle="Photograph an invoice or receipt — text is read on this device"
              busy={busy === 'scan'}
              disabled={busy !== null}
              onPress={takePhoto}
            />
            <SourceButton
              icon="images-outline"
              title="Choose a photo"
              subtitle="Pick a document image from your photo library"
              disabled={busy !== null}
              onPress={choosePhoto}
            />

            {busy === 'scan' && (
              <View style={styles.scanning}>
                <ActivityIndicator color="#4f46e5" />
                <Text style={styles.scanningText}>Reading the photo on this device…</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>Options</Text>
            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.label}>Spreadsheet amounts are in pence</Text>
                  <Text style={styles.hint}>
                    Leave off when amounts are pounds (for example 250.00).
                  </Text>
                </View>
                <Switch value={inPence} onValueChange={setInPence} />
              </View>
              <Text style={styles.label}>VAT rate on imported documents</Text>
              <TextInput
                value={taxRate}
                onChangeText={setTaxRate}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="20"
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>What can I import?</Text>
              <Text style={styles.cardText}>
                Accounting exports and spreadsheets with one row per line item work
                best. Text-based PDFs are read automatically. A scanned PDF has no text
                layer, so photograph the page instead.
              </Text>
              <Text style={styles.cardText}>
                Every row is shown for review before anything is created. Imports create
                documents and customers, and are logged in Activity.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={editing !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(null)}>
        {editing && (
          <DraftEditor
            key={editing.key}
            row={editing}
            kind={kind}
            onClose={() => setEditing(null)}
            onSave={(draft) => saveDraft(editing, draft)}
            onRemove={() => removeRow(editing)}
          />
        )}
      </Modal>
    </View>
  );
}

function SourceButton({
  icon,
  title,
  subtitle,
  busy,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.source, disabled && !busy && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button">
      <View style={styles.sourceIcon}>
        {busy ? (
          <ActivityIndicator color="#4f46e5" />
        ) : (
          <Ionicons name={icon} size={22} color="#4f46e5" />
        )}
      </View>
      <View style={styles.sourceText}>
        <Text style={styles.sourceTitle}>{title}</Text>
        <Text style={styles.sourceSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
    </Pressable>
  );
}

function Outcome({
  outcome,
  kind,
  onAgain,
  onView,
}: {
  outcome: ImportOutcome;
  kind: ImportKind;
  onAgain: () => void;
  onView: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.outcome}>
      <Ionicons name="checkmark-circle" size={54} color="#16a34a" />
      <Text style={styles.outcomeTitle}>Import complete</Text>
      <Text style={styles.outcomeText}>
        {outcome.created} {kind === 'invoice' ? 'invoice' : 'quote'}
        {outcome.created === 1 ? '' : 's'} created
        {outcome.createdContacts > 0
          ? ` · ${outcome.createdContacts} customer${outcome.createdContacts === 1 ? '' : 's'} added`
          : ''}
        {outcome.skipped > 0 ? ` · ${outcome.skipped} skipped` : ''}.
      </Text>

      {outcome.errors.length > 0 && (
        <View style={styles.rejected}>
          <Text style={styles.rejectedTitle}>Skipped rows</Text>
          {outcome.errors.map((item, index) => (
            <Text key={`${item.rowNumber}-${index}`} style={styles.rejectedText}>
              <Text style={styles.bold}>
                {item.originalNumber || `Row ${item.rowNumber}`}
              </Text>{' '}
              — {item.reason}
            </Text>
          ))}
        </View>
      )}

      <Pressable style={styles.commit} onPress={onView}>
        <Text style={styles.commitText}>
          View {kind === 'invoice' ? 'invoices' : 'quotes'}
        </Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={onAgain}>
        <Text style={styles.secondaryButtonText}>Import more</Text>
      </Pressable>
    </ScrollView>
  );
}

interface EditorItem {
  description: string;
  quantity: string;
  unitPrice: string;
}

function DraftEditor({
  row,
  kind,
  onClose,
  onSave,
  onRemove,
}: {
  row: DraftRow;
  kind: ImportKind;
  onClose: () => void;
  onSave: (draft: ImportDraft) => void;
  onRemove: () => void;
}) {
  const [originalNumber, setOriginalNumber] = useState(row.draft.originalNumber);
  const [customerName, setCustomerName] = useState(row.draft.customerName);
  const [customerEmail, setCustomerEmail] = useState(row.draft.customerEmail);
  const [title, setTitle] = useState(row.draft.title);
  const [documentDate, setDocumentDate] = useState(row.draft.documentDate ?? '');
  const [dueDate, setDueDate] = useState(
    (kind === 'invoice' ? row.draft.dueDate : row.draft.validUntil) ?? ''
  );
  const [status, setStatus] = useState(row.draft.status ?? '');
  const [notes, setNotes] = useState(row.draft.notes);
  const [items, setItems] = useState<EditorItem[]>(() =>
    row.draft.items.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: moneyInput(item.unitPrice),
    }))
  );
  const [error, setError] = useState<string | null>(null);

  const updateItem = (index: number, patch: Partial<EditorItem>) => {
    setItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  };

  const save = () => {
    const date = documentDate.trim();
    if (date && !DATE_RE.test(date)) {
      setError('Date must be in YYYY-MM-DD format.');
      return;
    }

    const due = dueDate.trim();
    if (due && !DATE_RE.test(due)) {
      setError('Due/valid-until date must be in YYYY-MM-DD format.');
      return;
    }

    if (items.length === 0) {
      setError('Add at least one line item.');
      return;
    }

    const parsedItems: ImportLineItem[] = [];
    for (const [index, item] of items.entries()) {
      const quantity = Number(item.quantity.replace(',', '.'));
      const unitPrice = parseMoney(item.unitPrice);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setError(`Line ${index + 1}: quantity must be greater than zero.`);
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        setError(`Line ${index + 1}: enter a valid unit price.`);
        return;
      }

      const pence = Math.round(unitPrice * 100);
      parsedItems.push({
        description: item.description.trim() || `Line ${index + 1}`,
        quantity,
        unitPrice: pence,
        total: pence * quantity,
      });
    }

    const next: ImportDraft = {
      ...row.draft,
      originalNumber: originalNumber.trim(),
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      title: title.trim(),
      documentDate: date || null,
      dueDate: kind === 'invoice' ? due || null : row.draft.dueDate,
      validUntil: kind === 'quote' ? due || null : row.draft.validUntil,
      status: status.trim() || null,
      notes,
      items: parsedItems,
    };
    next.error = validateDraft(next);
    onSave(next);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.modalBackdrop}>
      <View style={styles.modalSheet}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {row.draft.originalNumber || `Row ${row.draft.rowNumber}`}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color="#6b7280" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled">
          <Field label="Original number" value={originalNumber} onChangeText={setOriginalNumber} />
          <Field label="Customer name" value={customerName} onChangeText={setCustomerName} />
          <Field
            label="Customer email"
            value={customerEmail}
            onChangeText={setCustomerEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field label="Title" value={title} onChangeText={setTitle} />
          <Field
            label="Document date (YYYY-MM-DD)"
            value={documentDate}
            onChangeText={setDocumentDate}
            autoCapitalize="none"
            placeholder="2024-03-12"
          />
          <Field
            label={kind === 'invoice' ? 'Due date (YYYY-MM-DD)' : 'Valid until (YYYY-MM-DD)'}
            value={dueDate}
            onChangeText={setDueDate}
            autoCapitalize="none"
            placeholder="2024-04-11"
          />
          <Field
            label="Status"
            value={status}
            onChangeText={setStatus}
            autoCapitalize="none"
            placeholder={kind === 'invoice' ? 'sent, paid, overdue' : 'sent, accepted'}
          />

          <Text style={styles.sectionTitle}>Line items</Text>
          {items.map((item, index) => (
            <View key={index} style={styles.lineItem}>
              <View style={styles.lineHeader}>
                <Text style={styles.lineTitle}>Line {index + 1}</Text>
                {items.length > 1 && (
                  <Pressable
                    onPress={() =>
                      setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                    }
                    hitSlop={8}>
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                )}
              </View>
              <TextInput
                value={item.description}
                onChangeText={(value) => updateItem(index, { description: value })}
                placeholder="Description"
                style={styles.input}
              />
              <View style={styles.lineNumbers}>
                <View style={styles.lineNumber}>
                  <Text style={styles.smallLabel}>Quantity</Text>
                  <TextInput
                    value={item.quantity}
                    onChangeText={(value) => updateItem(index, { quantity: value })}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>
                <View style={styles.lineNumber}>
                  <Text style={styles.smallLabel}>Unit price</Text>
                  <TextInput
                    value={item.unitPrice}
                    onChangeText={(value) => updateItem(index, { unitPrice: value })}
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>
              </View>
            </View>
          ))}

          <Pressable
            style={styles.addLine}
            onPress={() =>
              setItems((prev) => [
                ...prev,
                { description: '', quantity: '1', unitPrice: '0.00' },
              ])
            }>
            <Ionicons name="add-circle-outline" size={18} color="#4f46e5" />
            <Text style={styles.addLineText}>Add line</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            style={[styles.input, styles.notes]}
          />

          {error && <Text style={styles.fieldError}>{error}</Text>}

          <Pressable style={styles.commit} onPress={save}>
            <Text style={styles.commitText}>Save row</Text>
          </Pressable>
          <Pressable style={styles.removeButton} onPress={onRemove}>
            <Text style={styles.removeButtonText}>Remove from import</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'email-address' | 'numbers-and-punctuation';
  autoCapitalize?: 'none' | 'sentences';
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholder={placeholder}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 16,
    gap: 10,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6b7280',
    marginTop: 10,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 9,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 7,
  },
  segmentActive: {
    backgroundColor: '#ffffff',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  segmentTextActive: {
    color: '#4f46e5',
  },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 13,
  },
  sourceIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceText: {
    flex: 1,
    gap: 3,
  },
  sourceTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  sourceSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  scanning: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  scanningText: {
    color: '#4f46e5',
    fontWeight: '600',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  cardText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  smallLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 17,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 9,
    padding: 12,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
    lineHeight: 20,
  },
  reviewHeader: {
    gap: 6,
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  link: {
    color: '#4f46e5',
    fontSize: 14,
    fontWeight: '700',
  },
  notice: {
    fontSize: 13,
    color: '#92400e',
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    padding: 10,
    lineHeight: 18,
  },
  rejected: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 9,
    padding: 12,
    gap: 5,
  },
  rejectedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991b1b',
  },
  rejectedText: {
    fontSize: 13,
    color: '#991b1b',
    lineHeight: 19,
  },
  bold: {
    fontWeight: '700',
  },
  draftCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    gap: 4,
    backgroundColor: '#ffffff',
  },
  draftError: {
    borderColor: '#fecaca',
    backgroundColor: '#fffafa',
  },
  draftTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  draftNumber: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  draftTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  draftCustomer: {
    fontSize: 14,
    color: '#374151',
  },
  draftMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  draftProblem: {
    fontSize: 13,
    color: '#b91c1c',
    fontWeight: '600',
  },
  draftWarning: {
    fontSize: 12,
    color: '#92400e',
  },
  draftEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  draftEditText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4f46e5',
  },
  commit: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4f46e5',
    borderRadius: 9,
    paddingVertical: 14,
  },
  commitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.55,
  },
  secondaryButton: {
    marginTop: 4,
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#4f46e5',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#4f46e5',
    fontWeight: '700',
    fontSize: 15,
  },
  outcome: {
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  outcomeTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: '#111827',
  },
  outcomeText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 6,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  modalSheet: {
    maxHeight: '92%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  modalContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 36,
  },
  field: {
    gap: 5,
  },
  lineItem: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 9,
    padding: 11,
    gap: 8,
  },
  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lineTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  removeText: {
    fontSize: 13,
    color: '#dc2626',
    fontWeight: '600',
  },
  lineNumbers: {
    flexDirection: 'row',
    gap: 8,
  },
  lineNumber: {
    flex: 1,
    gap: 4,
  },
  addLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#c7d2fe',
    borderRadius: 8,
  },
  addLineText: {
    color: '#4f46e5',
    fontWeight: '700',
    fontSize: 14,
  },
  notes: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  fieldError: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
  },
  removeButton: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 2,
  },
  removeButtonText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 14,
  },
});
