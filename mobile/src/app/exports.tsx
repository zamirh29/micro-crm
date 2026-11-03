import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { downloadFile, shareFile } from '@/lib/files';

type ExportFormat = 'xero' | 'quickbooks' | 'sage' | 'generic';
type ExportDataset = 'sales' | 'purchases' | 'vat';

const FORMATS: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'xero', label: 'Xero', description: 'Sales invoice import CSV' },
  { value: 'quickbooks', label: 'QuickBooks', description: 'Invoice import CSV' },
  { value: 'sage', label: 'Sage', description: 'Audit-trail style CSV' },
  { value: 'generic', label: 'Generic', description: 'FreeAgent, Dext, spreadsheets' },
];

const DATASETS: { value: ExportDataset; label: string; description: string }[] = [
  { value: 'sales', label: 'Sales', description: 'One row per invoice' },
  { value: 'purchases', label: 'Purchases', description: 'One row per expense' },
  { value: 'vat', label: 'VAT summary', description: 'Return boxes 1–9' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** UK tax year starts on 6 April, matching the web export defaults. */
function taxYearStart(): string {
  const now = new Date();
  const month = now.getMonth();
  const beforeApril6 = month < 3 || (month === 3 && now.getDate() < 6);
  return `${now.getFullYear() - (beforeApril6 ? 1 : 0)}-04-06`;
}

export default function ExportsScreen() {
  const [format, setFormat] = useState<ExportFormat>('generic');
  const [dataset, setDataset] = useState<ExportDataset>('sales');
  const [from, setFrom] = useState(taxYearStart);
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      Alert.alert('Check the dates', 'Dates must be in YYYY-MM-DD format.');
      return;
    }
    if (from > to) {
      Alert.alert('Check the dates', 'From must be on or before To.');
      return;
    }

    setBusy(true);
    try {
      const query = new URLSearchParams({ format, dataset, from, to });
      const fallback = `microcrm-${dataset}-${from}-to-${to}.csv`;
      const file = await downloadFile(`/api/exports/accounting?${query}`, fallback);
      await shareFile(file);
    } catch (err) {
      Alert.alert(
        'Could not export',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        Download your sales, purchases or a VAT summary as a CSV that can be imported
        into Xero, QuickBooks, Sage or a spreadsheet. Every amount is taken from the
        records already in MicroCRM.
      </Text>

      <Text style={styles.sectionTitle}>Accounting software</Text>
      <View style={styles.grid}>
        {FORMATS.map((option) => (
          <Choice
            key={option.value}
            label={option.label}
            description={option.description}
            active={format === option.value}
            onPress={() => setFormat(option.value)}
          />
        ))}
      </View>

      <Text style={styles.sectionTitle}>What to export</Text>
      <View style={styles.grid}>
        {DATASETS.map((option) => (
          <Choice
            key={option.value}
            label={option.label}
            description={option.description}
            active={dataset === option.value}
            onPress={() => setDataset(option.value)}
          />
        ))}
      </View>

      <View style={styles.dateRow}>
        <View style={styles.dateField}>
          <Text style={styles.label}>From</Text>
          <TextInput
            value={from}
            onChangeText={setFrom}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
          />
        </View>
        <View style={styles.dateField}>
          <Text style={styles.label}>To</Text>
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
          />
        </View>
      </View>

      <Pressable
        style={[styles.download, busy && styles.downloadBusy]}
        onPress={download}
        disabled={busy}
        accessibilityRole="button">
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <>
            <Ionicons name="download-outline" size={18} color="#ffffff" />
            <Text style={styles.downloadText}>Download CSV</Text>
          </>
        )}
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What each export contains</Text>
        <Text style={styles.cardText}>
          <Text style={styles.bold}>Sales</Text> — one row per invoice: customer,
          dates, net, VAT rate, VAT and gross.
        </Text>
        <Text style={styles.cardText}>
          <Text style={styles.bold}>Purchases</Text> — one row per expense: date,
          category, description and amount.
        </Text>
        <Text style={styles.cardText}>
          <Text style={styles.bold}>VAT summary</Text> — boxes 1–9 for the chosen
          period, ready to copy into a return.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Import tips</Text>
        <Text style={styles.cardText}>
          Xero: Business → Invoices → Import. QuickBooks: Sales → Customers → Import
          data.
        </Text>
        <Text style={styles.cardText}>
          Sage 50: File → Import → Audit Trail. Check your nominal codes before
          importing.
        </Text>
        <Text style={styles.cardText}>
          Import into a sandbox or test company first — accounting packages treat
          duplicate invoice numbers strictly.
        </Text>
      </View>

      <View style={styles.warning}>
        <Text style={styles.warningTitle}>VAT and expenses</Text>
        <Text style={styles.warningText}>
          Expenses are recorded gross in MicroCRM with no VAT split, so they are
          exported as non-reclaimable purchases. If you are VAT registered, check the
          summary with your accountant before filing.
        </Text>
      </View>

      <Pressable style={styles.hmrcLink} onPress={() => router.push('/hmrc')}>
        <View style={styles.hmrcText}>
          <Text style={styles.cardTitle}>Making Tax Digital</Text>
          <Text style={styles.cardText}>
            Connect your HMRC account to see VAT obligations and submit returns.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#6b7280" />
      </Pressable>
    </ScrollView>
  );
}

function Choice({
  label,
  description,
  active,
  onPress,
}: {
  label: string;
  description: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.choice, active && styles.choiceActive]}>
      <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{label}</Text>
      <Text style={styles.choiceDescription}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  intro: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6b7280',
    marginTop: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    width: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 2,
  },
  choiceActive: {
    borderColor: '#4f46e5',
    backgroundColor: '#eef2ff',
  },
  choiceLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  choiceLabelActive: {
    color: '#4f46e5',
  },
  choiceDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 17,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  dateField: {
    flex: 1,
    gap: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
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
  download: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4f46e5',
    borderRadius: 9,
    paddingVertical: 14,
  },
  downloadBusy: {
    opacity: 0.75,
  },
  downloadText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 14,
    gap: 6,
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
  bold: {
    fontWeight: '700',
    color: '#374151',
  },
  warning: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400e',
  },
  warningText: {
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
  hmrcLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 14,
  },
  hmrcText: {
    flex: 1,
    gap: 4,
  },
});
