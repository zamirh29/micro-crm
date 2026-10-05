import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { API_URL } from '@/lib/api';
import { useSession } from '@/lib/auth';
import {
  getProPackage,
  hasProEntitlement,
  initializePurchases,
  isPurchasesSupported,
  openSubscriptionManagement,
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
  const [busy, setBusy] = useState(false);

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
    })().catch(() => {
      // Store state is non-critical; the account section still renders.
    });

    return () => {
      active = false;
    };
  }, [userId]);

  // A web (Stripe) subscription also grants Pro, so the store must not offer a
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
        Alert.alert('Restored', 'Your subscription is active on this account.');
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
    if (hasProEntitlement(customerInfo)) {
      await openSubscriptionManagement(customerInfo);
      return;
    }
    await Linking.openURL(`${API_URL}/dashboard/billing`);
  };

  const proOnStore = hasProEntitlement(customerInfo);
  const isPro = proOnStore || proOnWeb;
  const canBuyInApp = isPurchasesSupported() && !isPro;

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
                : 'Renews through your web account.'}
            </Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={manageSubscription}
              disabled={busy}
            >
              <Text style={styles.secondaryButtonText}>
                {proOnStore ? 'Manage subscription' : 'Manage billing'}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              {price
                ? `Pro is ${price} per month. Billed by the App Store or Google Play.`
                : 'Unlock unlimited quotes, invoices and reports.'}
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
                  <Text style={styles.upgradeText}>Upgrade to Pro</Text>
                )}
              </Pressable>
            ) : (
              <Text style={styles.hint}>
                In-app purchase is unavailable in this build. Manage your plan on
                the web instead.
              </Text>
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
          </>
        )}
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