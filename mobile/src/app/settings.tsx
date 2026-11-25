import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { CustomerInfo } from 'react-native-purchases';

import { API_URL, api } from '@/lib/api';
import { useSession } from '@/lib/auth';
import {
  getProPackage,
  hasProEntitlement,
  initializePurchases,
  isPurchasesSupported,
  openSubscriptionManagement,
  PRO_TRIAL_LABEL,
  PRO_TRIAL_MONTHS,
  purchasePro,
  restorePro,
} from '@/lib/purchases';
import { supabase } from '@/lib/supabase';

// `nativeAppVersion` is the version baked into the installed build, which is the
// real answer under EAS remote versioning. `expoConfig.version` is only a
// fallback because it reflects app.json, which remote versioning ignores.
// No hardcoded fallback: a stale literal would show the wrong build forever.
const APP_VERSION =
  Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'dev';

export default function SettingsScreen() {
  const { session, signOut } = useSession();
  const userId = session?.user.id ?? null;

  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [proOnWeb, setProOnWeb] = useState(false);
  const [price, setPrice] = useState<string | null>(null);
  const [storeReady, setStoreReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // Store purchases update RevenueCat immediately, but Pro features are gated on
  // the server from Supabase. Mirror the entitlement into that row after a
  // purchase/restore so features unlock without waiting for the webhook.
  const syncSubscription = useCallback(async (): Promise<boolean> => {
    try {
      const result = await api<{
        synced: boolean;
        status?: string;
        plan?: string;
      }>('/api/subscription/sync', { method: 'POST' });
      const pro =
        result.data.plan === 'pro' &&
        (result.data.status === 'active' || result.data.status === 'trialing');
      setProOnWeb(pro);
      return result.data.synced;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    (async () => {
      // Sequential on purpose: the offering lookup must wait for configure.
      const info = await initializePurchases(userId);
      const pkg = await getProPackage();
      if (!active) return;
      setCustomerInfo(info);
      setPrice(pkg?.product.priceString ?? null);
      setStoreReady(Boolean(pkg));
      // Recover store purchases whose webhook has not reached Supabase yet.
      if (hasProEntitlement(info)) await syncSubscription();
    })().catch(() => {
      // Store state is non-critical; the account section still renders.
    });

    return () => {
      active = false;
    };
  }, [userId, syncSubscription]);

  // A web subscription also grants Pro, so the store must not offer a
  // second purchase to someone who already pays on the web.
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
        setProOnWeb(
          data?.plan === 'pro' &&
            (data.status === 'active' || data.status === 'trialing'),
        );
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/login');
        },
      },
    ]);
  };

  const runPurchase = async () => {
    setBusy(true);
    try {
      const result = await purchasePro();

      if (result.status === 'success') {
        setCustomerInfo(result.customerInfo);
        const synced = await syncSubscription();
        if (!synced) {
          Alert.alert(
            'Pro activated',
            'Your subscription is active. Access will update shortly; reopen the app if a Pro feature still looks locked.'
          );
        }
        return;
      }
      if (result.status === 'cancelled') return;

      Alert.alert(
        'Purchase not completed',
        result.message ?? 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const runRestore = async () => {
    setBusy(true);
    try {
      const result = await restorePro();
      if (result.status === 'success') {
        setCustomerInfo(result.customerInfo);
        const synced = await syncSubscription();
        Alert.alert(
          'Restored',
          synced
            ? 'Your subscription is active on this account.'
            : 'Your subscription is active on this account. Access will update shortly.'
        );
        return;
      }
      Alert.alert(
        'Nothing to restore',
        result.message ?? 'No active subscription was found.',
      );
    } finally {
      setBusy(false);
    }
  };

  const manageSubscription = async () => {
    if (proOnWeb) {
      Alert.alert(
        'Web subscription',
        'This Pro subscription is managed through your web account. Sign in on the website to change or cancel it.',
      );
      return;
    }
    if (hasProEntitlement(customerInfo)) {
      await openSubscriptionManagement(customerInfo);
      return;
    }
    Alert.alert('No subscription to manage', 'Your current plan is Free.');
  };

  const proOnStore = hasProEntitlement(customerInfo);
  const isPro = proOnStore || proOnWeb;
  const canBuyInApp = isPurchasesSupported() && storeReady && !isPro;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Subscription</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Current plan</Text>
        <Text style={styles.value}>{isPro ? 'Pro' : 'Free'}</Text>
        {isPro ? (
          <>
            <Text style={styles.hint}>
              {proOnStore
                ? 'Renews through the App Store or Google Play.'
                : 'Renews through your web account. Subscriptions bought in this app are managed by the store.'}
            </Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={manageSubscription}
              disabled={busy}
            >
              <Text style={styles.secondaryButtonText}>
                {proOnStore ? 'Manage subscription' : proOnWeb ? 'Web subscription' : 'Manage subscription'}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              {price
                ? `Start a ${PRO_TRIAL_LABEL}, then ${price} per month. Billed by the App Store or Google Play.`
                : `Unlock unlimited quotes, invoices and reports with ${PRO_TRIAL_MONTHS} months free.`}
            </Text>
            {canBuyInApp ? (
              <Pressable
                style={styles.upgradeButton}
                onPress={runPurchase}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.upgradeText}>Start {PRO_TRIAL_LABEL}</Text>
                )}
              </Pressable>
            ) : (
              <Text style={styles.hint}>
                {isPurchasesSupported()
                  ? 'The Pro subscription is not available right now. Please try again later.'
                  : 'In-app purchase is unavailable in this build.'}
              </Text>
            )}
          </>
        )}
        {isPurchasesSupported() ? (
          <Pressable
            style={styles.secondaryButton}
            onPress={runRestore}
            disabled={busy}
          >
            <Text style={styles.secondaryButtonText}>Restore purchases</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{session?.user.email ?? '—'}</Text>
      </View>

      <Text style={styles.sectionTitle}>Server</Text>
      <View style={styles.card}>
        <Text style={styles.label}>API URL</Text>
        <Text style={styles.value}>{API_URL}</Text>
      </View>

      <Text style={styles.sectionTitle}>Legal</Text>
      <View style={styles.card}>
        <Pressable
          onPress={() => Linking.openURL(`${API_URL}/privacy`)}
          accessibilityRole="link"
          accessibilityLabel="Open the privacy policy"
        >
          <Text style={styles.link}>Privacy policy</Text>
        </Pressable>
        <Pressable
          onPress={() => Linking.openURL(`${API_URL}/terms`)}
          accessibilityRole="link"
          accessibilityLabel="Open the terms of service"
        >
          <Text style={styles.link}>Terms of service</Text>
        </Pressable>
        <Pressable
          onPress={() => Linking.openURL(`${API_URL}/delete-account`)}
          accessibilityRole="link"
          accessibilityLabel="Open the account deletion instructions"
        >
          <Text style={styles.link}>Delete my account</Text>
        </Pressable>
      </View>

      <Pressable style={styles.signOut} onPress={confirmSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Text style={styles.footer}>MicroCRM v{APP_VERSION}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginTop: 10,
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  label: {
    fontSize: 15,
    color: '#6b7280',
  },
  value: {
    fontSize: 17,
    color: '#111827',
    fontWeight: '600',
  },
  hint: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  link: {
    fontSize: 16,
    color: '#4F46E5',
    fontWeight: '600',
    paddingVertical: 6,
  },
  upgradeButton: {
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: '#4F46E5',
    paddingVertical: 13,
    alignItems: 'center',
  },
  upgradeText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 6,
  },
  secondaryButtonText: {
    color: '#4F46E5',
    fontWeight: '600',
    fontSize: 15,
  },
  signOut: {
    marginTop: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc2626',
    paddingVertical: 12,
    alignItems: 'center',
  },
  signOutText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 17,
  },
  footer: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 24,
  },
});