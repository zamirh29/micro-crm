import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ProGate } from '@/components/pro-gate';
import { ScreenState } from '@/components/screen-state';
import { useApi } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { TaxBand, TaxReport } from '@/lib/types';

function isProError(message: string | null): boolean {
  return message?.includes('Pro feature') === true;
}

function pounds(value: number): string {
  return formatMoney(Math.round(value * 100));
}

export default function TaxScreen() {
  const { data, loading, error, offline, refresh } = useApi<TaxReport>(
    '/api/tax-report',
    'cache:tax-report'
  );

  if (isProError(error)) {
    return (
      <ProGate
        title="Tax Reports are a Pro feature"
        description="Track your UK income tax liability and find out when Making Tax Digital will apply to you."
        features={[
          'Estimated income tax on your invoiced income',
          'HMRC Making Tax Digital liability tracker',
          'Latest UK income tax bands and thresholds',
        ]}
      />
    );
  }

  return (
    <ScreenState loading={loading && !data} error={error} onRetry={refresh}>
      {data ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
          {offline ? <Text style={styles.offlineNote}>Offline — saved data</Text> : null}

          <Text style={styles.title}>Tax Report — {data.taxYear.label}</Text>
          <Text style={styles.intro}>
            Estimated UK income tax and Making Tax Digital readiness based on your paid
            invoices, less the expenses you have recorded.
          </Text>

          <View style={styles.cards}>
            <SummaryCard
              label={`Paid income (${data.taxYear.label})`}
              value={formatMoney(data.paidPence)}
              hint={`${formatMoney(data.invoicedPence)} invoiced in total`}
              icon="calculator-outline"
              color="#16a34a"
            />
            <SummaryCard
              label={`Expenses (${data.taxYear.label})`}
              value={formatMoney(data.expensesPence)}
              hint="Recorded business costs"
              icon="receipt-outline"
              color="#e11d48"
            />
            <SummaryCard
              label="Taxable profit"
              value={pounds(data.taxableIncome)}
              hint="Paid income less expenses"
              icon="business-outline"
              color="#2563eb"
            />
            <SummaryCard
              label="Estimated income tax"
              value={pounds(data.tax.totalTax)}
              hint={`~${(data.tax.effectiveRate * 100).toFixed(1)}% of profit`}
              icon="shield-half-outline"
              color="#d97706"
            />
          </View>

          <Text style={styles.sectionTitle}>
            UK Income Tax Bands — {data.taxYear.label}
          </Text>
          <View style={styles.card}>
            <Text style={styles.sectionHint}>
              England, Wales and Northern Ireland. Personal Allowance £12,570, tapered
              above £100,000. Bands frozen to April 2028.
            </Text>
            {data.tax.rows.map((row) => (
              <View key={row.label} style={styles.bandRow}>
                <View style={styles.bandMain}>
                  <Text style={styles.bandLabel}>{row.label}</Text>
                  <Text style={styles.bandRange}>
                    {row.to
                      ? `${pounds(row.from)} – ${pounds(row.to)}`
                      : `${pounds(row.from)}+`}
                  </Text>
                </View>
                <Text style={styles.bandTax}>{pounds(row.tax)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalHint}>On {pounds(data.taxableIncome)} profit</Text>
              <Text style={styles.totalValue}>{pounds(data.tax.totalTax)}</Text>
            </View>
            <Text style={styles.estimateNote}>
              Estimate only — paid invoices less the expenses recorded in MicroCRM. Your
              real liability depends on allowances, other income, and what HMRC will
              accept. Always confirm with HMRC or an accountant.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Making Tax Digital</Text>
          <View style={styles.card}>
            <Text style={styles.sectionHint}>
              HMRC requires most sole traders and landlords to keep digital records and
              submit quarterly updates.
            </Text>

            {data.mtd.liable && data.mtd.stage ? (
              <View style={[styles.mtdBanner, styles.mtdLiable]}>
                <Text style={styles.mtdTitle}>
                  You need to use Making Tax Digital for Income Tax
                </Text>
                <Text style={styles.mtdText}>
                  Based on {pounds(data.paidPence / 100)} income, you fall within
                  MTD&apos;s {data.mtd.stage.mtdStart} requirement.
                </Text>
              </View>
            ) : (
              <View style={[styles.mtdBanner, styles.mtdNotYet]}>
                <Text style={styles.mtdTitle}>Not yet required — but plan ahead</Text>
                <Text style={styles.mtdText}>
                  You&apos;re under the current MTD threshold. If your income rises above{' '}
                  {pounds(data.mtd.nextStage?.threshold ?? 0)}, MTD will apply from{' '}
                  {data.mtd.nextStage ? data.mtd.nextStage.mtdStart : 'a future date'}.
                </Text>
              </View>
            )}

            {data.schedule.map((stage) => {
              const crossed = data.paidPence / 100 > stage.threshold;
              return (
                <View
                  key={stage.assessmentYear}
                  style={[styles.stage, crossed && styles.stageCrossed]}>
                  <Ionicons
                    name={crossed ? 'checkmark-circle' : 'ellipse-outline'}
                    size={18}
                    color={crossed ? '#16a34a' : '#9ca3af'}
                    style={styles.stageIcon}
                  />
                  <View style={styles.stageMain}>
                    <Text style={styles.stageTitle}>
                      From {stage.mtdStart} — income over {pounds(stage.threshold)}{' '}
                      (assessed on {stage.assessmentYear} return)
                    </Text>
                    <Text style={styles.stageDescription}>{stage.description}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <TaxEstimator initialIncome={data.taxableIncome} bands={data.taxYear.bands} />
        </ScrollView>
      ) : null}
    </ScreenState>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
  color,
}: {
  label: string;
  value: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <View style={[styles.summaryIcon, { backgroundColor: `${color}1a` }]}>
          <Ionicons name={icon} size={17} color={color} />
        </View>
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryHint}>{hint}</Text>
    </View>
  );
}

function TaxEstimator({ initialIncome, bands }: { initialIncome: number; bands: TaxBand[] }) {
  const [income, setIncome] = useState(
    initialIncome > 0 ? String(Math.round(initialIncome)) : ''
  );

  const result = useMemo(() => {
    const parsed = Number.parseFloat(income);
    const gross = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const rows = bands.map((band) => {
      const upper = band.to ?? gross;
      const taxable = Math.max(0, Math.min(gross, upper) - band.from);
      const tax = Math.round(taxable * band.rate);
      return { band, tax };
    });
    const total = rows.reduce((sum, row) => sum + row.tax, 0);
    return {
      gross,
      total,
      effective: gross > 0 ? (total / gross) * 100 : 0,
      rows,
    };
  }, [bands, income]);

  return (
    <>
      <Text style={styles.sectionTitle}>Tax estimator</Text>
      <View style={styles.card}>
        <Text style={styles.sectionHint}>
          Enter a taxable profit to see the income tax it would attract in{' '}
          {new Date().getFullYear()}/{String(new Date().getFullYear() + 1).slice(2)}.
        </Text>
        <Text style={styles.fieldLabel}>Taxable profit (£)</Text>
        <TextInput
          style={styles.input}
          value={income}
          onChangeText={setIncome}
          placeholder="e.g. 45000"
          keyboardType="decimal-pad"
        />

        <View style={styles.estimatorResult}>
          <View>
            <Text style={styles.estimatorLabel}>Estimated tax</Text>
            <Text style={styles.estimatorValue}>{pounds(result.total)}</Text>
          </View>
          <View style={styles.estimatorRight}>
            <Text style={styles.estimatorLabel}>Effective rate</Text>
            <Text style={styles.estimatorValue}>{result.effective.toFixed(1)}%</Text>
          </View>
        </View>

        {result.rows.map(({ band, tax }) => (
          <View key={band.label} style={styles.bandRow}>
            <View style={styles.bandMain}>
              <Text style={styles.bandLabel}>{band.label}</Text>
              <Text style={styles.bandRange}>
                {band.to
                  ? `${pounds(band.from)} – ${pounds(band.to)}`
                  : `${pounds(band.from)}+`}
              </Text>
            </View>
            <Text style={styles.bandTax}>{pounds(tax)}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#f8fafc',
  },
  offlineNote: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  intro: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginTop: 4,
  },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  summaryCard: {
    width: '47.5%',
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    gap: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginTop: 4,
  },
  summaryHint: {
    fontSize: 12,
    color: '#6b7280',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 22,
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 19,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 8,
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  bandMain: {
    flex: 1,
    gap: 1,
  },
  bandLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  bandRange: {
    fontSize: 12,
    color: '#6b7280',
  },
  bandTax: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  totalHint: {
    flex: 1,
    fontSize: 12,
    color: '#6b7280',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  estimateNote: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
    marginTop: 10,
  },
  mtdBanner: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  mtdLiable: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  mtdNotYet: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  mtdTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  mtdText: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 19,
    marginTop: 3,
  },
  stage: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 11,
  },
  stageCrossed: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  stageIcon: {
    marginTop: 2,
  },
  stageMain: {
    flex: 1,
    gap: 2,
  },
  stageTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 18,
  },
  stageDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 17,
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
  estimatorResult: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    padding: 12,
    marginVertical: 4,
  },
  estimatorRight: {
    alignItems: 'flex-end',
  },
  estimatorLabel: {
    fontSize: 12,
    color: '#4f46e5',
    fontWeight: '600',
  },
  estimatorValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#312e81',
  },
});
