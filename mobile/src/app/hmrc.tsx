import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ScreenState } from '@/components/screen-state';
import { api, useApi } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { HmrcObligation, HmrcStatus, VatFigures } from '@/lib/types';

const MOBILE_REDIRECT = 'microcrm://hmrc';

function queryParam(url: string, key: string): string | null {
  const match = new RegExp(`[?&]${key}=([^&]*)`).exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function HmrcScreen() {
  const { data, loading, error, refresh } = useApi<HmrcStatus>('/api/hmrc/status');
  const [busy, setBusy] = useState<string | null>(null);

  const connect = async (rawVrn: string) => {
    const vrn = rawVrn.replace(/\s+/g, '');
    if (!/^\d{9}$/.test(vrn)) {
      Alert.alert('Check the VAT number', 'Enter a 9-digit VAT registration number.');
      return;
    }

    setBusy('connect');
    try {
      const link = await api<{ url: string }>(
        `/api/hmrc/auth/link?vrn=${encodeURIComponent(vrn)}`
      );
      const result = await WebBrowser.openAuthSessionAsync(link.data.url, MOBILE_REDIRECT);

      if (result.type !== 'success') return;

      const connected = queryParam(result.url, 'connected');
      const failure = queryParam(result.url, 'error');
      if (connected) {
        Alert.alert('Connected', 'Connected to HMRC.');
        refresh();
      } else if (failure) {
        Alert.alert('Could not connect', failure);
      }
    } catch (err) {
      Alert.alert(
        'Could not connect',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setBusy(null);
    }
  };

  const disconnect = () => {
    Alert.alert(
      'Disconnect from HMRC?',
      'Tokens will be deleted from our database. You can reconnect at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setBusy('disconnect');
            try {
              await api('/api/hmrc/disconnect', { method: 'POST' });
              Alert.alert('Disconnected', 'HMRC connection removed.');
              refresh();
            } catch (err) {
              Alert.alert(
                'Could not disconnect',
                err instanceof Error ? err.message : 'Please try again.'
              );
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  const saveVat = async (vatNumber: string, vatRegistered: boolean) => {
    setBusy('vat');
    try {
      await api('/api/hmrc/vat-details', {
        method: 'POST',
        body: { vatNumber, vatRegistered },
      });
      Alert.alert('Saved', 'VAT details saved.');
      refresh();
    } catch (err) {
      Alert.alert(
        'Could not save',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setBusy(null);
    }
  };

  const submit = (obligation: HmrcObligation) => {
    const figures = obligation.figures;
    const net = figures ? formatMoney(figures.netVatDue * 100) : '—';
    Alert.alert(
      'Submit VAT return?',
      `Net VAT for ${formatDate(obligation.start)} – ${formatDate(
        obligation.end
      )} is ${net}. Submitting a finalised return to HMRC cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setBusy(obligation.periodKey);
            try {
              await api('/api/hmrc/vat-return', {
                method: 'POST',
                body: {
                  periodKey: obligation.periodKey,
                  from: obligation.start,
                  to: obligation.end,
                  finalised: true,
                },
              });
              Alert.alert('Submitted', 'VAT return submitted to HMRC.');
              refresh();
            } catch (err) {
              Alert.alert(
                'Submission failed',
                err instanceof Error ? err.message : 'HMRC did not accept the return.'
              );
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenState loading={loading && !data} error={error} onRetry={refresh}>
      {data && (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
          <Text style={styles.intro}>
            Connect your VAT registration to see HMRC obligations and submit VAT
            returns from the records in MicroCRM.
          </Text>

          {!data.configured ? (
            <View style={styles.warning}>
              <Text style={styles.warningTitle}>HMRC is not configured</Text>
              <Text style={styles.warningText}>
                HMRC credentials are not configured on this deployment yet. Add
                HMRC_CLIENT_ID, HMRC_CLIENT_SECRET and HMRC_REDIRECT_URI, then try again.
              </Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>HMRC connection</Text>
          <View style={styles.card}>
            {data.connection ? (
              <>
                <View style={styles.connected}>
                  <Ionicons name="shield-checkmark" size={18} color="#15803d" />
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
                <Detail label="VRN" value={data.connection.vrn} mono />
                <Detail
                  label="Environment"
                  value={data.connection.environment}
                  capitalise
                />
                <Detail
                  label="Connected"
                  value={formatDate(data.connection.connectedAt)}
                />
                <Pressable
                  style={styles.dangerButton}
                  onPress={disconnect}
                  disabled={busy === 'disconnect'}>
                  {busy === 'disconnect' ? (
                    <ActivityIndicator color="#dc2626" />
                  ) : (
                    <Text style={styles.dangerButtonText}>Disconnect from HMRC</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <ConnectForm
                initialVatNumber={data.vat.vatNumber ?? ''}
                configured={data.configured}
                environment={data.environment}
                busy={busy === 'connect'}
                onConnect={connect}
              />
            )}
          </View>

          <Text style={styles.sectionTitle}>VAT details</Text>
          <View style={styles.card}>
            <VatDetailsForm
              initialVatNumber={data.vat.vatNumber ?? ''}
              initialVatRegistered={data.vat.vatRegistered}
              busy={busy === 'vat'}
              onSave={saveVat}
            />
          </View>

          {data.connection ? (
            <>
              <Text style={styles.sectionTitle}>VAT obligations</Text>
              <Text style={styles.sectionHint}>
                Periods HMRC has on record. Open periods can be submitted from your
                MicroCRM invoices and expenses.
              </Text>

              {data.obligationsError ? (
                <View style={styles.warning}>
                  <Text style={styles.warningText}>{data.obligationsError}</Text>
                </View>
              ) : null}

              {data.obligations.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.cardText}>
                    No obligations returned by HMRC for the last 12 months.
                  </Text>
                </View>
              ) : (
                data.obligations.map((obligation) => (
                  <ObligationRow
                    key={obligation.periodKey}
                    obligation={obligation}
                    busy={busy === obligation.periodKey}
                    onSubmit={() => submit(obligation)}
                  />
                ))
              )}

              <View style={styles.warning}>
                <Text style={styles.warningTitle}>Check before you submit</Text>
                <Text style={styles.warningText}>
                  Input VAT (box 4) is zero because expenses are stored gross. Sales in
                  box 6 include all issued invoices in the period. Submitting a finalised
                  return to HMRC cannot be undone — review the figures with your
                  accountant first.
                </Text>
              </View>

              {data.submissions.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Recent submissions</Text>
                  {data.submissions.map((submission) => (
                    <View key={submission.period_key} style={styles.submission}>
                      <View style={styles.submissionMain}>
                        <Text style={styles.submissionPeriod}>
                          {submission.period_from
                            ? formatDate(submission.period_from)
                            : '—'}{' '}
                          – {submission.period_to ? formatDate(submission.period_to) : '—'}
                        </Text>
                        <Text style={styles.hint}>
                          {formatDate(submission.submitted_at)} ·{' '}
                          {submission.receipt?.formBundleNumber ?? 'No receipt'}
                        </Text>
                      </View>
                      <Text style={styles.mono}>{submission.period_key}</Text>
                    </View>
                  ))}
                </>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      )}
    </ScreenState>
  );
}

function ConnectForm({
  initialVatNumber,
  configured,
  environment,
  busy,
  onConnect,
}: {
  initialVatNumber: string;
  configured: boolean;
  environment: string;
  busy: boolean;
  onConnect: (vatNumber: string) => void;
}) {
  const [vatNumber, setVatNumber] = useState(initialVatNumber);

  return (
    <>
      <Text style={styles.cardText}>
        You&apos;ll be taken to HMRC to sign in with your Government Gateway details and
        authorise MicroCRM to submit VAT returns for this business.
      </Text>
      <Text style={styles.label}>VAT registration number</Text>
      <TextInput
        value={vatNumber}
        onChangeText={setVatNumber}
        placeholder="123456789"
        keyboardType="number-pad"
        maxLength={9}
        style={styles.input}
      />
      <Pressable
        style={[styles.primaryButton, !configured && styles.disabled]}
        onPress={() => onConnect(vatNumber)}
        disabled={busy || !configured}>
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <>
            <Ionicons name="link-outline" size={17} color="#ffffff" />
            <Text style={styles.primaryButtonText}>Connect</Text>
          </>
        )}
      </Pressable>
      <Text style={styles.hint}>
        Environment: {environment}. Tokens are encrypted at rest and can be removed at
        any time.
      </Text>
    </>
  );
}

function VatDetailsForm({
  initialVatNumber,
  initialVatRegistered,
  busy,
  onSave,
}: {
  initialVatNumber: string;
  initialVatRegistered: boolean;
  busy: boolean;
  onSave: (vatNumber: string, vatRegistered: boolean) => void;
}) {
  const [vatNumber, setVatNumber] = useState(initialVatNumber);
  const [vatRegistered, setVatRegistered] = useState(initialVatRegistered);

  return (
    <>
      <Text style={styles.cardText}>
        Used to label exports and to cross-check the VAT registration number HMRC returns.
      </Text>
      <Text style={styles.label}>VAT registration number</Text>
      <TextInput
        value={vatNumber}
        onChangeText={setVatNumber}
        placeholder="123456789"
        keyboardType="number-pad"
        maxLength={9}
        style={styles.input}
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>VAT registered</Text>
        <Switch value={vatRegistered} onValueChange={setVatRegistered} />
      </View>
      <Pressable
        style={styles.secondaryButton}
        onPress={() => onSave(vatNumber, vatRegistered)}
        disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#4f46e5" />
        ) : (
          <Text style={styles.secondaryButtonText}>Save VAT details</Text>
        )}
      </Pressable>
    </>
  );
}

function Detail({
  label,
  value,
  mono,
  capitalise,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalise?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          mono && styles.mono,
          capitalise && styles.capitalise,
        ]}>
        {value}
      </Text>
    </View>
  );
}

function ObligationRow({
  obligation,
  busy,
  onSubmit,
}: {
  obligation: HmrcObligation;
  busy: boolean;
  onSubmit: () => void;
}) {
  const figures: VatFigures | null = obligation.figures;
  const open = obligation.status === 'O';

  return (
    <View style={styles.obligation}>
      <View style={styles.obligationTop}>
        <View style={styles.obligationPeriod}>
          <Text style={styles.obligationDates}>
            {formatDate(obligation.start)} – {formatDate(obligation.end)}
          </Text>
          <Text style={styles.hint}>Due {formatDate(obligation.due)}</Text>
        </View>
        <View style={[styles.statusChip, open ? styles.statusOpen : styles.statusDone]}>
          <Text style={[styles.statusText, open ? styles.statusOpenText : styles.statusDoneText]}>
            {open ? 'Open' : 'Fulfilled'}
          </Text>
        </View>
      </View>

      <View style={styles.boxRow}>
        <Box label="Box 1" value={figures ? formatMoney(figures.vatDueSales * 100) : '—'} />
        <Box
          label="Box 4"
          value={figures ? formatMoney(figures.vatReclaimedCurrPeriod * 100) : '—'}
        />
        <Box label="Box 5" value={figures ? formatMoney(figures.netVatDue * 100) : '—'} />
      </View>

      {open && figures ? (
        <Pressable
          style={[styles.submitButton, busy && styles.disabled]}
          onPress={onSubmit}
          disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Ionicons name="send-outline" size={15} color="#ffffff" />
              <Text style={styles.submitText}>Submit to HMRC</Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.boxLabel}>{label}</Text>
      <Text style={styles.boxValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 10,
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
    marginTop: 10,
  },
  sectionHint: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 19,
    marginTop: -4,
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 14,
    gap: 8,
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
    marginTop: 4,
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
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  capitalise: {
    textTransform: 'capitalize',
  },
  connected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectedText: {
    color: '#15803d',
    fontWeight: '700',
    fontSize: 14,
  },
  primaryButton: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4f46e5',
    borderRadius: 9,
    paddingVertical: 13,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    marginTop: 6,
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#4f46e5',
    paddingVertical: 11,
  },
  secondaryButtonText: {
    color: '#4f46e5',
    fontWeight: '700',
    fontSize: 14,
  },
  dangerButton: {
    marginTop: 8,
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#dc2626',
    paddingVertical: 11,
  },
  dangerButtonText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  switchLabel: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
  obligation: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  obligationTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  obligationPeriod: {
    flex: 1,
    gap: 3,
  },
  obligationDates: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusOpen: {
    backgroundColor: '#fffbeb',
  },
  statusDone: {
    backgroundColor: '#f0fdf4',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusOpenText: {
    color: '#b45309',
  },
  statusDoneText: {
    color: '#15803d',
  },
  boxRow: {
    flexDirection: 'row',
    gap: 8,
  },
  box: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 8,
    gap: 2,
  },
  boxLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#6b7280',
  },
  boxValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    paddingVertical: 10,
  },
  submitText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  warning: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 10,
    padding: 13,
    gap: 4,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400e',
  },
  warningText: {
    fontSize: 13,
    color: '#92400e',
    lineHeight: 19,
  },
  submission: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 9,
    padding: 12,
  },
  submissionMain: {
    flex: 1,
    gap: 3,
  },
  submissionPeriod: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
});
