import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { API_URL } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const PRO_FEATURES = [
  'Unlimited leads & invoices',
  'Unlimited quotes',
  'Edit invoices and quotes after creation',
  'Automated reminders',
  'UK tax reports & MTD tracking',
  'Custom branding',
  'Email templates',
  'Automated report emails',
  '10-day activity log & restore',
  'Priority support',
];

const FREE_FEATURES = [
  'Up to 50 customers',
  '20 quotes per month',
  '20 invoices per month',
  'Basic reminders',
];

interface PlanState {
  plan: 'free' | 'pro';
  status: string | null;
}

export default function BillingScreen() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [plan, setPlan] = useState<PlanState | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setPlan({
          plan: data?.plan === 'pro' ? 'pro' : 'free',
          status: data?.status ?? null,
        });
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const loading = Boolean(userId) && plan === null;

  const isPro =
    plan?.plan === 'pro' &&
    (plan.status === 'active' || plan.status === 'trialing');

  const openWebBilling = () => {
    Linking.openURL(`${API_URL}/dashboard/billing`).catch(() => {});
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Billing</Text>
      <Text style={styles.intro}>
        Manage your subscription and billing. First 3 months free on Pro, then £8 per
        month. Cancel anytime.
      </Text>

      <Text style={styles.sectionTitle}>Current plan</Text>
      <View style={styles.card}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#4f46e5" />
            <Text style={styles.loadingText}>Checking your plan…</Text>
          </View>
        ) : (
          <>
            <View style={styles.planRow}>
              <Text style={styles.planName}>{isPro ? 'Pro' : 'Free'}</Text>
              <View style={[styles.badge, isPro ? styles.badgePro : styles.badgeFree]}>
                <Text
                  style={[
                    styles.badgeText,
                    isPro ? styles.badgeTextPro : styles.badgeTextFree,
                  ]}>
                  {isPro ? 'Active' : 'Current'}
                </Text>
              </View>
            </View>
            <Text style={styles.planPrice}>{isPro ? '£8.00 / month' : 'Free'}</Text>
            {plan?.status === 'past_due' ? (
              <Text style={styles.warning}>
                Your last payment failed. Update your payment method to keep Pro.
              </Text>
            ) : null}
            {plan?.status === 'canceled' ? (
              <Text style={styles.warning}>
                Your subscription is cancelled. You keep Pro until the end of the
                current billing period.
              </Text>
            ) : null}
            <Text style={styles.planHint}>
              {isPro
                ? 'Your Pro features are available across web and mobile.'
                : 'Upgrade to unlock unlimited customers, quotes, invoices and reports.'}
            </Text>

            {Platform.OS === 'android' ? null : (
              <Pressable
                style={styles.primaryButton}
                onPress={openWebBilling}
                accessibilityRole="button"
                accessibilityLabel="Open billing on the web">
                <Ionicons name="open-outline" size={18} color="#ffffff" />
                <Text style={styles.primaryText}>
                  {isPro ? 'Manage billing on the web' : 'Upgrade to Pro on the web'}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={Platform.OS === 'android' ? styles.primaryButton : styles.secondaryButton}
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel="Open settings for in-app purchases">
              {Platform.OS === 'android' ? (
                <>
                  <Ionicons name="cart-outline" size={18} color="#ffffff" />
                  <Text style={styles.primaryText}>
                    {isPro ? 'Manage subscription' : 'Upgrade in the app'}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.secondaryText}>Buy in the app (Settings)</Text>
                  <Ionicons name="chevron-forward" size={17} color="#4f46e5" />
                </>
              )}
            </Pressable>
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>Compare plans</Text>
      <View style={styles.card}>
        <View style={styles.compareHeader}>
          <Text style={styles.compareName}>Free</Text>
          <Text style={styles.comparePrice}>£0</Text>
        </View>
        {FREE_FEATURES.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Ionicons name="checkmark" size={16} color="#16a34a" />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.compareHeader}>
          <Text style={styles.compareName}>Pro</Text>
          <Text style={styles.comparePrice}>£8 / month</Text>
        </View>
        {PRO_FEATURES.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Ionicons name="checkmark" size={16} color="#16a34a" />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      <View style={styles.helpCard}>
        <Text style={styles.helpTitle}>Where to manage your plan</Text>
        <Text style={styles.helpText}>
          {Platform.OS === 'android'
            ? 'Subscriptions bought in this app are handled by Google Play. Use Settings → Manage subscription to view, change or cancel your plan.'
            : 'Web subscriptions are managed through Stripe from the web dashboard. If you subscribed through the App Store, use Settings → Manage subscription in this app.'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#f8fafc',
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
    gap: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  planName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgePro: {
    backgroundColor: '#eef2ff',
  },
  badgeFree: {
    backgroundColor: '#f3f4f6',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeTextPro: {
    color: '#4f46e5',
  },
  badgeTextFree: {
    color: '#6b7280',
  },
  planPrice: {
    fontSize: 15,
    color: '#6b7280',
  },
  warning: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#92400e',
    lineHeight: 18,
  },
  planHint: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 19,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 4,
    backgroundColor: '#4f46e5',
    borderRadius: 9,
    paddingVertical: 13,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingVertical: 12,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4f46e5',
  },
  compareHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  compareName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  comparePrice: {
    fontSize: 14,
    color: '#6b7280',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 6,
  },
  helpCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginTop: 16,
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
