import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ProGate } from '@/components/pro-gate';
import { ScreenState } from '@/components/screen-state';
import { api, useApi } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import type {
  ReportFrequency,
  ReportSubscription,
  ReportType,
} from '@/lib/types';

const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: 'sales', label: 'Sales Report' },
  { value: 'month_end', label: 'Month-End Report' },
];

const FREQUENCIES: { value: ReportFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isProError(message: string | null): boolean {
  return message?.includes('Pro feature') === true;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function scheduleLabel(sub: ReportSubscription): string {
  if (sub.report_type === 'month_end') return 'Last day of each month';
  if (sub.frequency === 'daily') return 'Every day';
  if (sub.frequency === 'weekly') return `Every ${DAYS[sub.day_of_week ?? 1]}`;
  return `On the ${sub.day_of_month ?? 1}${ordinal(sub.day_of_month ?? 1)} of each month`;
}

function title(sub: ReportSubscription): string {
  if (sub.report_type === 'month_end') return 'Month-End Report';
  if (sub.frequency === 'daily') return 'Sales Report';
  if (sub.frequency === 'weekly') return 'Weekly Sales Report';
  return 'Monthly Sales Report';
}

export default function ReportEmailsScreen() {
  const { session } = useSession();
  const { data, loading, error, offline, refresh } = useApi<{
    subscriptions: ReportSubscription[];
  }>('/api/reports/subscriptions', 'cache:report-subscriptions');
  const [busy, setBusy] = useState<string | null>(null);

  const [reportType, setReportType] = useState<ReportType>('sales');
  const [frequency, setFrequency] = useState<ReportFrequency>('daily');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (isProError(error)) {
    return (
      <ProGate
        title="Automated report emails are a Pro feature"
        description="Have your Sales Report and Month-End Report emailed to you automatically — daily, weekly or monthly."
        features={[
          'Daily, weekly or monthly Sales Reports',
          'Month-End Report on the last day of every month',
          'Delivered straight to your inbox',
        ]}
      />
    );
  }

  const subscriptions = data?.subscriptions ?? [];

  const toggle = async (sub: ReportSubscription) => {
    setBusy(sub.id);
    try {
      await api(`/api/reports/subscriptions/${sub.id}`, {
        method: 'PATCH',
        body: { enabled: !sub.enabled },
      });
      refresh();
    } catch (err) {
      Alert.alert(
        'Could not update subscription',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setBusy(null);
    }
  };

  const remove = (sub: ReportSubscription) => {
    Alert.alert('Delete subscription?', `${title(sub)} — ${sub.email}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(sub.id);
          try {
            await api(`/api/reports/subscriptions/${sub.id}`, { method: 'DELETE' });
            refresh();
          } catch (err) {
            Alert.alert(
              'Could not delete subscription',
              err instanceof Error ? err.message : 'Please try again.'
            );
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const add = async () => {
    if (saving) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Enter a valid email address');
      return;
    }
    if (reportType === 'sales' && frequency === 'weekly') {
      const day = Number(dayOfWeek);
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        setFormError('Choose a weekday between Sunday and Saturday');
        return;
      }
    }
    if (reportType === 'sales' && frequency === 'monthly') {
      const day = Number(dayOfMonth);
      if (!Number.isInteger(day) || day < 1 || day > 28) {
        setFormError('Day of month must be between 1 and 28');
        return;
      }
    }

    setSaving(true);
    setFormError(null);
    try {
      await api('/api/reports/subscriptions', {
        method: 'POST',
        body: {
          report_type: reportType,
          frequency: reportType === 'month_end' ? 'monthly' : frequency,
          day_of_week:
            reportType === 'sales' && frequency === 'weekly' ? Number(dayOfWeek) : null,
          day_of_month:
            reportType === 'sales' && frequency === 'monthly'
              ? Number(dayOfMonth)
              : null,
          email: email.trim(),
        },
      });
      setEmail(session?.user.email ?? '');
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenState loading={loading && !data} error={error} onRetry={refresh}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
        {offline ? <Text style={styles.offlineNote}>Offline — saved data</Text> : null}

        <Text style={styles.intro}>
          Get your Sales and Month-End Reports emailed automatically.
        </Text>

        <Text style={styles.sectionTitle}>New subscription</Text>
        <View style={styles.card}>
          {formError ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={18} color="#b91c1c" />
              <Text style={styles.errorText}>{formError}</Text>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Report</Text>
          <View style={styles.chipRow}>
            {REPORT_TYPES.map((option) => {
              const active = reportType === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setReportType(option.value)}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {reportType === 'sales' ? (
            <>
              <Text style={styles.fieldLabel}>Frequency</Text>
              <View style={styles.chipRow}>
                {FREQUENCIES.map((option) => {
                  const active = frequency === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setFrequency(option.value)}
                      style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {frequency === 'weekly' ? (
                <>
                  <Text style={styles.fieldLabel}>Day of week (0 = Sunday)</Text>
                  <TextInput
                    style={styles.input}
                    value={dayOfWeek}
                    onChangeText={setDayOfWeek}
                    keyboardType="number-pad"
                    placeholder="1"
                  />
                </>
              ) : null}

              {frequency === 'monthly' ? (
                <>
                  <Text style={styles.fieldLabel}>Day of month (1–28)</Text>
                  <TextInput
                    style={styles.input}
                    value={dayOfMonth}
                    onChangeText={setDayOfMonth}
                    keyboardType="number-pad"
                    placeholder="1"
                  />
                </>
              ) : null}
            </>
          ) : (
            <Text style={styles.hint}>
              Month-End Reports are sent on the last day of every month and cover that
              month.
            </Text>
          )}

          <Text style={styles.fieldLabel}>Send to</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="you@example.com"
          />

          <Pressable
            style={[styles.primaryButton, saving && styles.buttonBusy]}
            onPress={add}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Create report subscription">
            <Text style={styles.primaryText}>
              {saving ? 'Creating…' : 'Create subscription'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Your subscriptions</Text>
        {subscriptions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="mail-outline" size={26} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No report subscriptions yet</Text>
            <Text style={styles.emptyText}>
              Create one above to start receiving automated reports.
            </Text>
          </View>
        ) : (
          subscriptions.map((sub) => (
            <View key={sub.id} style={styles.subCard}>
              <View style={styles.subHeader}>
                <Ionicons
                  name={sub.enabled ? 'mail-unread-outline' : 'mail-outline'}
                  size={18}
                  color={sub.enabled ? '#16a34a' : '#9ca3af'}
                />
                <Text style={styles.subTitle}>{title(sub)}</Text>
                <View
                  style={[
                    styles.badge,
                    sub.enabled ? styles.badgeActive : styles.badgePaused,
                  ]}>
                  <Text
                    style={[
                      styles.badgeText,
                      sub.enabled ? styles.badgeTextActive : styles.badgeTextPaused,
                    ]}>
                    {sub.enabled ? 'Active' : 'Paused'}
                  </Text>
                </View>
              </View>
              <Text style={styles.subMeta}>
                {scheduleLabel(sub)} · sent to {sub.email}
                {sub.last_run_at ? ` · last sent ${formatDate(sub.last_run_at)}` : ''}
              </Text>
              <View style={styles.subActions}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => toggle(sub)}
                  disabled={busy === sub.id}>
                  <Ionicons
                    name={sub.enabled ? 'pause-outline' : 'play-outline'}
                    size={16}
                    color="#374151"
                  />
                  <Text style={styles.secondaryText}>
                    {sub.enabled ? 'Pause' : 'Resume'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => remove(sub)}
                  disabled={busy === sub.id}
                  accessibilityLabel={`Delete ${title(sub)}`}>
                  <Ionicons name="trash-outline" size={17} color="#dc2626" />
                </Pressable>
              </View>
            </View>
          ))
        )}

        <View style={styles.helpCard}>
          <Text style={styles.helpTitle}>How scheduling works</Text>
          <Text style={styles.helpText}>
            Sales Report — daily reports cover that day, weekly cover the last 7 days,
            monthly cover the current calendar month.
          </Text>
          <Text style={styles.helpText}>
            Month-End Report — sent on the last day of each month and covers that month.
          </Text>
          <Text style={styles.helpText}>
            Reports are sent once per period. Your subscription must be enabled for a
            report to go out.
          </Text>
        </View>
      </ScrollView>
    </ScreenState>
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
  intro: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 20,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
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
    padding: 10,
  },
  errorText: {
    flex: 1,
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
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
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
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
  hint: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 19,
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: '#4f46e5',
    borderRadius: 9,
    paddingVertical: 13,
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
  emptyCard: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d1d5db',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
  subCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeActive: {
    backgroundColor: '#dcfce7',
  },
  badgePaused: {
    backgroundColor: '#f3f4f6',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: '#15803d',
  },
  badgeTextPaused: {
    color: '#6b7280',
  },
  subMeta: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  subActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  helpCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginTop: 10,
    gap: 6,
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  helpText: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
});
